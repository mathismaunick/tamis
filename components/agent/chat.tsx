"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AgentUIMessage } from "@/lib/agent/agent";
import { streamImport } from "@/lib/import-stream";
import type { ImportEvent, StepKey } from "@/lib/pipeline/events";

/** La conversation survit à un changement de page et à un rechargement, le temps de l'onglet. */
const STORAGE_KEY = "tamis:conversation";

function newConversationId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
}

export type StepState = { status: "running" | "done" | "failed"; detail?: string };

/** Un import lancé depuis le composeur : ses étapes, ses erreurs, et son résumé une fois fini. */
export type ImportRun = {
  filename: string;
  status: "running" | "done" | "failed";
  steps: Partial<Record<StepKey, StepState>>;
  errors: string[];
  summary?: string;
};

type AgentContext = {
  messages: AgentUIMessage[];
  status: "submitted" | "streaming" | "ready" | "error";
  error: Error | undefined;
  busy: boolean;
  ask: (text: string) => void;
  stop: () => void;
  restart: () => void;
  importRun: ImportRun | null;
  importCsv: (file: File) => Promise<void>;
};

const Context = createContext<AgentContext | null>(null);

export function useAgent(): AgentContext {
  const value = useContext(Context);
  if (!value) throw new Error("useAgent doit être utilisé dans un ChatProvider.");
  return value;
}

/** Met le curseur dans le champ de l'agent, avec une consigne : « Collez l'email du client ici ». */
export function focusComposer(placeholder?: string) {
  window.dispatchEvent(new CustomEvent("tamis:composer", { detail: { placeholder } }));
}

/**
 * La conversation avec l'agent, partagée par toute l'application : le panneau de droite l'affiche sur chaque page,
 * et chaque page peut lui poser une question. Elle tient dans l'onglet (sessionStorage), pas en base : rien n'est
 * conservé côté serveur hors des propositions et des stories que l'agent crée.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // L'identifiant de la conversation naît dans le navigateur, jamais pendant le rendu du serveur.
  const [conversationId, setConversationId] = useState("");
  const [importRun, setImportRun] = useState<ImportRun | null>(null);
  const { messages, sendMessage, status, stop, error, setMessages } = useChat<AgentUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const busy = status === "submitted" || status === "streaming";
  const restored = useRef(false);

  // Au chargement : la conversation de l'onglet, si elle existe. Le serveur rend la page sans elle ; on la relit
  // juste après le premier rendu, pour que le navigateur et le serveur affichent d'abord la même chose.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as { id: string; messages: AgentUIMessage[] } | null;
        if (saved?.messages?.length) {
          setConversationId(saved.id);
          setMessages(saved.messages);
        } else {
          setConversationId(newConversationId());
        }
      } catch {
        // Stockage indisponible (navigation privée, données effacées) : on repart d'une conversation vide.
        setConversationId(newConversationId());
      }
      restored.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [setMessages]);

  // Après chaque réponse complète : la conversation est gardée, et les écrans relisent la base (une story rédigée
  // par l'agent change les compteurs de l'accueil).
  const wasBusy = useRef(false);
  useEffect(() => {
    if (busy) {
      wasBusy.current = true;
      return;
    }
    if (status !== "ready" || !restored.current) return;
    try {
      if (messages.length === 0) sessionStorage.removeItem(STORAGE_KEY);
      else sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id: conversationId, messages }));
    } catch {
      // Sans stockage, la conversation reste en mémoire le temps de la page.
    }
    if (wasBusy.current) {
      wasBusy.current = false;
      router.refresh();
    }
  }, [busy, messages, status, conversationId, router]);

  // L'agent sait d'où part la question : l'onglet ouvert, et le besoin si le PO en regarde un.
  const ask = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      const need = /^\/themes\/(\d+)/.exec(pathname);
      sendMessage(
        { text: trimmed },
        { body: { context: { conversationId: conversationId || newConversationId(), view: pathname, themeId: need ? Number(need[1]) : null, panel: null } } },
      );
    },
    [busy, conversationId, pathname, sendMessage],
  );

  const restart = useCallback(() => {
    stop();
    setMessages([]);
    setImportRun(null);
    setConversationId(newConversationId());
  }, [setMessages, stop]);

  const importCsv = useCallback(
    async (file: File) => {
      const run: ImportRun = { filename: file.name, status: "running", steps: {}, errors: [] };
      setImportRun(run);
      const update = (change: (current: ImportRun) => ImportRun) => setImportRun((current) => (current ? change(current) : current));
      let summary: string | undefined;
      const onEvent = (event: ImportEvent) => {
        if (event.type === "step") update((current) => ({ ...current, steps: { ...current.steps, [event.step]: { status: event.status, detail: event.detail } } }));
        else if (event.type === "error") update((current) => ({ ...current, errors: [...current.errors, event.message] }));
        else summary = event.summary;
      };
      try {
        const result = await streamImport({ file }, onEvent);
        if (result.error) {
          update((current) => ({ ...current, status: "failed", errors: [result.error!, ...(result.details ?? [])] }));
          return;
        }
        update((current) => ({ ...current, status: summary ? "done" : "failed", summary }));
        router.refresh();
        // L'import est fini : l'agent dit ce qui a changé, à partir du compte rendu calculé par le code.
        if (summary) ask(`J'ai importé « ${file.name} » : ${summary}. Qu'est-ce qui a changé ?`);
      } catch {
        update((current) => ({ ...current, status: "failed", errors: ["La connexion a été coupée. Ce qui a été importé est conservé."] }));
      }
    },
    [ask, router],
  );

  const value = useMemo<AgentContext>(
    () => ({ messages, status, error, busy, ask, stop, restart, importRun, importCsv }),
    [messages, status, error, busy, ask, stop, restart, importRun, importCsv],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
