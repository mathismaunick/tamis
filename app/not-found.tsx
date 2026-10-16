import Link from "next/link";
import { TamisLogo } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-nuit px-4">
      <TamisLogo sombre />
      <div className="w-full max-w-sm rounded-xl bg-papier p-8">
        <h1 className="text-2xl font-bold tracking-[-0.02em]">Cette page n&apos;existe pas</h1>
        <p className="mt-1 text-encre-2">L&apos;adresse est peut-être erronée.</p>
        <Link href="/inbox" className="mt-6 inline-block font-semibold text-accent underline">
          Retour à l&apos;agent
        </Link>
      </div>
    </main>
  );
}
