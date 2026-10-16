"use client";

import { useEffect, useRef, useState } from "react";
import { useAgent } from "@/components/agent/chat";

/**
 * Le champ pour parler à l'agent, en bas de son panneau : une question, un retour client collé tel quel, ou un CSV
 * de retours joint. Entrée envoie, Maj + Entrée passe à la ligne. Une page peut y mettre le curseur avec une consigne
 * (`focusComposer`).
 */
export function Composer({ placeholder }: { placeholder: string }) {
  const { ask, busy, stop, importCsv, importRun } = useAgent();
  const [text, setText] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const importing = importRun?.status === "running";

  // Le champ grandit avec le texte collé, jusqu'à une hauteur raisonnable.
  useEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = "auto";
    // Panneau masqué (l'agent fermé, sur téléphone) : le champ ne se mesure pas, il garde ses deux lignes.
    if (element.scrollHeight === 0) return;
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
  }, [text]);

  useEffect(() => {
    const focus = (event: Event) => {
      setHint((event as CustomEvent<{ placeholder?: string }>).detail?.placeholder ?? null);
      field.current?.focus();
    };
    window.addEventListener("tamis:composer", focus);
    return () => window.removeEventListener("tamis:composer", focus);
  }, []);

  function send() {
    if (!text.trim() || busy || importing) return;
    ask(text);
    setText("");
    setHint(null);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      className="rounded-xl border-[1.5px] border-accent bg-papier shadow-[0_3px_12px_rgba(60,71,200,0.12)]"
    >
      <label htmlFor="agent-champ" className="sr-only">
        Votre message à l&apos;agent
      </label>
      <textarea
        id="agent-champ"
        ref={field}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        }}
        rows={2}
        placeholder={hint ?? placeholder}
        className="block min-h-[calc(2lh+1rem)] w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-[14px] leading-snug outline-none placeholder:text-encre-3"
      />
      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <input
          ref={file}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) void importCsv(chosen);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => file.current?.click()}
          disabled={busy || importing}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium text-encre-2 hover:bg-papier-2 hover:text-encre disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[15px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
          Joindre un CSV de retours
        </button>
        {busy ? (
          <button type="button" onClick={() => stop()} className="inline-flex min-h-8 items-center rounded-lg px-3 text-[12.5px] font-semibold text-encre-2 ring-[1.5px] ring-inset ring-trait-2 hover:bg-papier-2">
            Arrêter
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Envoyer"
            disabled={!text.trim() || importing}
            className="grid size-8 place-items-center rounded-[9px] bg-nuit text-white transition-colors hover:bg-accent disabled:bg-trait disabled:text-encre-4"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </button>
        )}
      </div>
    </form>
  );
}
