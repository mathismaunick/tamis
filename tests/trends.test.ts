import { describe, expect, it } from "vitest";
import { trendOf, trendSplit } from "@/lib/trends";

describe("les tendances des besoins", () => {
  it("coupe la période observée en son milieu", () => {
    expect(trendSplit(["2026-09-21", "2026-10-09", "2026-09-28"])).toBe("2026-09-30");
    expect(trendSplit([])).toBeNull();
  });

  it("repère un besoin en hausse, et un besoin en baisse", () => {
    const split = "2026-09-30";
    expect(trendOf(["2026-09-28", "2026-10-01", "2026-10-03", "2026-10-06", "2026-10-09"], split)).toMatchObject({ recent: 4, older: 1, rising: true });
    expect(trendOf(["2026-10-07", "2026-10-08", "2026-10-09"], split)).toMatchObject({ recent: 3, older: 0, rising: true });
    expect(trendOf(["2026-09-21", "2026-09-23", "2026-09-25", "2026-09-26", "2026-09-29", "2026-10-02"], split)).toMatchObject({ falling: true, rising: false });
  });

  it("ne crie pas à la tendance pour deux demandes", () => {
    expect(trendOf(["2026-10-05", "2026-10-06"], "2026-09-30")).toMatchObject({ rising: false, falling: false });
    expect(trendOf(["2026-09-22", "2026-09-24", "2026-09-25", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"], "2026-09-30")).toMatchObject({
      rising: false,
      falling: false,
    });
  });
});
