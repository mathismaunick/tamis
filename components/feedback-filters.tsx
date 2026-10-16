"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { buttonClass, cx } from "@/components/ui";

export type FilterValues = { q: string; canal: string; segment: string; client: string };
type Option = { value: string; label: string };

const inputClass = "min-h-10 rounded-lg bg-papier px-3 text-sm outline-none ring-1 ring-trait-2 focus:ring-2 focus:ring-accent";

/**
 * Les filtres des retours, sur une ligne, sans bouton « Filtrer » : un choix dans une liste s'applique aussitôt, la
 * recherche dès qu'on valide ou qu'on quitte le champ. Les listes se nomment par leur première valeur (« Tous les
 * canaux ») : la liste des retours commence juste dessous. Sans JavaScript, le formulaire s'envoie avec Entrée.
 */
export function FeedbackFilters({
  values,
  kind,
  channels,
  segments,
  clients,
}: {
  values: FilterValues;
  kind?: string;
  channels: Option[];
  segments: Option[];
  clients: Option[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState(values);
  // Les filtres changés ailleurs (« Effacer », le retour arrière) remplacent ceux du formulaire.
  const [previous, setPrevious] = useState(values);
  if (Object.keys(values).some((key) => values[key as keyof FilterValues] !== previous[key as keyof FilterValues])) {
    setPrevious(values);
    setForm(values);
  }
  const filtered = Object.values(values).some(Boolean);

  function apply(next: FilterValues) {
    setForm(next);
    const query = new URLSearchParams({ vue: "retours" });
    if (kind) query.set("type", kind);
    for (const [key, value] of Object.entries(next)) if (value.trim()) query.set(key, value.trim());
    startTransition(() => router.replace(`/inbox?${query.toString()}`, { scroll: false }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply(form);
  }

  // Une liste prend la largeur de sa plus longue valeur : celle des clients est bornée, la recherche garde sa place.
  const select = (name: "canal" | "segment" | "client", label: string, all: string, options: Option[]) => (
    <select
      name={name}
      aria-label={label}
      value={form[name]}
      onChange={(event) => apply({ ...form, [name]: event.target.value })}
      className={cx(inputClass, "min-w-0", name === "client" && "sm:max-w-48")}
    >
      <option value="">{all}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );

  return (
    // Sur téléphone, les champs s'empilent sur toute la largeur ; au-delà, ils tiennent sur une ligne.
    <form action="/inbox" role="search" aria-label="Filtrer les retours" onSubmit={submit} className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
      <input type="hidden" name="vue" value="retours" />
      {kind ? <input type="hidden" name="type" value={kind} /> : null}
      <input
        type="search"
        name="q"
        aria-label="Rechercher"
        value={form.q}
        placeholder="Rechercher un mot…"
        onChange={(event) => setForm({ ...form, q: event.target.value })}
        onBlur={() => (form.q.trim() !== values.q ? apply(form) : undefined)}
        className={cx(inputClass, "min-w-[10rem] sm:flex-1")}
      />
      {select("canal", "Canal", "Tous les canaux", channels)}
      {select("segment", "Formule", "Toutes les formules", segments)}
      {select("client", "Client", "Tous les clients", clients)}
      {filtered ? (
        <Link href="/inbox?vue=retours" className={cx(buttonClass("discret"), "justify-self-start")}>
          Effacer
        </Link>
      ) : null}
    </form>
  );
}
