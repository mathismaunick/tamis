import { describe, expect, it } from "vitest";
import { laneLayout } from "@/lib/cycles";

describe("laneLayout", () => {
  it("place chaque besoin selon son effort, sur la capacité, et laisse la place libre", () => {
    const layout = laneLayout([8, 13], 30);
    expect(layout.widths[0]).toBeCloseTo((8 / 30) * 100);
    expect(layout.widths[1]).toBeCloseTo((13 / 30) * 100);
    expect(layout.free).toBeCloseTo((9 / 30) * 100);
    expect(layout.over).toBe(0);
  });

  it("partage toute la largeur quand le couloir dépasse la capacité, sans déborder", () => {
    // Après « planifié » sur un besoin, « Ensuite » peut porter 32 points pour 30 (acte 2b de la démo).
    const layout = laneLayout([8, 8, 8, 8], 30);
    expect(layout.widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(100);
    expect(layout.free).toBe(0);
    expect(layout.over).toBe(2);
  });

  it("compte au moins un point pour un besoin sans effort", () => {
    expect(laneLayout([0], 30).widths[0]).toBeCloseTo((1 / 30) * 100);
  });
});
