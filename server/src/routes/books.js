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
// "Phổ biến" = số đơn mượn đã được nhân viên xác nhận (BORROWING, OVERDUE, RETURNED; dùng trực tiếp trong SQL bên dưới)

// Prisma không escape ký tự đại diện của LIKE, nên '%', '_' và '\' trong từ khóa phải tự escape để khớp theo nghĩa đen
const escapeLike = (s) => s.replace(/[\\%_]/g, "\\$&");

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

  const pattern = q ? escapeLike(q) : null;
  const where = {
    deletedAt: null,
    ...(categoryId && { categoryId }),
    ...(pattern && {
      OR: [
        { title: { contains: pattern, mode: "insensitive" } },
        { author: { contains: pattern, mode: "insensitive" } },
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
    // Sắp xếp theo số đơn mượn đã xác nhận ngay trong SQL (chỉ lấy đúng một trang), hòa thì theo tên như sort=name
    const like = pattern && `%${pattern}%`;
    const ranked = await prisma.$queryRaw`
      SELECT b.id
      FROM books b
      LEFT JOIN borrows w ON w.book_id = b.id AND w.status IN ('BORROWING', 'OVERDUE', 'RETURNED')
      WHERE b.deleted_at IS NULL
        AND (${categoryId}::int IS NULL OR b.category_id = ${categoryId}::int)
        AND (${like}::text IS NULL OR b.title ILIKE ${like}::text OR b.author ILIKE ${like}::text)
      GROUP BY b.id
      ORDER BY COUNT(w.id) DESC, b.title ASC, b.id ASC
      LIMIT ${PAGE_SIZE} OFFSET ${skip}`;
    const pageIds = ranked.map((r) => r.id);
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
