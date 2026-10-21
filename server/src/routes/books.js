import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createBookSchema } from "../validators/book.js";

export const booksRouter = Router();

const CATEGORY_MISSING = { message: "Thể loại không tồn tại", errors: { categoryId: "Thể loại không tồn tại" } };
const ISBN_TAKEN = { message: "ISBN đã tồn tại", errors: { isbn: "ISBN đã tồn tại" } };

const toBook = (b) => ({
  id: b.id,
  title: b.title,
  author: b.author,
  isbn: b.isbn,
  publishYear: b.publishYear,
  description: b.description,
  categoryId: b.categoryId,
  totalQuantity: b.totalQuantity,
  availableQuantity: b.availableQuantity,
  borrowedQuantity: b.borrowedQuantity,
});

const PAGE_SIZE = 10;
const SORTS = ["name", "year", "popular"];
const MAX_QUERY_LENGTH = 100;
// "Phổ biến" = số đơn mượn đã được nhân viên xác nhận
const CONFIRMED = ["BORROWING", "OVERDUE", "RETURNED"];

const toListItem = (b) => ({
  id: b.id,
  title: b.title,
  author: b.author,
  publishYear: b.publishYear,
  category: b.category,
  availableQuantity: b.availableQuantity,
  borrowedQuantity: b.borrowedQuantity,
});
const listSelect = {
  id: true,
  title: true,
  author: true,
  publishYear: true,
  availableQuantity: true,
  borrowedQuantity: true,
  category: { select: { id: true, name: true } },
};
const byTitle = [{ title: "asc" }, { id: "asc" }];

const queryString = (v) => (typeof v === "string" ? v.trim().slice(0, MAX_QUERY_LENGTH) : "");

// 2.2.3 Danh sách sách (công khai). Tham số sai thì dùng mặc định thay vì báo lỗi
booksRouter.get("/", async (req, res) => {
  const q = queryString(req.query.q);
  const sort = SORTS.includes(req.query.sort) ? req.query.sort : "name";
  const requestedPage = /^\d+$/.test(req.query.page ?? "") ? Math.max(1, Number(req.query.page)) : 1;

  // categoryId không tồn tại (hoặc không hợp lệ) thì bỏ lọc
  let categoryId = null;
  if (/^\d+$/.test(req.query.categoryId ?? "") && Number(req.query.categoryId) <= 2147483647) {
    const found = await prisma.category.findFirst({
      where: { id: Number(req.query.categoryId), deletedAt: null },
      select: { id: true },
    });
    categoryId = found?.id ?? null;
  }

  const where = {
    deletedAt: null,
    ...(categoryId && { categoryId }),
    ...(q && {
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { author: { contains: q, mode: "insensitive" } },
      ],
    }),
  };

  const total = await prisma.book.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Trang vượt quá dữ liệu thì chuyển về trang cuối có dữ liệu
  const page = Math.min(requestedPage, totalPages);
  const skip = (page - 1) * PAGE_SIZE;

  let books;
  if (sort === "popular") {
    // Prisma không đếm có điều kiện theo quan hệ khi sắp xếp, nên tính độ phổ biến riêng rồi cắt trang
    const all = await prisma.book.findMany({ where, select: { id: true, title: true } });
    const counts = await prisma.borrow.groupBy({
      by: ["bookId"],
      where: { bookId: { in: all.map((b) => b.id) }, status: { in: CONFIRMED } },
      _count: { _all: true },
    });
    const popularity = new Map(counts.map((c) => [c.bookId, c._count._all]));
    const pageIds = all
      .sort((a, b) => (popularity.get(b.id) ?? 0) - (popularity.get(a.id) ?? 0) || a.title.localeCompare(b.title, "vi") || a.id - b.id)
      .slice(skip, skip + PAGE_SIZE)
      .map((b) => b.id);
    const rows = await prisma.book.findMany({ where: { id: { in: pageIds } }, select: listSelect });
    const byId = new Map(rows.map((b) => [b.id, b]));
    books = pageIds.map((id) => byId.get(id)).filter(Boolean);
  } else {
    books = await prisma.book.findMany({
      where,
      select: listSelect,
      orderBy: sort === "year" ? [{ publishYear: "desc" }, ...byTitle] : byTitle,
      skip,
      take: PAGE_SIZE,
    });
  }

  res.json({ items: books.map(toListItem), page, pageSize: PAGE_SIZE, total, totalPages });
});

// 2.2.2 Thêm sách: total = available = số lượng, borrowed = 0 ("Có sẵn" suy ra từ available > 0)
booksRouter.post(
  "/",
  authenticate,
  requireRole("LIBRARIAN"),
  (req, res, next) => validate(createBookSchema())(req, res, next),
  async (req, res) => {
    const { title, author, publishYear, isbn, categoryId, description, quantity } = req.body;

    if (isbn && (await prisma.book.findFirst({ where: { isbn, deletedAt: null }, select: { id: true } }))) {
      return res.status(409).json(ISBN_TAKEN);
    }

    try {
      const book = await prisma.$transaction(async (tx) => {
        // Khóa dòng thể loại (FOR SHARE) để không bị xóa mềm xen giữa kiểm tra và tạo sách
        const rows = await tx.$queryRaw`SELECT id FROM categories WHERE id = ${categoryId} AND deleted_at IS NULL FOR SHARE`;
        if (rows.length === 0) return null;
        return tx.book.create({
          data: {
            title,
            author,
            isbn,
            publishYear,
            description,
            categoryId,
            totalQuantity: quantity,
            availableQuantity: quantity,
            borrowedQuantity: 0,
          },
        });
      });
      if (!book) return res.status(400).json(CATEGORY_MISSING);
      res.status(201).json({ message: "Thêm sách thành công", book: toBook(book) });
    } catch (err) {
      // Hai request cùng ISBN đồng thời: unique index bắt request thứ hai
      // Chỉ coi là trùng ISBN khi đúng cột isbn (hoặc driver không báo cột vi phạm)
      const target = err.meta?.target;
      if (err.code === "P2002" && (!target || String(target).includes("isbn"))) {
        return res.status(409).json(ISBN_TAKEN);
      }
      throw err;
    }
  },
);
