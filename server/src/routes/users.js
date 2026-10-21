import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { userStatusSchema } from "../validators/user.js";

export const usersRouter = Router();

const PAGE_SIZE = 10;
const ROLES = ["READER", "LIBRARIAN", "ADMIN"];
const NOT_FOUND = { message: "Người dùng không tồn tại" };

const toUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  status: u.status,
  createdAt: u.createdAt.toISOString(),
});

const select = { id: true, email: true, name: true, role: true, status: true, createdAt: true };

// Xác thực khai báo trên từng route để route mới thêm không vô tình thành công khai
const adminOnly = [authenticate, requireRole("ADMIN")];

const parseId = (req, res, next) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) return res.status(404).json(NOT_FOUND);
  req.targetId = id;
  next();
};

// 2.6.1 Danh sách người dùng: tìm theo email/tên, lọc theo vai trò, 10 dòng/trang
usersRouter.get("/", ...adminOnly, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const role = ROLES.includes(req.query.role) ? req.query.role : undefined;
  const requestedPage = /^\d+$/.test(req.query.page ?? "") ? Math.max(1, Number(req.query.page)) : 1;

  const where = {
    ...(role && { role }),
    ...(q && {
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    }),
  };

  const total = await prisma.user.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const users = await prisma.user.findMany({
    where,
    select,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  res.json({ items: users.map(toUser), page, pageSize: PAGE_SIZE, total, totalPages });
});

// Kích hoạt (kể cả tài khoản mới đăng ký đang chờ) hoặc vô hiệu hóa; không tự khóa chính mình
usersRouter.patch("/:id/status", ...adminOnly, parseId, validate(userStatusSchema), async (req, res) => {
  const { status } = req.body;
  if (req.targetId === req.user.id && status !== "ACTIVE") {
    return res.status(409).json({ message: "Bạn không thể vô hiệu hóa chính tài khoản của mình" });
  }
  try {
    const user = await prisma.user.update({ where: { id: req.targetId }, data: { status }, select });
    res.json(toUser(user));
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json(NOT_FOUND);
    throw err;
  }
});
