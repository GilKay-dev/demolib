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

// 2.2.2 Thêm sách: total = available = số lượng, borrowed = 0 ("Có sẵn" suy ra từ available > 0)
booksRouter.post(
  "/",
  authenticate,
  requireRole("LIBRARIAN"),
  (req, res, next) => validate(createBookSchema())(req, res, next),
  async (req, res) => {
    const { title, author, publishYear, categoryId, description, quantity } = req.body;
    const isbn = req.body.isbn || null; // "" (allow của Joi bỏ qua custom) và thiếu đều thành null

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
      if (err.code === "P2002") return res.status(409).json(ISBN_TAKEN);
      throw err;
    }
  },
);
