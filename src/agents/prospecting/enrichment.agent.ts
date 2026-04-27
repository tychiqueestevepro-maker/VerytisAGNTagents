/**
 * src/agents/prospecting/enrichment.agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Enrichment Agent — augments a prospect with additional data points.
 *
 * In production: calls Clay, Apollo, Hunter.io, or similar APIs.
 * Here: LLM-based enrichment from available signals.
 *
 * Input  : Partial Prospect
 * Output : Enriched Prospect (fields merged back in)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z }                from "zod";
import { generateObject }   from "../../llm/generateObject.js";
import { createLogger }     from "../../logs/logger.js";
import type { Prospect }    from "../../schemas/prospect.schema.js";

const log = createLogger("agent:enrichment");

// ── Output schema ─────────────────────────────────────────────────────────────

const EnrichmentResultSchema = z.object({
  /** Inferred industry if not provided */
  industry:      z.string().optional(),
  /** Inferred company size bracket */
  company_size:  z.enum(["1-10", "11-50", "51-200", "201-500", "500+"]).optional(),
  /** Inferred geography */
  geography:     z.string().optional(),
  /** Any additional context useful for copywriting */
  context_notes: z.string().describe("Key business context inferred from available signals"),
  /** Confidence 0–1 */
  confidence:    z.number().min(0).max(1),
}).strict();

type EnrichmentResult = z.infer<typeof EnrichmentResultSchema>;

export interface EnrichmentInput {
  prospect: Prospect;
}

export interface EnrichmentOutput {
  prospect:    Prospect;
  enrichment:  EnrichmentResult;
}

const SYSTEM_PROMPT = `
Tu es un expert en enrichissement de données B2B.
À partir des informations disponibles sur un prospect, tu déduis les données manquantes
(industrie, taille d'entreprise, géographie, contexte métier).

Base-toi sur le titre de poste, le nom de l'entreprise et toute autre donnée disponible.
Réponds UNIQUEMENT avec un JSON conforme au schéma demandé.
`.trim();

export async function runEnrichmentAgent(
  input: EnrichmentInput
): Promise<EnrichmentOutput> {
  const { prospect } = input;

  log.info("Enrichment agent started", { company: prospect.company });

  const userPrompt = `
Enrichis ce prospect avec les données manquantes :

Nom       : ${prospect.first_name} ${prospect.last_name}
Titre     : ${prospect.title}
Entreprise: ${prospect.company}
LinkedIn  : ${prospect.linkedin ?? "non fourni"}
Industrie : ${prospect.industry ?? "MANQUANT"}
Taille    : ${prospect.company_size ?? "MANQUANT"}
Géographie: ${prospect.geography ?? "MANQUANT"}
`.trim();

  const enrichment = await generateObject({
    schema: EnrichmentResultSchema,
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    model:  "gpt-4o-mini",
  });

  // Merge enriched fields back into prospect (only fill gaps)
  const enrichedProspect: Prospect = {
    ...prospect,
    industry:     prospect.industry     ?? enrichment.industry,
    company_size: prospect.company_size ?? enrichment.company_size,
    geography:    prospect.geography    ?? enrichment.geography,
  };

  log.info("Enrichment agent completed", { confidence: enrichment.confidence });

  return { prospect: enrichedProspect, enrichment };
}
