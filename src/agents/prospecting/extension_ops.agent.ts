/**
 * src/agents/prospecting/extension_ops.agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Extension Ops Agent — Cleans and structures data scraped from the browser.
 *
 * It handles the transition from raw LinkedIn HTML extraction to structured
 * Prospect entities ready for enrichment and qualification.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z }                from "zod";
import { generateObject }   from "../../llm/generateObject.js";
import { createLogger }     from "../../logs/logger.js";
import type { Prospect }    from "../../schemas/prospect.schema.js";

const log = createLogger("agent:extension-ops");

// ── Output schema ─────────────────────────────────────────────────────────────

const ExtensionOpsResultSchema = z.object({
  first_name: z.string().describe("Cleaned first name"),
  last_name:  z.string().describe("Cleaned last name"),
  title:      z.string().describe("Cleaned job title (removed emojis, suffixes)"),
  company:    z.string().describe("Normalized company name"),
  /** Confidence score of the cleaning process */
  confidence: z.number().min(0).max(1),
  /** Flag if data was heavily corrected or seems suspicious */
  is_flagged: z.boolean(),
  notes:      z.string().nullable().describe("Notes sur le nettoyage (mettre null si aucune note)"),
}).strict();

export interface ExtensionOpsInput {
  raw_name:    string;
  raw_title?:   string;
  raw_company?: string;
  source_url:  string;
}

export interface ExtensionOpsOutput {
  prospect: Partial<Prospect>;
}

const SYSTEM_PROMPT = `
Tu es un expert en nettoyage de données B2B spécialisé dans LinkedIn.
Ton rôle est de prendre des données brutes extraites par une extension et de les nettoyer parfaitement.

Règles de nettoyage CRITIQUES :
1. SÉPARATION : Sépare le nom complet en Prénom et Nom.
2. TITRE : Nettoie le titre de poste pour être EXTRÊMEMENT CONCIS (ex: "Co-Founder & COO"). Supprime les phrases d'accroche (ex: "Transforming product management...", "Helping B2B..."), les emojis, les mentions de degré (ex: "• 2nd"), les "Open to Work". Ne garde QUE le rôle.
3. PAS DE HALLUCINATION : Ne rajoute JAMAIS "Décideur" ou tout autre titre si ce n'est pas explicitement écrit dans les données brutes.
4. JUNK DATA : Supprime les mentions de "Connexions mutuelles", "Followers", "Mutual connections" qui polluent souvent le nom ou le titre.
5. SOCIÉTÉ : Normalise le nom de l'entreprise (enlève "Inc.", "SaaS", etc. si ce n'est pas essentiel).
6. TEST : Si le nom contient des caractères spéciaux ou semble être un profil de test, mets is_flagged à true.

Réponds UNIQUEMENT avec un JSON conforme au schéma demandé.
`.trim();

/**
 * Runs the Extension Ops agent to clean raw extension data.
 */
export async function runExtensionOpsAgent(
  input: ExtensionOpsInput
): Promise<ExtensionOpsOutput> {
  log.info("Extension Ops agent started", { raw_name: input.raw_name });

  const userPrompt = `
Nettoie les données suivantes extraites de LinkedIn :

Nom Brut    : ${input.raw_name}
Titre Brut  : ${input.raw_title ?? "non fourni"}
Société Brut: ${input.raw_company ?? "non fournie"}
URL Source  : ${input.source_url}
`.trim();

  const cleaned = await generateObject({
    schema: ExtensionOpsResultSchema,
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    model:  "gpt-4o-mini",
  });

  log.info("Extension Ops agent completed", { 
    confidence: cleaned.confidence,
    is_flagged: cleaned.is_flagged 
  });

  return {
    prospect: {
      first_name: cleaned.first_name,
      last_name:  cleaned.last_name,
      title:      cleaned.title,
      company:    cleaned.company,
    }
  };
}
