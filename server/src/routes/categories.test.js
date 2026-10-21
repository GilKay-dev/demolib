import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    category: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}));

process.env.JWT_SECRET = "test-secret";
const { prisma } = await import("../lib/prisma.js");
const { app } = await import("../app.js");

const auth = () => ({ Authorization: `Bearer ${jwt.sign({ sub: 1 }, "test-secret")}` });
const withCount = (c, books = 0) => ({ ...c, _count: { books } });

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ id: 1, role: "LIBRARIAN", status: "ACTIVE" });
  // mockReset (không chỉ clear) để xóa cả hàng đợi mockResolvedValueOnce còn sót
  prisma.category.findFirst.mockReset().mockResolvedValue(null);
});

describe("access control", () => {
  it("returns 401 without a token", async () => {
    expect((await request(app).get("/api/categories")).status).toBe(401);
  });

  it.each(["READER", "ADMIN"])("returns 403 for a %s", async (role) => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role, status: "ACTIVE" });
    for (const [method, path] of [["get", "/api/categories"], ["post", "/api/categories"], ["put", "/api/categories/1"], ["delete", "/api/categories/1"]]) {
      expect((await request(app)[method](path).set(auth()).send({ name: "x" })).status).toBe(403);
    }
    expect(prisma.category.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/categories", () => {
  it("lists active categories with their active book counts", async () => {
    prisma.category.findMany.mockResolvedValue([withCount({ id: 2, name: "B" }), withCount({ id: 1, name: "A", createdAt: 0 }, 2)]);
    const res = await request(app).get("/api/categories").set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 1, name: "A", bookCount: 2 },
      { id: 2, name: "B", bookCount: 0 },
    ]);
    const args = prisma.category.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ deletedAt: null });
    expect(args.include._count.select.books.where).toEqual({ deletedAt: null });
  });
});

describe("POST /api/categories", () => {
  it("creates a category with a trimmed name", async () => {
    prisma.category.create.mockResolvedValue(withCount({ id: 3, name: "Khoa học" }));
    const res = await request(app).post("/api/categories").set(auth()).send({ name: "  Khoa học " });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 3, name: "Khoa học", bookCount: 0 });
    expect(prisma.category.create.mock.calls[0][0].data).toEqual({ name: "Khoa học" });
  });

  it.each([{ name: "" }, { name: "   " }, { name: "a".repeat(51) }, {}])("rejects %j", async (body) => {
    const res = await request(app).post("/api/categories").set(auth()).send(body);
    expect(res.status).toBe(400);
    expect(res.body.errors.name).toBeTruthy();
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it("accepts a 50 character name", async () => {
    prisma.category.create.mockResolvedValue(withCount({ id: 3, name: "a".repeat(50) }));
    expect((await request(app).post("/api/categories").set(auth()).send({ name: "a".repeat(50) })).status).toBe(201);
  });

  it("returns 409 for a name that exists, compared case-insensitively among active categories", async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 9 });
    const res = await request(app).post("/api/categories").set(auth()).send({ name: "khoa học" });
    expect(res.status).toBe(409);
    expect(res.body.errors.name).toBe("Thể loại đã tồn tại");
    expect(prisma.category.findFirst.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      name: { equals: "khoa học", mode: "insensitive" },
    });
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it("returns 409 when a concurrent request hits the unique index", async () => {
    prisma.category.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    expect((await request(app).post("/api/categories").set(auth()).send({ name: "X" })).status).toBe(409);
  });
});

describe("PUT /api/categories/:id", () => {
  beforeEach(() => {
    // 1st findFirst: the category itself; 2nd: duplicate check
    prisma.category.findFirst.mockResolvedValueOnce({ id: 4 }).mockResolvedValueOnce(null);
    prisma.category.update.mockResolvedValue(withCount({ id: 4, name: "Mới" }, 1));
  });

  it("renames the category", async () => {
    const res = await request(app).put("/api/categories/4").set(auth()).send({ name: "Mới" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 4, name: "Mới", bookCount: 1 });
    expect(prisma.category.update.mock.calls[0][0].where).toEqual({ id: 4 });
    expect(prisma.category.findFirst.mock.calls[1][0].where.id).toEqual({ not: 4 });
  });

  it("returns 404 for a missing, deleted or malformed id", async () => {
    prisma.category.findFirst.mockReset().mockResolvedValue(null);
    expect((await request(app).put("/api/categories/4").set(auth()).send({ name: "Mới" })).status).toBe(404);
    expect((await request(app).put("/api/categories/abc").set(auth()).send({ name: "Mới" })).status).toBe(404);
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("returns 409 when another active category has the name", async () => {
    prisma.category.findFirst.mockReset().mockResolvedValueOnce({ id: 4 }).mockResolvedValueOnce({ id: 8 });
    expect((await request(app).put("/api/categories/4").set(auth()).send({ name: "Mới" })).status).toBe(409);
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("rejects an invalid name", async () => {
    const res = await request(app).put("/api/categories/4").set(auth()).send({ name: "" });
    expect(res.status).toBe(400);
    expect(prisma.category.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/categories/:id", () => {
  it("soft-deletes with a single conditional update that requires no active books", async () => {
    prisma.category.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).delete("/api/categories/4").set(auth());
    expect(res.status).toBe(200);
    const { where, data } = prisma.category.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: 4, deletedAt: null, books: { none: { deletedAt: null } } });
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(prisma.category.findFirst).not.toHaveBeenCalled();
  });

  it("returns 409 with the book count when books still reference it", async () => {
    prisma.category.updateMany.mockResolvedValue({ count: 0 });
    prisma.category.findFirst.mockResolvedValue(withCount({ id: 4, name: "X" }, 3));
    const res = await request(app).delete("/api/categories/4").set(auth());
    expect(res.status).toBe(409);
    expect(res.body.message).toContain("3");
  });

  it("returns 404 when the category does not exist or is already deleted", async () => {
    prisma.category.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).delete("/api/categories/4").set(auth());
    expect(res.status).toBe(404);
  });

  it("returns 404 for a malformed id without touching the database", async () => {
    expect((await request(app).delete("/api/categories/abc").set(auth())).status).toBe(404);
    expect(prisma.category.updateMany).not.toHaveBeenCalled();
  });
});
