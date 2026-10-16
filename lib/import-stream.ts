import type { ImportEvent } from "@/lib/pipeline/events";

/** Ce qu'on envoie à l'import : un fichier CSV, ou un seul retour collé dans l'agent. */
export type ImportPayload = { file: File } | { feedback: { text: string; client_name: string; channel: string; received_at: string; client_segment?: string | null } };

/**
 * Envoie un import et lit sa progression au fil de l'eau (une ligne JSON par événement). Côté navigateur : sert au
 * composeur de l'agent, au bouton « Ajouter au backlog » d'une analyse, et à la fenêtre d'import des retours.
 * Renvoie une erreur lisible si le serveur refuse l'import avant de commencer.
 */
export async function streamImport(payload: ImportPayload, onEvent: (event: ImportEvent) => void): Promise<{ error?: string; details?: string[] }> {
  let response: Response;
  if ("file" in payload) {
    const body = new FormData();
    body.append("file", payload.file);
    response = await fetch("/api/import", { method: "POST", body });
  } else {
    response = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback: payload.feedback }) });
  }
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null);
    return {
      error: body?.error ?? "L'import a échoué.",
      details: (body?.errors ?? []).map((error: { line: number; message: string }) => `Ligne ${error.line} : ${error.message}`),
    };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as ImportEvent);
  }
  return {};
}
