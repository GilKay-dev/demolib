// Vercel serverless entry: chạy toàn bộ Express app (mọi đường dẫn /api/* được rewrite về đây)
export { app as default } from "../server/src/app.js";
