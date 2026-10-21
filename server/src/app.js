import cors from "cors";
import express from "express";
import helmet from "helmet";
import { authRouter } from "./routes/auth.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);

app.use((err, req, res, _next) => {
  // Lỗi 4xx của body-parser (JSON sai định dạng, body quá lớn) là lỗi của client
  const status = err.status ?? err.statusCode;
  if (status >= 400 && status < 500) {
    return res.status(status).json({ message: status === 413 ? "Dữ liệu quá lớn" : "Yêu cầu không hợp lệ" });
  }
  console.error(err);
  res.status(500).json({ message: "Lỗi hệ thống" });
});
