import bcrypt from "bcryptjs";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { validate } from "../middleware/validate.js";
import { registerSchema } from "../validators/auth.js";

export const authRouter = Router();

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
