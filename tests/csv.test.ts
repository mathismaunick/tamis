import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFeedbackCsv } from "@/lib/csv/parse";

const HEADER = "external_id,channel,client_name,client_segment,author,received_at,text";

describe("lecture du CSV de retours", () => {
  it("lit un fichier standard, avec un texte sur plusieurs lignes", () => {
    const csv = `${HEADER}\nZD-1,ticket,Atelier Nord,pro,Lucie,2026-09-28,"Bonjour,\nune vue « dépendances » svp"\n`;
    const { rows, errors } = parseFeedbackCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ channel: "ticket", client_name: "Atelier Nord", client_segment: "pro", received_at: "2026-09-28" });
    expect(rows[0].text).toContain("\n");
  });

  it("tolère un export Excel : BOM, séparateur « ; », fins de ligne Windows, date et montant à la française", () => {
    const csv = "﻿channel;client_name;client_mrr;received_at;text\r\nemail;Kairos Conseil;1 350,50;28/09/2026;Un suivi du temps svp\r\n";
    const { rows, errors } = parseFeedbackCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ client_mrr: 1350.5, received_at: "2026-09-28", text: "Un suivi du temps svp" });
  });

  it("accepte les variantes d'écriture du canal", () => {
    const csv = "channel,client_name,received_at,text\nIn-App,Pixel Rivage,2026-10-01,un timer\nSales Call,Nexalis,2026-10-01,Slack\n";
    expect(parseFeedbackCsv(csv).rows.map((row) => row.channel)).toEqual(["in_app", "sales_call"]);
  });

  it("signale une colonne obligatoire manquante", () => {
    const { rows, errors } = parseFeedbackCsv("channel,client_name,received_at\nemail,Nexalis,2026-10-01\n");
    expect(rows).toEqual([]);
    expect(errors).toEqual([{ line: 1, column: "text", message: "colonne obligatoire manquante : text" }]);
  });

  it("rejette une ligne invalide avec son numéro et sa colonne, et garde les autres", () => {
    const csv = `channel,client_name,received_at,text\nfax,Nexalis,2026-10-01,Slack\nemail,Nexalis,31/02/2026,Slack\nemail,Nexalis,2026-10-01,Slack\n`;
    const { rows, errors } = parseFeedbackCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors.map((error) => [error.line, error.column])).toEqual([
      [2, "channel"],
      [3, "received_at"],
    ]);
  });

  it("lit sans erreur les fichiers du jeu de démonstration", () => {
    for (const [file, count] of [
      ["data/seed/feedback.csv", 72],
      ["data/seed/new_batch.csv", 10],
    ] as const) {
      const { rows, errors } = parseFeedbackCsv(readFileSync(file, "utf8"));
      expect(errors).toEqual([]);
      expect(rows).toHaveLength(count);
    }
  });
});
