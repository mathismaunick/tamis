"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { applyProposalAction, importReportAction, proposalStatusAction, rejectProposalAction, type ProposalActionResult } from "@/app/(app)/agent-actions";
import { CitedText } from "@/components/cited-text";
import { Button, MoscowTag, cx } from "@/components/ui";
import { streamImport } from "@/lib/import-stream";
import { CHANNEL_LABELS, MOSCOW_COLORS, SEGMENT_COLORS, SEGMENT_LABELS, formatDate, frenchSpaces, impactWord, moscowName, ordinal, plural, riceScore } from "@/lib/labels";
import { PIPELINE_STEPS, type StepKey } from "@/lib/pipeline/events";
import type { ImportReport } from "@/lib/services/imports";

/*
 * Les réponses visuelles de l'agent : chaque outil qu'il appelle a son bloc. Le modèle choisit l'outil, le code
 * dessine son résultat avec les vraies données : le classement en barres, un besoin et ses preuves, une story…
 */

type Output = Record<string, unknown>;
const idOf = (ref: unknown) => Number(String(ref).replace(/^\D+/, ""));
const fill = (moscow: unknown) => MOSCOW_COLORS[String(moscow ?? "wont")]?.fill ?? MOSCOW_COLORS.wont.fill;

function Frame({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-xl border border-trait bg-papier px-4 py-3.5 sm:px-5", className)}>
      {title || aside ? (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          {title ? <p className="text-[13.5px] font-semibold text-encre-2">{title}</p> : <span />}
          {aside}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function Legend({ children }: { children?: ReactNode }) {
  return (
    <p className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-encre-2">
      {(["must", "should", "could", "wont"] as const).map((key) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: MOSCOW_COLORS[key].fill }} />
          {moscowName(key)}
        </span>
      ))}
      {children ? <span className="ml-auto">{children}</span> : null}
    </p>
  );
}

type NeedRow = {
  id: string;
  title: string;
  rank: number | null;
  clients: number;
  messages: number;
  impact: number | null;
  confidence: number | null;
  effort: number | null;
  moscow: string | null;
  churn_risk?: boolean;
  trend?: string | null;
  recent_messages?: number;
  older_messages?: number;
};

/** Le classement : les six premiers besoins en barres, la longueur dit la priorité, la couleur la catégorie. */
export function RankingBlock({ output }: { output: Output }) {
  const needs = ((output.needs as NeedRow[]) ?? []).filter((need) => need.rank !== null).sort((a, b) => a.rank! - b.rank!);
  const max = Math.max(0.0001, ...needs.map(riceScore));
  const shown = needs.slice(0, 6);
  return (
    <Frame title="Le classement : clients × impact × confiance ÷ effort">
      <ol className="grid gap-2.5">
        {shown.map((need) => (
          <li key={need.id} className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-baseline gap-x-2">
            <span className="text-[13px] font-semibold text-encre-4">{need.rank}</span>
            <Link href={`/themes/${idOf(need.id)}`} className="truncate text-[13.5px] font-semibold text-encre hover:text-accent">
              {need.title}
            </Link>
            <span className="text-[12.5px] whitespace-nowrap text-encre-2">
              <b className="text-[14px] text-encre">{need.clients}</b> {need.clients > 1 ? "clients" : "client"}
            </span>
            <span aria-hidden className="col-span-2 col-start-2 mt-1 block h-2 rounded-[3px]" style={{ width: `${Math.max(4, Math.round((riceScore(need) / max) * 100))}%`, background: fill(need.moscow) }} />
          </li>
        ))}
      </ol>
      <Legend>
        {needs.length > shown.length ? (
          <Link href="/backlog" className="font-medium">
            {plural(needs.length - shown.length, "autre besoin", "autres besoins")}
          </Link>
        ) : null}
      </Legend>
    </Frame>
  );
}

/** Les tendances : pour chaque besoin, les demandes d'avant (en gris) et les récentes (en couleur). */
export function TrendsBlock({ output }: { output: Output }) {
  const needs = (output.needs as NeedRow[]) ?? [];
  const max = Math.max(1, ...needs.map((need) => need.messages));
  const since = output.recent_since ? formatDate(String(output.recent_since)) : null;
  return (
    <Frame title={since ? `Demandes avant et depuis le ${since}` : "Demandes par besoin"}>
      <ol className="grid gap-2.5">
        {needs.map((need) => (
          <li key={need.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2">
            <Link href={`/themes/${idOf(need.id)}`} className="truncate text-[13.5px] font-semibold text-encre hover:text-accent">
              {need.title}
            </Link>
            <span className="text-[12.5px] whitespace-nowrap text-encre-2">
              {need.trend === "en hausse" ? <b className="text-encre">↑ en hausse</b> : need.trend === "en baisse" ? "↓ en baisse" : plural(need.clients, "client")}
            </span>
            <span aria-hidden className="col-span-2 mt-1 flex h-2 gap-0.5" style={{ width: `${Math.max(4, Math.round((need.messages / max) * 100))}%` }}>
              <span className="rounded-l-[3px] bg-trait-2" style={{ flex: need.older_messages ?? 0 }} />
              <span className="rounded-r-[3px]" style={{ flex: need.recent_messages ?? 0, background: fill(need.moscow) }} />
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3.5 flex flex-wrap gap-x-4 text-[12.5px] text-encre-2">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[3px] bg-trait-2" />
          Avant
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[3px] bg-must" />
          Récentes, à la couleur de la catégorie
        </span>
      </p>
    </Frame>
  );
}

type Factor = { value: number | null; source?: string; ai_agreement?: string };

function disputed(factor: Factor | undefined) {
  if (!factor || factor.source !== "model" || !factor.ai_agreement) return false;
  const [agree, total] = factor.ai_agreement.split("/").map(Number);
  return agree < total;
}

/** Un chiffre de la fiche d'un besoin. Deux par ligne : quatre côte à côte ne tiennent pas dans les 360 px du panneau. */
function Kpi({ value, label, doubt }: { value: string; label: string; doubt?: boolean }) {
  return (
    <div className="min-w-0 border-trait py-2.5 odd:pr-3 even:border-l even:pl-3 [&:nth-child(n+3)]:border-t">
      <p className="text-[18px] leading-none font-extrabold tracking-[-0.02em] whitespace-nowrap">{value}</p>
      <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-encre-2">
        {doubt ? <span role="img" aria-label="L'IA hésite" className="size-2 rounded-full bg-ambre" /> : null}
        {label}
      </p>
    </div>
  );
}

/** Un besoin : sa place, ses facteurs en chiffres, ce que demandent les clients, et une preuve. */
export function NeedBlock({ output }: { output: Output }) {
  const id = idOf(output.id);
  const factors = (output.factors ?? {}) as Record<string, Factor>;
  const facets = ((output.facets as Array<{ label: string; clients: number }>) ?? []).slice(0, 3);
  const quotes = ((output.quotes as Array<{ feedback: string; client: string; quote: string }>) ?? []).slice(0, 2);
  const clients = factors.clients?.value ?? 0;
  return (
    <Frame>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <MoscowTag moscow={(output.moscow as string) ?? null} />
        {output.rank ? (
          <span className="text-[13px] font-medium text-encre-2">
            {ordinal(Number(output.rank))} sur {String(output.ranked_needs ?? "")}
          </span>
        ) : (
          <span className="text-[13px] text-encre-3">Hors classement</span>
        )}
        {output.churn_risk ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-encre-2">
            <span aria-hidden className="size-2 rounded-full bg-rouge" />
            Risque de départ
          </span>
        ) : null}
      </p>
      <Link href={`/themes/${id}`} className="mt-1.5 block text-lg leading-snug font-bold tracking-[-0.01em] text-encre hover:text-accent">
        {String(output.title)}
      </Link>
      <div className="mt-3 grid grid-cols-2 border-y border-trait">
        <Kpi value={String(clients)} label={clients > 1 ? "clients" : "client"} />
        <Kpi value={impactWord(factors.impact?.value)} label="impact" doubt={disputed(factors.impact)} />
        <Kpi value={factors.confidence?.value === null || factors.confidence?.value === undefined ? "–" : `${Math.round(factors.confidence.value * 100)} %`} label="confiance" doubt={disputed(factors.confidence)} />
        <Kpi value={factors.effort?.value ? `${factors.effort.value} pts` : "–"} label="effort" doubt={disputed(factors.effort)} />
      </div>
      {facets.length > 0 ? (
        <ul className="mt-3 grid gap-2.5">
          {facets.map((facet) => (
            <li key={facet.label}>
              <p className="flex justify-between gap-3 text-[13.5px]">
                <span>{frenchSpaces(facet.label)}</span>
                <span className="whitespace-nowrap text-encre-3">{plural(facet.clients, "client")}</span>
              </p>
              <span aria-hidden className="mt-1 block h-1.5 rounded-full bg-papier-3">
                <span className="block h-1.5 rounded-full" style={{ width: `${Math.max(6, Math.round((facet.clients / Math.max(1, clients)) * 100))}%`, background: fill(output.moscow) }} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {quotes.map((quote) => (
        <blockquote key={quote.feedback} className="mt-3 border-l-2 border-trait-2 pl-3 text-[13.5px] text-encre-2">
          {frenchSpaces(`« ${quote.quote} »`)}
          <span className="mt-0.5 block text-[12.5px] text-encre-3">
            <b className="font-medium text-encre">{quote.client}</b> ·{" "}
            <Link href={`/feedback/${idOf(quote.feedback)}`} className="text-encre-3 hover:text-accent">
              {quote.feedback}
            </Link>
          </span>
        </blockquote>
      ))}
    </Frame>
  );
}

/** Deux à cinq besoins côte à côte, facteur par facteur. */
export function CompareBlock({ output }: { output: Output }) {
  const needs = (output.needs as NeedRow[]) ?? [];
  const rows: Array<{ label: string; value: (need: NeedRow) => string }> = [
    { label: "Rang", value: (need) => (need.rank ? ordinal(need.rank) : "–") },
    { label: "Clients", value: (need) => String(need.clients) },
    { label: "Impact", value: (need) => impactWord(need.impact) },
    { label: "Confiance", value: (need) => (need.confidence === null ? "–" : `${Math.round(need.confidence * 100)} %`) },
    { label: "Effort", value: (need) => (need.effort ? `${need.effort} pts` : "–") },
  ];
  return (
    <Frame title="Comparaison, facteur par facteur">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="w-24" />
              {needs.map((need) => (
                <th key={need.id} className="px-2 pb-2 text-left align-bottom font-semibold">
                  <Link href={`/themes/${idOf(need.id)}`} className="text-encre hover:text-accent">
                    {need.title}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-trait">
                <th className="py-2 pr-2 text-left font-normal text-encre-3">{row.label}</th>
                {needs.map((need) => (
                  <td key={need.id} className="px-2 py-2 font-semibold">
                    {row.value(need)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  );
}

/** Des retours clients retrouvés par l'agent, chacun relié à sa source. */
export function FeedbackBlock({ output }: { output: Output }) {
  const items = (output.feedback as Array<{ id: string; client: string; segment: string; channel: string; date: string; excerpt: string }>) ?? [];
  if (items.length === 0) return null;
  return (
    <Frame title={plural(items.length, "retour trouvé", "retours trouvés")}>
      <ul className="grid gap-3">
        {items.slice(0, 5).map((item) => (
          <li key={item.id} className="border-l-2 border-trait-2 pl-3">
            <p className="line-clamp-2 text-[13.5px]">{frenchSpaces(item.excerpt)}</p>
            <p className="mt-0.5 text-[12.5px] text-encre-3">
              <b className="font-medium text-encre">{item.client}</b> · {SEGMENT_LABELS[item.segment] ?? item.segment} · {CHANNEL_LABELS[item.channel] ?? item.channel},{" "}
              {formatDate(item.date)} ·{" "}
              <Link href={`/feedback/${idOf(item.id)}`} className="text-encre-3 hover:text-accent">
                {item.id}
              </Link>
            </p>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

type ReportNeed = { id: string; title: string; requests_added: number; new_clients: string[]; clients: number; new_need: boolean; rank_before: number | null; rank_after: number | null };

function RankMove({ from, to }: { from: number | null; to: number | null }) {
  if (to === null) return <span className="text-encre-3">hors classement</span>;
  if (from === null || from === to) return <span className="text-encre-2">{ordinal(to)}</span>;
  return (
    <span className={cx("font-semibold", to < from ? "text-encre" : "text-encre-2")}>
      {ordinal(from)} → {ordinal(to)}
    </span>
  );
}

/** Ce qu'un import a changé : où sont allées les demandes, quels besoins sont nés, qui a bougé. */
export function ImportBlock({ output }: { output: Output }) {
  const needs = (output.needs as ReportNeed[]) ?? [];
  const regrouped = (output.regrouped as Array<{ small_need: string; into_title: string }>) ?? [];
  return (
    <Frame
      title={[
        `${plural(Number(output.feedback ?? 0), "retour importé", "retours importés")}${Number(output.duplicates ?? 0) > 0 ? ` dont ${plural(Number(output.duplicates), "doublon")}, compté une fois` : ""}`,
        plural(Number(output.requests ?? 0), "demande"),
        output.bugs ? plural(Number(output.bugs), "bug") : null,
      ]
        .filter(Boolean)
        .join(", ")}
    >
      <ul className="grid gap-2">
        {needs.slice(0, 8).map((need) => (
          <li key={need.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-trait pb-2 last:border-b-0 last:pb-0">
            <span className="min-w-0">
              <Link href={`/themes/${idOf(need.id)}`} className="text-sm font-semibold text-encre hover:text-accent">
                {need.title}
              </Link>
              <span className="ml-2 text-[13px] text-encre-3">
                {need.new_need ? "nouveau besoin" : `+${plural(need.requests_added, "demande")}`}
                {need.new_clients.length > 0 && !need.new_need ? `, dont ${need.new_clients.join(", ")}` : ""}
              </span>
            </span>
            <span className="text-[13px] whitespace-nowrap">
              {need.clients} cl. · <RankMove from={need.rank_before} to={need.rank_after} />
            </span>
          </li>
        ))}
      </ul>
      {regrouped.length > 0 ? (
        <p className="mt-3 text-[13px] text-encre-2">
          Regroupés : {regrouped.map((merge) => `« ${merge.small_need} » avec ${merge.into_title}`).join(" ; ")}.
        </p>
      ) : null}
    </Frame>
  );
}

const FACTOR_NAMES: Record<string, string> = { impact: "Impact", confidence: "Confiance", effort: "Effort" };

function factorValue(factor: string, value: unknown) {
  if (value === null || value === undefined) return "–";
  if (factor === "confidence") return `${Math.round(Number(value) * 100)} %`;
  if (factor === "effort") return `${value} pts`;
  if (factor === "impact") return impactWord(Number(value));
  return String(value);
}

/** Une proposition de l'agent : rien ne change tant que le PO n'a pas cliqué. */
export function ProposalBlock({ output, toolName }: { output: Output; toolName: string }) {
  const [result, setResult] = useState<ProposalActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const id = Number(output.proposal_id);
  const isScore = toolName === "propose_score_change";

  // La conversation suit le PO d'une page à l'autre : une proposition déjà tranchée ne se présente plus en attente.
  useEffect(() => {
    let active = true;
    void proposalStatusAction(id).then((status) => {
      if (active && (status === "applied" || status === "rejected")) setResult((current) => current ?? { status });
    });
    return () => {
      active = false;
    };
  }, [id]);
  const describe = isScore
    ? `${FACTOR_NAMES[String(output.factor)] ?? output.factor} : ${factorValue(String(output.factor), output.from)} → ${factorValue(String(output.factor), output.to)}`
    : `Statut : ${String(output.from)} → ${String(output.to)}`;

  async function act(kind: "apply" | "reject") {
    setPending(true);
    setResult(kind === "apply" ? await applyProposalAction(id) : await rejectProposalAction(id));
    setPending(false);
  }

  return (
    <Frame>
      <p className="flex items-center gap-2 text-[13px] font-medium text-encre-2">
        <span aria-hidden className={cx("size-2 rounded-full", result && !("error" in result) ? (result.status === "applied" ? "bg-accent" : "bg-neutre") : "bg-ambre")} />
        {result === null || "error" in result ? "Proposition, en attente de votre décision" : result.status === "applied" ? "Proposition appliquée, inscrite au journal" : "Proposition rejetée"}
      </p>
      <Link href={`/themes/${idOf(output.need)}`} className="mt-2 block text-sm font-semibold text-encre-2 hover:text-accent">
        {String(output.need_title)}
      </Link>
      <p className="mt-0.5 text-lg font-bold">{describe}</p>
      <p className="mt-1 text-[13.5px] text-encre-2">
        <CitedText text={String(output.reason)} />
      </p>
      {result === null ? (
        <div className="mt-3 flex gap-2">
          <Button variant="principal" size="sm" disabled={pending} onClick={() => act("apply")}>
            Appliquer
          </Button>
          <Button variant="trait" size="sm" disabled={pending} onClick={() => act("reject")}>
            Rejeter
          </Button>
        </div>
      ) : "error" in result ? (
        <p role="alert" className="mt-3 text-sm text-rouge-encre">
          {result.error}
        </p>
      ) : result.status === "applied" && result.before?.rank !== result.after?.rank ? (
        <p className="mt-3 text-sm">
          Le besoin passe de <RankMove from={result.before?.rank ?? null} to={result.after?.rank ?? null} />.
        </p>
      ) : null}
    </Frame>
  );
}

/**
 * Une story rédigée par l'agent : son titre, sa taille et sa phrase. Le document complet (critères, points à
 * trancher, complexité) s'affiche dans l'onglet Rédiger : le panneau ne le répète pas.
 */
export function StoryBlock({ output }: { output: Output }) {
  const criteria = Array.isArray(output.criteria) ? (output.criteria as string[]) : [];
  return (
    <Frame
      title="Story rédigée, en brouillon"
      aside={output.points ? <span className="rounded-md bg-must px-2 py-0.5 text-[13px] font-bold text-white">{String(output.points)} points</span> : null}
    >
      <p className="text-[14.5px] font-bold">{String(output.title)}</p>
      <p className="mt-1 line-clamp-3 text-[13.5px] leading-relaxed text-encre-2">{frenchSpaces(String(output.story))}</p>
      {criteria.length > 0 ? <p className="mt-1.5 text-[12.5px] text-encre-3">{plural(criteria.length, "critère d'acceptation", "critères d'acceptation")}, au format Étant donné / Quand / Alors.</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/stories?besoin=${idOf(output.need)}`} className="inline-flex min-h-8 items-center rounded-lg bg-accent px-3 text-[13px] font-semibold text-white hover:bg-accent-fort hover:text-white">
          La lire en entier
        </Link>
        <Link href={`/stories/${String(output.story_id)}#modifier`} className="inline-flex min-h-8 items-center rounded-lg px-3 text-[13px] font-semibold text-encre-2 ring-[1.5px] ring-inset ring-trait-2 hover:bg-papier-2">
          Modifier
        </Link>
      </div>
    </Frame>
  );
}

type AnalysisItem = {
  kind: string;
  need: string;
  solution: string | null;
  quote: string;
  would_join: { id: string; title: string; rank: number | null; rank_after_same_factors: number | null; clients: number; clients_after: number } | string | null;
};

type StepState = { status: "running" | "done" | "failed"; detail?: string };

/**
 * Un retour collé, analysé sans être enregistré : ce que le client demande, le besoin que ça rejoint, et ce que ça
 * changerait. « Ajouter au backlog » passe par l'import normal ; le compte rendu dit ensuite où le retour est allé.
 */
export function AnalysisBlock({ output }: { output: Output }) {
  const router = useRouter();
  const items = (output.items as AnalysisItem[]) ?? [];
  const add = output.add as { text: string; client: string; channel: string; segment: string | null; date: string } | undefined;
  const client = output.client as { name: string; known: boolean; segment: string | null } | undefined;
  const [state, setState] = useState<"idle" | "adding" | "added" | "ignored" | "failed">("idle");
  const [segment, setSegment] = useState<string>(add?.segment ?? "");
  const [steps, setSteps] = useState<Partial<Record<StepKey, StepState>>>({});
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const features = items.filter((item) => item.kind === "feature");
  const others = items.filter((item) => item.kind !== "feature");

  async function addToBacklog() {
    if (!add) return;
    setState("adding");
    setError(null);
    let batchId: number | null = null;
    const result = await streamImport(
      { feedback: { text: add.text, client_name: add.client, channel: add.channel, received_at: add.date, client_segment: segment || null } },
      (event) => {
        if (event.type === "step") setSteps((current) => ({ ...current, [event.step]: { status: event.status, detail: event.detail } }));
        else if (event.type === "error") setError(event.message);
        else batchId = event.batchId;
      },
    ).catch(() => ({ error: "La connexion a été coupée." }));
    if (result.error || batchId === null) {
      setError(result.error ?? "L'ajout n'a pas abouti.");
      setState("failed");
      return;
    }
    setReport(await importReportAction(batchId));
    setState("added");
    router.refresh();
  }

  const needsSegment = client && !client.known && !add?.segment;

  return (
    <Frame>
      <p className="flex items-center gap-2 text-[13px] font-medium text-encre-2">
        <span aria-hidden className={cx("size-2 rounded-full", state === "added" ? "bg-accent" : state === "ignored" ? "bg-neutre" : "bg-ambre")} />
        {state === "added" ? "Ajouté à vos retours" : state === "ignored" ? "Ignoré : rien n'a été enregistré" : "Analysé, pas encore ajouté à vos retours"}
        {output.already_received ? <span className="text-encre-3">· déjà reçu ({String(output.already_received)})</span> : null}
      </p>

      {features.map((item, index) => {
        const join = typeof item.would_join === "object" ? item.would_join : null;
        return (
          <div key={index} className="mt-3 grid items-center gap-2 @lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @lg:gap-3">
            <div className="rounded-lg bg-papier-2 px-3.5 py-2.5">
              <p className="text-[12.5px] font-medium text-encre-3">Le client demande</p>
              <p className="text-[14.5px]">{frenchSpaces(`« ${item.solution ?? item.quote} »`)}</p>
            </div>
            <span aria-hidden className="hidden text-lg text-encre-4 @lg:block">
              →
            </span>
            {join ? (
              <div className="rounded-lg bg-should-voile px-3.5 py-2.5">
                <p className="text-[12.5px] font-medium text-encre-2">Son besoin rejoint</p>
                <Link href={`/themes/${idOf(join.id)}`} className="block text-[14.5px] font-semibold text-encre hover:text-accent">
                  {join.title}
                </Link>
                <p className="mt-0.5 text-[13px] text-encre-2">
                  <b className="text-xl font-extrabold tracking-[-0.02em] text-encre">
                    {join.clients} → {join.clients_after}
                  </b>{" "}
                  clients
                  {join.rank && join.rank_after_same_factors && join.rank_after_same_factors !== join.rank ? `, ${ordinal(join.rank)} → ${ordinal(join.rank_after_same_factors)}` : ""}
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-papier-2 px-3.5 py-2.5">
                <p className="text-[12.5px] font-medium text-encre-3">Un nouveau besoin</p>
                <p className="text-[14.5px] font-semibold">{frenchSpaces(item.need)}</p>
              </div>
            )}
          </div>
        );
      })}
      {others.length > 0 ? (
        <p className="mt-3 text-[13px] text-encre-2">
          Aussi : {others.map((item) => `${item.kind === "bug" ? "un bug" : item.kind === "praise" ? "un remerciement" : "une remarque"}, « ${item.quote} »`).join(" ; ")}.
        </p>
      ) : null}

      {state === "idle" && add && !output.already_received ? (
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {needsSegment ? (
            <label className="inline-flex items-center gap-2 text-[13px] text-encre-2">
              Nouveau client, formule
              <select value={segment} onChange={(event) => setSegment(event.target.value)} className="min-h-8 rounded-lg bg-papier px-2 text-[13px] ring-1 ring-trait-2">
                <option value="">à choisir</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </label>
          ) : null}
          <Button variant="principal" size="sm" disabled={Boolean(needsSegment && !segment)} onClick={addToBacklog}>
            Ajouter au backlog
          </Button>
          <Button variant="trait" size="sm" onClick={() => setState("ignored")}>
            Ignorer
          </Button>
        </div>
      ) : null}

      {state === "adding" ? (
        <ol className="mt-3 grid gap-1 text-[13px]" aria-live="polite">
          {PIPELINE_STEPS.filter((step) => steps[step.key]).map((step) => (
            <li key={step.key} className="flex items-center gap-2 text-encre-2">
              <span aria-hidden className={cx("size-1.5 rounded-full", steps[step.key]!.status === "done" ? "bg-accent" : steps[step.key]!.status === "failed" ? "bg-rouge" : "animate-pulse bg-encre-4")} />
              {step.label}
            </li>
          ))}
          {Object.keys(steps).length === 0 ? <li className="text-encre-3">Envoi du retour…</li> : null}
        </ol>
      ) : null}

      {state === "added" && report ? (
        <ul className="mt-3 grid gap-1 text-[13.5px]">
          {report.needs.map((need) => (
            <li key={need.id}>
              {need.created ? "Nouveau besoin : " : "A rejoint "}
              <Link href={`/themes/${need.id}`} className="font-semibold">
                {need.title}
              </Link>
              {` : ${plural(need.reach, "client")}, `}
              <RankMove from={need.rankBefore} to={need.rankAfter} />
              {"."}
            </li>
          ))}
          {report.needs.length === 0 ? <li className="text-encre-2">Aucune demande de fonctionnalité dans ce retour.</li> : null}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-rouge-encre">
          {error}
        </p>
      ) : null}
    </Frame>
  );
}

/** La répartition des clients d'un besoin par segment. */
export function SegmentBar({ segments }: { segments: Record<string, number> }) {
  const parts = ["enterprise", "pro", "starter"].map((key) => ({ key, value: segments[key] ?? 0 })).filter((part) => part.value > 0);
  return (
    <>
      <span aria-hidden className="flex h-2.5 gap-0.5 overflow-hidden rounded-[3px]">
        {parts.map((part) => (
          <span key={part.key} style={{ flex: part.value, background: SEGMENT_COLORS[part.key] }} />
        ))}
      </span>
      <span className="mt-1.5 flex flex-wrap gap-x-3 text-[12.5px] text-encre-2">
        {parts.map((part) => (
          <span key={part.key} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-[2px]" style={{ background: SEGMENT_COLORS[part.key] }} />
            {SEGMENT_LABELS[part.key]} {part.value}
          </span>
        ))}
      </span>
    </>
  );
}
