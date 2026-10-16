import { describe, expect, it } from "vitest";
import { consensus, median, type ProposalSample } from "@/lib/scoring/consensus";

const sample = (impact: number, confidence: number, effort: number): ProposalSample => ({
  impact: { value: impact, why: `impact ${impact}` },
  confidence: { value: confidence, why: `confiance ${confidence}` },
  effort: { value: effort, why: `effort ${effort}` },
});

describe("consensus de plusieurs propositions du modèle", () => {
  it("prend la médiane, pas la moyenne", () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([2, 2, 13])).toBe(2);
  });

  it("garde pour chaque facteur la médiane et la justification qui l'a donnée", () => {
    const result = consensus([sample(2, 0.8, 8), sample(1, 0.8, 5), sample(2, 1, 8)]);
    expect(result.impact).toEqual({ value: 2, why: "impact 2", agreement: 2, samples: 3 });
    expect(result.confidence).toEqual({ value: 0.8, why: "confiance 0.8", agreement: 2, samples: 3 });
    expect(result.effort).toEqual({ value: 8, why: "effort 8", agreement: 2, samples: 3 });
  });

  it("signale l'accord complet quand les trois propositions concordent", () => {
    expect(consensus([sample(1, 0.5, 3), sample(1, 0.5, 3), sample(1, 0.5, 3)]).impact.agreement).toBe(3);
  });

  it("un avis isolé ne déplace pas le résultat", () => {
    expect(consensus([sample(3, 1, 13), sample(1, 0.5, 3), sample(1, 0.5, 3)]).impact.value).toBe(1);
  });
});
