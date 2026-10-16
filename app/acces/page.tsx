import { Suspense } from "react";
import { TamisLogo } from "@/components/brand";
import { AccessForm } from "./access-form";

export const metadata = { title: "Code d'accès" };

export default function AccessPage({ searchParams }: PageProps<"/acces">) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-nuit px-4">
      <TamisLogo sombre />
      <div className="w-full max-w-sm rounded-xl bg-papier p-8">
        <h1 className="text-2xl font-bold tracking-[-0.02em]">Démo privée</h1>
        <p className="mt-1 text-encre-2">Saisissez le code d&apos;accès qui vous a été transmis.</p>
        <Suspense fallback={<AccessForm next="/" />}>
          <AccessFormWithReturn searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function AccessFormWithReturn({ searchParams }: Pick<PageProps<"/acces">, "searchParams">) {
  const { suite } = await searchParams;
  return <AccessForm next={typeof suite === "string" ? suite : "/"} />;
}
