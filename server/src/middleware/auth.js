import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { assertJwtSecret } from "../lib/token.js";

const UNAUTHORIZED = { message: "Vui lòng đăng nhập" };

// Xác thực Bearer JWT, rồi nạp user từ DB để vai trò/trạng thái luôn mới nhất
export async function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  if (scheme !== "Bearer" || !token) return res.status(401).json(UNAUTHORIZED);

  let payload;
  try {
    payload = jwt.verify(token, assertJwtSecret());
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) return res.status(401).json(UNAUTHORIZED);
    throw err;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status !== "ACTIVE") return res.status(401).json(UNAUTHORIZED);
  req.user = user;
  next();
}

export const requireRole =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user.role) ? next() : res.status(403).json({ message: "Bạn không có quyền thực hiện thao tác này" });
