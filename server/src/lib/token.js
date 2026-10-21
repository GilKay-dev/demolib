import { createHmac } from "node:crypto";
import jwt from "jsonwebtoken";

// Thiếu hoặc còn giá trị mẫu thì mọi token đều có thể bị giả mạo / ký thất bại
export function assertJwtSecret(secret = process.env.JWT_SECRET) {
  if (!secret || secret === "change-me") {
    throw new Error("JWT_SECRET chưa được cấu hình (không được để trống hoặc là 'change-me')");
  }
  return secret;
}

// Dấu vân tay của mật khẩu hiện tại: đổi mật khẩu thì giá trị này đổi, làm mọi token cũ mất hiệu lực.
// Dùng HMAC để không lộ gì về hash bcrypt trong payload của token.
export const passwordFingerprint = (passwordHash) =>
  createHmac("sha256", assertJwtSecret()).update(passwordHash).digest("base64url").slice(0, 22);

export const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role, pv: passwordFingerprint(user.passwordHash) }, assertJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || "24h",
  });
