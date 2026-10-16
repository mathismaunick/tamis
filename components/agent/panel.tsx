"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { focusComposer, useAgent, type ImportRun } from "@/components/agent/chat";
import { Composer } from "@/components/agent/composer";
import { AgentAvatar, AgentTurn, needTitles } from "@/components/agent/turn";
import { cx } from "@/components/ui";
import { plural } from "@/lib/labels";
import { PIPELINE_STEPS } from "@/lib/pipeline/events";

/** Ce que le panneau sait de l'état de Tamis, calculé par le serveur : de quoi dire en deux phrases quoi faire ici. */
export type PanelData = {
  feedback: number;
  /** Le point à trancher le plus grave (un risque de départ), s'il y en a un. */
  alert: { title: string; question: string } | null;
  stories: { total: number; written: number; next: string | null };
  needTitles: Record<number, { title: string; rank: number | null }>;
};

type Suggestion = { label: string; ask?: string; composer?: string };

/**
 * Une phrase et deux suggestions par onglet : l'agent dit ce qu'il y a à faire sur l'écran, sans répéter ce que l'écran
 * montre déjà (les chiffres, les tendances, le cycle sont dans la page). Un nouveau venu sait par où commencer.
 */
function introFor(pathname: string, data: PanelData): { lines: ReactNode[]; alert?: PanelData["alert"]; suggestions: Suggestion[] } {
  if (data.feedback === 0) {
    return {
      lines: ["Je n'ai encore lu aucun retour. Joignez un CSV de retours clients, ou collez un email : j'en tire les besoins, je les classe, puis je rédige les stories."],
      suggestions: [{ label: "Coller un email client", composer: "Collez l'email du client ici, avec son nom…" }],
    };
  }
  const need = /^\/themes\/(\d+)/.exec(pathname);
  if (need) {
    const known = data.needTitles[Number(need[1])];
    const title = known?.title ?? "ce besoin";
    return {
      lines: [
        <>
          <strong>À faire ici</strong> : vérifier que ce classement vous semble juste. Un critère vous paraît faux ? Ajustez-le, avec votre raison. Sinon, faites
          rédiger sa story.
        </>,
      ],
      suggestions: [
        {
          label: known?.rank && known.rank > 1 ? "Pourquoi pas plus haut ?" : "Qu'est-ce qui le place en tête ?",
          ask:
            known?.rank && known.rank > 1
              ? `Pourquoi « ${title} » n'est-il pas plus haut ? Compare-le aux besoins classés devant lui.`
              : `Qu'est-ce qui place « ${title} » en tête du classement ?`,
        },
        { label: "Rédiger sa story", ask: `Rédige la story de « ${title} ».` },
      ],
    };
  }
  if (pathname.startsWith("/backlog")) {
    return {
      lines: [
        <>
          <strong>À faire ici</strong> : valider ce que l&apos;équipe fait ce cycle. Un besoin vous semble mal placé ? Ouvrez-le pour ajuster un critère ou le
          changer de cycle, avec votre raison.
        </>,
      ],
      alert: data.alert,
      suggestions: [
        data.alert ? { label: "Que faire de ce point ?", ask: data.alert.question } : null,
        { label: "Pourquoi cet ordre ?", ask: "Pourquoi ce classement ? Qu'est-ce qui place les premiers devant les autres ?" },
      ].filter(Boolean) as Suggestion[],
    };
  }
  if (pathname.startsWith("/stories")) {
    return {
      lines: [
        data.stories.next ? (
          <>
            <strong>À faire ici</strong> : écrire la story de chaque besoin du cycle ({data.stories.written} sur {data.stories.total}). Je rédige celle de{" "}
            <strong>{data.stories.next}</strong> ? Vous relisez, puis vous l&apos;ajustez si besoin.
          </>
        ) : (
          `Les ${plural(data.stories.total, "besoin", "besoins")} du cycle ont leur story. Je peux en préciser une, ou en rédiger une autre.`
        ),
      ],
      suggestions: data.stories.next
        ? [{ label: "Oui, rédige-la", ask: `Rédige la story de « ${data.stories.next} ».` }]
        : [{ label: "Quel besoin rédiger ensuite ?", ask: "Quel besoin hors du cycle mériterait sa story ensuite ?" }],
    };
  }
  if (pathname.startsWith("/feedback/")) {
    return {
      lines: [
        <>
          <strong>À faire ici</strong> : vérifier ce que j&apos;ai tiré de ce retour. Chaque demande cite la phrase exacte du client, surlignée dans son
          message, et mène au besoin qu&apos;elle rejoint.
        </>,
      ],
      suggestions: [{ label: "Analyser un autre email", composer: "Collez l'email du client ici, avec son nom…" }],
    };
  }
  if (pathname.startsWith("/changes")) {
    return {
      lines: ["Le journal garde chaque décision : qui l'a prise, quand, et pourquoi."],
      suggestions: [{ label: "Qu'a changé le dernier import ?", ask: "Qu'est-ce qui a changé au dernier import ?" }],
    };
  }
  return {
    lines: [
      <>
        <strong>À faire ici</strong> : vérifier que mes regroupements tiennent. Ouvrez un besoin pour lire ce que disent les clients, avec leurs mots.
      </>,
      "Un nouvel email client ? Collez-le ici : je vous dis quel besoin il rejoint, sans rien enregistrer. Quand tout vous va, passez à Prioriser.",
    ],
    suggestions: [
      { label: "Analyser un email client", composer: "Collez l'email du client ici, avec son nom…" },
      { label: "Qu'est-ce qui monte, et pourquoi ?", ask: "Quelles tendances ressortent de mes retours clients ?" },
    ],
  };
}

function Intro({ data, onAsk }: { data: PanelData; onAsk: (text: string) => void }) {
  const pathname = usePathname();
  const intro = introFor(pathname, data);
  return (
    <div className="grid gap-3">
      {intro.lines.map((line, index) => (
        <p key={index} className="text-[14px] leading-relaxed text-encre">
          {line}
        </p>
      ))}
      {intro.alert ? (
        <p className="flex gap-2.5 rounded-xl border border-[#f6c9cb] bg-papier px-3 py-2.5 text-[13.5px] leading-relaxed">
          <span aria-hidden className="mt-[7px] size-2 shrink-0 rounded-full bg-rouge" />
          <span>
            <strong>Un point à trancher.</strong> {intro.alert.title}
          </span>
        </p>
      ) : null}
      <div className="mt-1 grid gap-1.5">
        {intro.suggestions.map((suggestion) => (
          <button
            key={suggestion.label}
            type="button"
            onClick={() => (suggestion.ask ? onAsk(suggestion.ask) : focusComposer(suggestion.composer))}
            className="rounded-[10px] border border-[#d3d7f2] bg-papier px-3 py-2 text-left text-[13.5px] font-semibold text-accent-fort transition-colors hover:border-accent hover:bg-accent-voile"
          >
            {suggestion.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Un import lancé depuis le composeur : ses étapes défilent dans la conversation. */
function ImportProgress({ run }: { run: ImportRun }) {
  return (
    <div className="rounded-xl border border-agent-trait bg-papier px-3.5 py-3">
      <p className="text-[13px] font-semibold text-encre-2">
        {run.status === "running" ? `Je traite « ${run.filename} »…` : run.status === "done" ? `« ${run.filename} » est traité.` : `L'import de « ${run.filename} » n'a pas abouti.`}
      </p>
      <ol className="mt-2 grid gap-1 text-[12.5px]" aria-live="polite">
        {PIPELINE_STEPS.filter((step) => run.steps[step.key]).map((step) => {
          const state = run.steps[step.key]!;
          return (
            <li key={step.key} className="flex items-baseline gap-2">
              <span aria-hidden className={cx("size-1.5 shrink-0 translate-y-[-1px] rounded-full", state.status === "done" ? "bg-accent" : state.status === "failed" ? "bg-rouge" : "animate-pulse bg-encre-4")} />
              <span className="font-medium">{step.label}</span>
              <span className="text-encre-3">{state.status === "running" ? "en cours…" : state.status === "failed" ? "échec" : state.detail}</span>
            </li>
          );
        })}
      </ol>
      {run.errors.length > 0 ? (
        <ul className="mt-2 grid gap-0.5 text-[12.5px] text-rouge-encre">
          {run.errors.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * L'agent, à droite de chaque page, toujours au même endroit : il dit en deux phrases ce qui compte sur l'écran
 * ouvert, propose deux questions, et garde la conversation d'une page à l'autre. Le champ pour lui parler est
 * toujours visible, en bas. Sur mobile, il s'ouvre en plein écran depuis un bouton.
 */
const noSubscription = () => () => {};

export function AgentPanel({ data }: { data: PanelData }) {
  const { messages, status, error, busy, ask, restart, importRun } = useAgent();
  const [open, setOpen] = useState(false);
  const titles = useMemo(() => needTitles(messages), [messages]);
  const pathname = usePathname();
  // Le panneau arrive après le reste de la page (ses données sont lues à part) : la conversation de l'onglet peut
  // déjà être restaurée quand il s'hydrate. Il s'hydrate donc comme le serveur l'a rendu, puis l'affiche.
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const conversation = hydrated && (messages.length > 0 || importRun !== null);
  // Une conversation en cours remplace l'accueil de la page : le point à trancher reste visible au-dessus du champ,
  // tant que la question n'a pas été posée.
  const pageAlert = conversation ? introFor(pathname, data).alert : null;
  const alertAsked = pageAlert ? messages.some((message) => message.role === "user" && message.parts.some((part) => part.type === "text" && part.text === pageAlert.question)) : false;
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (conversation) bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, status, importRun, conversation]);

  return (
    <>
      <aside
        aria-label="Tamis, votre agent produit"
        className={cx(
          "flex-col border-agent-trait bg-agent lg:static lg:z-auto lg:flex lg:h-dvh lg:w-[360px] lg:shrink-0 lg:border-l",
          open ? "fixed inset-0 z-40 flex" : "hidden",
        )}
      >
        <header className="flex min-h-[60px] items-center gap-2.5 border-b border-agent-trait bg-papier px-4">
          <AgentAvatar />
          <span className="min-w-0 leading-tight">
            <b className="block text-[15px]">Tamis</b>
            <span className="block text-xs whitespace-nowrap text-encre-3">Votre agent produit</span>
          </span>
          <span className="ml-auto flex items-center gap-1">
            {conversation ? (
              <button
                type="button"
                onClick={restart}
                aria-label="Nouvelle conversation"
                className="inline-flex min-h-8 items-center rounded-lg px-2.5 text-[12.5px] font-medium whitespace-nowrap text-encre-2 hover:bg-papier-2 hover:text-encre"
              >
                {/* Sur un téléphone, le libellé court laisse l'en-tête sur une ligne. */}
                <span className="sm:hidden">Recommencer</span>
                <span className="hidden sm:inline">Nouvelle conversation</span>
              </button>
            ) : null}
            <button type="button" onClick={() => setOpen(false)} aria-label="Fermer l'agent" className="grid size-9 place-items-center rounded-lg text-encre-3 hover:bg-papier-2 lg:hidden">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </span>
        </header>

        <div className="@container min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {conversation ? (
            <div className="flex flex-col gap-4" aria-live="polite">
              {messages.map((message, index) =>
                message.role === "user" ? (
                  <p key={message.id} className="line-clamp-6 max-w-[88%] self-end rounded-xl rounded-br-[4px] bg-nuit px-3 py-2 text-[13.5px] leading-relaxed whitespace-pre-line text-white">
                    {message.parts.map((part) => (part.type === "text" ? part.text : "")).join("")}
                  </p>
                ) : (
                  <AgentTurn key={message.id} message={message} titles={titles} last={index === messages.length - 1} busy={busy} onAsk={ask} />
                ),
              )}
              {importRun && importRun.status !== "done" ? <ImportProgress run={importRun} /> : null}
              {status === "submitted" ? (
                <p className="flex items-center gap-2 text-[12.5px] text-encre-3">
                  <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-accent" />
                  Je lis vos données…
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="text-[13px] text-rouge-encre">
                  Je n&apos;ai pas pu répondre. Réessayez dans un instant.
                </p>
              ) : null}
              <div ref={bottom} />
            </div>
          ) : (
            <Intro data={data} onAsk={ask} />
          )}
        </div>

        {pageAlert && !alertAsked ? (
          <div className="shrink-0 px-3 pt-2">
            <div className="flex gap-2.5 rounded-xl border border-[#f6c9cb] bg-papier px-3 py-2 text-[13px] leading-snug">
              <span aria-hidden className="mt-[5px] size-2 shrink-0 rounded-full bg-rouge" />
              <span className="min-w-0">
                <strong>Un point à trancher.</strong> {pageAlert.title}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => ask(pageAlert.question)}
                  className="mt-1 block font-semibold text-accent-fort hover:text-accent disabled:opacity-50"
                >
                  Que faire de ce point ?
                </button>
              </span>
            </div>
          </div>
        ) : null}

        <div className="shrink-0 px-3 pt-1 pb-3">
          <Composer placeholder={conversation ? "Répondez, ou collez un autre retour…" : "Collez un email client ou posez une question…"} />
        </div>
      </aside>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-4 z-30 inline-flex min-h-12 items-center gap-2 rounded-full bg-nuit px-4 text-sm font-semibold text-white shadow-menu lg:hidden"
        >
          <AgentAvatar className="size-7 bg-transparent" />
          Demander à Tamis
        </button>
      ) : null}
    </>
  );
}
