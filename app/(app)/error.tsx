"use client";

import { Button, ErrorNote, Page } from "@/components/ui";

/** Une erreur inattendue : ce qui s'est passé, et quoi faire. Les données déjà enregistrées ne sont pas perdues. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Page className="grid gap-4">
      <ErrorNote title="Cette page n'a pas pu s'afficher">
        La base ou un service n&apos;a pas répondu à temps. Rien de ce qui était enregistré n&apos;est perdu : réessayez dans un instant.
      </ErrorNote>
      <div>
        <Button variant="principal" onClick={() => reset()}>
          Réessayer
        </Button>
      </div>
    </Page>
  );
}
