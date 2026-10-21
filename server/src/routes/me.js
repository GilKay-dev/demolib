import { Router } from "express";
import { signToken } from "../lib/token.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { passwordLimiter } from "../middleware/rateLimit.js";
import { validate } from "../middleware/validate.js";
import { comparePassword, hashPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { changePasswordSchema, updateProfileSchema } from "../validators/me.js";

export const meRouter = Router();

// 2.1.3 chỉ dành cho Độc giả; userId luôn lấy từ token, không nhận từ client
meRouter.use(authenticate, requireRole("READER"));

const toProfile = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  phone: u.phone,
  address: u.address,
  createdAt: u.createdAt,
});

meRouter.get("/", async (req, res) => {
  const [borrowCount, fines] = await Promise.all([
    // Số lần mượn = số đơn đã được nhân viên xác nhận
    prisma.borrow.count({ where: { readerId: req.user.id, status: { in: ["BORROWING", "OVERDUE", "RETURNED"] } } }),
    // Tổng tiền phạt = các phiếu chưa Đã thanh toán
    prisma.fine.aggregate({
      where: { borrow: { readerId: req.user.id }, status: { not: "PAID" } },
      _sum: { amount: true },
    }),
  ]);
  res.json({
    ...toProfile(req.user),
    borrowCount,
    totalFine: Number(fines._sum.amount ?? 0),
  });
});

meRouter.put("/", validate(updateProfileSchema), async (req, res) => {
  const { name, phone, address } = req.body;
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { name, phone: phone || null, address },
  });
  res.json({ message: "Cập nhật thành công", user: toProfile(user) });
});

meRouter.put("/password", passwordLimiter, validate(changePasswordSchema), async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const { passwordHash } = await prisma.user.findUnique({ where: { id: req.user.id }, select: { passwordHash: true } });
  if (!(await comparePassword(currentPassword, passwordHash))) {
    return res
      .status(400)
      .json({ message: "Mật khẩu hiện tại không đúng", errors: { currentPassword: "Mật khẩu hiện tại không đúng" } });
  }
  const newHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: newHash } });
  // Mọi token cũ (kể cả của phiên này) hết hiệu lực; cấp token mới để người dùng hiện tại không bị đăng xuất
  res.json({ message: "Đổi mật khẩu thành công", token: signToken({ ...req.user, passwordHash: newHash }) });
});
