"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { unlock, type UnlockState } from "./actions";

export function AccessForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<UnlockState, FormData>(unlock, {});
  return (
    <form action={action} className="mt-6 grid gap-3">
      <input type="hidden" name="suite" value={next} />
      <label htmlFor="code" className="text-sm font-semibold text-encre-2">
        Code d&apos;accès
      </label>
      <input
        id="code"
        name="code"
        type="password"
        autoComplete="off"
        required
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "code-erreur" : undefined}
        className="min-h-12 rounded-lg px-3.5 text-base outline-none ring-1 ring-trait-2 focus:ring-2 focus:ring-accent"
      />
      {state.error ? (
        <p id="code-erreur" role="alert" className="text-sm font-medium text-rouge-encre">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="principal" disabled={pending} className="mt-2 min-h-12">
        {pending ? "Vérification…" : "Entrer"}
      </Button>
    </form>
  );
}
