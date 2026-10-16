"use client";

import { useActionState, useState, type ReactNode } from "react";
import { applyProposalAction, rejectProposalAction, type ProposalActionResult } from "@/app/(app)/agent-actions";
import {
  confirmFactorAction,
  mergeAction,
  updateFactorAction,
  updateMoscowAction,
  updateStatusAction,
  type FormState,
} from "@/app/(app)/themes/[id]/actions";
import { CitedText } from "@/components/cited-text";
import { Help } from "@/components/help";
import { Icon } from "@/components/icons";
import { Button, cx } from "@/components/ui";
import { frenchSpaces, moscowName } from "@/lib/labels";

const fieldClass = "min-h-10 w-full rounded-lg bg-papier px-3 text-sm outline-none ring-1 ring-trait-2 focus:ring-2 focus:ring-accent";

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="text-sm font-medium text-rouge-encre">{state.error}</p>;
  if (state.ok) return <p role="status" className="text-sm font-medium text-encre-2">{state.ok}</p>;
  return null;
}

type Factor = "impact" | "confidence" | "effort";

export type EquationFactor = {
  key: Factor;
  /** Le chiffre affiché en grand (« Moyen », « 100 % », « 8 pts »). */
  value: string;
  /** Ce que mesure le chiffre (« impact », « confiance », « effort »). */
  caption: string;
  /** Le facteur dans une phrase (« l'impact »). */
  name: string;
  /** La valeur dans une phrase (« moyen », « 100 % », « 8 points »). */
  keep: string;
  current: number | null;
  options: Array<{ value: number; label: string; hint?: string }>;
  origin: "code" | "model" | "po" | "none";
  /** « 2/3 » : les propositions du modèle. */
  agreement?: string;
  justification?: string;
};

const disputed = (factor: EquationFactor) => {
  if (factor.origin !== "model" || !factor.agreement) return false;
  const [agree, total] = factor.agreement.split("/").map(Number);
  return agree < total;
};

function originLabel(factor: EquationFactor) {
  if (factor.origin === "po") return "ajusté par vous";
  if (factor.origin === "model") return disputed(factor) ? "l'IA hésite" : "proposé par l'IA";
  return "à proposer";
}

/** Ce que dit un facteur en clair : « Impact moyen », « Confiance 100 % », « 8 points ». */
function factorPhrase(factor: EquationFactor) {
  if (factor.key === "effort") return factor.keep;
  return `${factor.caption.charAt(0).toUpperCase()}${factor.caption.slice(1)} ${factor.keep}`;
}

/**
 * Le « pourquoi » d'un rang, au même endroit : le doute de l'IA à trancher s'il y en a un, puis le calcul replié,
 * clients × impact × confiance ÷ effort = rang. La phrase au-dessus suffit à comprendre ; le calcul est à un clic.
 * Chaque facteur s'ajuste d'un clic, avec sa raison ; celui sur lequel l'IA hésite est cerclé d'ambre.
 */
export function FactorStrip({
  themeId,
  reach,
  factors,
  rank,
}: {
  themeId: number;
  reach: number;
  factors: EquationFactor[];
  rank: { value: string; caption: string; className: string };
}) {
  const [editing, setEditing] = useState<Factor | null>(null);
  const [showCalc, setShowCalc] = useState(false);
  const doubt = factors.find(disputed);
  const opened = factors.find((factor) => factor.key === editing);
  const chip = "flex min-h-[54px] flex-col justify-center rounded-[10px] border px-3 py-1.5 text-left";

  return (
    <section aria-label="Le calcul du classement">
      {doubt && editing === null ? <ConfirmStrip themeId={themeId} factor={doubt} onAdjust={() => setEditing(doubt.key)} /> : null}

      <p className="mt-2.5 flex items-center">
        <button
          type="button"
          onClick={() => setShowCalc(!showCalc)}
          aria-expanded={showCalc}
          aria-controls="calcul"
          className="inline-flex min-h-8 items-center gap-1 text-[13.5px] font-semibold text-accent hover:text-accent-fort"
        >
          <Icon name="chevron" className={cx("size-4 transition-transform", !showCalc && "-rotate-90")} />
          {showCalc ? "Masquer le calcul" : "Voir le calcul"}
        </button>
        <Help term="calcul" />
      </p>

      <div id="calcul" hidden={!showCalc} className={cx("mt-1.5 flex-wrap items-center gap-1.5", showCalc ? "flex" : "hidden")}>
        <div className={cx(chip, "border-trait")}>
          <span className="text-[14.5px] font-bold whitespace-nowrap">{reach > 1 ? `${reach} clients` : `${reach} client`}</span>
          <span className="text-xs text-encre-3">comptés par le code</span>
        </div>
        {factors.map((factor, index) => (
          <span key={factor.key} className="contents">
            <span aria-hidden className="px-0.5 text-[15px] text-encre-3">
              {index === factors.length - 1 ? "÷" : "×"}
            </span>
            <button
              type="button"
              onClick={() => setEditing(editing === factor.key ? null : factor.key)}
              aria-expanded={editing === factor.key}
              title="Ajuster, avec sa raison"
              className={cx(
                chip,
                "transition-colors",
                disputed(factor) ? "border-[1.5px] border-ambre bg-ambre-voile" : "border-trait hover:border-trait-3",
                editing === factor.key && "border-accent bg-accent-voile",
              )}
            >
              <span className="text-[14.5px] font-bold whitespace-nowrap">{factorPhrase(factor)}</span>
              <span className={cx("flex items-center gap-1.5 text-xs", disputed(factor) ? "text-ambre-encre" : "text-encre-3")}>{originLabel(factor)}</span>
            </button>
          </span>
        ))}
        <span aria-hidden className="px-0.5 text-[15px] text-encre-3">
          =
        </span>
        <div className={cx(chip, "border-transparent", rank.className)}>
          <span className="text-[14.5px] font-bold whitespace-nowrap">{rank.value}</span>
          <span className="text-xs opacity-85">{rank.caption}</span>
        </div>
      </div>

      {opened ? (
        <div className="mt-3 rounded-xl border border-trait p-4">
          <FactorControl themeId={themeId} factor={opened} onClose={() => setEditing(null)} />
        </div>
      ) : null}
    </section>
  );
}

/** L'IA hésite : le PO garde sa proposition, ou l'ajuste. La phrase dit d'où vient le doute, sans jargon. */
function ConfirmStrip({ themeId, factor, onAdjust }: { themeId: number; factor: EquationFactor; onAdjust: () => void }) {
  const [state, action, pending] = useActionState(confirmFactorAction, {});
  const [agree, total] = (factor.agreement ?? "").split("/");
  return (
    <form action={action} className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-trait px-4 py-2.5">
      <input type="hidden" name="themeId" value={themeId} />
      <input type="hidden" name="factor" value={factor.key} />
      <input type="hidden" name="value" value={factor.current ?? ""} />
      <div className="min-w-0 flex-1 basis-[16rem] text-sm text-encre-2">
        <p className="flex items-baseline gap-2">
          <span aria-hidden className="size-2 shrink-0 translate-y-[-1px] self-center rounded-full bg-ambre" />
          <span>
            <b className="font-semibold text-encre">L&apos;IA hésite sur {factor.name}</b>
            {frenchSpaces(` : elle a proposé « ${factor.keep} » ${agree} fois sur ${total}.`)}
          </span>
        </p>
        {factor.justification ? (
          <details className="mt-1 pl-4">
            <summary className="cursor-pointer text-[13px] font-medium text-encre-3 hover:text-encre">Pourquoi elle hésite</summary>
            <p className="mt-1 text-[13px] leading-relaxed">{frenchSpaces(firstSentence(factor.justification))}</p>
          </details>
        ) : null}
      </div>
      <span className="flex gap-2">
        <Button type="submit" variant="principal" size="sm" disabled={pending}>
          Garder « {factor.keep} »
        </Button>
        <Button type="button" variant="trait" size="sm" onClick={onAdjust}>
          Ajuster
        </Button>
      </span>
      <Feedback state={state} />
    </form>
  );
}

function firstSentence(text: string) {
  const end = text.search(/[.!?](\s|$)/);
  return end > 0 ? text.slice(0, end + 1) : text;
}

/**
 * Un facteur ajustable d'un geste : les valeurs possibles en boutons. Choisir une autre valeur demande une raison,
 * qui entre au journal ; le score et le rang sont recalculés par le code.
 */
function FactorControl({ themeId, factor, onClose }: { themeId: number; factor: EquationFactor; onClose: () => void }) {
  const [state, action, pending] = useActionState(updateFactorAction, {});
  const [chosen, setChosen] = useState<number | null>(null);
  const changing = chosen !== null && chosen !== factor.current;
  const shown = factor.options.find((option) => option.value === (chosen ?? factor.current));
  // Une fois enregistré, la page est rafraîchie : la valeur choisie devient la valeur courante,
  // et le panneau de raison se referme de lui-même. En cas d'erreur, il reste ouvert.

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="themeId" value={themeId} />
      <input type="hidden" name="factor" value={factor.key} />
      <input type="hidden" name="value" value={chosen ?? factor.current ?? ""} />
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">Ajuster {factor.name}</p>
        <button type="button" onClick={onClose} aria-label="Fermer" className="grid size-9 place-items-center rounded-lg text-encre-3 hover:bg-papier-2 hover:text-encre">
          <Icon name="x" />
        </button>
      </div>
      <div role="radiogroup" aria-label={factor.caption} className="flex flex-wrap gap-1.5">
        {factor.options.map((option) => {
          const selected = (chosen ?? factor.current) === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              title={option.hint}
              onClick={() => setChosen(option.value === factor.current ? null : option.value)}
              className={cx(
                "min-h-10 min-w-12 flex-1 rounded-lg px-3 text-sm font-semibold transition-colors",
                selected ? "bg-accent text-white" : "bg-papier text-encre-2 ring-1 ring-trait-2 ring-inset hover:bg-papier-2",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {shown?.hint ? <p className="text-[13px] text-encre-2">{shown.hint}</p> : null}
      {changing ? (
        <div className="grid gap-2">
          <label className="grid gap-1 text-[13px] font-medium text-encre-2">
            Pourquoi ce changement ? La raison ira au journal.
            <input name="reason" required minLength={3} autoFocus placeholder="Ex. : un client gère ça dans un tableur à côté" className={fieldClass} />
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="principal" size="sm" disabled={pending}>
              {pending ? "Recalcul…" : "Enregistrer"}
            </Button>
            <Button type="button" variant="discret" size="sm" onClick={() => setChosen(null)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : null}
      <Feedback state={state} />
      {factor.justification ? (
        <details className="text-[13px] text-encre-2">
          <summary className="cursor-pointer font-medium text-encre-3 hover:text-encre">Pourquoi l&apos;IA a proposé cette valeur</summary>
          <p className="mt-1.5 leading-relaxed">{frenchSpaces(factor.justification)}</p>
        </details>
      ) : null}
    </form>
  );
}

type Choice = { value: string; label: string; hint?: string };

/** Les statuts, et ce que chacun change pour le besoin : sa phrase s'affiche au survol, au clavier, ou une fois choisi. */
const STATUSES: Choice[] = [
  { value: "new", label: "Nouveau", hint: "Pas encore examiné par vous." },
  { value: "triaged", label: "Trié", hint: "Examiné : il garde sa place dans le classement." },
  { value: "planned", label: "Planifié", hint: "L'équipe s'y engage : au moins dans le cycle suivant." },
  { value: "parked", label: "Parqué", hint: "Mis de côté : il sort du classement, en Pas maintenant." },
  { value: "shipped", label: "Livré", hint: "Déjà fait : il sort du classement." },
];

/** Les catégories, dites comme dans les cycles. La première rend la main au calcul, selon la capacité de l'équipe. */
function categoriesFor(moscow: string | null, source: string): Choice[] {
  const suggested = source !== "po" && moscow ? `Suggérée : ${moscowName(moscow)}` : "Suggérée par le classement";
  return [{ value: "auto", label: suggested }, ...["must", "should", "could", "wont"].map((value) => ({ value, label: moscowName(value) }))];
}

/** « Décider » : le statut, la catégorie MoSCoW et le regroupement, dans un panneau qui s'ouvre sous le bouton. */
export function DecidePanel({
  themeId,
  status,
  moscow,
  moscowSource,
  options,
  merged,
}: {
  themeId: number;
  status: string;
  moscow: string | null;
  moscowSource: string;
  options: Array<{ id: number; title: string }>;
  merged: Array<{ id: number; title: string }>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button type="button" variant="trait" aria-expanded={open} onClick={() => setOpen(!open)}>
        Décider
        <Icon name="chevron" className="size-4" />
      </Button>
      {/* Sur téléphone, le bouton passe à gauche sous le titre : le panneau s'ouvre vers la droite, dans l'écran. */}
      {open ? (
        <div className="absolute top-full left-0 z-30 mt-2 grid w-[min(420px,calc(100vw-2rem))] gap-5 rounded-xl bg-papier p-5 shadow-menu sm:right-0 sm:left-auto">
          <DecisionControl title="Statut" field="status" themeId={themeId} current={status} choices={STATUSES} action={updateStatusAction} />
          <DecisionControl
            title="Catégorie MoSCoW"
            help={<Help term="moscow" align="end" />}
            field="moscow"
            themeId={themeId}
            current={moscowSource === "po" && moscow ? moscow : "auto"}
            choices={categoriesFor(moscow, moscowSource)}
            action={updateMoscowAction}
            columns
          />
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">Regrouper avec un autre besoin</summary>
            <p className="mt-1.5 text-[13px] text-encre-2">Quand Tamis a séparé deux formulations du même besoin.</p>
            <div className="mt-3">
              <MergeEditor themeId={themeId} options={options} />
            </div>
            {merged.length > 0 ? <p className="mt-3 text-xs text-encre-3">Déjà regroupés ici : {merged.map((m) => m.title).join(", ")}.</p> : null}
          </details>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Une décision du PO, toujours le même geste : choisir parmi des boutons, puis donner sa raison, qui part au journal.
 * Le statut : un PO passe son temps à dire non ; parquer ou planifier demande une raison, qui se trace. La catégorie
 * se décide de la même façon. La valeur choisie est en indigo, comme toute sélection dans Tamis.
 */
function DecisionControl({
  title,
  help,
  field,
  themeId,
  current,
  choices,
  action,
  columns = false,
}: {
  title: string;
  help?: ReactNode;
  field: "status" | "moscow";
  themeId: number;
  current: string;
  choices: Choice[];
  action: (state: FormState, form: FormData) => Promise<FormState>;
  columns?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [chosen, setChosen] = useState<string | null>(null);
  const [pointed, setPointed] = useState<string | null>(null);
  const changing = chosen !== null && chosen !== current;
  // La phrase du statut survolé ou atteint au clavier ; sinon, celle du statut choisi.
  const hint = choices.find((choice) => choice.value === (pointed ?? chosen ?? current))?.hint;

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="themeId" value={themeId} />
      <input type="hidden" name={field} value={chosen ?? current} />
      <p className="flex items-center font-semibold">
        {title}
        {help}
      </p>
      <div role="radiogroup" aria-label={title} onMouseLeave={() => setPointed(null)} className={cx("gap-1.5", columns ? "grid grid-cols-2" : "flex flex-wrap")}>
        {choices.map((choice, index) => {
          const selected = (chosen ?? current) === choice.value;
          return (
            <button
              key={choice.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setChosen(choice.value === current ? null : choice.value)}
              onMouseEnter={() => setPointed(choice.value)}
              onFocus={() => setPointed(choice.value)}
              onBlur={() => setPointed(null)}
              className={cx(
                "min-h-9 rounded-lg px-2.5 py-1 text-[13px] leading-tight font-semibold transition-colors",
                columns ? index === 0 && "col-span-2" : "flex-1",
                selected ? "bg-accent text-white" : "bg-papier-2 text-encre-2 hover:bg-papier-3 hover:text-encre",
              )}
            >
              {choice.label}
              {choice.hint ? <span className="sr-only">{`, ${choice.hint}`}</span> : null}
            </button>
          );
        })}
      </div>
      {hint ? (
        <p aria-hidden className="text-[13px] leading-snug text-encre-2">
          {frenchSpaces(hint)}
        </p>
      ) : null}
      {changing ? (
        <div className="grid gap-2 rounded-lg bg-papier-2 p-3">
          <label className="grid gap-1 text-[13px] font-medium text-encre-2">
            La raison de cette décision, pour le journal
            <input name="reason" required minLength={3} autoFocus placeholder="Ex. : hors de la stratégie du trimestre" className={fieldClass} />
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="principal" size="sm" disabled={pending}>
              {pending ? "…" : "Enregistrer"}
            </Button>
            <Button type="button" variant="discret" size="sm" onClick={() => setChosen(null)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : null}
      <Feedback state={state} />
    </form>
  );
}

function MergeEditor({ themeId, options }: { themeId: number; options: Array<{ id: number; title: string }> }) {
  const [state, action, pending] = useActionState(mergeAction, {});
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="sourceId" value={themeId} />
      <label className="grid gap-1 text-[13px] font-medium text-encre-2">
        Regrouper ce besoin dans
        <select name="targetId" required defaultValue="" className={fieldClass}>
          <option value="" disabled>
            Choisir un besoin
          </option>
          {options
            .filter((option) => option.id !== themeId)
            .map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
        </select>
      </label>
      <label className="grid gap-1 text-[13px] font-medium text-encre-2">
        Raison
        <input name="reason" placeholder="Ex. : même besoin, autre formulation" className={fieldClass} />
      </label>
      <div>
        <Button type="submit" variant="trait" size="sm" disabled={pending}>
          {pending ? "…" : "Regrouper"}
        </Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

/** Une proposition de l'agent restée en attente : elle se tranche aussi depuis la page du besoin. */
export function PendingProposal({ id, label, reason }: { id: number; label: string; reason: string }) {
  const [result, setResult] = useState<ProposalActionResult | null>(null);
  const [pending, setPending] = useState(false);

  async function act(kind: "apply" | "reject") {
    setPending(true);
    setResult(kind === "apply" ? await applyProposalAction(id) : await rejectProposalAction(id));
    setPending(false);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-trait px-4 py-3">
      <p className="min-w-0 text-sm text-encre-2">
        <span className="flex items-center gap-2 font-semibold text-encre">
          <span aria-hidden className="size-2 rounded-full bg-ambre" />
          Proposition de l&apos;agent : {label}
        </span>
        <CitedText text={reason} />
      </p>
      {result === null ? (
        <span className="flex gap-2">
          <Button variant="principal" size="sm" disabled={pending} onClick={() => act("apply")}>
            Appliquer
          </Button>
          <Button variant="trait" size="sm" disabled={pending} onClick={() => act("reject")}>
            Rejeter
          </Button>
        </span>
      ) : "error" in result ? (
        <p role="alert" className="text-sm text-rouge-encre">
          {result.error}
        </p>
      ) : (
        <p className="text-sm text-encre-2">{result.status === "applied" ? "Appliquée, inscrite au journal." : "Rejetée."}</p>
      )}
    </div>
  );
}
