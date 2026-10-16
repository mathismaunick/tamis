import { parseFeedbackCsv, parseFeedbackRow, type CsvError, type FeedbackRow } from "@/lib/csv/parse";
import type { ImportEvent } from "@/lib/pipeline/events";
import { runImport } from "@/lib/pipeline/run";

// Dix retours prennent moins d'une minute ; la limite laisse de la marge pour un lot plus gros.
export const maxDuration = 300;

const MAX_BYTES = 2_000_000;

/**
 * Import de retours : un fichier CSV (formulaire), ou un seul retour collé dans l'agent puis ajouté par le PO (JSON).
 * La progression de chaque étape est envoyée au fur et à mesure (une ligne JSON par événement).
 */
export async function POST(request: Request) {
  let rows: FeedbackRow[];
  let errors: CsvError[] = [];
  let filename: string;

  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    const body = await request.json().catch(() => null);
    const parsed = parseFeedbackRow(body?.feedback);
    if ("error" in parsed) return Response.json({ error: `Retour incomplet : ${parsed.error}.` }, { status: 400 });
    rows = [parsed.row];
    filename = `Retour de ${parsed.row.client_name}, ajouté depuis l'agent`;
  } else {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Aucun fichier reçu. Choisissez un fichier CSV." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "Fichier trop volumineux : 2 Mo au plus." }, { status: 413 });
    }
    ({ rows, errors } = parseFeedbackCsv(await file.text()));
    filename = file.name;
    if (rows.length === 0) {
      return Response.json({ error: "Aucune ligne valide dans ce fichier.", errors: errors.slice(0, 20) }, { status: 400 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ImportEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      if (errors.length > 0) {
        emit({ type: "error", message: `${errors.length} ligne(s) ignorée(s) : ${errors[0].message} (ligne ${errors[0].line})` });
      }
      try {
        await runImport(rows, filename, emit);
      } catch (error) {
        emit({ type: "error", message: error instanceof Error ? error.message : "Erreur inattendue pendant l'import." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
