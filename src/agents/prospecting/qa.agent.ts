/**
 * src/agents/prospecting/qa.agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * QA Agent — validates outreach messages before they are sent.
 *
 * Checks:
 *  • Tone consistency with client rules
 *  • No hallucinated facts
 *  • GDPR / compliance markers
 *  • Character limits per channel
 *  • Personalisation quality score
 *
 * Input  : MessageBundle
 * Output : QAResult (approve / revision required)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z }              from "zod";
import { generateObject } from "../../llm/generateObject.js";
import { createLogger }   from "../../logs/logger.js";
import type { MessageBundle } from "../../schemas/message.schema.js";
import {
  playbookPromptSummary,
  type ProspectionPlaybook,
} from "../../services/prospectingPlaybook.service.js";

const log = createLogger("agent:qa");

// ── Output schema ─────────────────────────────────────────────────────────────

const QAIssueSchema = z.object({
  message_index: z.number().int().nonnegative(),
  channel:       z.string(),
  severity:      z.enum(["blocking", "warning", "suggestion"]),
  description:   z.string(),
  fix:           z.string().nullable().describe("Proposition de correction ou null"),
});

export const QAResultSchema = z.object({
  approved:             z.boolean(),
  overall_quality:      z.number().int().min(0).max(100),
  personalisation_score: z.number().int().min(0).max(100),
  compliance_ok:        z.boolean(),
  issues:               z.array(QAIssueSchema),
  summary:              z.string(),
}).strict();

export type QAResult = z.infer<typeof QAResultSchema>;

// ── Limits per channel ────────────────────────────────────────────────────────

const CHAR_LIMITS: Record<string, number> = {
  email:    2000,
  linkedin: 300,
  sms:      160,
};

const SYSTEM_PROMPT = `
Tu es un expert en contrôle qualité des messages de prospection B2B.

Ton rôle : auditer chaque message pour détecter :
1. Des faits potentiellement inventés (hallucinations)
2. Un ton inapproprié ou incohérent
3. Des dépassements de limites de caractères par canal
4. Des problèmes de conformité RGPD (ex: collecte de données sans consentement)
5. Une personnalisation insuffisante (messages génériques)

Seuil d'approbation : qualité globale ≥ 75, score personnalisation ≥ 60, compliance_ok = true.
Réponds UNIQUEMENT avec un JSON conforme au schéma demandé.
`.trim();

export async function runQAAgent(bundle: MessageBundle, playbook?: ProspectionPlaybook): Promise<QAResult> {
  log.info("QA agent started", { messages: bundle.messages.length });

  // Build a structured representation of the bundle for the LLM
  const bundleDescription = bundle.messages.map((msg, i) => {
    const limit = CHAR_LIMITS[msg.channel] ?? 9999;
    return `
[Message ${i + 1}] Canal: ${msg.channel} | Limite: ${limit} chars | Longueur: ${msg.body.length} chars
Sujet : ${msg.subject ?? "N/A"}
Body  : ${msg.body}
CTA   : ${msg.cta}
    `.trim();
  }).join("\n\n");

  const userPrompt = `
Effectue un contrôle qualité complet de ces messages d'outreach :

${bundleDescription}

Prospect référence : ${bundle.prospect_ref}
Playbook métier à respecter :
${playbook ? playbookPromptSummary(playbook) : "aucun playbook fourni"}
`.trim();

  const result = await generateObject({
    schema: QAResultSchema,
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    model:  "gpt-4o",
  });

  log.info("QA agent completed", {
    approved:        result.approved,
    quality:         result.overall_quality,
    issues_count:    result.issues.length,
  });

  return result;
}
