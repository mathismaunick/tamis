import Link from "next/link";
import { Suspense } from "react";
import { TamisLogo } from "@/components/brand";
import { NavLinks, NavLinksFallback } from "@/components/nav-links";
import { DEMO_PO } from "@/lib/labels";
import { PRODUCT } from "@/lib/product";

/** La barre latérale, en indigo nuit : la marque, les trois étapes de l'énoncé, le journal, le PO. */
export function Sidebar() {
  return (
    <aside className="hidden h-dvh w-[208px] shrink-0 flex-col bg-nuit px-3 pt-5 pb-3.5 lg:flex">
      <Link href="/inbox" aria-label="Tamis, première étape" className="px-2.5">
        <TamisLogo sombre />
      </Link>
      <p title={`Le produit dont vous êtes Product Owner : ${PRODUCT.description}.`} className="mb-6 pl-[46px] text-[13px] text-nuit-doux">
        Produit{" "}: <span className="font-semibold text-nuit-texte">{PRODUCT.name}</span>
      </p>
      <Suspense fallback={<NavLinksFallback />}>
        <NavLinks />
      </Suspense>
      <div className="mt-2 flex items-center gap-2.5 border-t border-white/10 px-2.5 pt-3 font-medium text-white">
        <span aria-hidden className="grid size-7 place-items-center rounded-full bg-white/15 text-[13px] font-semibold">
          {DEMO_PO.name.charAt(0)}
        </span>
        <span className="text-[13.5px] leading-tight">
          {DEMO_PO.name}
          <span className="block text-xs font-normal text-nuit-doux">{DEMO_PO.role}</span>
        </span>
      </div>
    </aside>
  );
}

/** Sur mobile et tablette : la marque et les étapes en bandeau, la barre latérale n'a pas la place. */
export function MobileBar() {
  return (
    <header className="sticky top-0 z-20 bg-nuit lg:hidden">
      <div className="flex items-center gap-3 px-4 pt-3">
        <Link href="/inbox" aria-label="Tamis, première étape">
          <TamisLogo sombre />
        </Link>
      </div>
      <div className="overflow-x-auto px-2 py-2">
        <Suspense fallback={<NavLinksFallback layout="ligne" />}>
          <NavLinks layout="ligne" />
        </Suspense>
      </div>
    </header>
  );
}
