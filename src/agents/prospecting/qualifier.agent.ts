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
  campaign_context?: {
    name?: string;
    objective?: string;
    target_description?: string;
    offer?: string;
  };
  organization_context?: {
    company_description?: string;
    website?: string;
    linkedin_url?: string;
    mission_hint?: string;
  };
  experience_context?: {
    current_experience?: Record<string, unknown>;
    experiences?: unknown[];
    experience_highlights?: string[];
    personalization_signals?: string[];
    current_role_start?: string;
    current_role_duration?: string;
    current_role_is_recent?: boolean;
  };
  raw_signals?: string[];
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
- Mission / positionnement probable de l'organisation du prospect
- Fit concret avec la cible et l'offre de la campagne
- Signaux de personnalisation vérifiés : prise de poste récente, ancienneté, évolution interne, expérience passée utile

Réponds UNIQUEMENT avec un objet JSON conforme au schéma demandé.
`.trim();

export async function runQualifierAgent(
  input: QualifierInput
): Promise<QualificationResult> {
  const { prospect, icp } = input;
  const campaign = input.campaign_context ?? {};
  const organization = input.organization_context ?? {};
  const experience = input.experience_context ?? {};
  const rawSignals = input.raw_signals?.filter(Boolean) ?? [];

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
LinkedIn  : ${prospect.linkedin ?? "inconnu"}

--- ORGANISATION DU PROSPECT ---
Description / mission : ${organization.company_description ?? organization.mission_hint ?? "inconnue"}
Site web              : ${organization.website ?? "inconnu"}
LinkedIn entreprise   : ${organization.linkedin_url ?? "inconnu"}
Signaux bruts utiles  : ${rawSignals.length ? rawSignals.join(" | ") : "aucun"}

--- PARCOURS / EXPERIENCE DU PROSPECT ---
Experience actuelle : ${experience.current_experience ? JSON.stringify(experience.current_experience) : "inconnue"}
Debut role actuel   : ${experience.current_role_start ?? "inconnu"}
Anciennete role     : ${experience.current_role_duration ?? "inconnue"}
Role recent         : ${experience.current_role_is_recent ? "oui" : "non ou inconnu"}
Experiences recentes: ${experience.experience_highlights?.length ? experience.experience_highlights.join(" | ") : "aucune"}
Hooks detectes      : ${experience.personalization_signals?.length ? experience.personalization_signals.join(" | ") : "aucun"}

--- ICP ---
Industries cibles   : ${icp.industries.join(", ")}
Tailles d'entreprise: ${icp.company_sizes.join(", ")}
Géographies cibles  : ${icp.geographies.join(", ")}
Titres cibles       : ${icp.job_titles.join(", ")}
Mots-clés exclus    : ${icp.exclude_keywords.join(", ") || "aucun"}

--- CAMPAGNE ---
Nom campagne       : ${campaign.name ?? "inconnu"}
Objectif           : ${campaign.objective ?? "inconnu"}
Cible / description: ${campaign.target_description ?? "inconnue"}
Offre              : ${campaign.offer ?? "inconnue"}

Seuil de qualification minimum : ${QUALIFICATION_THRESHOLD}/100

Dans prospect_insights.organization_mission, indique la mission ou proposition de valeur la plus fiable que tu peux déduire des données fournies. Si les données ne suffisent pas, écris clairement "inconnue" au lieu d'inventer.
Dans prospect_insights.career_context, synthétise uniquement les faits vérifiés sur l'ancienneté, une prise de poste récente ou une expérience utile. Si rien n'est fiable, écris "inconnu".
Dans prospect_insights.personalization_hooks, liste 1 à 4 accroches spécifiques utilisables pour personnaliser un message. Si le rôle est récent, tu peux proposer une accroche de félicitations. Ne félicite jamais une embauche si la date ou la durée n'est pas explicitement fournie.
Dans prospect_insights.suggested_opening, propose une première phrase courte d'outreach basée sur le meilleur hook vérifié, ou une phrase neutre si aucun hook fiable n'existe.
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
