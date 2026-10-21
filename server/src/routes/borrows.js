import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createBorrowSchema } from "../validators/borrow.js";

export const borrowsRouter = Router();

// Đơn hoạt động: chờ xác nhận, đang mượn, quá hạn (giả định A3)
const ACTIVE_BORROWS = ["PENDING", "BORROWING", "OVERDUE"];
const MAX_ACTIVE_BORROWS = 5;

const BOOK_MISSING = { message: "Sách không tồn tại" };
const SOLD_OUT = { message: "Sách đã hết, không thể mượn" };
const DUPLICATE = { message: "Bạn đã mượn hoặc đang chờ duyệt sách này" };
const LIMIT = { message: `Đã đạt tối đa ${MAX_ACTIVE_BORROWS} sách mượn` };
const UNPAID_FINE = { message: "Bạn còn khoản phạt chưa thanh toán", link: "/fines" };

// Kiểm tra theo đúng thứ tự trong flow 2.3.1, trả về lỗi đầu tiên gặp phải (null nếu đủ điều kiện)
async function checkEligibility(db, readerId, bookId) {
  const book = await db.book.findFirst({ where: { id: bookId, deletedAt: null }, select: { availableQuantity: true } });
  if (!book) return { status: 404, body: BOOK_MISSING };
  if (book.availableQuantity <= 0) return { status: 409, body: SOLD_OUT };
  if (await db.borrow.findFirst({ where: { readerId, bookId, status: { in: ACTIVE_BORROWS } }, select: { id: true } })) {
    return { status: 409, body: DUPLICATE };
  }
  if ((await db.borrow.count({ where: { readerId, status: { in: ACTIVE_BORROWS } } })) >= MAX_ACTIVE_BORROWS) {
    return { status: 409, body: LIMIT };
  }
  if (await db.fine.findFirst({ where: { status: { not: "PAID" }, borrow: { readerId } }, select: { id: true } })) {
    return { status: 409, body: UNPAID_FINE };
  }
  return null;
}

const parseId = (raw) => (typeof raw === "string" && /^\d+$/.test(raw) && Number(raw) <= 2147483647 ? Number(raw) : null);

// FE gọi trước để hiện lý do ngay trên nút "Mượn sách"
borrowsRouter.get("/eligibility", authenticate, requireRole("READER"), async (req, res) => {
  const bookId = parseId(req.query.bookId);
  if (!bookId) return res.status(404).json(BOOK_MISSING);
  const problem = await checkEligibility(prisma, req.user.id, bookId);
  if (problem?.status === 404) return res.status(404).json(problem.body);
  res.json(problem ? { eligible: false, ...problem.body } : { eligible: true });
});

// 2.3.1 Tạo đơn mượn ở trạng thái "Chờ xác nhận"; tồn kho chỉ đổi khi nhân viên xác nhận (2.3.2)
borrowsRouter.post("/", authenticate, requireRole("READER"), validate(createBorrowSchema), async (req, res) => {
  const { bookId, days } = req.body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Khóa dòng độc giả để hai request đồng thời không cùng vượt giới hạn số sách
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${req.user.id} FOR UPDATE`;
      const problem = await checkEligibility(tx, req.user.id, bookId);
      if (problem) return { problem };
      const borrow = await tx.borrow.create({ data: { readerId: req.user.id, bookId, requestedDays: days } });
      return { borrow };
    });
    if (result.problem) return res.status(result.problem.status).json(result.problem.body);
    const { borrow } = result;
    res.status(201).json({
      message: "Đã gửi yêu cầu mượn, chờ nhân viên xác nhận",
      borrow: { id: borrow.id, bookId: borrow.bookId, status: borrow.status, requestedDays: borrow.requestedDays },
    });
  } catch (err) {
    // Unique index (reader, book) đang hoạt động bắt trường hợp trùng đơn đồng thời
    if (err.code === "P2002") return res.status(409).json(DUPLICATE);
    throw err;
  }
});
