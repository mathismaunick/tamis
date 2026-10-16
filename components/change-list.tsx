import Link from "next/link";
import { CitedText } from "@/components/cited-text";
import { cx } from "@/components/ui";
import { DEMO_PO, IMPACT_LABELS, THEME_STATUS, formatDateTime, moscowName } from "@/lib/labels";
import type { ChangeRow } from "@/lib/services/backlog";

const FIELD_LABELS: Record<string, string> = {
  impact: "Impact",
  confidence: "Confiance",
  effort: "Effort",
  status: "Statut",
  moscow: "MoSCoW",
  merge: "Regroupement",
};

/** Les valeurs du journal sont stockées brutes (0.8, planned) : on les affiche comme dans le reste de l'interface. */
function formatValue(field: string, value: string | null): string {
  if (value === null || value === "") return "–";
  const number = Number(value);
  if (field === "confidence" && Number.isFinite(number)) return `${Math.round(number * 100)} %`;
  if (field === "impact" && Number.isFinite(number)) return (IMPACT_LABELS[String(number)] ?? value).toLowerCase();
  if (field === "effort" && Number.isFinite(number)) return `${number} pts`;
  if (field === "status") return THEME_STATUS[value]?.label ?? value;
  if (field === "moscow") return moscowName(value);
  return value;
}

/** Ce qui a changé, en une ligne : « 80 % → 100 % », « moyen, confirmé », ou le petit besoin regroupé. */
function describe(change: ChangeRow): string {
  if (change.field === "merge") {
    const absorbed = (change.oldValue ?? "").replace(/^T\d+ · /, "");
    return `« ${absorbed} » regroupé avec ${change.themeTitle}`;
  }
  if (change.oldValue === change.newValue) return `${formatValue(change.field, change.newValue)}, confirmé`;
  return `${formatValue(change.field, change.oldValue)} → ${formatValue(change.field, change.newValue)}`;
}

/** Qui a décidé, comment, et quand : « Par Camille, sur proposition de l'agent, 14 oct., 16 h 31 ». */
function signature(change: ChangeRow): string {
  return [
    change.actor === "po" ? `Par ${DEMO_PO.name}` : "Par le traitement automatique",
    change.via === "agent" ? "sur proposition de l'agent" : null,
    formatDateTime(change.createdAt),
  ]
    .filter(Boolean)
    .join(", ");
}

/** Le journal : chaque décision, qui l'a prise, comment, et pourquoi. Le PO en indigo, le traitement en gris. */
export function ChangeList({ changes, showTheme = false }: { changes: ChangeRow[]; showTheme?: boolean }) {
  return (
    <ul className="divide-y divide-trait rounded-xl border border-trait text-sm">
      {changes.map((change) => (
        <li key={change.id} className="grid grid-cols-[8px_minmax(0,1fr)] gap-x-3 px-4 py-3">
          <span aria-hidden className={cx("mt-[7px] size-2 rounded-full", change.actor === "po" ? "bg-accent" : "bg-neutre")} />
          <div className="grid gap-0.5">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold">{FIELD_LABELS[change.field] ?? change.field}</span>
              <span className="text-encre-2">{describe(change)}</span>
              {showTheme && change.field !== "merge" ? (
                <Link href={`/themes/${change.themeId}`} className="font-medium">
                  {change.themeTitle}
                </Link>
              ) : null}
            </p>
            {change.reason ? (
              <p className="text-encre-2">
                <CitedText text={change.reason} />
              </p>
            ) : null}
            <p className="text-xs text-encre-3">{signature(change)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
