"use server";

import { refresh } from "next/cache";
import { BacklogError, mergeThemes, updateFactor, updateMoscow, updateStatus, type ThemeStatus } from "@/lib/services/backlog";

export type FormState = { ok?: string; error?: string };

async function run(work: () => Promise<void>, success: string): Promise<FormState> {
  try {
    await work();
    refresh();
    return { ok: success };
  } catch (error) {
    if (error instanceof BacklogError) return { error: error.message };
    console.error(error);
    return { error: "La modification n'a pas pu être enregistrée. Réessayez." };
  }
}

export async function updateFactorAction(_state: FormState, form: FormData): Promise<FormState> {
  const themeId = Number(form.get("themeId"));
  const factor = String(form.get("factor")) as "impact" | "confidence" | "effort";
  const value = Number(form.get("value"));
  return run(() => updateFactor(themeId, factor, value, String(form.get("reason") ?? ""), "ui"), "Enregistré : le classement est recalculé.");
}

/** Le PO garde la valeur proposée par l'IA : elle devient la sienne, et la confirmation entre au journal. */
export async function confirmFactorAction(_state: FormState, form: FormData): Promise<FormState> {
  const themeId = Number(form.get("themeId"));
  const factor = String(form.get("factor")) as "impact" | "confidence" | "effort";
  const value = Number(form.get("value"));
  return run(() => updateFactor(themeId, factor, value, "Proposition de l'IA confirmée par le PO", "ui"), "Confirmé.");
}

export async function updateStatusAction(_state: FormState, form: FormData): Promise<FormState> {
  const themeId = Number(form.get("themeId"));
  return run(
    () => updateStatus(themeId, String(form.get("status")) as ThemeStatus, String(form.get("reason") ?? ""), "ui"),
    "Statut enregistré.",
  );
}

export async function updateMoscowAction(_state: FormState, form: FormData): Promise<FormState> {
  const themeId = Number(form.get("themeId"));
  const moscow = String(form.get("moscow")) as "must" | "should" | "could" | "wont" | "auto";
  return run(() => updateMoscow(themeId, moscow, String(form.get("reason") ?? "")), "Catégorie enregistrée.");
}

export async function mergeAction(_state: FormState, form: FormData): Promise<FormState> {
  const sourceId = Number(form.get("sourceId"));
  const targetId = Number(form.get("targetId"));
  return run(() => mergeThemes(sourceId, targetId, String(form.get("reason") ?? "")), "Besoins regroupés.");
}
