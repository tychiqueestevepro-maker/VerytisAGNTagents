/**
 * src/agents/prospecting/qualifier.agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Qualifier Agent — scores a prospect against the client's ICP.
 *
 * Input  : Prospect + ICP configuration
 * Output : QualificationResult (Zod-validated via generateObject)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { generateObject } from "../../llm/generateObject.js";
import { createLogger }   from "../../logs/logger.js";
import type { Prospect }  from "../../schemas/prospect.schema.js";
import {
  QualificationResultSchema,
  QUALIFICATION_THRESHOLD,
  type QualificationResult,
} from "../../schemas/qualifier.schema.js";

const log = createLogger("agent:qualifier");

export interface QualifierInput {
  prospect: Prospect;
  icp: {
    industries:    string[];
    company_sizes: string[];
    geographies:   string[];
    job_titles:    string[];
    exclude_keywords: string[];
  };
}

const SYSTEM_PROMPT = `
Tu es un expert en qualification de leads B2B.
Ton rôle est d'évaluer si un prospect correspond au profil client idéal (ICP) fourni.

Critères d'évaluation :
- Pertinence du titre de poste (décideur ? influenceur ?)
- Adéquation de l'industrie
- Taille d'entreprise compatible
- Géographie cible
- Absence de signaux disqualifiants

Réponds UNIQUEMENT avec un objet JSON conforme au schéma demandé.
`.trim();

export async function runQualifierAgent(
  input: QualifierInput
): Promise<QualificationResult> {
  const { prospect, icp } = input;

  log.info("Qualifier agent started", {
    prospect: `${prospect.first_name} ${prospect.last_name}`,
    company:  prospect.company,
  });

  const userPrompt = `
Évalue ce prospect selon l'ICP fourni :

--- PROSPECT ---
Nom       : ${prospect.first_name} ${prospect.last_name}
Titre     : ${prospect.title}
Entreprise: ${prospect.company}
Industrie : ${prospect.industry ?? "inconnue"}
Taille    : ${prospect.company_size ?? "inconnue"}
Géographie: ${prospect.geography ?? "inconnue"}

--- ICP ---
Industries cibles   : ${icp.industries.join(", ")}
Tailles d'entreprise: ${icp.company_sizes.join(", ")}
Géographies cibles  : ${icp.geographies.join(", ")}
Titres cibles       : ${icp.job_titles.join(", ")}
Mots-clés exclus    : ${icp.exclude_keywords.join(", ") || "aucun"}

Seuil de qualification minimum : ${QUALIFICATION_THRESHOLD}/100
`.trim();

  const result = await generateObject({
    schema: QualificationResultSchema,
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    model:  "gpt-4o",
  });

  log.info("Qualifier agent completed", {
    score:     result.score,
    qualified: result.qualified,
    action:    result.recommended_action,
  });

  return result;
}
