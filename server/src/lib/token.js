import jwt from "jsonwebtoken";

// Thiếu hoặc còn giá trị mẫu thì mọi token đều có thể bị giả mạo / ký thất bại
export function assertJwtSecret(secret = process.env.JWT_SECRET) {
  if (!secret || secret === "change-me") {
    throw new Error("JWT_SECRET chưa được cấu hình (không được để trống hoặc là 'change-me')");
  }
  return secret;
}

export const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, assertJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || "24h",
  });
