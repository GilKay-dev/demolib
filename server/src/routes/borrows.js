import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createBorrowSchema, rejectBorrowSchema } from "../validators/borrow.js";

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

const ALREADY_PROCESSED = { message: "Đơn đã được xử lý bởi người khác, vui lòng tải lại danh sách" };
const NO_STOCK = { message: "Sách đã hết bản, không thể xác nhận; hãy từ chối với lý do hết sách" };
const BORROW_MISSING = { message: "Không tìm thấy đơn mượn" };

// Ngày hôm nay dạng date (00:00 UTC) để lưu vào cột date mà không lệch múi giờ
const today = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
};

// 2.3.2 Danh sách đơn chờ xác nhận, cũ nhất trước
borrowsRouter.get("/", authenticate, requireRole("LIBRARIAN"), async (req, res) => {
  const items = await prisma.borrow.findMany({
    where: { status: "PENDING", book: { deletedAt: null } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      requestedDays: true,
      createdAt: true,
      reader: { select: { id: true, name: true } },
      book: { select: { id: true, title: true, author: true, availableQuantity: true } },
    },
  });
  res.json({ items });
});

// Khóa đơn rồi (nếu cần) khóa sách trong transaction; chỉ một NV xử lý được mỗi đơn
async function lockPending(tx, id) {
  const rows = await tx.$queryRaw`SELECT id, book_id, requested_days, status FROM borrows WHERE id = ${id} FOR UPDATE`;
  if (rows.length === 0) return { error: BORROW_MISSING, status: 404 };
  if (rows[0].status !== "PENDING") return { error: ALREADY_PROCESSED, status: 409 };
  return { borrow: rows[0] };
}

// 2.3.2 Xác nhận: Đang mượn, tính hạn trả, available -1 / borrowed +1
borrowsRouter.post("/:id/confirm", authenticate, requireRole("LIBRARIAN"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json(BORROW_MISSING);

  const result = await prisma.$transaction(async (tx) => {
    const locked = await lockPending(tx, id);
    if (locked.error) return locked;
    const { book_id: bookId, requested_days: days } = locked.borrow;
    const books = await tx.$queryRaw`SELECT available_quantity FROM books WHERE id = ${bookId} FOR UPDATE`;
    if (books.length === 0 || Number(books[0].available_quantity) <= 0) return { error: NO_STOCK, status: 409 };

    const borrowDate = today();
    const dueDate = new Date(borrowDate.getTime() + Number(days) * 86400000);
    const borrow = await tx.borrow.update({
      where: { id },
      data: { status: "BORROWING", borrowDate, dueDate, processedById: req.user.id, processedAt: new Date() },
    });
    await tx.book.update({ where: { id: bookId }, data: { availableQuantity: { decrement: 1 }, borrowedQuantity: { increment: 1 } } });
    return { borrow };
  });

  if (result.error) return res.status(result.status).json(result.error);
  const { borrow } = result;
  res.json({
    message: "Đã xác nhận đơn mượn",
    borrow: { id: borrow.id, status: borrow.status, borrowDate: borrow.borrowDate, dueDate: borrow.dueDate },
  });
});

// 2.3.2 Từ chối: bắt buộc có lý do, tồn kho không đổi
borrowsRouter.post("/:id/reject", authenticate, requireRole("LIBRARIAN"), validate(rejectBorrowSchema), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json(BORROW_MISSING);

  const result = await prisma.$transaction(async (tx) => {
    const locked = await lockPending(tx, id);
    if (locked.error) return locked;
    const borrow = await tx.borrow.update({
      where: { id },
      data: { status: "REJECTED", rejectReason: req.body.reason, processedById: req.user.id, processedAt: new Date() },
    });
    return { borrow };
  });

  if (result.error) return res.status(result.status).json(result.error);
  res.json({ message: "Đã từ chối đơn mượn", borrow: { id: result.borrow.id, status: result.borrow.status } });
});

const NOT_OWNER = { message: "Không có quyền thao tác trên đơn mượn này" };
const NOT_BORROWING = { message: "Chỉ yêu cầu trả được sách đang mượn" };
const RETURN_DUPLICATE = { message: "Bạn đã gửi yêu cầu trả cho sách này" };

const ALL_STATUSES = ["PENDING", "BORROWING", "OVERDUE", "RETURNED", "REJECTED"];
const RENEW_DAYS = 7;
const MAX_RENEWALS = 1;

// 2.3.3 Lịch sử mượn của độc giả (mới nhất trước), lọc theo ?status=; kèm lý do từ chối, ngày trả, cờ đã gửi yêu cầu trả
borrowsRouter.get("/mine", authenticate, requireRole("READER"), async (req, res) => {
  const { status } = req.query;
  if (status !== undefined && !ALL_STATUSES.includes(status)) return res.status(400).json({ message: "Trạng thái không hợp lệ" });
  const rows = await prisma.borrow.findMany({
    where: { readerId: req.user.id, ...(status && { status }) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      status: true,
      borrowDate: true,
      dueDate: true,
      returnDate: true,
      renewCount: true,
      rejectReason: true,
      book: { select: { id: true, title: true, author: true } },
      returnRequests: { where: { status: "PENDING" }, select: { id: true }, take: 1 },
    },
  });
  const items = rows.map(({ returnRequests, ...b }) => ({ ...b, returnPending: returnRequests.length > 0 }));
  res.json({ items });
});

const RENEW_NOT_ALLOWED = { message: "Chỉ gia hạn được sách đang mượn và chưa quá hạn" };
const RENEW_LIMIT = { message: "Sách này đã được gia hạn tối đa số lần cho phép" };

// 2.3.3 Gia hạn +7 ngày, tối đa 1 lần, chỉ khi chưa quá hạn
borrowsRouter.post("/:id/renew", authenticate, requireRole("READER"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json(BORROW_MISSING);

  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT id, reader_id, status, due_date, renew_count FROM borrows WHERE id = ${id} FOR UPDATE`;
    if (rows.length === 0) return { status: 404, body: BORROW_MISSING };
    const row = rows[0];
    if (Number(row.reader_id) !== req.user.id) return { status: 403, body: NOT_OWNER };
    if (row.status !== "BORROWING" || !row.due_date || new Date(row.due_date) < today()) {
      return { status: 409, body: RENEW_NOT_ALLOWED };
    }
    if (Number(row.renew_count) >= MAX_RENEWALS) return { status: 409, body: RENEW_LIMIT };
    const dueDate = new Date(new Date(row.due_date).getTime() + RENEW_DAYS * 86400000);
    return { borrow: await tx.borrow.update({ where: { id }, data: { dueDate, renewCount: { increment: 1 } } }) };
  });

  if (result.body) return res.status(result.status).json(result.body);
  res.json({ message: `Đã gia hạn thêm ${RENEW_DAYS} ngày`, borrow: { id, dueDate: result.borrow.dueDate, renewCount: result.borrow.renewCount } });
});

// 2.4.1 Tạo yêu cầu trả "Chờ xác nhận"; tồn kho và trạng thái đơn chỉ đổi khi nhân viên xác nhận (2.4.2)
borrowsRouter.post("/:id/return-requests", authenticate, requireRole("READER"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json(BORROW_MISSING);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw`SELECT id, reader_id, status FROM borrows WHERE id = ${id} FOR UPDATE`;
      if (rows.length === 0) return { status: 404, body: BORROW_MISSING };
      if (Number(rows[0].reader_id) !== req.user.id) return { status: 403, body: NOT_OWNER };
      if (!["BORROWING", "OVERDUE"].includes(rows[0].status)) return { status: 409, body: NOT_BORROWING };
      if (await tx.returnRequest.findFirst({ where: { borrowId: id, status: "PENDING" }, select: { id: true } })) {
        return { status: 409, body: RETURN_DUPLICATE };
      }
      return { request: await tx.returnRequest.create({ data: { borrowId: id } }) };
    });
    if (result.body) return res.status(result.status).json(result.body);
    res.status(201).json({
      message: "Đã gửi yêu cầu trả, vui lòng mang sách đến thư viện",
      returnRequest: { id: result.request.id, borrowId: id, status: result.request.status },
    });
  } catch (err) {
    // Unique index (borrow_id) WHERE status = PENDING bắt trường hợp bấm hai lần đồng thời
    if (err.code === "P2002") return res.status(409).json(RETURN_DUPLICATE);
    throw err;
  }
});
