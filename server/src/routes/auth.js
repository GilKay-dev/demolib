import bcrypt from "bcryptjs";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { validate } from "../middleware/validate.js";
import { signToken } from "../lib/token.js";
import { loginSchema, registerSchema } from "../validators/auth.js";

export const authRouter = Router();

const BAD_CREDENTIALS = { message: "Email hoặc mật khẩu không đúng" };
const INACTIVE = {
  PENDING: "Tài khoản đang chờ quản lý viên kích hoạt",
  DISABLED: "Tài khoản đã bị vô hiệu hóa",
};
// Hash giả để so sánh khi email không tồn tại, tránh lộ email qua thời gian phản hồi
const DUMMY_HASH = bcrypt.hashSync("dummy-password", 10);

// 2.1.2 Đăng nhập: trả JWT 24h
authRouter.post("/login", validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return res.status(401).json(BAD_CREDENTIALS);
  if (user.status !== "ACTIVE") return res.status(403).json({ message: INACTIVE[user.status] });

  res.json({
    token: signToken(user),
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

const EMAIL_TAKEN = { message: "Email đã được sử dụng", errors: { email: "Email đã được sử dụng" } };

// 2.1.1 Đăng ký: luôn tạo Reader, trạng thái Chờ xác nhận
authRouter.post("/register", validate(registerSchema), async (req, res) => {
  const { email, name, password } = req.body;

  if (await prisma.user.findUnique({ where: { email } })) {
    return res.status(409).json(EMAIL_TAKEN);
  }

  try {
    const user = await prisma.user.create({
      data: { email, name, passwordHash: await bcrypt.hash(password, 10), role: "READER", status: "PENDING" },
      select: { id: true, email: true, name: true, role: true, status: true },
    });
    res.status(201).json({
      message: "Đăng ký thành công, vui lòng chờ quản lý viên kích hoạt",
      user,
    });
  } catch (err) {
    // Hai request cùng email đồng thời: unique constraint bắt request thứ hai
    if (err.code === "P2002") return res.status(409).json(EMAIL_TAKEN);
    throw err;
  }
});
