import { authFor, fakeUser } from "../test/auth.js";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  },
}));

process.env.JWT_SECRET = "test-secret";
const { prisma } = await import("../lib/prisma.js");
const { app } = await import("../app.js");

const admin = () => fakeUser({ id: 1, role: "ADMIN" });
const auth = () => authFor(admin());
const row = (over = {}) => ({
  id: 2,
  email: "a@x.com",
  name: "An",
  role: "READER",
  status: "ACTIVE",
  createdAt: new Date("2026-10-01T00:00:00Z"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue(admin());
  prisma.user.count.mockResolvedValue(1);
  prisma.user.findMany.mockResolvedValue([row()]);
});

describe("access control", () => {
  const calls = [["get", "/api/users"], ["patch", "/api/users/2/status"]];

  it.each(calls)("returns 401 for an anonymous %s", async (method, path) => {
    expect((await request(app)[method](path).send({})).status).toBe(401);
  });

  it.each(["READER", "LIBRARIAN"])("returns 403 for a %s", async (role) => {
    prisma.user.findUnique.mockResolvedValue(fakeUser({ role }));
    for (const [method, path] of calls) {
      expect((await request(app)[method](path).set(authFor(fakeUser({ role }))).send({ status: "DISABLED" })).status).toBe(403);
    }
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("GET /api/users", () => {
  it("lists users without sensitive fields", async () => {
    const res = await request(app).get("/api/users").set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [{ id: 2, email: "a@x.com", name: "An", role: "READER", status: "ACTIVE", createdAt: "2026-10-01T00:00:00.000Z" }],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
    expect(prisma.user.findMany.mock.calls[0][0].select.passwordHash).toBeUndefined();
  });

  it("searches email/name and filters by role", async () => {
    await request(app).get("/api/users?q=%20an%20&role=LIBRARIAN").set(auth());
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      role: "LIBRARIAN",
      OR: [
        { email: { contains: "an", mode: "insensitive" } },
        { name: { contains: "an", mode: "insensitive" } },
      ],
    });
  });

  it("ignores an unknown role filter", async () => {
    await request(app).get("/api/users?role=HACKER").set(auth());
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({});
  });

  it("clamps the page to the last page", async () => {
    prisma.user.count.mockResolvedValue(25);
    const res = await request(app).get("/api/users?page=99").set(auth());
    expect(res.body.page).toBe(3);
    expect(prisma.user.findMany.mock.calls[0][0]).toMatchObject({ skip: 20, take: 10 });
  });
});

describe("PATCH /api/users/:id/status", () => {
  it("disables another account", async () => {
    prisma.user.update.mockResolvedValue(row({ status: "DISABLED" }));
    const res = await request(app).patch("/api/users/2/status").set(auth()).send({ status: "DISABLED" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("DISABLED");
    expect(prisma.user.update.mock.calls[0][0]).toMatchObject({ where: { id: 2 }, data: { status: "DISABLED" } });
  });

  it("activates a pending account", async () => {
    prisma.user.update.mockResolvedValue(row({ status: "ACTIVE" }));
    const res = await request(app).patch("/api/users/2/status").set(auth()).send({ status: "ACTIVE" });
    expect(res.status).toBe(200);
  });

  it("refuses to disable the caller's own account", async () => {
    const res = await request(app).patch("/api/users/1/status").set(auth()).send({ status: "DISABLED" });
    expect(res.status).toBe(409);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each([{ status: "PENDING" }, { status: "x" }, {}])("rejects invalid body %j", async (body) => {
    const res = await request(app).patch("/api/users/2/status").set(auth()).send(body);
    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing user", async () => {
    prisma.user.update.mockRejectedValue({ code: "P2025" });
    const res = await request(app).patch("/api/users/999/status").set(auth()).send({ status: "DISABLED" });
    expect(res.status).toBe(404);
  });

  it("returns 404 for a malformed id", async () => {
    const res = await request(app).patch("/api/users/abc/status").set(auth()).send({ status: "DISABLED" });
    expect(res.status).toBe(404);
  });
});
