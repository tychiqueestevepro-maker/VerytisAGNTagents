/**
 * src/agents/prospecting/copywriter.agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Copywriter Agent — generates personalised outreach messages.
 *
 * Input  : Enriched Prospect + QualificationResult + channel config
 * Output : MessageBundle (one message per requested channel)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z }                      from "zod";
import { generateObject }         from "../../llm/generateObject.js";
import { createLogger }           from "../../logs/logger.js";
import type { Prospect }          from "../../schemas/prospect.schema.js";
import type { QualificationResult } from "../../schemas/qualifier.schema.js";
import {
  MessageSchema,
  MessageBundleSchema,
  type OutreachChannel,
  type MessageBundle,
} from "../../schemas/message.schema.js";
import { AgentMemoryService } from "../../services/agentMemory.service.js";
import type { WorkflowRunMeta } from "../../engine/taskRunner.js";

const log = createLogger("agent:copywriter");

// ── Input ─────────────────────────────────────────────────────────────────────

export interface CopywriterInput {
  prospect:        Prospect;
  qualification:   QualificationResult;
  channels:        OutreachChannel[];
  tone:            "formal" | "conversational" | "technical";
  language:        string;
  brand_context:   string;
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(input: CopywriterInput, memories: any[] = []): string {
  const memoryContext = memories.length > 0
    ? `\n--- MÉMOIRE / APPRENTISSAGES PRÉCÉDENTS ---\nPrends en compte ces leçons issues de tes interactions passées :\n${memories.map(m => `- ${JSON.stringify(m.content)}`).join("\n")}\n`
    : "";

  return `
Tu es un expert en copywriting B2B ultra-personnalisé.
Ton objectif : rédiger des messages d'outreach qui génèrent des réponses, pas des désabonnements.

Contexte de marque : ${input.brand_context}
Ton de communication : ${input.tone}
Langue : ${input.language}
${memoryContext}

Règles absolues :
- Personnalise CHAQUE message avec des détails spécifiques au prospect.
- Ne mentionne jamais la concurrence.
- Un seul CTA clair par message.
- Email/LinkedIn : max 150 mots.
- Commence toujours par le prénom du prospect.
- La valeur d'abord, la vente ensuite.

Réponds UNIQUEMENT avec un JSON conforme au schéma demandé.
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent
// ─────────────────────────────────────────────────────────────────────────────

// Single-channel message schema (reuse from message.schema)
const SingleMessageResultSchema = z.object({ message: MessageSchema }).strict();

export async function runCopywriterAgent(
  input: CopywriterInput,
  config?: Record<string, unknown>,
  meta?: WorkflowRunMeta
): Promise<MessageBundle> {
  const { prospect, qualification, channels } = input;

  if (config?.personalized_message) {
    log.info("Using pre-generated personalized message from config", {
      prospect: `${prospect.first_name} ${prospect.last_name}`,
    });
    return MessageBundleSchema.parse({
      prospect_ref: `${prospect.first_name}_${prospect.last_name}_${prospect.company}`,
      messages: channels.map((channel) => ({
        channel,
        content: config.personalized_message as string,
        subject: "",
      })),
      created_at: new Date().toISOString(),
    });
  }

  log.info("Copywriter agent started", {
    prospect: `${prospect.first_name} ${prospect.last_name}`,
    channels,
  });

  let memories: any[] = [];
  if (meta?.clientId) {
    memories = await AgentMemoryService.getContextMemories({
      clientId: meta.clientId,
      workflowId: meta.workflowId,
      prospectId: meta.prospectId,
      memoryType: "lesson",
    });
  }

  const messages = await Promise.all(
    channels.map(async (channel) => {
      const userPrompt = `
Rédige un message ${channel} pour ce prospect :

--- PROSPECT ---
Prénom     : ${prospect.first_name}
Nom        : ${prospect.last_name}
Titre      : ${prospect.title}
Entreprise : ${prospect.company}
Industrie  : ${prospect.industry ?? "non précisée"}
Géographie : ${prospect.geography ?? "non précisée"}

--- QUALIFICATION ---
Score ICP  : ${qualification.score}/100
Critères ✓ : ${qualification.matched_criteria.join(", ")}
Contexte   : ${qualification.reasoning.icp_match}
Parcours   : ${qualification.prospect_insights?.career_context ?? "inconnu"}
Hooks      : ${qualification.prospect_insights?.personalization_hooks?.length ? qualification.prospect_insights.personalization_hooks.join(" | ") : "aucun hook vérifié"}
Ouverture  : ${qualification.prospect_insights?.suggested_opening ?? "aucune"}

Canal cible: ${channel}

Si un hook de prise de poste récente est fourni, tu peux féliciter le prospect. Sinon, n'invente pas d'embauche ou de promotion.
`.trim();

      const result = await generateObject({
        schema: SingleMessageResultSchema,
        system: buildSystemPrompt(input, memories),
        prompt: userPrompt,
        model:  "gpt-4o",
      });

      return { ...result.message, channel };
    })
  );

  const bundle = MessageBundleSchema.parse({
    prospect_ref: `${prospect.first_name}_${prospect.last_name}_${prospect.company}`,
    messages,
    created_at:   new Date().toISOString(),
  });

  log.info("Copywriter agent completed", { messages_generated: messages.length });

  return bundle;
}
