import { Suspense } from "react";
import { ChatProvider } from "@/components/agent/chat";
import { AgentPanelFallback, AgentPanelServer } from "@/components/agent/panel-server";
import { MobileBar, Sidebar } from "@/components/sidebar";

/**
 * Trois zones fixes : à gauche les trois étapes de l'énoncé, au centre l'écran du PO, à droite l'agent. L'écran du
 * centre défile seul ; l'agent et son champ restent visibles. La conversation vit au-dessus des pages : elle survit
 * quand le PO change d'onglet. Elle naît dans le navigateur (ses identifiants sont aléatoires) : la frontière
 * Suspense la tient hors du rendu statique.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh lg:h-dvh lg:overflow-hidden">
      <Sidebar />
      <Suspense fallback={<div className="min-w-0 flex-1" />}>
        <ChatProvider>
          <div className="flex min-w-0 flex-1 flex-col lg:h-dvh">
            <MobileBar />
            {/* Sur téléphone, 80 px de marge en bas : le bouton « Demander à Tamis » flotte au-dessus du bas de la page. */}
            <main className="min-w-0 flex-1 pb-20 lg:overflow-y-auto lg:pb-0">{children}</main>
          </div>
          <Suspense fallback={<AgentPanelFallback />}>
            <AgentPanelServer />
          </Suspense>
        </ChatProvider>
      </Suspense>
    </div>
  );
}
