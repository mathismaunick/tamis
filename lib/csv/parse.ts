import Papa from "papaparse";
import { z } from "zod";

export const CHANNELS = ["email", "ticket", "in_app", "sales_call"] as const;
export const SEGMENTS = ["starter", "pro", "enterprise"] as const;
export type Channel = (typeof CHANNELS)[number];
export type Segment = (typeof SEGMENTS)[number];

const REQUIRED_COLUMNS = ["channel", "client_name", "received_at", "text"] as const;

/** Une cellule vide vaut « non renseigné ». */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), schema.optional());

/** Nombre au format français ou anglais : « 1 350 », « 1350,50 », « 1350.5 ». */
const looseNumber = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return Number(value.replace(/[\s  ]/g, "").replace(",", "."));
}, z.number().finite().nonnegative());

/** Date au format 2026-09-28 ou 28/09/2026 (l'heure éventuelle est ignorée). */
const looseDate = z.string().transform((value, ctx) => {
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const french = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const [year, month, day] = iso
    ? [iso[1], iso[2], iso[3]]
    : french
      ? [french[3], french[2].padStart(2, "0"), french[1].padStart(2, "0")]
      : [];
  const date = year ? new Date(`${year}-${month}-${day}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) {
    ctx.addIssue({ code: "custom", message: `date illisible « ${trimmed} » (attendu 2026-09-28 ou 28/09/2026)` });
    return z.NEVER;
  }
  return `${year}-${month}-${day}`;
});

const rowSchema = z.object({
  external_id: optional(z.string().trim().max(100)),
  channel: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toLowerCase().replace(/[-\s]/g, "_") : value),
    z.enum(CHANNELS, { message: "canal inconnu (email, ticket, in_app ou sales_call)" }),
  ),
  client_name: z.string().trim().min(1, "client manquant").max(200),
  client_segment: optional(
    z.preprocess(
      (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
      z.enum(SEGMENTS, { message: "segment inconnu (starter, pro ou enterprise)" }),
    ),
  ),
  client_seats: optional(looseNumber.pipe(z.number().int())),
  client_mrr: optional(looseNumber),
  author: optional(z.string().trim().max(200)),
  received_at: looseDate,
  text: z.string().trim().min(1, "texte vide").max(20_000),
  language: optional(z.string().trim().toLowerCase().max(10)),
});

export type FeedbackRow = z.infer<typeof rowSchema>;
export type CsvError = { line: number; column?: string; message: string };
export type CsvParseResult = { rows: FeedbackRow[]; errors: CsvError[] };

/** Un retour isolé (collé dans l'agent, puis ajouté par le PO), validé par les mêmes règles qu'une ligne de CSV. */
export function parseFeedbackRow(raw: unknown): { row: FeedbackRow } | { error: string } {
  const result = rowSchema.safeParse(raw);
  if (result.success) return { row: result.data };
  return { error: result.error.issues.map((issue) => issue.message).join(" ; ") };
}

/**
 * Lit un CSV de retours clients (format décrit dans le README). Tolère le BOM et le séparateur « ; »
 * d'un export Excel, les fins de ligne Windows, et renvoie une erreur lisible par ligne.
 */
export function parseFeedbackCsv(content: string): CsvParseResult {
  const source = content.replace(/^﻿/, "");
  const parsed = Papa.parse<Record<string, string>>(source, {
    header: true,
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t"],
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  const columns = parsed.meta.fields ?? [];
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: missing.map((column) => ({ line: 1, column, message: `colonne obligatoire manquante : ${column}` })),
    };
  }

  const rows: FeedbackRow[] = [];
  const errors: CsvError[] = [];
  parsed.data.forEach((raw, index) => {
    const line = index + 2; // la ligne 1 est l'en-tête
    const result = rowSchema.safeParse(raw);
    if (result.success) {
      rows.push(result.data);
    } else {
      for (const issue of result.error.issues) {
        errors.push({ line, column: issue.path.join(".") || undefined, message: issue.message });
      }
    }
  });
  for (const error of parsed.errors) {
    errors.push({ line: (error.row ?? 0) + 2, message: `CSV mal formé : ${error.message}` });
  }
  return { rows, errors };
}
