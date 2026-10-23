import { authFor, fakeUser } from "../test/auth.js";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), count: vi.fn() },
    book: { aggregate: vi.fn() },
    borrow: { count: vi.fn(), findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

process.env.JWT_SECRET = "test-secret";
const { prisma } = await import("../lib/prisma.js");
const { app } = await import("../app.js");

const staff = (role = "LIBRARIAN") => fakeUser({ id: 1, role });

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue(staff());
  prisma.book.aggregate.mockResolvedValue({ _sum: { availableQuantity: 30, borrowedQuantity: 12 } });
  prisma.borrow.count.mockResolvedValue(0);
  prisma.user.count.mockResolvedValue(0);
  prisma.borrow.findMany.mockResolvedValue([]);
  prisma.$queryRaw.mockResolvedValue([]);
});

describe("GET /api/reports/dashboard", () => {
  it("returns 401 for an anonymous request", async () => {
    expect((await request(app).get("/api/reports/dashboard")).status).toBe(401);
  });

  it("returns 403 for a reader", async () => {
    prisma.user.findUnique.mockResolvedValue(fakeUser({ role: "READER" }));
    const res = await request(app).get("/api/reports/dashboard").set(authFor(fakeUser({ role: "READER" })));
    expect(res.status).toBe(403);
    expect(prisma.book.aggregate).not.toHaveBeenCalled();
  });

  it.each(["LIBRARIAN", "ADMIN"])("allows a %s", async (role) => {
    prisma.user.findUnique.mockResolvedValue(staff(role));
    const res = await request(app).get("/api/reports/dashboard").set(authFor(staff(role)));
    expect(res.status).toBe(200);
  });

  it("aggregates stock, readers, today's borrows, top books and overdue readers", async () => {
    const due = new Date(Date.now() - 3 * 86400000);
    prisma.borrow.count.mockImplementation(async ({ where }) => {
      if (where.returnCondition === "LOST") return 2;
      if (where.returnCondition === "DAMAGED") return 1;
      if (where.dueDate) return 7;
      return 4; // đơn mượn hôm nay
    });
    prisma.user.count.mockImplementation(async ({ where }) => (where.status === "ACTIVE" ? 20 : 3));
    prisma.$queryRaw.mockResolvedValue([{ id: 5, title: "Dế Mèn", author: "Tô Hoài", borrowCount: 9 }]);
    prisma.borrow.findMany.mockResolvedValue([
      { id: 8, dueDate: due, reader: { id: 2, name: "An", email: "a@x.com" }, book: { id: 5, title: "Dế Mèn" } },
    ]);

    const res = await request(app).get("/api/reports/dashboard").set(authFor(staff()));
    expect(res.body.books).toEqual({ available: 30, borrowed: 12, lost: 2, damaged: 1 });
    expect(res.body.readers).toEqual({ active: 20, disabled: 3 });
    expect(res.body.borrowsToday).toBe(4);
    expect(res.body.topBooks).toEqual([{ id: 5, title: "Dế Mèn", author: "Tô Hoài", borrowCount: 9 }]);
    expect(res.body.overdue.total).toBe(7);
    expect(res.body.overdue.items[0]).toMatchObject({ borrowId: 8, reader: { email: "a@x.com" }, book: { title: "Dế Mèn" } });
    expect(res.body.overdue.items[0].daysLate).toBeGreaterThanOrEqual(1);
  });

  it("treats a missing stock sum as zero", async () => {
    prisma.book.aggregate.mockResolvedValue({ _sum: { availableQuantity: null, borrowedQuantity: null } });
    const res = await request(app).get("/api/reports/dashboard").set(authFor(staff()));
    expect(res.body.books).toMatchObject({ available: 0, borrowed: 0 });
  });

  it("only counts readers, not staff, for the reader totals", async () => {
    await request(app).get("/api/reports/dashboard").set(authFor(staff()));
    const wheres = prisma.user.count.mock.calls.map(([a]) => a.where);
    expect(wheres).toEqual(expect.arrayContaining([{ role: "READER", status: "ACTIVE" }, { role: "READER", status: "DISABLED" }]));
  });
});
