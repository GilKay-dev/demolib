import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";

export const reportsRouter = Router();

const DAY = 86400000;
const TOP_BOOKS = 5;
const OVERDUE_LIMIT = 50;

// Ngày hôm nay dạng date (00:00 UTC), cùng cách lưu với due_date nên so sánh không lệch múi giờ
const today = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
};

// Xác thực khai báo trên từng route để route mới thêm không vô tình thành công khai
const staff = [authenticate, requireRole("LIBRARIAN", "ADMIN")];

// 2.7.1 Dashboard: số liệu tổng quan cho thủ thư và quản lý viên
reportsRouter.get("/dashboard", ...staff, async (req, res) => {
  const now = today();
  const tomorrow = new Date(now.getTime() + DAY);
  // Quá hạn = đang mượn/quá hạn mà hạn trả đã qua (trạng thái OVERDUE không được cập nhật tự động)
  const overdueWhere = { status: { in: ["BORROWING", "OVERDUE"] }, dueDate: { lt: now } };

  const [stock, lost, damaged, activeReaders, disabledReaders, borrowsToday, top, overdue, overdueTotal] =
    await Promise.all([
      prisma.book.aggregate({
        where: { deletedAt: null },
        _sum: { availableQuantity: true, borrowedQuantity: true },
      }),
      prisma.borrow.count({ where: { returnCondition: "LOST" } }),
      prisma.borrow.count({ where: { returnCondition: "DAMAGED" } }),
      prisma.user.count({ where: { role: "READER", status: "ACTIVE" } }),
      prisma.user.count({ where: { role: "READER", status: "DISABLED" } }),
      prisma.borrow.count({ where: { createdAt: { gte: now, lt: tomorrow } } }),
      // "Phổ biến" = số đơn mượn đã được nhân viên xác nhận, giống sort=popular ở danh sách sách
      prisma.$queryRaw`
        SELECT b.id, b.title, b.author, COUNT(w.id)::int AS "borrowCount"
        FROM books b
        JOIN borrows w ON w.book_id = b.id AND w.status IN ('BORROWING', 'OVERDUE', 'RETURNED')
        WHERE b.deleted_at IS NULL
        GROUP BY b.id
        ORDER BY COUNT(w.id) DESC, b.title ASC, b.id ASC
        LIMIT ${TOP_BOOKS}`,
      prisma.borrow.findMany({
        where: overdueWhere,
        select: {
          id: true,
          dueDate: true,
          reader: { select: { id: true, name: true, email: true } },
          book: { select: { id: true, title: true } },
        },
        orderBy: [{ dueDate: "asc" }, { id: "asc" }],
        take: OVERDUE_LIMIT,
      }),
      prisma.borrow.count({ where: overdueWhere }),
    ]);

  res.json({
    books: {
      available: stock._sum.availableQuantity ?? 0,
      borrowed: stock._sum.borrowedQuantity ?? 0,
      lost,
      damaged,
    },
    readers: { active: activeReaders, disabled: disabledReaders },
    borrowsToday,
    topBooks: top.map((b) => ({ id: b.id, title: b.title, author: b.author, borrowCount: b.borrowCount })),
    overdue: {
      total: overdueTotal,
      items: overdue.map((o) => ({
        borrowId: o.id,
        reader: o.reader,
        book: o.book,
        dueDate: o.dueDate,
        daysLate: Math.max(1, Math.round((now.getTime() - new Date(o.dueDate).getTime()) / DAY)),
      })),
    },
  });
});
