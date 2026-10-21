import "dotenv/config";
import { defineConfig } from "prisma/config";

// Schema được quản lý bằng SQL trong db/migrations/ (không dùng `prisma migrate`).
// DIRECT_URL (port 5432) cho CLI như `db pull`; app dùng DATABASE_URL (pooler).
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
