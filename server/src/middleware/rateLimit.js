import { rateLimit } from "express-rate-limit";

const WINDOW_MS = 15 * 60 * 1000;

const tooMany = (message) => (req, res, _next, options) => res.status(options.statusCode).json({ message });

// Chỉ đếm lần thất bại (4xx/5xx): đăng nhập đúng không bị tính, nhưng đoán mật khẩu thì bị chặn
// Lưu ý: store mặc định là bộ nhớ của từng instance; khi chạy nhiều instance/serverless cần store dùng chung (Redis...)
export const loginLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: Number(process.env.LOGIN_RATE_LIMIT ?? 10),
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: tooMany("Quá nhiều lần đăng nhập thất bại, vui lòng thử lại sau 15 phút"),
});

// Theo từng tài khoản (đặt sau authenticate), không theo IP, để token bị đánh cắp cũng không đoán được mật khẩu hiện tại
export const passwordLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: Number(process.env.PASSWORD_RATE_LIMIT ?? 5),
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user.id}`,
  handler: tooMany("Quá nhiều lần đổi mật khẩu thất bại, vui lòng thử lại sau 15 phút"),
});
