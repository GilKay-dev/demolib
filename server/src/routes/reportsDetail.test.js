import { authFor, fakeUser } from "../test/auth.js";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

process.env.JWT_SECRET = "test-secret";
const { prisma } = await import("../lib/prisma.js");
const { app } = await import("../app.js");
const { resolveRange, toCsv } = await import("./reports.js");

const staff = (role = "LIBRARIAN") => fakeUser({ id: 1, role });
const get = (path) => request(app).get(`/api/reports/${path}`).set(authFor(staff()));

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue(staff());
  prisma.$queryRaw.mockResolvedValue([]);
});

describe("resolveRange", () => {
  const now = new Date(Date.UTC(2026, 10, 18)); // Thứ Tư 18/11/2026

  it.each([
    ["day", "2026-11-18", "2026-11-18"],
    ["week", "2026-11-16", "2026-11-22"],
    ["month", "2026-11-01", "2026-11-30"],
    ["quarter", "2026-10-01", "2026-12-31"],
    ["year", "2026-01-01", "2026-12-31"],
  ])("%s", (period, from, to) => {
    expect(resolveRange({ period }, now)).toEqual({ from, to });
  });

  it("prefers explicit from/to", () => {
    expect(resolveRange({ period: "year", from: "2026-02-01", to: "2026-02-10" }, now)).toEqual({
      from: "2026-02-01",
      to: "2026-02-10",
    });
  });
});

describe("toCsv", () => {
  it("quotes special cells and neutralises formulas", () => {
    const csv = toCsv([{ key: "a", label: "A" }, { key: "b", label: "B" }], [{ a: 'x,"y"', b: "=1+1" }]);
    expect(csv).toBe('﻿A,B\r\n"x,""y""",\'=1+1\r\n');
  });
});

describe.each(["books", "borrows", "fines", "replacements"])("GET /api/reports/%s", (name) => {
  it("returns 401 for an anonymous request", async () => {
    expect((await request(app).get(`/api/reports/${name}`)).status).toBe(401);
  });

  it("returns 403 for a reader without querying", async () => {
    prisma.user.findUnique.mockResolvedValue(fakeUser({ role: "READER" }));
    const res = await request(app).get(`/api/reports/${name}`).set(authFor(fakeUser({ role: "READER" })));
    expect(res.status).toBe(403);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it.each(["LIBRARIAN", "ADMIN"])("allows a %s", async (role) => {
    prisma.user.findUnique.mockResolvedValue(staff(role));
    const res = await request(app).get(`/api/reports/${name}`).set(authFor(staff(role)));
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.range.from).toMatch(/^\d{4}-\d{2}-01$/); // mặc định là tháng hiện tại
  });

  it.each([
    "period=decade",
    "from=2026-01-01",
    "from=2026-02-30&to=2026-03-01",
    "from=2026-03-02&to=2026-03-01",
    "format=xml",
  ])("rejects bad query %s", async (qs) => {
    const res = await get(`${name}?${qs}`);
    expect(res.status).toBe(400);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("exports CSV with a download header", async () => {
    const res = await get(`${name}?format=csv&from=2026-01-01&to=2026-01-31`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.headers["content-disposition"]).toContain("_2026-01-01_2026-01-31.csv");
    expect(res.text.startsWith("﻿")).toBe(true);
  });
});

describe("report contents", () => {
  it("books: returns rows from the query", async () => {
    const row = { id: 1, title: "Dế Mèn", author: "Tô Hoài", total: 5, available: 3, borrowed: 2, lost: 0, damaged: 1, borrowCount: 4 };
    prisma.$queryRaw.mockResolvedValue([row]);
    const res = await get("books?period=year");
    expect(res.body.items).toEqual([row]);
  });

  it("borrows: sums totals and echoes groupBy", async () => {
    prisma.$queryRaw.mockResolvedValue([
      { bucket: "2026-11-01", borrowed: 3, returned: 1 },
      { bucket: "2026-12-01", borrowed: 2, returned: 4 },
    ]);
    const res = await get("borrows?groupBy=month&period=year");
    expect(res.body.groupBy).toBe("month");
    expect(res.body.totals).toEqual({ borrowed: 5, returned: 5 });
  });

  it("fines: returns revenue and debtors", async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ total: 150000, count: 3 }])
      .mockResolvedValueOnce([{ readerId: 2, name: "An", email: "a@x.com", fineCount: 1, amount: 50000 }]);
    const res = await get("fines");
    expect(res.body.revenue).toEqual({ total: 150000, count: 3 });
    expect(res.body.items[0].name).toBe("An");
  });

  it("replacements: labels the condition in CSV", async () => {
    prisma.$queryRaw.mockResolvedValue([
      { borrowId: 1, bookId: 2, title: "Sách A", author: "X", condition: "LOST", returnDate: new Date("2026-11-02"), readerName: "An", readerEmail: "a@x.com" },
    ]);
    const res = await get("replacements?format=csv");
    expect(res.text).toContain("Sách A,X,Mất,2026-11-02,An,a@x.com");
  });
});
