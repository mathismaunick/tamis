import { AgentPanel, type PanelData } from "@/components/agent/panel";
import { listDecisions } from "@/lib/services/decisions";
import { homeOverview } from "@/lib/services/home";

/** Le panneau de l'agent, avec ce que le serveur sait de l'état de Tamis : relu à chaque rafraîchissement de la page. */
export async function AgentPanelServer() {
  const [home, decisions] = await Promise.all([homeOverview(), listDecisions()]);
  const churn = decisions.find((decision) => decision.signal === "rouge" && decision.question);
  const data: PanelData = {
    feedback: home.feedback,
    alert: churn ? { title: churn.title, question: churn.question! } : null,
    stories: { total: home.must.total, written: home.must.withStory, next: home.must.firstWithoutStory?.title ?? null },
    needTitles: Object.fromEntries(home.needs.map((need) => [need.id, { title: need.title, rank: need.rank }])),
  };
  return <AgentPanel data={data} />;
}

/** La place du panneau, le temps que ses données arrivent : la page ne bouge pas quand il apparaît. */
export function AgentPanelFallback() {
  return <aside aria-hidden className="hidden border-l border-agent-trait bg-agent lg:block lg:h-dvh lg:w-[360px] lg:shrink-0" />;
}
