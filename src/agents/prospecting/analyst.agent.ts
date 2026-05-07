/**
 * src/agents/prospecting/analyst.agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Analyst Agent — analyzes a company website to generate a Prospection Playbook.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { generateObject } from "../../llm/generateObject.js";
import { createLogger } from "../../logs/logger.js";
import { ProspectionPlaybookSchema, type ProspectionPlaybook } from "../../services/prospectingPlaybook.service.js";

const log = createLogger("agent:analyst");

const SYSTEM_PROMPT = `
Tu es un expert en stratégie commerciale et en prospection B2B.
Ton rôle est d'analyser le contenu d'un site web d'entreprise pour extraire sa mission, son offre, et définir les règles d'or de sa prospection.

Tu dois générer un "Prospection Playbook" qui servira à guider d'autres agents IA pour qualifier des prospects et rédiger des messages personnalisés.

CONSIGNES :
1. Analyse la proposition de valeur (goal).
2. Définis la méthode de prospection idéale pour cette offre.
3. Propose des règles de qualification précises (qualification_rules).
4. Propose des règles d'exclusion (exclusion_rules).
5. Définis la stratégie de message (message_strategy) : ton, angle d'approche, et ce qu'il faut éviter.

Réponds UNIQUEMENT avec un objet JSON conforme au schéma ProspectionPlaybook.
`.trim();

export interface AnalystInput {
  website_url: string;
  website_title: string;
  website_content: string;
}

export async function runAnalystAgent(input: AnalystInput): Promise<ProspectionPlaybook> {
  log.info("Analyst agent started", { url: input.website_url });

  const userPrompt = `
Analyse ce site web et génère le Playbook de prospection :

SITE : ${input.website_url}
TITRE : ${input.website_title}

CONTENU :
${input.website_content}

Génère un playbook complet et professionnel en français.
`.trim();

  const result = await generateObject({
    schema: ProspectionPlaybookSchema,
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    model: "gpt-4o",
  });

  log.info("Analyst agent completed", { url: input.website_url });

  return result;
}
