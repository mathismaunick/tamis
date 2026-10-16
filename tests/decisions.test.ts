import { describe, expect, it } from "vitest";
import { buildDecisions, isDisputed, type DecisionTheme } from "@/lib/services/decisions";

const theme = (overrides: Partial<DecisionTheme> = {}): DecisionTheme => ({
  id: 1,
  title: "Dépendances entre tâches",
  status: "new",
  rank: 5,
  moscow: "should",
  reach: 6,
  messages: 6,
  churnRisk: false,
  alreadyExists: null,
  agreement: { impact: "3/3", confidence: "3/3", effort: "3/3" },
  sources: { reach: "code", impact: "model", confidence: "model", effort: "model" },
  stories: 0,
  churnClients: [],
  ...overrides,
});

describe("la file « À décider »", () => {
  it("met le risque de départ en tête, avec la question à poser à l'agent", () => {
    const decisions = buildDecisions({
      themes: [theme({ id: 2, title: "Notifications", churnRisk: true, churnClients: ["Nexalis"], reach: 3, messages: 14 }), theme({ agreement: { impact: "2/3" } })],
      merges: [],
      proposals: [],
    });
    expect(decisions[0]).toMatchObject({ kind: "churn", title: "Nexalis menace de partir : faut-il remonter son besoin ?", href: "/themes/2", signal: "rouge" });
    expect(decisions[0].question).toContain("Notifications");
    expect(decisions[1]).toMatchObject({ kind: "confirm", title: "L'IA n'est pas sûre de l'impact : le garder ?", signal: "ambre" });
    expect(decisions[1].question).toContain("Dépendances entre tâches");
  });

  it("oublie une décision prise : statut posé, facteur ajusté par le PO", () => {
    const decisions = buildDecisions({
      themes: [
        theme({ id: 2, churnRisk: true, churnClients: ["Nexalis"], status: "planned" }),
        theme({ id: 3, agreement: { impact: "2/3" }, sources: { impact: "po" } }),
        theme({ id: 4, alreadyExists: "L'export CSV existe.", status: "parked", rank: null }),
      ],
      merges: [],
      proposals: [],
    });
    expect(decisions).toEqual([]);
  });

  it("ne montre que deux facteurs à confirmer, des mieux classés aux moins bien classés", () => {
    const decisions = buildDecisions({
      themes: [3, 1, 2].map((rank) => theme({ id: rank, rank, title: `T${rank}`, agreement: { effort: "1/3" } })),
      merges: [],
      proposals: [],
    });
    expect(decisions.map((d) => d.detail)).toEqual(["T1", "T2"]);
    expect(decisions[0].title).toBe("L'IA n'est pas sûre de l'effort : le garder ?");
  });

  it("regroupe les regroupements automatiques et les stories manquantes en une ligne chacune", () => {
    const decisions = buildDecisions({
      themes: [theme({ id: 1, moscow: "must", rank: 1, title: "Rapports" }), theme({ id: 2, moscow: "must", rank: 2, stories: 1 })],
      merges: [
        { targetId: 1, targetTitle: "Rapports" },
        { targetId: 3, targetTitle: "Mobile" },
        { targetId: 1, targetTitle: "Rapports" },
      ],
      proposals: [{ themeId: 2, themeTitle: "Notifications", label: "statut Nouveau → Planifié" }],
    });
    expect(decisions.map((d) => d.kind)).toEqual(["proposal", "merge", "story"]);
    expect(decisions[1]).toMatchObject({ title: "3 petits besoins regroupés par Tamis : ces regroupements tiennent-ils ?", detail: "Rapports, Mobile" });
    expect(decisions[2]).toMatchObject({ title: "Un besoin Must sans story : la rédiger ?", href: "/themes/1", question: "Rédige la story de « Rapports »." });
    expect(decisions[0].question).toBeUndefined();
  });

  it("lit l'accord des propositions", () => {
    expect(isDisputed("2/3")).toBe(true);
    expect(isDisputed("3/3")).toBe(false);
    expect(isDisputed(undefined)).toBe(false);
  });
});
