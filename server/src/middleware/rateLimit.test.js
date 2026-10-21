import bcrypt from "bcryptjs";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { authFor, fakeUser } from "../test/auth.js";

vi.mock("../lib/prisma.js", () => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() } },
}));

// Giới hạn nhỏ để test; phải đặt trước khi import app (limiter đọc env lúc khởi tạo)
process.env.LOGIN_RATE_LIMIT = "3";
process.env.PASSWORD_RATE_LIMIT = "2";
const { prisma } = await import("../lib/prisma.js");
const { app } = await import("../app.js");

const HASH = bcrypt.hashSync("password1", 4);
const account = (over = {}) => fakeUser({ id: 5, role: "READER", passwordHash: HASH, email: "a@b.com", name: "A", ...over });

const login = (password) => request(app).post("/api/auth/login").send({ email: "a@b.com", password });

// Store của limiter nằm trong bộ nhớ và dùng chung cả file, nên các test dưới đây chạy theo thứ tự
describe("login limiter", () => {
  it("does not count successful logins", async () => {
    prisma.user.findUnique.mockResolvedValue(account());
    for (let i = 0; i < 6; i++) expect((await login("password1")).status).toBe(200);
  });

  it("blocks after the allowed number of failures, even for the correct password", async () => {
    prisma.user.findUnique.mockResolvedValue(account());
    for (let i = 0; i < 3; i++) expect((await login("wrongpass1")).status).toBe(401);

    const blocked = await login("wrongpass1");
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/Quá nhiều lần đăng nhập thất bại/);
    expect(blocked.headers.ratelimit).toBeTruthy();

    expect((await login("password1")).status).toBe(429);
  });

  it("is not bypassed by a spoofed X-Forwarded-For header", async () => {
    const res = await login("wrongpass1").set("X-Forwarded-For", "203.0.113.9");
    expect(res.status).toBe(429);
  });
});

describe("password change limiter", () => {
  const change = (user, currentPassword) => {
    prisma.user.findUnique.mockResolvedValue(user);
    return request(app)
      .put("/api/me/password")
      .set(authFor(user))
      .send({ currentPassword, newPassword: "newpassword2", confirmPassword: "newpassword2" });
  };

  it("blocks guessing the current password per account", async () => {
    const user = account();
    expect((await change(user, "wrongpass1")).status).toBe(400);
    expect((await change(user, "wrongpass2")).status).toBe(400);
    const blocked = await change(user, "wrongpass3");
    expect(blocked.status).toBe(429);
    expect(prisma.user.update).not.toHaveBeenCalled();
    // đúng mật khẩu trong lúc bị khóa cũng bị chặn: không cho dò từng lần
    expect((await change(user, "password1")).status).toBe(429);
  });

  it("does not affect other accounts", async () => {
    prisma.user.update.mockResolvedValue({});
    const other = account({ id: 6 });
    expect((await change(other, "password1")).status).toBe(200);
  });
});
