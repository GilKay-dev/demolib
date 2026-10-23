import { authFor, fakeUser } from "../test/auth.js";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma.js", () => {
  const db = () => ({
    $queryRaw: vi.fn(),
    book: { update: vi.fn() },
    borrow: { update: vi.fn() },
    fine: { createMany: vi.fn() },
    fineLevel: { findMany: vi.fn() },
    returnRequest: { findMany: vi.fn(), update: vi.fn() },
  });
  const tx = db();
  return { prisma: { ...db(), user: { findUnique: vi.fn() }, $transaction: vi.fn((fn) => fn(tx)), tx } };
});

process.env.JWT_SECRET = "test-secret";
const { prisma } = await import("../lib/prisma.js");
const { app } = await import("../app.js");

const staff = () => authFor(fakeUser({ id: 3, role: "LIBRARIAN" }));
const { today } = await import("../lib/today.js");
const day = (offset) => new Date(today().getTime() + offset * 86400000);
const LEVELS = [
  { id: 1, name: "Hư nhẹ", amount: 20000 },
  { id: 2, name: "Trả muộn", amount: 5000 },
];

// $queryRaw của tx được gọi lần lượt: khóa yêu cầu, khóa đơn, khóa sách
const setup = ({ rrStatus = "PENDING", borrowStatus = "BORROWING", dueOffset = 3, levels = LEVELS } = {}) => {
  prisma.tx.$queryRaw
    .mockResolvedValueOnce([{ id: 5, borrow_id: 8, status: rrStatus }])
    .mockResolvedValueOnce([{ id: 8, book_id: 4, due_date: day(dueOffset), status: borrowStatus }])
    .mockResolvedValueOnce([{ id: 4 }]);
  prisma.tx.fineLevel.findMany.mockImplementation(async ({ where }) => levels.filter((l) => where.id.in.includes(l.id)));
};
const confirm = (body) => request(app).post("/api/return-requests/5/confirm").set(staff()).send(body);

beforeEach(() => {
  vi.clearAllMocks();
  prisma.tx.$queryRaw.mockReset();
  prisma.user.findUnique.mockResolvedValue(fakeUser({ id: 3, role: "LIBRARIAN" }));
});

describe("access", () => {
  it.each([
    ["get", "/api/return-requests"],
    ["post", "/api/return-requests/5/confirm"],
  ])("%s %s returns 401 without a token", async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(401);
  });

  it.each(["READER", "ADMIN"])("returns 403 for a %s", async (role) => {
    prisma.user.findUnique.mockResolvedValue(fakeUser({ id: 3, role }));
    const res = await request(app).post("/api/return-requests/5/confirm").set(authFor(fakeUser({ role }))).send({ condition: "NORMAL" });
    expect(res.status).toBe(403);
    expect(prisma.tx.borrow.update).not.toHaveBeenCalled();
  });
});

describe("GET /api/return-requests", () => {
  it("lists pending requests with days late and the fine levels", async () => {
    prisma.returnRequest.findMany.mockResolvedValue([
      { id: 5, createdAt: new Date(), borrow: { id: 8, dueDate: day(-2), reader: { id: 9, name: "An" }, book: { id: 4, title: "X" } } },
    ]);
    prisma.fineLevel.findMany.mockResolvedValue(LEVELS);
    const res = await request(app).get("/api/return-requests").set(staff());
    expect(res.status).toBe(200);
    expect(res.body.items[0].daysLate).toBe(2);
    expect(res.body.fineLevels).toHaveLength(2);
    expect(prisma.returnRequest.findMany.mock.calls[0][0].where).toEqual({ status: "PENDING" });
  });
});

describe("POST /api/return-requests/:id/confirm validation", () => {
  it.each([
    [{}],
    [{ condition: "BROKEN" }],
    [{ condition: "NORMAL", note: "x" }],
    [{ condition: "NORMAL", conditionFineLevelId: 1 }],
    [{ condition: "DAMAGED", note: "rách bìa" }],
    [{ condition: "DAMAGED", conditionFineLevelId: 1 }],
    [{ condition: "LOST", conditionFineLevelId: 1, note: "   " }],
    [{ condition: "LOST", conditionFineLevelId: 1, note: "a".repeat(501) }],
    [{ condition: "LOST", conditionFineLevelId: 0, note: "mất" }],
    [{ condition: "NORMAL", lateFineLevelId: "x" }],
    [{ condition: "NORMAL", role: "x" }],
  ])("rejects %j", async (body) => {
    const res = await confirm(body);
    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("POST /api/return-requests/:id/confirm", () => {
  it("normal and on time: copy goes back to stock, no fine", async () => {
    setup();
    const res = await confirm({ condition: "NORMAL" });
    expect(res.status).toBe(200);
    expect(res.body.totalFine).toBe(0);
    expect(prisma.tx.fine.createMany).not.toHaveBeenCalled();
    expect(prisma.tx.book.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { availableQuantity: { increment: 1 }, borrowedQuantity: { decrement: 1 } },
    });
    expect(prisma.tx.borrow.update.mock.calls[0][0].data).toMatchObject({ status: "RETURNED", returnCondition: "NORMAL", processedById: 3 });
    expect(prisma.tx.returnRequest.update.mock.calls[0][0].data).toMatchObject({ status: "CONFIRMED", confirmedById: 3 });
  });

  it("normal but late: creates one LATE fine and still restocks", async () => {
    setup({ dueOffset: -4 });
    const res = await confirm({ condition: "NORMAL", lateFineLevelId: 2 });
    expect(res.status).toBe(200);
    const fines = prisma.tx.fine.createMany.mock.calls[0][0].data;
    expect(fines).toHaveLength(1);
    expect(fines[0]).toMatchObject({ type: "LATE", levelName: "Trả muộn", amount: 5000, borrowId: 8, createdById: 3 });
    expect(res.body.totalFine).toBe(5000);
    expect(prisma.tx.book.update.mock.calls[0][0].data.availableQuantity).toEqual({ increment: 1 });
  });

  it("late with no late level: 400 and nothing written", async () => {
    setup({ dueOffset: -1 });
    const res = await confirm({ condition: "NORMAL" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Bắt buộc chọn mức phạt trả muộn");
    expect(prisma.tx.borrow.update).not.toHaveBeenCalled();
    expect(prisma.tx.book.update).not.toHaveBeenCalled();
  });

  it("due today is not late", async () => {
    setup({ dueOffset: 0 });
    expect((await confirm({ condition: "NORMAL" })).status).toBe(200);
    expect(prisma.tx.fine.createMany).not.toHaveBeenCalled();
  });

  it.each(["DAMAGED", "LOST"])("%s: fine with note, copy leaves stock (total and borrowed -1)", async (condition) => {
    setup();
    const res = await confirm({ condition, conditionFineLevelId: 1, note: "  ghi chú  " });
    expect(res.status).toBe(200);
    const fines = prisma.tx.fine.createMany.mock.calls[0][0].data;
    expect(fines).toEqual([expect.objectContaining({ type: condition, fineLevelId: 1, amount: 20000, note: "ghi chú" })]);
    expect(prisma.tx.book.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { borrowedQuantity: { decrement: 1 }, totalQuantity: { decrement: 1 } },
    });
    expect(prisma.tx.borrow.update.mock.calls[0][0].data).toMatchObject({ status: "RETURNED", returnCondition: condition });
  });

  it("damaged and late: two separate fines", async () => {
    setup({ dueOffset: -2 });
    const res = await confirm({ condition: "DAMAGED", conditionFineLevelId: 1, note: "rách", lateFineLevelId: 2 });
    expect(res.status).toBe(200);
    expect(prisma.tx.fine.createMany.mock.calls[0][0].data.map((f) => f.type)).toEqual(["LATE", "DAMAGED"]);
    expect(res.body.totalFine).toBe(25000);
  });

  it("uses the same level for both fines without a duplicate lookup error", async () => {
    setup({ dueOffset: -2, levels: [LEVELS[0]] });
    const res = await confirm({ condition: "LOST", conditionFineLevelId: 1, note: "mất", lateFineLevelId: 1 });
    expect(res.status).toBe(200);
    expect(prisma.tx.fine.createMany.mock.calls[0][0].data).toHaveLength(2);
  });

  it("400 when a fine level does not exist or was deleted", async () => {
    setup({ levels: [] });
    const res = await confirm({ condition: "LOST", conditionFineLevelId: 99, note: "mất" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Mức phạt không tồn tại");
    expect(prisma.tx.fine.createMany).not.toHaveBeenCalled();
    expect(prisma.tx.borrow.update).not.toHaveBeenCalled();
  });

  it("409 when the request was already processed", async () => {
    setup({ rrStatus: "CONFIRMED" });
    expect((await confirm({ condition: "NORMAL" })).status).toBe(409);
    expect(prisma.tx.borrow.update).not.toHaveBeenCalled();
  });

  it("409 when the borrow is no longer active", async () => {
    setup({ borrowStatus: "RETURNED" });
    expect((await confirm({ condition: "NORMAL" })).status).toBe(409);
    expect(prisma.tx.book.update).not.toHaveBeenCalled();
  });

  it("404 for a missing or malformed id", async () => {
    prisma.tx.$queryRaw.mockResolvedValueOnce([]);
    expect((await confirm({ condition: "NORMAL" })).status).toBe(404);
    const res = await request(app).post("/api/return-requests/abc/confirm").set(staff()).send({ condition: "NORMAL" });
    expect(res.status).toBe(404);
  });
});
