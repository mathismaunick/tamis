import { createAgentUIStreamResponse } from "ai";
import { agent, agentOptionsSchema } from "@/lib/agent/agent";

// Une analyse de retour (extraction, rattachement) s'ajoute aux appels de l'agent : la marge de 300 s couvre le pire cas.
export const maxDuration = 300;

/** La boucle de l'agent : la réponse et chaque appel d'outil arrivent en direct dans le panneau. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const options = agentOptionsSchema.safeParse(body?.context);
  if (!body || !Array.isArray(body.messages) || !options.success) {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }
  return createAgentUIStreamResponse({
    agent,
    uiMessages: body.messages,
    options: options.data,
    onError: (error) => {
      console.error(error);
      return "L'agent n'a pas pu répondre. Réessayez dans un instant.";
    },
  });
}
