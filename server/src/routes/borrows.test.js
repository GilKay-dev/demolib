import { authFor, fakeUser } from "../test/auth.js";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma.js", () => {
  const db = () => ({
    $queryRaw: vi.fn(),
    book: { findFirst: vi.fn() },
    borrow: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
    fine: { findFirst: vi.fn() },
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
