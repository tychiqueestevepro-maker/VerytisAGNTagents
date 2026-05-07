/**
 * src/agents/prospecting/sequence.agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Sequence Agent — generates a sequence of steps based on campaign config.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z } from "zod";
import { generateObject } from "../../llm/generateObject.js";
import { createLogger } from "../../logs/logger.js";
import {
  playbookPromptSummary,
  type ProspectionPlaybook,
} from "../../services/prospectingPlaybook.service.js";

const log = createLogger("agent:sequence");

// ── Schema ──────────────────────────────────────────────────────────────────

export const SequenceStepSchema = z.object({
  type: z.enum(['linkedin', 'wait', 'condition', 'end']),
  name: z.string(),
  channel: z.enum(['LinkedIn', 'Général']),
  config: z.object({
    message: z.string().optional(),
    days: z.number().optional(),
    condition: z.string().optional(),
  })
});

export const SequenceAgentOutputSchema = z.object({
  name: z.string(),
  description: z.string(),
  steps: z.array(SequenceStepSchema)
});

export type SequenceAgentOutput = z.infer<typeof SequenceAgentOutputSchema>;

export interface SequenceAgentInput {
  campaign_name: string;
  campaign_objective: string;
  target_description: string;
  target_roles: string[];
  target_industries: string[];
  tone: string;
  brand_context?: string;
  prospection_playbook?: ProspectionPlaybook;
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(input: SequenceAgentInput): string {
  return `
Tu es un expert en Growth Hacking et Stratégie d'Outreach B2B.
Ton objectif est de créer une séquence de prospection automatisée ultra-performante pour "closer" des clients.

CONTEXTE DE LA CAMPAGNE :
- Nom : ${input.campaign_name}
- Objectif : ${input.campaign_objective}
- Cible : ${input.target_description}
- Roles : ${input.target_roles.join(", ")}
- Industries : ${input.target_industries.join(", ")}
- Ton : ${input.tone}
${input.brand_context ? `- Contexte de marque : ${input.brand_context}` : ""}
- Playbook métier : ${input.prospection_playbook ? playbookPromptSummary(input.prospection_playbook) : "aucun playbook fourni"}

CONSIGNES POUR LA SÉQUENCE :
1. La séquence doit être progressive et naturelle.
2. Utilise les types d'étapes suivants :
   - 'linkedin' : actions sur LinkedIn (Voir profil, Envoyer message, Ajouter avec message).
   - 'wait' : temps d'attente entre deux étapes (config.days).
   - 'condition' : branchement conditionnel (config.condition).
   - 'end' : fin de la séquence.
3. Chaque message LinkedIn doit être court, percutant et aligné sur le ton demandé.
4. Utilise des variables comme {{first_name}}, {{company}}, {{role}} dans les messages.
5. L'objectif final est de générer une conversion (rendez-vous, réponse positive, closing).

Structure ta réponse pour qu'elle puisse être directement importée dans un constructeur de workflow.
Réponds UNIQUEMENT avec un JSON conforme au schéma demandé.
`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent
// ─────────────────────────────────────────────────────────────────────────────

export async function runSequenceAgent(
  input: SequenceAgentInput,
  _config?: Record<string, unknown>
): Promise<SequenceAgentOutput> {
  log.info("Sequence agent started", {
    campaign: input.campaign_name,
    objective: input.campaign_objective,
  });

  const userPrompt = `
Génère une séquence complète de 5 à 7 étapes pour cette campagne.
La séquence doit commencer par une approche douce sur LinkedIn (ex: visite de profil) et monter en puissance.
Inclus au moins une relance si le prospect ne répond pas.
`.trim();

  const result = await generateObject({
    schema: SequenceAgentOutputSchema,
    system: buildSystemPrompt(input),
    prompt: userPrompt,
    model: "gpt-4o",
  });

  log.info("Sequence agent completed", { steps_generated: result.steps.length });

  return result;
}
