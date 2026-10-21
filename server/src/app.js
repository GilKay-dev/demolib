import cors from "cors";
import express from "express";
import helmet from "helmet";
import { authRouter } from "./routes/auth.js";
import { booksRouter } from "./routes/books.js";
import { borrowsRouter } from "./routes/borrows.js";
import { categoriesRouter } from "./routes/categories.js";
import { meRouter } from "./routes/me.js";

export const app = express();

// Sau reverse proxy (Vercel...) cần báo số lớp proxy để rate limit lấy đúng IP client
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY));

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/me", meRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/books", booksRouter);
app.use("/api/borrows", borrowsRouter);

app.use((err, req, res, _next) => {
  // Lỗi 4xx của body-parser (JSON sai định dạng, body quá lớn) là lỗi của client
  if (res.headersSent) return _next(err);
  // Chỉ tin lỗi parse body của Express (err.type), không phải mọi lỗi có status 4xx
  const status = err.status ?? err.statusCode;
  if (err.type && Number.isInteger(status) && status >= 400 && status < 500) {
    return res.status(status).json({ message: status === 413 ? "Dữ liệu quá lớn" : "Yêu cầu không hợp lệ" });
  }
  console.error(err);
  res.status(500).json({ message: "Lỗi hệ thống" });
});
