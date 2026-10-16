import Link from "next/link";
import { EmptyState, Page } from "@/components/ui";

export default function NotFound() {
  return (
    <Page>
    <EmptyState
      title="Cette page n'existe pas"
      action={
        <Link href="/inbox" className="font-semibold text-accent underline">
          Retour à l&apos;agent
        </Link>
      }
    >
      Le besoin, le retour ou la story demandé a peut-être été regroupé avec un autre, ou son numéro est erroné.
    </EmptyState>
    </Page>
  );
}
