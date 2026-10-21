import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { confirmReturnSchema } from "../validators/returnRequest.js";

export const returnRequestsRouter = Router();

const REQUEST_MISSING = { message: "Không tìm thấy yêu cầu trả" };
const ALREADY_PROCESSED = { message: "Yêu cầu đã được xử lý bởi người khác, vui lòng tải lại danh sách" };
const LATE_LEVEL_REQUIRED = { message: "Bắt buộc chọn mức phạt trả muộn" };
const LEVEL_MISSING = { message: "Mức phạt không tồn tại" };

const DAY = 86400000;
const parseId = (raw) => (typeof raw === "string" && /^\d+$/.test(raw) && Number(raw) <= 2147483647 ? Number(raw) : null);

// Ngày hôm nay dạng date (00:00 UTC), cùng cách lưu với due_date nên so sánh không lệch múi giờ
const today = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
};
const daysLate = (dueDate, now) => Math.max(0, Math.round((now.getTime() - new Date(dueDate).getTime()) / DAY));

// 2.4.2 Yêu cầu trả chờ xác nhận (cũ nhất trước) kèm các mức phạt để form chọn
returnRequestsRouter.get("/", authenticate, requireRole("LIBRARIAN"), async (req, res) => {
  const [rows, fineLevels] = await Promise.all([
    prisma.returnRequest.findMany({
      where: { status: "PENDING" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        createdAt: true,
        borrow: {
          select: {
            id: true,
            borrowDate: true,
            dueDate: true,
            reader: { select: { id: true, name: true } },
            book: { select: { id: true, title: true, author: true } },
          },
        },
      },
    }),
    prisma.fineLevel.findMany({
      where: { deletedAt: null },
      orderBy: [{ amount: "asc" }, { id: "asc" }],
      select: { id: true, name: true, amount: true },
    }),
  ]);
  const now = today();
  const items = rows.map((r) => ({ ...r, daysLate: daysLate(r.borrow.dueDate, now) }));
  res.json({ items, fineLevels });
});

// 2.4.2 Xác nhận trả: đơn thành "Đã trả", cập nhật tồn kho và tạo phiếu phạt (một transaction)
returnRequestsRouter.post("/:id/confirm", authenticate, requireRole("LIBRARIAN"), validate(confirmReturnSchema), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json(REQUEST_MISSING);
  const { condition, conditionFineLevelId, note, lateFineLevelId } = req.body;

  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`SELECT id, borrow_id, status FROM return_requests WHERE id = ${id} FOR UPDATE`;
    if (rows.length === 0) return { status: 404, body: REQUEST_MISSING };
    if (rows[0].status !== "PENDING") return { status: 409, body: ALREADY_PROCESSED };

    const borrowId = Number(rows[0].borrow_id);
    const borrows = await tx.$queryRaw`SELECT id, book_id, due_date, status FROM borrows WHERE id = ${borrowId} FOR UPDATE`;
    if (!["BORROWING", "OVERDUE"].includes(borrows[0].status)) return { status: 409, body: ALREADY_PROCESSED };
    const bookId = Number(borrows[0].book_id);

    const now = today();
    const late = daysLate(borrows[0].due_date, now) > 0;
    if (late && !lateFineLevelId) return { status: 400, body: LATE_LEVEL_REQUIRED };

    const levelIds = [...new Set([late && lateFineLevelId, condition !== "NORMAL" && conditionFineLevelId].filter(Boolean))];
    const levels = await tx.fineLevel.findMany({ where: { id: { in: levelIds }, deletedAt: null } });
    const level = (levelId) => levels.find((l) => l.id === levelId);
    if (levels.length !== levelIds.length) return { status: 400, body: LEVEL_MISSING };

    const fines = [];
    const addFine = (type, lv, fineNote) =>
      fines.push({ borrowId, fineLevelId: lv.id, type, levelName: lv.name, amount: lv.amount, note: fineNote ?? null, finedDate: now, createdById: req.user.id });
    if (late) addFine("LATE", level(lateFineLevelId));
    if (condition !== "NORMAL") addFine(condition, level(conditionFineLevelId), note);
    if (fines.length > 0) await tx.fine.createMany({ data: fines });

    // Bản sách hư hỏng / mất không quay lại kho: giảm cả đang mượn và tổng
    await tx.$queryRaw`SELECT id FROM books WHERE id = ${bookId} FOR UPDATE`;
    await tx.book.update({
      where: { id: bookId },
      data:
        condition === "NORMAL"
          ? { availableQuantity: { increment: 1 }, borrowedQuantity: { decrement: 1 } }
          : { borrowedQuantity: { decrement: 1 }, totalQuantity: { decrement: 1 } },
    });
    await tx.borrow.update({
      where: { id: borrowId },
      data: { status: "RETURNED", returnDate: now, returnCondition: condition, processedById: req.user.id, processedAt: new Date() },
    });
    await tx.returnRequest.update({ where: { id }, data: { status: "CONFIRMED", confirmedById: req.user.id, confirmedAt: new Date() } });

    const totalFine = fines.reduce((sum, f) => sum + Number(f.amount), 0);
    return { ok: true, borrowId, fines: fines.map((f) => ({ type: f.type, amount: Number(f.amount) })), totalFine };
  });

  if (result.body) return res.status(result.status).json(result.body);
  res.json({
    message: result.totalFine > 0 ? "Đã xác nhận trả sách và tạo phiếu phạt" : "Đã xác nhận trả sách",
    borrow: { id: result.borrowId, status: "RETURNED", returnCondition: condition },
    fines: result.fines,
    totalFine: result.totalFine,
  });
});
