import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidIsbn, normalizeIsbn } from "../lib/isbn.js";

vi.mock("../lib/prisma.js", () => {
  const tx = { $queryRaw: vi.fn(), book: { create: vi.fn() } };
  return {
    prisma: {
      user: { findUnique: vi.fn() },
      book: { findFirst: vi.fn() },
      $transaction: vi.fn((fn) => fn(tx)),
      tx,
    },
  };
});

process.env.JWT_SECRET = "test-secret";
const { prisma } = await import("../lib/prisma.js");
const { app } = await import("../app.js");

const auth = () => ({ Authorization: `Bearer ${jwt.sign({ sub: 1 }, "test-secret")}` });
const thisYear = new Date().getFullYear();
const valid = {
  title: "  Clean Code ",
  author: "Robert C. Martin",
  publishYear: 2008,
  isbn: "978-0-306-40615-7",
  categoryId: 3,
  description: "A handbook of agile software craftsmanship",
  quantity: 5,
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ id: 1, role: "LIBRARIAN", status: "ACTIVE" });
  prisma.book.findFirst.mockResolvedValue(null);
  prisma.tx.$queryRaw.mockResolvedValue([{ id: 3 }]);
  prisma.tx.book.create.mockImplementation(async ({ data }) => ({ id: 11, ...data }));
});

describe("isbn helpers", () => {
  it.each(["9780306406157", "0306406152", "080442957X"])("accepts %s", (s) => expect(isValidIsbn(s)).toBe(true));
  it.each(["9780306406158", "0306406153", "12345", "abcdefghij", "978030640615X"])("rejects %s", (s) =>
    expect(isValidIsbn(s)).toBe(false),
  );
  it("normalizes dashes, spaces and lowercase x", () => expect(normalizeIsbn(" 0-8044-2957-x ")).toBe("080442957X"));
});

describe("POST /api/books access", () => {
  it("returns 401 without a token", async () => {
    expect((await request(app).post("/api/books").send(valid)).status).toBe(401);
  });

  it.each(["READER", "ADMIN"])("returns 403 for a %s", async (role) => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, role, status: "ACTIVE" });
    expect((await request(app).post("/api/books").set(auth()).send(valid)).status).toBe(403);
    expect(prisma.tx.book.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/books", () => {
  it("creates a book with total = available = quantity and a normalized ISBN", async () => {
    const res = await request(app).post("/api/books").set(auth()).send(valid);
    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Thêm sách thành công");
    expect(prisma.tx.book.create.mock.calls[0][0].data).toEqual({
      title: "Clean Code",
      author: "Robert C. Martin",
      isbn: "9780306406157",
      publishYear: 2008,
      description: "A handbook of agile software craftsmanship",
      categoryId: 3,
      totalQuantity: 5,
      availableQuantity: 5,
      borrowedQuantity: 0,
    });
    expect(res.body.book).toMatchObject({ id: 11, totalQuantity: 5, availableQuantity: 5, borrowedQuantity: 0 });
  });

  it("accepts numeric strings from a form and stores an empty ISBN as null", async () => {
    const res = await request(app)
      .post("/api/books")
      .set(auth())
      .send({ ...valid, isbn: "", publishYear: "2008", categoryId: "3", quantity: "2" });
    expect(res.status).toBe(201);
    const { data } = prisma.tx.book.create.mock.calls[0][0];
    expect(data).toMatchObject({ isbn: null, publishYear: 2008, categoryId: 3, totalQuantity: 2 });
    expect(prisma.book.findFirst).not.toHaveBeenCalled();
  });

  it.each(["", "   ", null])("treats a blank ISBN (%j) as none, validated in the schema", async (blank) => {
    const res = await request(app).post("/api/books").set(auth()).send({ ...valid, isbn: blank });
    expect(res.status).toBe(201);
    expect(prisma.tx.book.create.mock.calls[0][0].data.isbn).toBeNull();
  });

  it("treats an omitted ISBN as none", async () => {
    const { isbn: _omit, ...withoutIsbn } = valid;
    expect((await request(app).post("/api/books").set(auth()).send(withoutIsbn)).status).toBe(201);
    expect(prisma.tx.book.create.mock.calls[0][0].data.isbn).toBeNull();
  });

  it("accepts the boundary values", async () => {
    const res = await request(app)
      .post("/api/books")
      .set(auth())
      .send({
        ...valid,
        title: "a".repeat(100),
        author: "a".repeat(100),
        description: "a".repeat(255),
        publishYear: 1900,
        isbn: null,
        quantity: 1,
      });
    expect(res.status).toBe(201);
    expect((await request(app).post("/api/books").set(auth()).send({ ...valid, publishYear: thisYear })).status).toBe(201);
  });

  it.each([
    ["title", { title: "" }],
    ["title", { title: "a".repeat(101) }],
    ["author", { author: "  " }],
    ["author", { author: "a".repeat(101) }],
    ["publishYear", { publishYear: 1899 }],
    ["publishYear", { publishYear: thisYear + 1 }],
    ["publishYear", { publishYear: 2000.5 }],
    ["publishYear", { publishYear: "abc" }],
    ["isbn", { isbn: "123" }],
    ["isbn", { isbn: "978-0-306-40615-8" }],
    ["isbn", { isbn: 9780306406157 }],
    ["categoryId", { categoryId: undefined }],
    ["categoryId", { categoryId: "" }],
    ["categoryId", { categoryId: 0 }],
    ["description", { description: "" }],
    ["description", { description: "a".repeat(256) }],
    ["quantity", { quantity: 0 }],
    ["quantity", { quantity: -1 }],
    ["quantity", { quantity: 1.5 }],
    ["quantity", { quantity: "abc" }],
    ["quantity", { quantity: 100001 }],
  ])("rejects invalid %s", async (field, patch) => {
    const res = await request(app).post("/api/books").set(auth()).send({ ...valid, ...patch });
    expect(res.status).toBe(400);
    expect(res.body.errors[field]).toBeTruthy();
    expect(prisma.tx.book.create).not.toHaveBeenCalled();
  });

  it("rejects counters supplied by the client", async () => {
    for (const extra of [{ availableQuantity: 99 }, { borrowedQuantity: 1 }, { totalQuantity: 9 }]) {
      expect((await request(app).post("/api/books").set(auth()).send({ ...valid, ...extra })).status).toBe(400);
    }
    expect(prisma.tx.book.create).not.toHaveBeenCalled();
  });

  it("returns 400 when the category is missing or deleted, locking the row in the same transaction", async () => {
    prisma.tx.$queryRaw.mockResolvedValue([]);
    const res = await request(app).post("/api/books").set(auth()).send(valid);
    expect(res.status).toBe(400);
    expect(res.body.errors.categoryId).toBe("Thể loại không tồn tại");
    expect(prisma.tx.book.create).not.toHaveBeenCalled();
    expect(prisma.tx.$queryRaw.mock.calls[0].join(" ")).toMatch(/FOR SHARE/);
  });

  it("returns 409 when an active book already has the ISBN (after normalization)", async () => {
    prisma.book.findFirst.mockResolvedValue({ id: 2 });
    const res = await request(app).post("/api/books").set(auth()).send(valid);
    expect(res.status).toBe(409);
    expect(res.body.errors.isbn).toBe("ISBN đã tồn tại");
    expect(prisma.book.findFirst.mock.calls[0][0].where).toEqual({ isbn: "9780306406157", deletedAt: null });
    expect(prisma.tx.book.create).not.toHaveBeenCalled();
  });

  it("does not report a unique violation on another column as a duplicate ISBN", async () => {
    prisma.tx.book.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002", meta: { target: ["other"] } }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(app).post("/api/books").set(auth()).send(valid);
    spy.mockRestore();
    expect(res.status).toBe(500);
  });

  it("returns 409 when a concurrent request hits the unique index", async () => {
    prisma.tx.book.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    expect((await request(app).post("/api/books").set(auth()).send(valid)).status).toBe(409);
  });
});
