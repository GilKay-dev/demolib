import { authFor, fakeUser } from "../test/auth.js";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    fine: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  },
}));

process.env.JWT_SECRET = "test-secret";
const { prisma } = await import("../lib/prisma.js");
const { app } = await import("../app.js");

const reader = () => authFor(fakeUser({ id: 7, role: "READER" }));
const row = (over = {}) => ({
  id: 1,
  type: "LATE",
  levelName: "Trả muộn",
  amount: 5000,
  note: null,
  status: "UNPAID",
  finedDate: new Date("2026-10-20T00:00:00Z"),
  rejectReason: null,
  borrow: { book: { id: 4, title: "Clean Code" } },
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  prisma.user.findUnique.mockResolvedValue(fakeUser({ id: 7, role: "READER" }));
});

describe("access", () => {
  it.each([
    ["get", "/api/fines/mine"],
    ["post", "/api/fines/1/mark-paid"],
  ])("%s %s returns 401 without a token", async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(401);
  });

  it.each(["LIBRARIAN", "ADMIN"])("returns 403 for a %s", async (role) => {
    prisma.user.findUnique.mockResolvedValue(fakeUser({ id: 7, role }));
    const headers = authFor(fakeUser({ id: 7, role }));
    expect((await request(app).get("/api/fines/mine").set(headers)).status).toBe(403);
    expect((await request(app).post("/api/fines/1/mark-paid").set(headers)).status).toBe(403);
    expect(prisma.fine.updateMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/fines/mine", () => {
  it("only queries the signed-in reader's fines and totals the unpaid ones", async () => {
    prisma.fine.findMany.mockResolvedValue([row({ id: 1, amount: 5000 }), row({ id: 2, amount: 20000 }), row({ id: 3, status: "PAID" })]);
    const res = await request(app).get("/api/fines/mine").set(reader());
    expect(res.status).toBe(200);
    expect(prisma.fine.findMany.mock.calls[0][0].where).toEqual({ borrow: { readerId: 7 } });
    expect(res.body.totalUnpaid).toBe(25000);
    expect(res.body.items[0]).toMatchObject({ id: 1, amount: 5000, finedDate: "2026-10-20", book: { title: "Clean Code" } });
  });

  it("lists payable fines before pending and paid ones", async () => {
    prisma.fine.findMany.mockResolvedValue([row({ id: 1, status: "PAID" }), row({ id: 2, status: "REJECTED", rejectReason: "Sai số tiền" }), row({ id: 3 })]);
    const res = await request(app).get("/api/fines/mine").set(reader());
    expect(res.body.items.map((f) => f.id)).toEqual([2, 3, 1]);
    expect(res.body.items[0].rejectReason).toBe("Sai số tiền");
  });

  it("filters by status", async () => {
    prisma.fine.findMany.mockResolvedValue([]);
    await request(app).get("/api/fines/mine?status=PENDING").set(reader());
    expect(prisma.fine.findMany.mock.calls[0][0].where).toEqual({ borrow: { readerId: 7 }, status: "PENDING" });
  });

  it("rejects an unknown status", async () => {
    const res = await request(app).get("/api/fines/mine?status=BOGUS").set(reader());
    expect(res.status).toBe(400);
    expect(prisma.fine.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/fines/:id/mark-paid", () => {
  it("moves an unpaid fine to pending, scoped to the reader", async () => {
    prisma.fine.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post("/api/fines/1/mark-paid").set(reader());
    expect(res.status).toBe(200);
    expect(res.body.fine).toEqual({ id: 1, status: "PENDING" });
    const arg = prisma.fine.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 1, status: { in: ["UNPAID", "REJECTED"] }, borrow: { readerId: 7 } });
    expect(arg.data).toMatchObject({ status: "PENDING", rejectReason: null });
  });

  it("returns 409 when the fine is already pending or paid", async () => {
    prisma.fine.updateMany.mockResolvedValue({ count: 0 });
    prisma.fine.findFirst.mockResolvedValue({ id: 1 });
    expect((await request(app).post("/api/fines/1/mark-paid").set(reader())).status).toBe(409);
  });

  it("returns 404 for another reader's or a missing fine", async () => {
    prisma.fine.updateMany.mockResolvedValue({ count: 0 });
    prisma.fine.findFirst.mockResolvedValue(null);
    expect((await request(app).post("/api/fines/1/mark-paid").set(reader())).status).toBe(404);
  });

  it("returns 404 for a malformed id without touching the db", async () => {
    expect((await request(app).post("/api/fines/abc/mark-paid").set(reader())).status).toBe(404);
    expect(prisma.fine.updateMany).not.toHaveBeenCalled();
  });
});

describe("staff: 2.5.3", () => {
  const librarian = () => authFor(fakeUser({ id: 3, role: "LIBRARIAN" }));
  beforeEach(() => prisma.user.findUnique.mockResolvedValue(fakeUser({ id: 3, role: "LIBRARIAN" })));

  it.each([
    ["get", "/api/fines"],
    ["post", "/api/fines/1/confirm"],
    ["post", "/api/fines/1/reject"],
  ])("%s %s returns 403 for a reader", async (method, url) => {
    prisma.user.findUnique.mockResolvedValue(fakeUser({ id: 7, role: "READER" }));
    expect((await request(app)[method](url).set(reader()).send({ reason: "x" })).status).toBe(403);
    expect(prisma.fine.updateMany).not.toHaveBeenCalled();
  });

  it("lists pending fines with reader and book", async () => {
    prisma.fine.findMany.mockResolvedValue([
      { ...row({ status: "PENDING", amount: 5000 }), markedPaidAt: new Date("2026-10-21T00:00:00Z"), borrow: { reader: { id: 7, name: "An", email: "a@x.com" }, book: { id: 4, title: "Clean Code" } } },
    ]);
    const res = await request(app).get("/api/fines").set(librarian());
    expect(res.status).toBe(200);
    expect(prisma.fine.findMany.mock.calls[0][0].where).toEqual({ status: "PENDING" });
    expect(res.body.items[0]).toMatchObject({ id: 1, amount: 5000, reader: { name: "An" }, book: { title: "Clean Code" } });
  });

  it("confirms a pending fine as paid", async () => {
    prisma.fine.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post("/api/fines/1/confirm").set(librarian());
    expect(res.status).toBe(200);
    const arg = prisma.fine.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 1, status: "PENDING" });
    expect(arg.data).toMatchObject({ status: "PAID", processedById: 3 });
    expect(arg.data.paidAt).toBeInstanceOf(Date);
  });

  it("rejects a pending fine with a reason", async () => {
    prisma.fine.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post("/api/fines/1/reject").set(librarian()).send({ reason: "Sai số tiền" });
    expect(res.status).toBe(200);
    expect(prisma.fine.updateMany.mock.calls[0][0].data).toMatchObject({ status: "REJECTED", rejectReason: "Sai số tiền", processedById: 3 });
  });

  it.each([{}, { reason: "  " }, { reason: "a".repeat(256) }])("rejects an invalid reason %j with 400", async (body) => {
    const res = await request(app).post("/api/fines/1/reject").set(librarian()).send(body);
    expect(res.status).toBe(400);
    expect(prisma.fine.updateMany).not.toHaveBeenCalled();
  });

  it("returns 409 when the fine was already processed and 404 when missing", async () => {
    prisma.fine.updateMany.mockResolvedValue({ count: 0 });
    prisma.fine.findFirst.mockResolvedValueOnce({ id: 1 });
    expect((await request(app).post("/api/fines/1/confirm").set(librarian())).status).toBe(409);
    prisma.fine.findFirst.mockResolvedValueOnce(null);
    expect((await request(app).post("/api/fines/1/confirm").set(librarian())).status).toBe(404);
  });
});
