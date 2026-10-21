import { authFor, fakeUser } from "../test/auth.js";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    fineLevel: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}));

process.env.JWT_SECRET = "test-secret";
const { prisma } = await import("../lib/prisma.js");
const { app } = await import("../app.js");

const auth = () => authFor(fakeUser({ role: "ADMIN" }));
const row = (over = {}) => ({
  id: 1,
  name: "Hư nhẹ",
  amount: "50000",
  effectiveDate: new Date("2026-10-22T00:00:00Z"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue(fakeUser({ role: "ADMIN" }));
  prisma.fineLevel.findFirst.mockReset().mockResolvedValue(null);
});

describe("access control", () => {
  const calls = [["get", "/api/fine-levels"], ["post", "/api/fine-levels"], ["put", "/api/fine-levels/1"], ["delete", "/api/fine-levels/1"]];

  it.each(calls)("returns 401 for an anonymous %s", async (method, path) => {
    expect((await request(app)[method](path).send({})).status).toBe(401);
  });

  it.each(["READER", "LIBRARIAN"])("returns 403 for a %s", async (role) => {
    prisma.user.findUnique.mockResolvedValue(fakeUser({ role }));
    for (const [method, path] of calls) {
      expect((await request(app)[method](path).set(authFor(fakeUser({ role }))).send({})).status).toBe(403);
    }
    expect(prisma.fineLevel.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/fine-levels", () => {
  it("lists active levels with numeric amount and date-only effectiveDate", async () => {
    prisma.fineLevel.findMany.mockResolvedValue([row()]);
    const res = await request(app).get("/api/fine-levels").set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1, name: "Hư nhẹ", amount: 50000, effectiveDate: "2026-10-22" }]);
    expect(prisma.fineLevel.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null });
  });
});

describe("POST /api/fine-levels", () => {
  it("creates a level, trimming the name", async () => {
    prisma.fineLevel.create.mockResolvedValue(row());
    const res = await request(app).post("/api/fine-levels").set(auth()).send({ name: "  Hư nhẹ ", amount: 50000, effectiveDate: "2026-10-22" });
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(50000);
    expect(prisma.fineLevel.create).toHaveBeenCalledWith({
      data: { name: "Hư nhẹ", amount: 50000, effectiveDate: new Date("2026-10-22T00:00:00Z") },
    });
  });

  it("omits effectiveDate so the DB defaults to today", async () => {
    prisma.fineLevel.create.mockResolvedValue(row());
    await request(app).post("/api/fine-levels").set(auth()).send({ name: "A", amount: 1 });
    expect(prisma.fineLevel.create).toHaveBeenCalledWith({ data: { name: "A", amount: 1 } });
  });

  it.each([
    [{ amount: 1 }, "name"],
    [{ name: "   ", amount: 1 }, "name"],
    [{ name: "a".repeat(26), amount: 1 }, "name"],
    [{ name: "A" }, "amount"],
    [{ name: "A", amount: 0 }, "amount"],
    [{ name: "A", amount: -5 }, "amount"],
    [{ name: "A", amount: "abc" }, "amount"],
    [{ name: "A", amount: 1.5 }, "amount"],
    [{ name: "A", amount: 1e13 }, "amount"],
    [{ name: "A", amount: 1, effectiveDate: "2026-02-30" }, "effectiveDate"],
    [{ name: "A", amount: 1, effectiveDate: "22/10/2026" }, "effectiveDate"],
  ])("rejects %j with an error on %s", async (body, field) => {
    const res = await request(app).post("/api/fine-levels").set(auth()).send(body);
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty(field);
    expect(prisma.fineLevel.create).not.toHaveBeenCalled();
  });

  it("accepts a 25-character name", async () => {
    prisma.fineLevel.create.mockResolvedValue(row());
    expect((await request(app).post("/api/fine-levels").set(auth()).send({ name: "a".repeat(25), amount: 1 })).status).toBe(201);
  });

  it("returns 409 when the name already exists", async () => {
    prisma.fineLevel.findFirst.mockResolvedValue({ id: 9 });
    const res = await request(app).post("/api/fine-levels").set(auth()).send({ name: "hư nhẹ", amount: 1 });
    expect(res.status).toBe(409);
    expect(res.body.errors.name).toBe("Mức phạt đã tồn tại");
    expect(prisma.fineLevel.create).not.toHaveBeenCalled();
  });

  it("returns 409 when the unique index catches a concurrent duplicate", async () => {
    prisma.fineLevel.create.mockRejectedValue({ code: "P2002" });
    expect((await request(app).post("/api/fine-levels").set(auth()).send({ name: "A", amount: 1 })).status).toBe(409);
  });
});

describe("PUT /api/fine-levels/:id", () => {
  const put = (id, body) => request(app).put(`/api/fine-levels/${id}`).set(auth()).send(body);

  it("updates a level", async () => {
    prisma.fineLevel.findFirst.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);
    prisma.fineLevel.update.mockResolvedValue(row({ amount: "70000" }));
    const res = await put(1, { name: "Hư nhẹ", amount: 70000 });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(70000);
    expect(prisma.fineLevel.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { name: "Hư nhẹ", amount: 70000 } });
  });

  it.each(["abc", "0", "99999999999"])("returns 404 for id %s", async (id) => {
    expect((await put(id, { name: "A", amount: 1 })).status).toBe(404);
    expect(prisma.fineLevel.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the level is missing or deleted", async () => {
    expect((await put(5, { name: "A", amount: 1 })).status).toBe(404);
  });

  it("returns 409 when renaming to another level's name", async () => {
    prisma.fineLevel.findFirst.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({ id: 2 });
    expect((await put(1, { name: "B", amount: 1 })).status).toBe(409);
    expect(prisma.fineLevel.update).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid input", async () => {
    expect((await put(1, { name: "A", amount: 0 })).status).toBe(400);
  });
});

describe("DELETE /api/fine-levels/:id", () => {
  it("soft-deletes an active level", async () => {
    prisma.fineLevel.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).delete("/api/fine-levels/3").set(auth());
    expect(res.status).toBe(200);
    expect(prisma.fineLevel.updateMany).toHaveBeenCalledWith({
      where: { id: 3, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it("returns 404 when already deleted or missing", async () => {
    prisma.fineLevel.updateMany.mockResolvedValue({ count: 0 });
    expect((await request(app).delete("/api/fine-levels/3").set(auth())).status).toBe(404);
  });

  it("returns 404 for a malformed id without touching the DB", async () => {
    expect((await request(app).delete("/api/fine-levels/abc").set(auth())).status).toBe(404);
    expect(prisma.fineLevel.updateMany).not.toHaveBeenCalled();
  });
});
