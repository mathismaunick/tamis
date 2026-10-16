"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { BacklogError } from "@/lib/services/backlog";
import { draftStory, updateStory } from "@/lib/services/stories";

export type StoryFormState = { ok?: string; error?: string };

/** Rédiger la user story d'un besoin, puis l'ouvrir pour relecture. */
export async function draftStoryAction(_state: StoryFormState, form: FormData): Promise<StoryFormState> {
  let storyId: number;
  try {
    storyId = (await draftStory(Number(form.get("themeId")), "ui")).id;
  } catch (error) {
    if (error instanceof BacklogError) return { error: error.message };
    console.error(error);
    return { error: "La rédaction a échoué. Réessayez dans un instant." };
  }
  redirect(`/stories/${storyId}`);
}

export async function updateStoryAction(_state: StoryFormState, form: FormData): Promise<StoryFormState> {
  try {
    const criteria = JSON.parse(String(form.get("criteria") ?? "[]"));
    const openQuestions = String(form.get("openQuestions") ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    await updateStory(Number(form.get("storyId")), {
      title: String(form.get("title") ?? ""),
      persona: String(form.get("persona") ?? ""),
      want: String(form.get("want") ?? ""),
      soThat: String(form.get("soThat") ?? ""),
      criteria,
      openQuestions,
      status: form.get("status") === "reviewed" ? "reviewed" : "draft",
    });
    refresh();
    return { ok: "Enregistré : nouvelle version de la story." };
  } catch (error) {
    if (error instanceof BacklogError) return { error: error.message };
    return { error: "Vérifiez les champs : chaque critère doit avoir un contexte, une action et un résultat." };
  }
}
