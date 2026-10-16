import type { ModelMessage } from "ai";
import { tool } from "ai";
import { z } from "zod";
import { CHANNELS, SEGMENTS } from "@/lib/csv/parse";
import { db, toVector } from "@/lib/db/client";
import { normalizeText } from "@/lib/feedback/fingerprint";
import { embedTexts } from "@/lib/pipeline/embed";
import { analyzeFeedback } from "@/lib/services/analysis";
import { BacklogError, FACTOR_OPTIONS, getThemeDetail, listThemes } from "@/lib/services/backlog";
import { getImportReport } from "@/lib/services/imports";
import { homeOverview } from "@/lib/services/home";
import { createScoreProposal, createStatusProposal } from "@/lib/services/proposals";
import { draftStory } from "@/lib/services/stories";
import { countFacetClients } from "@/lib/facets";
import { midSentence } from "@/lib/labels";

/*
 * Les outils de l'agent. Ils appellent les mêmes services que l'interface et renvoient des vues compactes
 * (identifiants, titres, chiffres), pas les objets complets : moins de tokens, moins de bruit pour le modèle.
 * Chaque sortie porte une `view` : ce que le panneau de droite doit montrer au PO (« besoin-5 », « story-3 »…).
 * Une erreur (identifiant inconnu, valeur interdite) revient comme un message lisible, que le modèle peut corriger.
 * Le score RICE brut n'est pas renvoyé : le PO lit un rang et des facteurs, pas un nombre sans unité.
 */

const STATUS_FR: Record<string, string> = { new: "nouveau", triaged: "trié", planned: "planifié", parked: "parqué", shipped: "livré" };
const status = (code: string | null | undefined) => (code ? (STATUS_FR[code] ?? code) : null);

async function safely<T>(work: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof BacklogError) return { error: error.message };
    throw error;
  }
}

/** Le texte du dernier message du PO, pour vérifier qu'un retour collé est recopié mot pour mot. */
function lastUserText(messages: ModelMessage[]): string {
  const last = [...messages].reverse().find((message) => message.role === "user");
  if (!last) return "";
  if (typeof last.content === "string") return last.content;
  return last.content.map((part) => (part.type === "text" ? part.text : "")).join("\n");
}

export function createTools(context: { conversationId: string }) {
  return {
    list_needs: tool({
      description:
        "Le classement des besoins : chaque besoin avec son rang, ses clients distincts, ses messages, ses segments, ses facteurs (impact, confiance, effort), sa catégorie MoSCoW, son statut, ses signaux, sa tendance (demandes récentes contre demandes d'avant) et s'il a déjà une story. À appeler pour toute question de priorisation ou de tendance.",
      inputSchema: z.object({}),
      execute: async () => {
        const [needs, home] = await Promise.all([listThemes(), homeOverview()]);
        const trends = new Map(home.needs.map((need) => [need.id, need.trend]));
        const stories = await db()`select theme_id, count(*)::int as n from user_stories group by theme_id`;
        const withStory = new Set(stories.map((row) => row.theme_id as number));
        return {
          view: "besoins",
          trend_since: home.trendSince,
          needs: needs.map((need) => {
            const trend = trends.get(need.id);
            return {
              id: `T${need.id}`,
              title: need.title,
              rank: need.rank,
              clients: need.reach,
              messages: need.messages,
              segments: need.segments,
              impact: need.impact,
              confidence: need.confidence,
              effort: need.effort,
              moscow: need.moscow,
              status: status(need.status),
              churn_risk: need.churnRisk,
              already_exists: need.alreadyExists !== null,
              recent_messages: trend?.recent ?? 0,
              older_messages: trend?.older ?? 0,
              trend: trend?.rising ? "en hausse" : trend?.falling ? "en baisse" : null,
              has_story: withStory.has(need.id),
            };
          }),
        };
      },
    }),

    get_need: tool({
      description:
        "Les preuves d'un besoin : énoncé, synthèse citée, facteurs avec leur origine (code, IA ou PO), leur justification et l'accord des propositions de l'IA, clients (segment, revenu mensuel, messages), et des citations de retours avec leur identifiant. À appeler avant d'affirmer quoi que ce soit sur un besoin.",
      inputSchema: z.object({ need_id: z.number().int().describe("Le numéro du besoin : 3 pour T3.") }),
      execute: async ({ need_id }) => {
        const [need, ranked] = await Promise.all([getThemeDetail(need_id), db()`select count(*)::int as n from themes where merged_into is null and rank is not null`]);
        if (!need) return { error: `Le besoin T${need_id} n'existe pas. Appelle list_needs pour trouver le bon identifiant.` };
        return {
          view: `besoin-${need.id}`,
          id: `T${need.id}`,
          title: need.title,
          need: need.needStatement,
          synthesis: need.synthesis,
          status: status(need.status),
          status_reason: need.statusReason,
          rank: need.rank,
          ranked_needs: ranked[0].n as number,
          moscow: need.moscow,
          facets: countFacetClients(need.facets, need.evidence).map((facet) => ({ label: facet.label, clients: facet.clients })),
          segments: Object.fromEntries(
            ["enterprise", "pro", "starter"].map((segment) => [segment, need.clients.filter((client) => client.segment === segment).length]),
          ),
          factors: {
            clients: { value: need.reach, source: "code" },
            impact: { value: need.impact, source: need.factorSources.impact, why: need.factorJustifications.impact, ai_agreement: need.agreement.impact },
            confidence: { value: need.confidence, source: need.factorSources.confidence, why: need.factorJustifications.confidence, ai_agreement: need.agreement.confidence },
            effort: { value: need.effort, source: need.factorSources.effort, why: need.factorJustifications.effort, ai_agreement: need.agreement.effort },
          },
          messages: need.messages,
          share_of_messages_from_top_client: Math.round(need.topClientShare * 100) / 100,
          churn_risk: need.churnRisk,
          already_exists: need.alreadyExists,
          clients: need.clients.map((client) => ({
            name: client.name,
            segment: client.segment,
            mrr_eur: client.mrr,
            messages: client.messages,
            churn_risk: client.churnRisk,
          })),
          quotes: need.evidence.slice(0, 8).map((item) => ({ feedback: `F${item.feedbackId}`, client: item.client, quote: item.quote })),
        };
      },
    }),

    search_feedback: tool({
      description:
        "Cherche dans les retours clients, par le sens (query) ou par filtre (client, segment, canal). Renvoie au plus 10 retours avec leur identifiant et les besoins qu'ils portent. À utiliser pour les questions ouvertes (« que disent les clients Enterprise du mobile ? »).",
      inputSchema: z.object({
        query: z.string().optional().describe("Ce que l'on cherche, en langage naturel."),
        client: z.string().optional().describe("Nom du client, exact ou partiel."),
        segment: z.enum(SEGMENTS).optional(),
        channel: z.enum(CHANNELS).optional(),
        limit: z.number().int().min(1).max(10).optional(),
      }),
      execute: async ({ query, client, segment, channel, limit }) => {
        const sql = db();
        const max = limit ?? 8;
        const clientFilter = client ? `%${client}%` : null;
        let ids: number[] | null = null;
        if (query?.trim()) {
          const { embeddings } = await embedTexts([query.trim()]);
          const nearest = await sql`
            select distinct on (r.feedback_id) r.feedback_id, r.embedding <=> ${toVector(embeddings[0])}::vector as distance
            from feature_requests r where r.embedding is not null
            order by r.feedback_id, distance`;
          ids = nearest
            .sort((a, b) => Number(a.distance) - Number(b.distance))
            .slice(0, 30)
            .map((row) => row.feedback_id);
        }
        const rows = await sql`
          select f.id, f.channel, f.received_at::text as date, left(f.text, 220) as excerpt, c.name as client, c.segment,
                 (select json_agg(distinct jsonb_build_object('id', 'T' || t.id, 'title', t.title))
                    from feature_requests r join themes t on t.id = r.theme_id
                    where r.feedback_id = f.id) as needs
          from feedback f join clients c on c.id = f.client_id
          where f.duplicate_of is null
            and (${ids}::int[] is null or f.id = any(${ids}::int[]))
            and (${clientFilter}::text is null or c.name ilike ${clientFilter})
            and (${segment ?? null}::text is null or c.segment = ${segment ?? null})
            and (${channel ?? null}::text is null or f.channel = ${channel ?? null})
          order by f.received_at desc`;
        const ordered = (ids ? ids.map((id) => rows.find((row) => row.id === id)).filter(Boolean) : rows).slice(0, max);
        return {
          view: `retours-${ordered.map((row) => row!.id).join(",")}`,
          feedback: ordered.map((row) => ({
            id: `F${row!.id}`,
            client: row!.client,
            segment: row!.segment,
            channel: row!.channel,
            date: row!.date,
            excerpt: row!.excerpt,
            needs: row!.needs ?? [],
          })),
        };
      },
    }),

    get_trends: tool({
      description:
        "Les tendances des retours : chaque besoin avec ses clients distincts, ses demandes récentes et celles d'avant (la période est coupée en son milieu), ce qui monte et ce qui baisse. À appeler pour toute question sur ce qui revient, ce qui monte ou ce qui change dans les retours.",
      inputSchema: z.object({}),
      execute: async () => {
        const home = await homeOverview();
        return {
          view: "tendances",
          recent_since: home.trendSince,
          feedback: home.feedback,
          requests: home.requests,
          needs: home.needs.map((need) => ({
            id: `T${need.id}`,
            title: need.title,
            clients: need.clients,
            messages: need.messages,
            recent_messages: need.trend.recent,
            older_messages: need.trend.older,
            trend: need.trend.rising ? "en hausse" : need.trend.falling ? "en baisse" : "stable",
            moscow: need.moscow,
          })),
        };
      },
    }),

    compare_needs: tool({
      description:
        "Compare deux à cinq besoins facteur par facteur (clients, impact, confiance, effort, rang, segments, risque de départ), sans rien recalculer. À appeler pour tout arbitrage entre besoins (« A ou B ? », « lequel d'abord ? ») : la recommandation doit s'appuyer sur leurs facteurs, pas seulement sur leur rang.",
      inputSchema: z.object({ need_ids: z.array(z.number().int()).min(2).max(5).describe("Les numéros des besoins : [2, 5] pour T2 et T5.") }),
      execute: async ({ need_ids }) => {
        const needs = await listThemes();
        const missing = need_ids.filter((id) => !needs.some((need) => need.id === id));
        if (missing.length > 0) return { error: `Besoins introuvables : ${missing.map((id) => `T${id}`).join(", ")}. Appelle list_needs.` };
        return {
          view: `comparer-${need_ids.join(",")}`,
          needs: need_ids.map((id) => {
            const need = needs.find((n) => n.id === id)!;
            return {
              id: `T${need.id}`,
              title: need.title,
              rank: need.rank,
              clients: need.reach,
              messages: need.messages,
              impact: need.impact,
              confidence: need.confidence,
              effort: need.effort,
              segments: need.segments,
              churn_risk: need.churnRisk,
            };
          }),
        };
      },
    }),

    analyze_feedback: tool({
      description:
        "Analyse un retour client que le PO vient de coller (un email, un ticket, une note d'appel), sans rien enregistrer : les demandes qu'il contient, avec leur citation exacte, et pour chacune le besoin du backlog qu'elle rejoindrait (ou un nouveau besoin). Le PO décide ensuite de l'ajouter d'un clic.",
      inputSchema: z.object({
        text: z.string().min(1).describe("Le texte du client, recopié mot pour mot depuis le message du PO, sans ses propres phrases."),
        client: z.string().min(1).describe("Le nom du client qui a écrit."),
        channel: z.enum(CHANNELS).describe("email, ticket, in_app (commentaire dans l'application) ou sales_call (note d'appel)."),
        segment: z.enum(SEGMENTS).optional().describe("Seulement si le PO l'a précisé pour un nouveau client."),
      }),
      execute: async ({ text, client, channel, segment }, { messages }) => {
        // Le modèle ne doit pas reformuler le retour : les citations, puis l'import, partent de ce texte.
        if (!normalizeText(lastUserText(messages)).includes(normalizeText(text))) {
          return { error: "Le texte doit être recopié mot pour mot depuis le message du PO, sans le reformuler ni le résumer." };
        }
        const analysis = await analyzeFeedback({ text, client, channel, segment });
        const joined = analysis.items.find((item) => item.match)?.match;
        return {
          view: joined ? `besoin-${joined.needId}` : null,
          saved: false,
          client: analysis.client,
          channel: analysis.channel,
          already_received: analysis.duplicateOf ? `F${analysis.duplicateOf}` : null,
          items: analysis.items.map((item) => ({
            kind: item.kind,
            need: item.need,
            solution: item.solution,
            quote: item.quote,
            urgency: item.urgency,
            would_join: item.match
              ? {
                  id: `T${item.match.needId}`,
                  title: item.match.title,
                  rank: item.match.rank,
                  rank_after_same_factors: item.match.rankAfter,
                  clients: item.match.reach,
                  clients_after: item.match.reachAfter,
                }
              : item.kind === "feature"
                ? "nouveau besoin"
                : null,
          })),
          rejected_quotes: analysis.rejected,
          // Ce que le bouton « Ajouter au backlog » enverra à l'import : le texte exact, le client, le canal, la date.
          add: { text: analysis.text, client: analysis.client.name, channel: analysis.channel, segment: analysis.client.segment, date: analysis.date },
        };
      },
    }),

    get_import_report: tool({
      description:
        "Le compte rendu du dernier import (ou d'un import donné) : retours, demandes extraites, besoins qui ont reçu des demandes et de quels nouveaux clients, besoins nés, petits besoins regroupés, et rangs avant et après. À appeler quand le PO demande ce qui a changé.",
      inputSchema: z.object({ import_id: z.number().int().optional().describe("Le numéro de l'import ; par défaut, le dernier.") }),
      execute: async ({ import_id }) => {
        const report = await getImportReport(import_id ?? null);
        if (!report) return { error: "Aucun import terminé pour l'instant." };
        return {
          view: `import-${report.batchId}`,
          import_id: report.batchId,
          file: report.filename,
          feedback: report.feedback,
          duplicates: report.duplicates,
          requests: report.requests,
          bugs: report.bugs,
          needs: report.needs.map((need) => ({
            id: `T${need.id}`,
            title: need.title,
            requests_added: need.added,
            new_clients: need.newClients,
            clients: need.reach,
            new_need: need.created,
            rank_before: need.rankBefore,
            rank_after: need.rankAfter,
          })),
          regrouped: report.merged.map((merge) => ({ small_need: merge.source, into: `T${merge.targetId}`, into_title: merge.targetTitle })),
          other_moves: report.moved.map((move) => ({ id: `T${move.id}`, title: move.title, rank_before: move.from, rank_after: move.to })),
        };
      },
    }),

    propose_score_change: tool({
      description: `Propose au PO de modifier un facteur d'un besoin. Ne modifie rien : crée une proposition que le PO appliquera ou rejettera. Valeurs possibles : impact ${FACTOR_OPTIONS.impact.join(", ")} ; confidence ${FACTOR_OPTIONS.confidence.join(", ")} ; effort ${FACTOR_OPTIONS.effort.join(", ")}.`,
      inputSchema: z.object({
        need_id: z.number().int(),
        factor: z.enum(["impact", "confidence", "effort"]),
        value: z.number(),
        reason: z.string().describe("La raison, fondée sur les preuves, qui ira dans le journal si le PO applique."),
      }),
      execute: async ({ need_id, factor, value, reason }) =>
        safely(async () => {
          const proposal = await createScoreProposal({ conversationId: context.conversationId, themeId: need_id, factor, value, reason });
          return {
            view: `besoin-${proposal.themeId}`,
            proposal_id: proposal.id,
            need: `T${proposal.themeId}`,
            need_title: proposal.themeTitle,
            factor,
            from: proposal.payload.kind === "score_change" ? proposal.payload.previous : null,
            to: value,
            reason,
            status: "en attente : le PO doit l'appliquer",
          };
        }),
    }),

    propose_status: tool({
      description:
        "Propose au PO de changer le statut d'un besoin (triaged trié, planned planifié, parked parqué, shipped livré), avec la raison. Ne modifie rien : le PO applique ou rejette. Utile pour tracer un « non » ou une décision commerciale sans gonfler un facteur.",
      inputSchema: z.object({
        need_id: z.number().int(),
        status: z.enum(["new", "triaged", "planned", "parked", "shipped"]),
        reason: z.string(),
      }),
      execute: async ({ need_id, status: input_status, reason }) =>
        safely(async () => {
          const proposal = await createStatusProposal({ conversationId: context.conversationId, themeId: need_id, status: input_status, reason });
          return {
            view: `besoin-${proposal.themeId}`,
            proposal_id: proposal.id,
            need: `T${proposal.themeId}`,
            need_title: proposal.themeTitle,
            from: proposal.payload.kind === "status_change" ? status(proposal.payload.previous) : null,
            to: status(input_status),
            status_code: input_status,
            reason,
            status: "en attente : le PO doit l'appliquer",
          };
        }),
    }),

    draft_user_story: tool({
      description:
        "Rédige la user story d'un besoin à partir de ses preuves (persona, besoin, bénéfice, critères Étant donné / Quand / Alors, complexité relative aux stories de référence, questions ouvertes) et l'enregistre en brouillon, modifiable par le PO.",
      inputSchema: z.object({ need_id: z.number().int() }),
      execute: async ({ need_id }) =>
        safely(async () => {
          const story = await draftStory(need_id, "agent");
          return {
            view: `story-${story.id}`,
            story_id: story.id,
            need: `T${story.themeId}`,
            title: story.title,
            need_title: story.themeTitle,
            story: `En tant que ${midSentence(story.persona)}, je veux ${midSentence(story.want)}, afin de ${midSentence(story.soThat)}.`,
            criteria: story.criteria.map((criterion) => `Étant donné ${midSentence(criterion.given)}, quand ${midSentence(criterion.when)}, alors ${midSentence(criterion.then)}.`),
            points: story.points,
            references: story.references.map((ref) => `${ref.title} (${ref.points})`),
            open_questions: story.openQuestions,
            status: "brouillon enregistré, à relire par le PO",
          };
        }),
    }),
  };
}

export type AgentTools = ReturnType<typeof createTools>;
