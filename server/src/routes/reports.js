import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { reportQuerySchema } from "../validators/report.js";

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

// ---- 2.7.2 Báo cáo chi tiết ----

const ymd = (d) => d.toISOString().slice(0, 10);

// Khoảng [from, to] (gồm cả hai đầu) của kỳ hiện tại; from/to tự chọn ưu tiên hơn period
export const resolveRange = ({ period, from, to }, now = today()) => {
  if (from && to) return { from, to };
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  let start;
  let end;
  if (period === "day") {
    start = end = now;
  } else if (period === "week") {
    start = new Date(Date.UTC(y, m, d - ((now.getUTCDay() + 6) % 7))); // thứ Hai
    end = new Date(start.getTime() + 6 * DAY);
  } else if (period === "quarter") {
    const q = Math.floor(m / 3) * 3;
    start = new Date(Date.UTC(y, q, 1));
    end = new Date(Date.UTC(y, q + 3, 0));
  } else if (period === "year") {
    start = new Date(Date.UTC(y, 0, 1));
    end = new Date(Date.UTC(y, 11, 31));
  } else {
    start = new Date(Date.UTC(y, m, 1));
    end = new Date(Date.UTC(y, m + 1, 0));
  }
  return { from: ymd(start), to: ymd(end) };
};

// Ô bắt đầu bằng = + - @ bị Excel coi là công thức: thêm dấu ' phía trước để chặn CSV injection
const csvCell = (v) => {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? ymd(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// BOM để Excel mở đúng tiếng Việt
export const toCsv = (columns, rows) =>
  "﻿" +
  [columns.map((c) => csvCell(c.label)), ...rows.map((r) => columns.map((c) => csvCell(r[c.key])))]
    .map((l) => l.join(","))
    .join("\r\n") +
  "\r\n";

const sendReport = (res, format, name, columns, rows, extra = {}) => {
  if (format === "csv") {
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="${name}.csv"`);
    return res.send(toCsv(columns, rows));
  }
  return res.json({ ...extra, items: rows });
};

const parseQuery = (req, res) => {
  const { value, error } = reportQuerySchema.validate(req.query, { abortEarly: false });
  if (error) {
    res.status(400).json({ message: "Tham số không hợp lệ", errors: { query: error.details[0].message } });
    return null;
  }
  return { ...value, range: resolveRange(value) };
};

// Báo cáo sách: tồn kho, số sách mất/hỏng và số lần mượn trong kỳ
reportsRouter.get("/books", ...staff, async (req, res) => {
  const q = parseQuery(req, res);
  if (!q) return;
  const { from, to } = q.range;
  const rows = await prisma.$queryRaw`
    SELECT b.id, b.title, b.author, b.total_quantity::int AS "total",
           b.available_quantity::int AS "available", b.borrowed_quantity::int AS "borrowed",
           COUNT(w.id) FILTER (WHERE w.return_condition = 'LOST')::int AS "lost",
           COUNT(w.id) FILTER (WHERE w.return_condition = 'DAMAGED')::int AS "damaged",
           COUNT(w.id) FILTER (WHERE w.status IN ('BORROWING', 'OVERDUE', 'RETURNED')
             AND w.borrow_date BETWEEN ${from}::date AND ${to}::date)::int AS "borrowCount"
    FROM books b
    LEFT JOIN borrows w ON w.book_id = b.id
    WHERE b.deleted_at IS NULL
    GROUP BY b.id
    ORDER BY "borrowCount" DESC, b.title ASC, b.id ASC`;
  const columns = [
    { key: "title", label: "Tên sách" },
    { key: "author", label: "Tác giả" },
    { key: "total", label: "Tổng số" },
    { key: "available", label: "Có sẵn" },
    { key: "borrowed", label: "Đang mượn" },
    { key: "lost", label: "Bị mất" },
    { key: "damaged", label: "Hư hỏng" },
    { key: "borrowCount", label: "Số lần mượn" },
  ];
  sendReport(res, q.format, `bao-cao-sach_${from}_${to}`, columns, rows, { range: q.range });
});

// Báo cáo mượn trả: lượt mượn (theo ngày mượn) và trả (theo ngày trả), gom theo ngày/tuần/tháng/quý
reportsRouter.get("/borrows", ...staff, async (req, res) => {
  const q = parseQuery(req, res);
  if (!q) return;
  const { from, to } = q.range;
  const unit = q.groupBy; // đã qua Joi valid() nên an toàn khi truyền vào date_trunc
  const rows = await prisma.$queryRaw`
    SELECT to_char(g.bucket, 'YYYY-MM-DD') AS "bucket",
           COALESCE(SUM(g.borrowed), 0)::int AS "borrowed",
           COALESCE(SUM(g.returned), 0)::int AS "returned"
    FROM (
      SELECT date_trunc(${unit}, borrow_date)::date AS bucket, 1 AS borrowed, 0 AS returned
      FROM borrows
      WHERE status IN ('BORROWING', 'OVERDUE', 'RETURNED') AND borrow_date BETWEEN ${from}::date AND ${to}::date
      UNION ALL
      SELECT date_trunc(${unit}, return_date)::date, 0, 1
      FROM borrows
      WHERE status = 'RETURNED' AND return_date BETWEEN ${from}::date AND ${to}::date
    ) g
    GROUP BY g.bucket
    ORDER BY g.bucket ASC`;
  const columns = [
    { key: "bucket", label: "Từ ngày" },
    { key: "borrowed", label: "Lượt mượn" },
    { key: "returned", label: "Lượt trả" },
  ];
  sendReport(res, q.format, `bao-cao-muon-tra_${from}_${to}`, columns, rows, {
    range: q.range,
    groupBy: unit,
    totals: {
      borrowed: rows.reduce((s, r) => s + r.borrowed, 0),
      returned: rows.reduce((s, r) => s + r.returned, 0),
    },
  });
});

// Báo cáo phạt: doanh thu phạt đã thu trong kỳ và danh sách độc giả còn nợ phạt
reportsRouter.get("/fines", ...staff, async (req, res) => {
  const q = parseQuery(req, res);
  if (!q) return;
  const { from, to } = q.range;
  const [revenue, debtors] = await Promise.all([
    prisma.$queryRaw`
      SELECT COALESCE(SUM(amount), 0)::float8 AS "total", COUNT(*)::int AS "count"
      FROM fines
      WHERE status = 'PAID' AND paid_at >= ${from}::date AND paid_at < ${to}::date + 1`,
    prisma.$queryRaw`
      SELECT u.id AS "readerId", u.name, u.email, COUNT(f.id)::int AS "fineCount", SUM(f.amount)::float8 AS "amount"
      FROM fines f
      JOIN borrows w ON w.id = f.borrow_id
      JOIN users u ON u.id = w.reader_id
      WHERE f.status IN ('UNPAID', 'PENDING', 'REJECTED')
      GROUP BY u.id
      ORDER BY SUM(f.amount) DESC, u.id ASC`,
  ]);
  const columns = [
    { key: "name", label: "Độc giả" },
    { key: "email", label: "Email" },
    { key: "fineCount", label: "Số phiếu phạt" },
    { key: "amount", label: "Số tiền nợ" },
  ];
  sendReport(res, q.format, `bao-cao-phat_${from}_${to}`, columns, debtors, {
    range: q.range,
    revenue: { total: revenue[0]?.total ?? 0, count: revenue[0]?.count ?? 0 },
  });
});

// Báo cáo sách mất/hư: danh sách sách cần thay thế (theo ngày trả trong kỳ)
reportsRouter.get("/replacements", ...staff, async (req, res) => {
  const q = parseQuery(req, res);
  if (!q) return;
  const { from, to } = q.range;
  const rows = await prisma.$queryRaw`
    SELECT w.id AS "borrowId", b.id AS "bookId", b.title, b.author, w.return_condition AS "condition",
           w.return_date AS "returnDate", u.name AS "readerName", u.email AS "readerEmail"
    FROM borrows w
    JOIN books b ON b.id = w.book_id
    JOIN users u ON u.id = w.reader_id
    WHERE w.return_condition IN ('LOST', 'DAMAGED') AND w.return_date BETWEEN ${from}::date AND ${to}::date
    ORDER BY w.return_date DESC, w.id DESC`;
  const label = { LOST: "Mất", DAMAGED: "Hư hỏng" };
  const shown = rows.map((r) => ({ ...r, conditionLabel: label[r.condition] }));
  const columns = [
    { key: "title", label: "Tên sách" },
    { key: "author", label: "Tác giả" },
    { key: "conditionLabel", label: "Tình trạng" },
    { key: "returnDate", label: "Ngày trả" },
    { key: "readerName", label: "Độc giả" },
    { key: "readerEmail", label: "Email" },
  ];
  sendReport(res, q.format, `bao-cao-sach-mat-hu_${from}_${to}`, columns, shown, { range: q.range });
});
