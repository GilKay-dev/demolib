import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    borrow: { count: vi.fn() },
    fine: { aggregate: vi.fn() },
  },
}));

process.env.JWT_SECRET = "test-secret";
const { prisma } = await import("../lib/prisma.js");
const { app } = await import("../app.js");

const dbUser = (patch = {}) => ({
  id: 5,
  email: "reader@example.com",
  name: "An",
  phone: null,
  address: null,
  role: "READER",
  status: "ACTIVE",
  createdAt: new Date("2026-01-02T00:00:00Z"),
  passwordHash: bcrypt.hashSync("password1", 4),
  ...patch,
});
const tokenFor = (id = 5, secret = "test-secret", opts = {}) => jwt.sign({ sub: id, role: "READER" }, secret, opts);
const auth = (t = tokenFor()) => ({ Authorization: `Bearer ${t}` });

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue(dbUser());
  prisma.user.update.mockImplementation(async ({ data }) => ({ ...dbUser(), ...data }));
  prisma.borrow.count.mockResolvedValue(3);
  prisma.fine.aggregate.mockResolvedValue({ _sum: { amount: "50000" } });
});

describe("authentication", () => {
  it.each([
    ["no header", {}],
    ["wrong scheme", { Authorization: "Basic abc" }],
    ["garbage token", { Authorization: "Bearer nope" }],
    ["wrong secret", auth(tokenFor(5, "other"))],
    ["expired token", auth(tokenFor(5, "test-secret", { expiresIn: -10 }))],
  ])("returns 401 for %s", async (_name, headers) => {
    const res = await request(app).get("/api/me").set(headers);
    expect(res.status).toBe(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each([null, dbUser({ status: "DISABLED" }), dbUser({ status: "PENDING" })])(
    "returns 401 when the account is missing or not active",
    async (user) => {
      prisma.user.findUnique.mockResolvedValue(user);
      expect((await request(app).get("/api/me").set(auth())).status).toBe(401);
    },
  );

  it.each(["LIBRARIAN", "ADMIN"])("returns 403 for a %s", async (role) => {
    prisma.user.findUnique.mockResolvedValue(dbUser({ role }));
    expect((await request(app).get("/api/me").set(auth())).status).toBe(403);
  });
});

describe("req.user", () => {
  it("is loaded without the password hash", async () => {
    await request(app).get("/api/me").set(auth());
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 5 }, omit: { passwordHash: true } });
  });
});

describe("GET /api/me", () => {
  it("returns the profile with stats and no password hash", async () => {
    const res = await request(app).get("/api/me").set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 5, email: "reader@example.com", borrowCount: 3, totalFine: 50000 });
    expect(res.body.passwordHash).toBeUndefined();
    expect(prisma.borrow.count.mock.calls[0][0].where).toEqual({
      readerId: 5,
      status: { in: ["BORROWING", "OVERDUE", "RETURNED"] },
    });
    expect(prisma.fine.aggregate.mock.calls[0][0].where).toEqual({
      borrow: { readerId: 5 },
      status: { not: "PAID" },
    });
  });

  it("reports a zero fine total when there are no fines", async () => {
    prisma.fine.aggregate.mockResolvedValue({ _sum: { amount: null } });
    const res = await request(app).get("/api/me").set(auth());
    expect(res.body.totalFine).toBe(0);
  });
});

describe("PUT /api/me", () => {
  const valid = { name: " Nguyễn Văn B ", phone: "0912345678", address: "1 Lê Lợi" };

  it("updates only the caller's record from the token and ignores a userId", async () => {
    const res = await request(app).put("/api/me").set(auth()).send(valid);
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { name: "Nguyễn Văn B", phone: "0912345678", address: "1 Lê Lợi" },
    });
  });

  it("rejects a client-supplied userId, email or role", async () => {
    for (const extra of [{ userId: 9 }, { email: "x@y.com" }, { role: "ADMIN" }]) {
      const res = await request(app).put("/api/me").set(auth()).send({ ...valid, ...extra });
      expect(res.status).toBe(400);
    }
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects a request that omits phone instead of wiping it", async () => {
    const { phone: _omit, ...withoutPhone } = valid;
    const res = await request(app).put("/api/me").set(auth()).send(withoutPhone);
    expect(res.status).toBe(400);
    expect(res.body.errors.phone).toBeTruthy();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("stores an empty phone as null", async () => {
    await request(app).put("/api/me").set(auth()).send({ ...valid, phone: "" });
    expect(prisma.user.update.mock.calls[0][0].data.phone).toBeNull();
  });

  it.each([
    ["name", { name: "" }],
    ["name", { name: "a".repeat(51) }],
    ["phone", { phone: "12345" }],
    ["phone", { phone: "09123456789" }],
    ["address", { address: "" }],
    ["address", { address: "a".repeat(256) }],
  ])("rejects invalid %s", async (field, patch) => {
    const res = await request(app).put("/api/me").set(auth()).send({ ...valid, ...patch });
    expect(res.status).toBe(400);
    expect(res.body.errors[field]).toBeTruthy();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("PUT /api/me/password", () => {
  const valid = { currentPassword: "password1", newPassword: "newpassword2", confirmPassword: "newpassword2" };

  it("hashes and saves the new password", async () => {
    const res = await request(app).put("/api/me/password").set(auth()).send(valid);
    expect(res.status).toBe(200);
    const { where, data } = prisma.user.update.mock.calls[0][0];
    expect(where).toEqual({ id: 5 });
    expect(data.passwordHash).not.toBe("newpassword2");
    expect(bcrypt.compareSync("newpassword2", data.passwordHash)).toBe(true);
  });

  it("returns 400 when the current password is wrong", async () => {
    const res = await request(app).put("/api/me/password").set(auth()).send({ ...valid, currentPassword: "wrongpass1" });
    expect(res.status).toBe(400);
    expect(res.body.errors.currentPassword).toBeTruthy();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each([
    ["newPassword", { newPassword: "short", confirmPassword: "short" }],
    ["newPassword", { newPassword: "a".repeat(17), confirmPassword: "a".repeat(17) }],
    ["newPassword", { newPassword: "password1", confirmPassword: "password1" }],
    ["confirmPassword", { confirmPassword: "different1" }],
    ["confirmPassword", { confirmPassword: "" }],
    ["currentPassword", { currentPassword: "" }],
  ])("rejects invalid %s", async (field, patch) => {
    const res = await request(app).put("/api/me/password").set(auth()).send({ ...valid, ...patch });
    expect(res.status).toBe(400);
    expect(res.body.errors[field]).toBeTruthy();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
