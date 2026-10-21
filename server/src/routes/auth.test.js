import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: { user: { findUnique: vi.fn(), create: vi.fn() } },
}));

const { prisma } = await import("../lib/prisma.js");
const { app } = await import("../app.js");

process.env.JWT_SECRET = "test-secret";
const { default: bcrypt } = await import("bcryptjs");
const { default: jwt } = await import("jsonwebtoken");

describe("JWT secret", () => {
  it.each([null, "", "change-me"])("rejects %j", async (secret) => {
    const { assertJwtSecret } = await import("../lib/token.js");
    expect(() => assertJwtSecret(secret)).toThrow(/JWT_SECRET/);
  });

  it("returns 500 on login when the secret is the placeholder", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 1, email: "a@b.com", name: "A", role: "READER", status: "ACTIVE",
      passwordHash: bcrypt.hashSync("password1", 4),
    });
    process.env.JWT_SECRET = "change-me";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.com", password: "password1" });
    process.env.JWT_SECRET = "test-secret";
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body.token).toBeUndefined();
  });
});

describe("error handler", () => {
  it("does not mask a non-parser error that carries a 4xx status", async () => {
    prisma.user.findUnique.mockRejectedValue(Object.assign(new Error("upstream"), { status: 404 }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.com", password: "password1" });
    spy.mockRestore();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/auth/login", () => {
  const creds = { email: " Reader@Example.COM ", password: "password1" };
  const dbUser = (patch = {}) => ({
    id: 7,
    email: "reader@example.com",
    name: "An",
    role: "LIBRARIAN",
    status: "ACTIVE",
    passwordHash: bcrypt.hashSync("password1", 4),
    ...patch,
  });

  beforeEach(() => vi.clearAllMocks());

  it("returns a 24h JWT and the user without the password hash", async () => {
    prisma.user.findUnique.mockResolvedValue(dbUser());
    const res = await request(app).post("/api/auth/login").send(creds);
    expect(res.status).toBe(200);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "reader@example.com" } });
    expect(res.body.user).toEqual({ id: 7, email: "reader@example.com", name: "An", role: "LIBRARIAN" });
    const payload = jwt.verify(res.body.token, "test-secret");
    expect(payload).toMatchObject({ sub: 7, role: "LIBRARIAN" });
    expect(payload.exp - payload.iat).toBe(24 * 3600);
  });

  it.each([
    ["email", { email: "abc" }],
    ["email", { email: "" }],
    ["password", { password: "" }],
    ["password", { password: "short" }],
    ["password", { password: "a".repeat(17) }],
  ])("rejects invalid %s", async (field, patch) => {
    const res = await request(app).post("/api/auth/login").send({ ...creds, ...patch });
    expect(res.status).toBe(400);
    expect(res.body.errors[field]).toBeTruthy();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns the same 401 for an unknown email and a wrong password", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const unknown = await request(app).post("/api/auth/login").send(creds);
    prisma.user.findUnique.mockResolvedValue(dbUser());
    const wrong = await request(app).post("/api/auth/login").send({ ...creds, password: "wrongpass1" });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.token).toBeUndefined();
  });

  it.each(["PENDING", "DISABLED"])("returns 403 without a token for a %s account", async (status) => {
    prisma.user.findUnique.mockResolvedValue(dbUser({ status }));
    const res = await request(app).post("/api/auth/login").send(creds);
    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
  });

  it("does not reveal inactive status when the password is wrong", async () => {
    prisma.user.findUnique.mockResolvedValue(dbUser({ status: "PENDING" }));
    const res = await request(app).post("/api/auth/login").send({ ...creds, password: "wrongpass1" });
    expect(res.status).toBe(401);
  });
});

const valid = {
  email: "  Reader@Example.COM ",
  name: "Nguyễn Văn A",
  password: "password1",
  confirmPassword: "password1",
};

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
  });

  it("creates a pending reader with a normalized email and hashed password", async () => {
    const res = await request(app).post("/api/auth/register").send(valid);
    expect(res.status).toBe(201);
    const { data } = prisma.user.create.mock.calls[0][0];
    expect(data.email).toBe("reader@example.com");
    expect(data.role).toBe("READER");
    expect(data.status).toBe("PENDING");
    expect(data.passwordHash).not.toBe("password1");
  });

  it.each([
    ["email", { email: "abc" }],
    ["name", { name: "" }],
    ["name", { name: "a".repeat(51) }],
    ["password", { password: "short", confirmPassword: "short" }],
    ["password", { password: "a".repeat(17), confirmPassword: "a".repeat(17) }],
    ["confirmPassword", { confirmPassword: "different1" }],
    ["confirmPassword", { confirmPassword: "" }],
  ])("rejects invalid %s", async (field, patch) => {
    const res = await request(app).post("/api/auth/register").send({ ...valid, ...patch });
    expect(res.status).toBe(400);
    expect(res.body.errors[field]).toBeTruthy();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects a client-supplied role with a Vietnamese message", async () => {
    const res = await request(app).post("/api/auth/register").send({ ...valid, role: "ADMIN" });
    expect(res.status).toBe(400);
    expect(res.body.errors.role).toBe("Trường không hợp lệ");
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("returns a Vietnamese message for a non-string field", async () => {
    const res = await request(app).post("/api/auth/register").send({ ...valid, email: 123 });
    expect(res.status).toBe(400);
    expect(res.body.errors.email).not.toMatch(/[a-z]+\.[a-z]+|"email"/);
  });

  it("returns 400, not 500, for malformed JSON", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
  });

  it("returns 413 for an oversized body", async () => {
    const res = await request(app).post("/api/auth/register").send({ ...valid, name: "a".repeat(200_000) });
    expect(res.status).toBe(413);
  });

  it("rethrows a unique violation on a column other than email", async () => {
    prisma.user.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002", meta: { target: ["phone"] } }));
    const res = await request(app).post("/api/auth/register").send(valid);
    expect(res.status).toBe(500);
  });

  it("returns 409 when the email already exists", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 2 });
    const res = await request(app).post("/api/auth/register").send(valid);
    expect(res.status).toBe(409);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("returns 409 when a concurrent request hits the unique constraint", async () => {
    prisma.user.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    const res = await request(app).post("/api/auth/register").send(valid);
    expect(res.status).toBe(409);
  });
});
