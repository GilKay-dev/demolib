import { authFor, fakeUser } from "../test/auth.js";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma.js", () => {
  const db = () => ({
    $queryRaw: vi.fn(),
    book: { findFirst: vi.fn(), update: vi.fn() },
    borrow: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    fine: { findFirst: vi.fn() },
    returnRequest: { findFirst: vi.fn(), create: vi.fn() },
  });
  const tx = db();
  return { prisma: { ...db(), user: { findUnique: vi.fn() }, $transaction: vi.fn((fn) => fn(tx)), tx } };
});

process.env.JWT_SECRET = "test-secret";
const { prisma } = await import("../lib/prisma.js");
const { app } = await import("../app.js");

const auth = () => authFor(fakeUser({ id: 7, role: "READER" }));

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue(fakeUser({ id: 7, role: "READER" }));
  for (const db of [prisma, prisma.tx]) {
    db.book.findFirst.mockResolvedValue({ availableQuantity: 3 });
    db.borrow.findFirst.mockResolvedValue(null);
    db.borrow.count.mockResolvedValue(0);
    db.fine.findFirst.mockResolvedValue(null);
  }
  prisma.tx.borrow.create.mockImplementation(async ({ data }) => ({ id: 21, status: "PENDING", ...data }));
});

describe("POST /api/borrows access", () => {
  it("returns 401 without a token", async () => {
    expect((await request(app).post("/api/borrows").send({ bookId: 1 })).status).toBe(401);
  });

  it.each(["LIBRARIAN", "ADMIN"])("returns 403 for a %s", async (role) => {
    prisma.user.findUnique.mockResolvedValue(fakeUser({ id: 7, role }));
    expect((await request(app).post("/api/borrows").set(authFor(fakeUser({ role }))).send({ bookId: 1 })).status).toBe(403);
    expect(prisma.tx.borrow.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/borrows validation", () => {
  it.each([{}, { bookId: "abc" }, { bookId: 0 }, { bookId: 1.5 }, { bookId: 1, days: 0 }, { bookId: 1, days: 31 }, { bookId: 1, days: 2.5 }, { bookId: 1, days: "x" }, { bookId: 1, role: "x" }])(
    "rejects %j",
    async (body) => {
      const res = await request(app).post("/api/borrows").set(auth()).send(body);
      expect(res.status).toBe(400);
      expect(prisma.tx.borrow.create).not.toHaveBeenCalled();
    },
  );
});

describe("POST /api/borrows", () => {
  it("creates a pending borrow for the caller without touching inventory", async () => {
    const res = await request(app).post("/api/borrows").set(auth()).send({ bookId: 4, days: 20 });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Đã gửi yêu cầu mượn, chờ nhân viên xác nhận");
    expect(res.body.borrow).toMatchObject({ id: 21, bookId: 4, status: "PENDING", requestedDays: 20 });
    expect(prisma.tx.borrow.create.mock.calls[0][0].data).toEqual({ readerId: 7, bookId: 4, requestedDays: 20 });
  });

  it("defaults to 14 days", async () => {
    await request(app).post("/api/borrows").set(auth()).send({ bookId: 4 });
    expect(prisma.tx.borrow.create.mock.calls[0][0].data.requestedDays).toBe(14);
  });

  it("returns 404 when the book does not exist", async () => {
    prisma.tx.book.findFirst.mockResolvedValue(null);
    const res = await request(app).post("/api/borrows").set(auth()).send({ bookId: 4 });
    expect(res.status).toBe(404);
    expect(prisma.tx.borrow.create).not.toHaveBeenCalled();
  });

  it("returns 409 when no copy is available", async () => {
    prisma.tx.book.findFirst.mockResolvedValue({ availableQuantity: 0 });
    const res = await request(app).post("/api/borrows").set(auth()).send({ bookId: 4 });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Sách đã hết, không thể mượn");
  });

  it("returns 409 when the reader already has an active borrow of this book", async () => {
    prisma.tx.borrow.findFirst.mockResolvedValue({ id: 3 });
    const res = await request(app).post("/api/borrows").set(auth()).send({ bookId: 4 });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Bạn đã mượn hoặc đang chờ duyệt sách này");
  });

  it("returns 409 at 5 active borrows", async () => {
    prisma.tx.borrow.count.mockResolvedValue(5);
    const res = await request(app).post("/api/borrows").set(auth()).send({ bookId: 4 });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Đã đạt tối đa 5 sách mượn");
  });

  it("allows the 5th borrow (4 active)", async () => {
    prisma.tx.borrow.count.mockResolvedValue(4);
    expect((await request(app).post("/api/borrows").set(auth()).send({ bookId: 4 })).status).toBe(201);
  });

  it("returns 409 with a link when the reader has an unpaid fine", async () => {
    prisma.tx.fine.findFirst.mockResolvedValue({ id: 9 });
    const res = await request(app).post("/api/borrows").set(auth()).send({ bookId: 4 });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ message: "Bạn còn khoản phạt chưa thanh toán", link: "/fines" });
    expect(prisma.tx.fine.findFirst.mock.calls[0][0].where).toEqual({ status: { not: "PAID" }, borrow: { readerId: 7 } });
  });

  it("returns 409 when a concurrent duplicate hits the unique index", async () => {
    prisma.tx.borrow.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    const res = await request(app).post("/api/borrows").set(auth()).send({ bookId: 4 });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Bạn đã mượn hoặc đang chờ duyệt sách này");
  });
});

describe("GET /api/borrows/eligibility", () => {
  it("returns 401 without a token", async () => {
    expect((await request(app).get("/api/borrows/eligibility?bookId=4")).status).toBe(401);
  });

  it("is eligible when every check passes", async () => {
    const res = await request(app).get("/api/borrows/eligibility?bookId=4").set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ eligible: true });
  });

  it("reports the first failing reason", async () => {
    prisma.book.findFirst.mockResolvedValue({ availableQuantity: 0 });
    prisma.fine.findFirst.mockResolvedValue({ id: 9 });
    const res = await request(app).get("/api/borrows/eligibility?bookId=4").set(auth());
    expect(res.body).toEqual({ eligible: false, message: "Sách đã hết, không thể mượn" });
  });

  it("includes the fines link for an unpaid fine", async () => {
    prisma.fine.findFirst.mockResolvedValue({ id: 9 });
    const res = await request(app).get("/api/borrows/eligibility?bookId=4").set(auth());
    expect(res.body).toMatchObject({ eligible: false, link: "/fines" });
  });

  it.each(["", "?bookId=abc", "?bookId=99999999999"])("returns 404 for %j", async (qs) => {
    expect((await request(app).get(`/api/borrows/eligibility${qs}`).set(auth())).status).toBe(404);
  });

  it("returns 404 for a missing book", async () => {
    prisma.book.findFirst.mockResolvedValue(null);
    expect((await request(app).get("/api/borrows/eligibility?bookId=4").set(auth())).status).toBe(404);
  });
});

describe("staff handling of borrow requests (2.3.2)", () => {
  const staff = () => authFor(fakeUser({ id: 2, role: "LIBRARIAN" }));
  const asStaff = () => prisma.user.findUnique.mockResolvedValue(fakeUser({ id: 2, role: "LIBRARIAN" }));
  const pendingRow = { id: 5, book_id: 4, requested_days: 20, status: "PENDING" };

  beforeEach(() => {
    asStaff();
    prisma.tx.$queryRaw.mockResolvedValueOnce([pendingRow]).mockResolvedValueOnce([{ available_quantity: 2 }]);
    prisma.tx.borrow.update.mockImplementation(async ({ data }) => ({ id: 5, ...data }));
  });

  it.each([
    ["get", "/api/borrows"],
    ["post", "/api/borrows/5/confirm"],
    ["post", "/api/borrows/5/reject"],
  ])("%s %s is forbidden for readers", async (method, url) => {
    prisma.user.findUnique.mockResolvedValue(fakeUser({ id: 7, role: "READER" }));
    expect((await request(app)[method](url).set(auth()).send({ reason: "x" })).status).toBe(403);
  });

  it("lists pending requests oldest first", async () => {
    prisma.borrow.findMany.mockResolvedValue([{ id: 5 }]);
    const res = await request(app).get("/api/borrows").set(staff());
    expect(res.body).toEqual({ items: [{ id: 5 }] });
    const arg = prisma.borrow.findMany.mock.calls[0][0];
    expect(arg.where.status).toBe("PENDING");
    expect(arg.orderBy[0]).toEqual({ createdAt: "asc" });
  });

  it("confirms: sets dates, moves one copy to borrowed", async () => {
    const res = await request(app).post("/api/borrows/5/confirm").set(staff());
    expect(res.status).toBe(200);
    const data = prisma.tx.borrow.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "BORROWING", processedById: 2 });
    expect((data.dueDate - data.borrowDate) / 86400000).toBe(20);
    expect(prisma.tx.book.update.mock.calls[0][0]).toEqual({
      where: { id: 4 },
      data: { availableQuantity: { decrement: 1 }, borrowedQuantity: { increment: 1 } },
    });
  });

  it("returns 409 when the request was already handled", async () => {
    prisma.tx.$queryRaw.mockReset().mockResolvedValueOnce([{ ...pendingRow, status: "BORROWING" }]);
    expect((await request(app).post("/api/borrows/5/confirm").set(staff())).status).toBe(409);
    expect(prisma.tx.book.update).not.toHaveBeenCalled();
  });

  it("returns 409 when no copy is left", async () => {
    prisma.tx.$queryRaw.mockReset().mockResolvedValueOnce([pendingRow]).mockResolvedValueOnce([{ available_quantity: 0 }]);
    expect((await request(app).post("/api/borrows/5/confirm").set(staff())).status).toBe(409);
    expect(prisma.tx.borrow.update).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown request", async () => {
    prisma.tx.$queryRaw.mockReset().mockResolvedValueOnce([]);
    expect((await request(app).post("/api/borrows/5/confirm").set(staff())).status).toBe(404);
    expect((await request(app).post("/api/borrows/abc/confirm").set(staff())).status).toBe(404);
  });

  it("rejects with a reason and leaves inventory alone", async () => {
    const res = await request(app).post("/api/borrows/5/reject").set(staff()).send({ reason: "  Hết sách " });
    expect(res.status).toBe(200);
    expect(prisma.tx.borrow.update.mock.calls[0][0].data).toMatchObject({ status: "REJECTED", rejectReason: "Hết sách", processedById: 2 });
    expect(prisma.tx.book.update).not.toHaveBeenCalled();
  });

  it.each([{}, { reason: "   " }, { reason: "x".repeat(256) }])("requires a valid reason: %j", async (body) => {
    expect((await request(app).post("/api/borrows/5/reject").set(staff()).send(body)).status).toBe(400);
    expect(prisma.tx.borrow.update).not.toHaveBeenCalled();
  });

  it("returns 409 when rejecting an already handled request", async () => {
    prisma.tx.$queryRaw.mockReset().mockResolvedValueOnce([{ ...pendingRow, status: "REJECTED" }]);
    expect((await request(app).post("/api/borrows/5/reject").set(staff()).send({ reason: "x" })).status).toBe(409);
  });
});

describe("reader return requests (2.4.1)", () => {
  const reader = () => auth();
  const ownRow = { id: 5, reader_id: 7, status: "BORROWING" };

  beforeEach(() => {
    prisma.tx.$queryRaw.mockReset().mockResolvedValue([ownRow]);
    prisma.tx.returnRequest.findFirst.mockResolvedValue(null);
    prisma.tx.returnRequest.create.mockImplementation(async ({ data }) => ({ id: 31, status: "PENDING", ...data }));
  });

  it("returns 401 without a token and 403 for staff", async () => {
    expect((await request(app).post("/api/borrows/5/return-requests")).status).toBe(401);
    prisma.user.findUnique.mockResolvedValue(fakeUser({ id: 2, role: "LIBRARIAN" }));
    expect((await request(app).post("/api/borrows/5/return-requests").set(authFor(fakeUser({ id: 2, role: "LIBRARIAN" })))).status).toBe(403);
    expect(prisma.tx.returnRequest.create).not.toHaveBeenCalled();
  });

  it("creates a pending return request without touching the borrow or inventory", async () => {
    const res = await request(app).post("/api/borrows/5/return-requests").set(reader());
    expect(res.status).toBe(201);
    expect(res.body.returnRequest).toMatchObject({ id: 31, borrowId: 5, status: "PENDING" });
    expect(prisma.tx.borrow.update).not.toHaveBeenCalled();
    expect(prisma.tx.book.update).not.toHaveBeenCalled();
  });

  it("allows an overdue borrow", async () => {
    prisma.tx.$queryRaw.mockResolvedValue([{ ...ownRow, status: "OVERDUE" }]);
    expect((await request(app).post("/api/borrows/5/return-requests").set(reader())).status).toBe(201);
  });

  it("returns 404 for an unknown or malformed id", async () => {
    prisma.tx.$queryRaw.mockResolvedValue([]);
    expect((await request(app).post("/api/borrows/5/return-requests").set(reader())).status).toBe(404);
    expect((await request(app).post("/api/borrows/abc/return-requests").set(reader())).status).toBe(404);
  });

  it("returns 403 for someone else's borrow", async () => {
    prisma.tx.$queryRaw.mockResolvedValue([{ ...ownRow, reader_id: 99 }]);
    expect((await request(app).post("/api/borrows/5/return-requests").set(reader())).status).toBe(403);
    expect(prisma.tx.returnRequest.create).not.toHaveBeenCalled();
  });

  it.each(["PENDING", "RETURNED", "REJECTED"])("returns 409 for a %s borrow", async (status) => {
    prisma.tx.$queryRaw.mockResolvedValue([{ ...ownRow, status }]);
    expect((await request(app).post("/api/borrows/5/return-requests").set(reader())).status).toBe(409);
    expect(prisma.tx.returnRequest.create).not.toHaveBeenCalled();
  });

  it("returns 409 when a pending return request already exists", async () => {
    prisma.tx.returnRequest.findFirst.mockResolvedValue({ id: 30 });
    expect((await request(app).post("/api/borrows/5/return-requests").set(reader())).status).toBe(409);
    expect(prisma.tx.returnRequest.create).not.toHaveBeenCalled();
  });

  it("returns 409 when a concurrent duplicate hits the unique index", async () => {
    prisma.tx.returnRequest.create.mockRejectedValue({ code: "P2002" });
    expect((await request(app).post("/api/borrows/5/return-requests").set(reader())).status).toBe(409);
  });

  it("lists the reader's active borrows with the pending-return flag", async () => {
    prisma.borrow.findMany.mockResolvedValue([
      { id: 5, status: "BORROWING", book: { id: 4, title: "A", author: "B" }, returnRequests: [{ id: 31 }] },
      { id: 6, status: "OVERDUE", book: { id: 5, title: "C", author: "D" }, returnRequests: [] },
    ]);
    const res = await request(app).get("/api/borrows/mine").set(reader());
    expect(res.status).toBe(200);
    expect(res.body.items.map((b) => b.returnPending)).toEqual([true, false]);
    expect(prisma.borrow.findMany.mock.calls[0][0].where).toMatchObject({ readerId: 7 });
    expect((await request(app).get("/api/borrows/mine")).status).toBe(401);
  });
});
