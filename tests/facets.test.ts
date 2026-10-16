import { describe, expect, it } from "vitest";
import { countFacetClients } from "@/lib/facets";
import { cleanFacets } from "@/lib/pipeline/themes";

describe("les facettes d'un thème", () => {
  const evidence = [
    { feedbackId: 10, client: "Atelier Nord" },
    { feedbackId: 17, client: "Kairos Conseil" },
    { feedbackId: 22, client: "Fabrique Ondine" },
    { feedbackId: 23, client: "Fabrique Ondine" },
    { feedbackId: 46, client: "Batimo Construction" },
  ];

  it("compte des clients distincts, pas des messages, et classe de la plus partagée à la plus rare", () => {
    const counts = countFacetClients(
      [
        { label: "Bloquer ou avertir", feedbackIds: [46] },
        { label: "Voir ce qui bloque", feedbackIds: [10, 17, 22, 23] },
      ],
      evidence,
    );
    expect(counts).toEqual([
      { label: "Voir ce qui bloque", feedbackIds: [10, 17, 22, 23], clients: 3 },
      { label: "Bloquer ou avertir", feedbackIds: [46], clients: 1 },
    ]);
  });

  it("écarte les retours qui ne sont pas dans le thème, et les facettes vides", () => {
    const cleaned = cleanFacets(
      [
        { label: " Voir ce qui bloque ", feedback_ids: [10, 10, 99] },
        { label: "Inventée", feedback_ids: [99] },
      ],
      new Set([10, 17]),
    );
    expect(cleaned).toEqual([{ label: "Voir ce qui bloque", feedbackIds: [10] }]);
  });
});
