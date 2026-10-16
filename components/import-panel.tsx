"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Button, ErrorNote, cx } from "@/components/ui";
import { streamImport } from "@/lib/import-stream";
import { formatUsd } from "@/lib/labels";
import { PIPELINE_STEPS, type ImportEvent, type StepKey } from "@/lib/pipeline/events";

type StepState = { status: "running" | "done" | "failed"; detail?: string };

/** Import d'un CSV de retours, avec la progression visible étape par étape. `autoOpen` l'ouvre dès l'arrivée sur la page. */
export function ImportPanel({ autoOpen = false, label = "Importer un CSV" }: { autoOpen?: boolean; label?: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (autoOpen && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [autoOpen]);
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Partial<Record<StepKey, StepState>>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);

  function reset() {
    setSteps({});
    setErrors([]);
    setResult(null);
  }

  function handle(event: ImportEvent) {
    if (event.type === "step") {
      setSteps((current) => ({ ...current, [event.step]: { status: event.status, detail: event.detail } }));
    } else if (event.type === "error") {
      setErrors((current) => [...current, event.message]);
    } else {
      const seconds = Math.max(1, Math.round(event.durationMs / 1000));
      const cost = event.costUsd > 0 ? `, coût ${formatUsd(event.costUsd)}` : "";
      setResult(`${event.summary}. Terminé en ${seconds} s${cost}.`);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    reset();
    setRunning(true);
    try {
      const outcome = await streamImport({ file }, handle);
      if (outcome.error) setErrors([outcome.error, ...(outcome.details ?? [])]);
      else router.refresh();
    } catch {
      setErrors(["La connexion a été coupée. Ce qui a été importé est conservé : rechargez la page pour le voir."]);
    } finally {
      setRunning(false);
    }
  }

  const visibleSteps = PIPELINE_STEPS.filter((step) => steps[step.key]);

  return (
    <>
      <Button
        variant="trait"
        onClick={() => {
          reset();
          dialog.current?.showModal();
        }}
      >
        <Icon name="upload" className="size-4" />
        {label}
      </Button>
      <dialog ref={dialog} aria-labelledby="import-titre" className="m-auto w-[min(560px,calc(100vw-32px))] rounded-xl bg-papier p-0 text-encre shadow-menu backdrop:bg-nuit/40">
        <form onSubmit={submit} className="grid gap-5 p-6">
          <div>
            <h2 id="import-titre" className="text-xl font-bold tracking-[-0.02em]">
              Importer des retours clients
            </h2>
            <p className="mt-1 text-sm text-encre-2">
              Un fichier CSV avec au moins les colonnes channel, client_name, received_at et text. Les exports Excel (séparateur « ; ») sont acceptés.{" "}
              <a href="/exemples/nouveaux-retours.csv" download className="font-semibold underline">
                Fichier d&apos;exemple
              </a>
            </p>
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={running}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="rounded-lg border-2 border-dashed border-trait-2 p-4 text-sm file:mr-3 file:min-h-9 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:font-semibold file:text-white"
          />

          {visibleSteps.length > 0 ? (
            <ol className="grid gap-2" aria-live="polite">
              {visibleSteps.map((step) => {
                const state = steps[step.key]!;
                return (
                  <li key={step.key} className="flex items-baseline gap-3 text-sm">
                    <span
                      aria-hidden
                      className={cx("size-2 shrink-0 translate-y-[-1px] rounded-full", state.status === "done" ? "bg-accent" : state.status === "failed" ? "bg-rouge" : "animate-pulse bg-encre-4")}
                    />
                    <span className="font-semibold">{step.label}</span>
                    <span className="text-encre-2">{state.status === "running" ? "en cours…" : state.status === "failed" ? "échec" : state.detail}</span>
                  </li>
                );
              })}
            </ol>
          ) : null}

          {errors.length > 0 ? (
            <ErrorNote title="Ce qui n'a pas fonctionné">
              <ul className="list-disc pl-4">
                {errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </ErrorNote>
          ) : null}
          {result ? <p className="rounded-lg border border-trait px-4 py-3 text-sm font-medium">{result}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="discret" onClick={() => dialog.current?.close()}>
              Fermer
            </Button>
            <Button type="submit" variant="principal" disabled={!file || running}>
              {running ? "Import en cours…" : "Importer"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
