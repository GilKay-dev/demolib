import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { assertJwtSecret, passwordFingerprint } from "../lib/token.js";

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

  const found = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!found || found.status !== "ACTIVE") return res.status(401).json(UNAUTHORIZED);

  // Token cấp trước khi đổi mật khẩu (hoặc không có dấu vân tay) không còn hợp lệ
  const { passwordHash, ...user } = found;
  if (payload.pv !== passwordFingerprint(passwordHash)) return res.status(401).json(UNAUTHORIZED);

  // Không giữ passwordHash trong req.user để tránh vô tình lộ ra qua res.json/log
  req.user = user;
  next();
}

// Cho endpoint công khai có thêm dữ liệu theo vai trò: token hợp lệ thì nạp req.user, thiếu/sai/hết hạn thì coi là khách
export async function optionalAuthenticate(req, res, next) {
  if (!req.headers.authorization) return next();
  let rejected = false;
  const probe = { status: () => ({ json: () => void (rejected = true) }) };
  let passed = false;
  await authenticate(req, probe, () => void (passed = true));
  if (rejected || !passed) req.user = undefined;
  next();
}

export const requireRole =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user.role) ? next() : res.status(403).json({ message: "Bạn không có quyền thực hiện thao tác này" });
