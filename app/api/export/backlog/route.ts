import Papa from "papaparse";
import { listThemes } from "@/lib/services/backlog";

/** Export du backlog classé en CSV, avec le séparateur « ; » et le BOM d'Excel pour une ouverture directe. */
export async function GET() {
  const themes = await listThemes();
  const csv = Papa.unparse(
    themes.map((theme) => ({
      rang: theme.rank ?? "",
      theme: `T${theme.id}`,
      titre: theme.title,
      besoin: theme.needStatement,
      clients: theme.reach,
      messages: theme.messages,
      segments: theme.segments.join(" "),
      impact: theme.impact ?? "",
      confiance: theme.confidence ?? "",
      effort: theme.effort ?? "",
      score: theme.score === null ? "" : theme.score.toFixed(2).replace(".", ","),
      moscow: theme.moscow ?? "",
      statut: theme.status,
      risque_de_depart: theme.churnRisk ? "oui" : "non",
    })),
    { delimiter: ";" },
  );
  return new Response(`﻿${csv}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="backlog-tamis.csv"',
    },
  });
}
