"use client";

import type { ReactNode } from "react";
import { useAgent } from "@/components/agent/chat";

/** Depuis n'importe quelle page : un bouton qui pose la question à l'agent, dont la réponse s'affiche à droite. */
export function AskButton({ question, className, children }: { question: string; className?: string; children: ReactNode }) {
  const { ask, busy } = useAgent();
  return (
    <button type="button" disabled={busy} onClick={() => ask(question)} className={className}>
      {children}
    </button>
  );
}
