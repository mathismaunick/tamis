"use client";

import { useActionState, useState } from "react";
import { draftStoryAction, updateStoryAction, type StoryFormState } from "@/app/(app)/stories/actions";
import { Icon } from "@/components/icons";
import { Button, type ButtonVariant } from "@/components/ui";
import type { Criterion, Story } from "@/lib/services/stories";

const fieldClass = "w-full rounded-lg bg-papier px-3 py-2 text-sm outline-none ring-1 ring-trait-2 focus:ring-2 focus:ring-accent";

function Message({ state }: { state: StoryFormState }) {
  if (state.error) return <p role="alert" className="text-sm text-rouge-encre">{state.error}</p>;
  if (state.ok) return <p role="status" className="text-sm text-encre-2">{state.ok}</p>;
  return null;
}

/** Lancer la rédaction d'une story : une vingtaine de secondes, la progression est dite. */
export function DraftStoryButton({
  themeId,
  label = "Rédiger la user story",
  variant = "principal",
}: {
  themeId: number;
  label?: string;
  variant?: ButtonVariant;
}) {
  const [state, action, pending] = useActionState(draftStoryAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="themeId" value={themeId} />
      <Button type="submit" variant={variant} disabled={pending}>
        <Icon name="pen" className="size-4" />
        {pending ? "Rédaction à partir des preuves…" : label}
      </Button>
      <Message state={state} />
    </form>
  );
}

/** Modifier la story : chaque champ, chaque critère ; une modification du PO n'est jamais écrasée. */
export function StoryEditor({ story }: { story: Story }) {
  const [state, action, pending] = useActionState(updateStoryAction, {});
  const [criteria, setCriteria] = useState<Criterion[]>(story.criteria);

  function update(index: number, key: keyof Criterion, value: string) {
    setCriteria((current) => current.map((criterion, i) => (i === index ? { ...criterion, [key]: value } : criterion)));
  }

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="storyId" value={story.id} />
      <input type="hidden" name="criteria" value={JSON.stringify(criteria)} />
      <label className="grid gap-1 text-xs font-medium text-encre-3">
        Titre
        <input name="title" defaultValue={story.title} className={fieldClass} />
      </label>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-xs font-medium text-encre-3">
          En tant que
          <textarea name="persona" defaultValue={story.persona} rows={2} className={fieldClass} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-encre-3">
          Je veux
          <textarea name="want" defaultValue={story.want} rows={2} className={fieldClass} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-encre-3">
          Afin de
          <textarea name="soThat" defaultValue={story.soThat} rows={2} className={fieldClass} />
        </label>
      </div>
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-xs font-medium text-encre-3">Critères d&apos;acceptation</legend>
        {criteria.map((criterion, index) => (
          <div key={index} className="grid gap-2 rounded-lg border border-trait p-3 md:grid-cols-[1fr_1fr_1fr_auto]">
            {(["given", "when", "then"] as const).map((key) => (
              <label key={key} className="grid gap-1 text-xs font-medium text-encre-3">
                {key === "given" ? "Étant donné" : key === "when" ? "Quand" : "Alors"}
                <textarea value={criterion[key]} onChange={(event) => update(index, key, event.target.value)} rows={3} className={fieldClass} />
              </label>
            ))}
            <Button type="button" variant="discret" size="sm" onClick={() => setCriteria((current) => current.filter((_, i) => i !== index))} className="self-end">
              Retirer
            </Button>
          </div>
        ))}
        <Button type="button" variant="trait" size="sm" onClick={() => setCriteria((current) => [...current, { given: "", when: "", then: "" }])} className="justify-self-start">
          Ajouter un critère
        </Button>
      </fieldset>
      <label className="grid gap-1 text-xs font-medium text-encre-3">
        Questions ouvertes (une par ligne)
        <textarea name="openQuestions" defaultValue={story.openQuestions.join("\n")} rows={3} className={fieldClass} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="status" value="reviewed" defaultChecked={story.status === "reviewed"} className="size-4 accent-[var(--accent)]" />
        Relue et prête pour l&apos;équipe
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="principal" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer une nouvelle version"}
        </Button>
        <Message state={state} />
      </div>
    </form>
  );
}
