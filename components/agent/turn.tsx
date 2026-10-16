"use client";

import { getToolName, isToolUIPart } from "ai";
import Link from "next/link";
import type { ReactNode } from "react";
import { AnalysisBlock, CompareBlock, FeedbackBlock, ImportBlock, NeedBlock, ProposalBlock, RankingBlock, StoryBlock, TrendsBlock } from "@/components/agent/blocks";
import { TamisSymbol } from "@/components/brand";
import { RichText } from "@/components/rich-text";
import { buttonClass, cx } from "@/components/ui";
import type { AgentUIMessage } from "@/lib/agent/agent";
import { frenchSpaces, plural } from "@/lib/labels";

type Part = AgentUIMessage["parts"][number];
type Output = Record<string, unknown>;

/** L'avatar de l'agent : le tamis, sur la nuit de la marque. */
export function AgentAvatar({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cx("grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-nuit text-white", className)}>
      <TamisSymbol size={20} />
    </span>
  );
}

/** Ce que l'agent a fait, outil par outil, en une ligne chacun, à la première personne. */
function stepLabel(name: string, input: Output | undefined, output: Output | null, done: boolean): string {
  switch (name) {
    case "list_needs":
      return done ? `J'ai lu le classement des ${(output?.needs as unknown[] | undefined)?.length ?? ""} besoins` : "Je lis le classement des besoins…";
    case "get_trends":
      return done ? "J'ai compté les demandes récentes et celles d'avant, besoin par besoin" : "Je compte les demandes récentes…";
    case "get_need":
      return done && output?.title ? `J'ai lu les preuves de « ${String(output.title)} »` : "Je lis les preuves d'un besoin…";
    case "search_feedback":
      return input?.query ? `J'ai cherché dans les retours : « ${String(input.query)} »` : "J'ai cherché dans les retours";
    case "compare_needs":
      return `J'ai comparé ${(input?.need_ids as unknown[] | undefined)?.length ?? "plusieurs"} besoins, facteur par facteur`;
    case "analyze_feedback": {
      if (!done) return "J'analyse le retour : demandes, citations, besoin le plus proche…";
      const items = (output?.items as Array<{ kind: string }> | undefined) ?? [];
      const features = items.filter((item) => item.kind === "feature").length;
      return `J'ai analysé le retour : ${plural(features, "demande")}, citations vérifiées mot pour mot`;
    }
    case "get_import_report":
      return "J'ai lu le compte rendu de l'import";
    case "propose_score_change":
    case "propose_status":
      return "J'ai préparé une proposition, à votre décision";
    case "draft_user_story":
      return done ? "J'ai rédigé la story à partir des preuves" : "Je rédige la story à partir des preuves (une vingtaine de secondes)…";
    default:
      return done ? "J'ai consulté les données" : "Je consulte les données…";
  }
}

/** Les outils qui demandent une action du PO : leur bloc est toujours montré. */
const ACTION_TOOLS = new Set(["analyze_feedback", "propose_score_change", "propose_status", "draft_user_story"]);

function blockFor(name: string, output: Output): ReactNode {
  switch (name) {
    case "list_needs":
      return <RankingBlock output={output} />;
    case "get_trends":
      return <TrendsBlock output={output} />;
    case "get_need":
      return <NeedBlock output={output} />;
    case "compare_needs":
      return <CompareBlock output={output} />;
    case "search_feedback":
      return <FeedbackBlock output={output} />;
    case "get_import_report":
      return <ImportBlock output={output} />;
    case "analyze_feedback":
      return <AnalysisBlock output={output} />;
    case "propose_score_change":
    case "propose_status":
      return <ProposalBlock output={output} toolName={name} />;
    case "draft_user_story":
      return <StoryBlock output={output} />;
    default:
      return null;
  }
}

type Done = { name: string; id: string; output: Output };

/** Les titres des besoins vus par l'agent : une référence [T3] devient un lien qui porte le titre. */
export function needTitles(messages: AgentUIMessage[]): Map<number, string> {
  const titles = new Map<number, string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(visit);
    const record = value as Record<string, unknown>;
    if (typeof record.id === "string" && /^T\d+$/.test(record.id) && typeof record.title === "string") titles.set(Number(record.id.slice(1)), record.title);
    Object.values(record).forEach(visit);
  };
  for (const message of messages) for (const part of message.parts) if (isToolUIPart(part) && part.state === "output-available") visit(part.output);
  return titles;
}

/** La suite proposée après une réponse, selon ce que l'agent vient de montrer. */
export type FollowUp = { label: string; ask?: string; href?: string };

export function followUpsFor(done: Done[]): FollowUp[] {
  const last = [...done].reverse().find((entry) => !("error" in entry.output));
  if (!last) return [];
  const output = last.output;
  switch (last.name) {
    case "list_needs": {
      const first = ((output.needs as Array<{ rank: number | null; title: string }>) ?? []).filter((need) => need.rank !== null).sort((a, b) => a.rank! - b.rank!)[0];
      return [first ? { label: `Rédige la story de « ${first.title} »`, ask: `Rédige la story de « ${first.title} ».` } : null, { label: "Tous les besoins", href: "/backlog" }].filter(Boolean) as FollowUp[];
    }
    case "get_trends":
      return [{ label: "Qu'est-ce que je priorise ce cycle ?", ask: "Qu'est-ce que je priorise ce cycle, et pourquoi ?" }];
    case "get_need":
      return [
        { label: `Rédige la story de « ${String(output.title)} »`, ask: `Rédige la story de « ${String(output.title)} ».` },
        { label: "Ouvrir la page du besoin", href: `/themes/${String(output.id).slice(1)}` },
      ];
    case "compare_needs":
      return [{ label: "Lequel rédiger en premier ?", ask: "Lequel de ces besoins faut-il rédiger en premier ?" }];
    case "get_import_report":
      return [{ label: "Quel besoin a le plus bougé, et pourquoi ?", ask: "Quel besoin a le plus bougé avec cet import, et pourquoi ?" }];
    default:
      return [];
  }
}

/**
 * Une réponse de l'agent : ses étapes en lignes grises, sa réponse, puis ses résultats en visuel. Le texte que le
 * modèle écrit entre deux outils est sa note de travail, souvent en anglais : on ne montre que celui de la fin.
 */
export function AgentTurn({
  message,
  titles,
  last,
  busy,
  onAsk,
}: {
  message: AgentUIMessage;
  titles: ReadonlyMap<number, string>;
  last: boolean;
  busy: boolean;
  onAsk: (text: string) => void;
}) {
  const parts = message.parts;
  const lastToolIndex = parts.reduce((found, part, index) => (isToolUIPart(part) ? index : found), -1);
  const steps: Array<{ key: string; label: string; failed: boolean; done: boolean }> = [];
  const done: Done[] = [];

  parts.forEach((part: Part, index) => {
    if (!isToolUIPart(part)) return;
    const name = getToolName(part);
    const isDone = part.state === "output-available";
    const output = isDone ? (part.output as Output) : null;
    const failed = part.state === "output-error" || Boolean(output && "error" in output);
    steps.push({ key: `${index}`, label: stepLabel(name, part.input as Output | undefined, output, isDone), failed, done: isDone });
    if (isDone && output && !("error" in output)) done.push({ name, id: part.toolCallId, output });
  });

  const text = parts
    .map((part, index) => (part.type === "text" && index > lastToolIndex ? part.text : ""))
    .join("")
    .trim();

  // Les blocs d'action sont tous montrés ; des blocs de lecture, seul le dernier (l'agent en lit souvent plusieurs).
  const lastView = [...done].reverse().find((entry) => !ACTION_TOOLS.has(entry.name));
  const blocks = done.filter((entry) => ACTION_TOOLS.has(entry.name) || entry === lastView);
  const followUps = last && !busy ? followUpsFor(done) : [];

  // Dans le panneau de l'agent : pas d'avatar à chaque réponse, l'en-tête du panneau dit déjà qui parle.
  return (
    <div className="grid min-w-0 gap-2.5">
      <div className="grid min-w-0 gap-2.5">
        {steps.length > 0 ? (
          <ul className="grid gap-0.5" aria-label="Ce que l'agent a fait">
            {steps.map((step) => (
              <li key={step.key} className="flex items-start gap-2 text-[12.5px] leading-snug text-encre-3">
                {step.failed ? (
                  <span aria-hidden className="size-1.5 rounded-full bg-rouge" />
                ) : step.done ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5 text-encre-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : (
                  <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-accent" />
                )}
                {step.label}
                {step.failed ? <span className="text-rouge-encre">· échec</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {text ? (
          <div className="text-[14px] leading-relaxed text-encre">
            <RichText text={text} titles={titles} />
          </div>
        ) : null}
        {blocks.map((entry) => (
          <div key={entry.id}>{blockFor(entry.name, entry.output)}</div>
        ))}
        {followUps.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {followUps.map((followUp, index) => {
              // Une suggestion peut porter un long titre de besoin : elle passe à la ligne au lieu de sortir du panneau.
              const className = cx(buttonClass(index === 0 ? "principal" : "trait", "sm"), "py-1.5 text-left");
              const label = <span className="whitespace-normal">{frenchSpaces(followUp.label)}</span>;
              return followUp.href ? (
                <Link key={followUp.label} href={followUp.href} className={className}>
                  {label}
                </Link>
              ) : (
                <button key={followUp.label} type="button" onClick={() => onAsk(followUp.ask!)} className={className}>
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
