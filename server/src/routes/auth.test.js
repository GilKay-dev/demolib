import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: { user: { findUnique: vi.fn(), create: vi.fn() } },
}));

const { prisma } = await import("../lib/prisma.js");
const { app } = await import("../app.js");

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

  it("rejects a client-supplied role", async () => {
    await request(app).post("/api/auth/register").send({ ...valid, role: "ADMIN" });
    expect(prisma.user.create).not.toHaveBeenCalled();
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
