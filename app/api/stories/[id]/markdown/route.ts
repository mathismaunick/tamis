import { getStory, storyToMarkdown } from "@/lib/services/stories";

/** Export d'une story en Markdown, prêt à coller dans l'outil de ticketing de l'équipe. */
export async function GET(_request: Request, { params }: RouteContext<"/api/stories/[id]/markdown">) {
  const { id } = await params;
  const story = Number.isInteger(Number(id)) ? await getStory(Number(id)) : null;
  if (!story) return Response.json({ error: "Story introuvable." }, { status: 404 });
  return new Response(storyToMarkdown(story), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="story-S${story.id}.md"`,
    },
  });
}
