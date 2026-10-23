import { describe, expect, it } from "vitest";
import { today } from "./today.js";

describe("today", () => {
  it("uses the Vietnam calendar day even when UTC is still the previous day", () => {
    // 17:30 UTC ngày 23/10 = 00:30 ngày 24/10 giờ Việt Nam
    expect(today(new Date("2026-10-23T17:30:00Z")).toISOString()).toBe("2026-10-24T00:00:00.000Z");
  });

  it("stays on the same day before Vietnam midnight", () => {
    // 16:59 UTC = 23:59 giờ Việt Nam cùng ngày
    expect(today(new Date("2026-10-23T16:59:00Z")).toISOString()).toBe("2026-10-23T00:00:00.000Z");
  });

  it("returns midnight UTC so it compares with date columns", () => {
    expect(today().getUTCHours()).toBe(0);
  });
});
