import { authFor, fakeUser } from "../test/auth.js";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidIsbn, normalizeIsbn } from "../lib/isbn.js";

vi.mock("../lib/prisma.js", () => {
  const tx = { $queryRaw: vi.fn(), book: { create: vi.fn() } };
  return {
    prisma: {
      user: { findUnique: vi.fn() },
      book: { findFirst: vi.fn(), count: vi.fn(), findMany: vi.fn() },
      category: { findFirst: vi.fn() },
      $queryRaw: vi.fn(),
      $transaction: vi.fn((fn) => fn(tx)),
      tx,
    },
  };
});

process.env.JWT_SECRET = "test-secret";
const { prisma } = await import("../lib/prisma.js");
const { app } = await import("../app.js");

const auth = () => authFor();
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
  prisma.user.findUnique.mockResolvedValue(fakeUser());
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
    prisma.user.findUnique.mockResolvedValue(fakeUser({ role }));
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

describe("GET /api/books (public list)", () => {
  const row = (id, over = {}) => ({
    id,
    title: `Sách ${id}`,
    author: "Tác giả",
    publishYear: 2000,
    availableQuantity: 2,
    borrowedQuantity: 1,
    category: { id: 3, name: "Công nghệ" },
    ...over,
  });
  const findArgs = () => prisma.book.findMany.mock.calls[0][0];

  beforeEach(() => {
    prisma.book.count.mockResolvedValue(25);
    prisma.book.findMany.mockResolvedValue([row(1), row(2)]);
    prisma.category.findFirst.mockResolvedValue({ id: 3 });
    prisma.$queryRaw.mockResolvedValue([]);
  });

  it("needs no login and returns the listed fields plus paging info", async () => {
    const res = await request(app).get("/api/books");
    expect(res.status).toBe(200);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ page: 1, pageSize: 10, total: 25, totalPages: 3 });
    expect(res.body.items[0]).toEqual({
      id: 1,
      title: "Sách 1",
      author: "Tác giả",
      publishYear: 2000,
      category: { id: 3, name: "Công nghệ" },
      availableQuantity: 2,
      borrowedQuantity: 1,
    });
  });

  it("only lists books that are not deleted, 10 per page, sorted by title by default", async () => {
    await request(app).get("/api/books");
    expect(findArgs()).toMatchObject({
      where: { deletedAt: null },
      orderBy: [{ title: "asc" }, { id: "asc" }],
      skip: 0,
      take: 10,
    });
  });

  it("searches title or author case-insensitively on the trimmed query", async () => {
    await request(app).get("/api/books").query({ q: "  Code " });
    expect(findArgs().where.OR).toEqual([
      { title: { contains: "Code", mode: "insensitive" } },
      { author: { contains: "Code", mode: "insensitive" } },
    ]);
  });

  it("ignores an empty or repeated q", async () => {
    await request(app).get("/api/books?q=%20%20");
    expect(findArgs().where.OR).toBeUndefined();
    prisma.book.findMany.mockClear();
    await request(app).get("/api/books?q=a&q=b");
    expect(findArgs().where.OR).toBeUndefined();
  });

  it("filters by an existing category", async () => {
    await request(app).get("/api/books?categoryId=3");
    expect(prisma.category.findFirst.mock.calls[0][0].where).toEqual({ id: 3, deletedAt: null });
    expect(findArgs().where.categoryId).toBe(3);
  });

  it.each(["999", "abc", "-1", "99999999999999"])("drops the category filter for %s", async (id) => {
    prisma.category.findFirst.mockResolvedValue(null);
    const res = await request(app).get("/api/books").query({ categoryId: id });
    expect(res.status).toBe(200);
    expect(findArgs().where.categoryId).toBeUndefined();
  });

  it("sorts by newest publish year", async () => {
    await request(app).get("/api/books?sort=year");
    expect(findArgs().orderBy[0]).toEqual({ publishYear: "desc" });
  });

  it("falls back to title order for an unknown sort", async () => {
    await request(app).get("/api/books?sort=bogus");
    expect(findArgs().orderBy).toEqual([{ title: "asc" }, { id: "asc" }]);
  });

  it("paginates with skip", async () => {
    const res = await request(app).get("/api/books?page=2");
    expect(res.body.page).toBe(2);
    expect(findArgs().skip).toBe(10);
  });

  it.each(["0", "-3", "abc", "1.5", ""])("uses page 1 for page=%j", async (page) => {
    const res = await request(app).get("/api/books").query({ page });
    expect(res.body.page).toBe(1);
  });

  it("moves to the last page that has data when page is too large", async () => {
    const res = await request(app).get("/api/books?page=99");
    expect(res.body.page).toBe(3);
    expect(findArgs().skip).toBe(20);
  });

  it("returns an empty first page when nothing matches", async () => {
    prisma.book.count.mockResolvedValue(0);
    prisma.book.findMany.mockResolvedValue([]);
    const res = await request(app).get("/api/books?q=zzz&page=4");
    expect(res.body).toMatchObject({ items: [], page: 1, total: 0, totalPages: 1 });
  });

  describe("sort=popular", () => {
    const sqlOf = () => prisma.$queryRaw.mock.calls[0][0].join("?");
    const paramsOf = () => prisma.$queryRaw.mock.calls[0].slice(1);

    it("ranks in SQL by confirmed borrow count, then title, and keeps the order of the ranked ids", async () => {
      prisma.book.count.mockResolvedValue(4);
      prisma.$queryRaw.mockResolvedValue([{ id: 3 }, { id: 1 }, { id: 2 }, { id: 4 }]);
      prisma.book.findMany.mockResolvedValue([row(1), row(2), row(3), row(4)]); // DB returns them unordered
      const res = await request(app).get("/api/books?sort=popular");
      expect(res.body.items.map((b) => b.id)).toEqual([3, 1, 2, 4]);
      expect(sqlOf()).toMatch(/'BORROWING', 'OVERDUE', 'RETURNED'/);
      expect(sqlOf()).toMatch(/ORDER BY COUNT\(w\.id\) DESC, b\.title ASC, b\.id ASC/);
      expect(prisma.book.findMany.mock.calls[0][0].where).toEqual({ id: { in: [3, 1, 2, 4] } });
    });

    it("fetches only one page in SQL and passes filters as parameters, never loading all books", async () => {
      prisma.book.count.mockResolvedValue(12);
      prisma.$queryRaw.mockResolvedValue([{ id: 11 }, { id: 12 }]);
      prisma.book.findMany.mockResolvedValue([row(11), row(12)]);
      const res = await request(app).get("/api/books?sort=popular&page=2&q=s&categoryId=3");
      expect(res.body.items.map((b) => b.id)).toEqual([11, 12]);
      // [categoryId, categoryId, like, like, like, limit, offset]
      expect(paramsOf()).toEqual([3, 3, "%s%", "%s%", "%s%", 10, 10]);
      expect(sqlOf()).not.toMatch(/s%|3/); // giá trị người dùng không nằm trong chuỗi SQL
      expect(prisma.book.findMany).toHaveBeenCalledTimes(1); // chỉ lấy dữ liệu của trang, không nạp toàn bộ sách
    });

    it("passes null parameters when no filter is set", async () => {
      prisma.book.count.mockResolvedValue(1);
      await request(app).get("/api/books?sort=popular");
      expect(paramsOf()).toEqual([null, null, null, null, null, 10, 0]);
    });
  });

  describe("LIKE wildcards in the search term", () => {
    it.each([
      ["50%", "50\\%"],
      ["a_b", "a\\_b"],
      ["back\\slash", "back\\\\slash"],
    ])("escapes %j for the Prisma contains filter", async (input, escaped) => {
      await request(app).get("/api/books").query({ q: input });
      expect(prisma.book.findMany.mock.calls[0][0].where.OR[0].title.contains).toBe(escaped);
    });

    it("escapes the pattern passed to the SQL ILIKE for sort=popular too", async () => {
      await request(app).get("/api/books").query({ q: "100%", sort: "popular" });
      expect(prisma.$queryRaw.mock.calls[0].slice(1)).toContain("%100\\%%");
    });
  });
});
