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
import {
  playbookPromptSummary,
  type ProspectionPlaybook,
} from "../../services/prospectingPlaybook.service.js";

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
  recent_serp_sources?: unknown[];
  language?:             string;
  prospection_playbook?: ProspectionPlaybook;
}

const SYSTEM_PROMPT = `
Tu es un expert en qualification B2B de haut niveau (Strategic Prospecting).
Ton rôle n'est pas seulement de valider des critères (titre, secteur), mais de construire un business case : pourquoi ce prospect mérite une action MAINTENANT ?

Priorités de qualification :
1. MOMENTUM : Levées de fonds, recrutements massifs (Ops/Tech), expansion, nouveaux projets.
2. TIMING : Prise de poste récente, évolution interne, actualité SERP.
3. DOULEURS PROBABLES : Déduire les besoins d'automatisation/structuration liés à la phase de croissance.
4. ANGLE D'APPROCHE : Pourquoi ce message peut fonctionner sur lui spécifiquement ?

Règles de rédaction :
- Évite le générique ("CTO chez FinTech").
- Sois narratif et hypothétique : "L'entreprise recrute sur X, ce qui suggère un besoin de structuration sur Y".
- Focalise sur l'URGENCE psychologique et le timing business.

Règles de langue :
- Si la langue demandée est l'anglais ("english" ou "en"), tu DOIS rédiger TOUS les champs textuels en ANGLAIS.
- Sinon, tu rédiges en FRANÇAIS.

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
  const recentSerpSources = input.recent_serp_sources?.filter(Boolean).slice(0, 8) ?? [];
  const playbook = input.prospection_playbook;

  log.info("Qualifier agent started", {
    prospect: `${prospect.first_name} ${prospect.last_name}`,
    company:  prospect.company,
  });

  // ── Demo Mock Mode ────────────────────────────────────────────────────────
  // Check if this is the demo campaign for Verytis
  const isVerytisDemo = input.campaign_context?.name?.toLowerCase().includes("verytis.com");
  const fullName = `${prospect.first_name} ${prospect.last_name}`;

  if (isVerytisDemo) {
    const isEn = input.language?.toLowerCase().includes("en") || input.language?.toLowerCase().includes("anglais");
    const t = (fr: string, en: string) => (isEn ? en : fr);

    if (fullName === "Marcus Sterling") {
      return {
        score: 98,
        qualified: true,
        reasoning: {
          icp_match: t("NovaPay recrute massivement sur des profils Engineering et Ops aux USA, signe d'une phase d'expansion critique. Marcus pilote la structuration technique de ces flux financiers massifs, créant un momentum idéal pour une approche orientée process et IA.", "NovaPay is aggressively hiring Engineering and Ops roles in the US, signaling a critical expansion phase. Marcus is leading the technical scaling of these massive financial flows, creating ideal momentum for a process and AI-driven approach."),
          title_relevance: t("Décideur technique direct (CTO) au cœur des enjeux de scalabilité infrastructurelle aux USA.", "Direct technical decision-maker (CTO) at the heart of infrastructure scalability issues in the US."),
          company_fit: t("Volume de transactions colossal nécessitant une automatisation sans faille dans le cloud.", "Colossal transaction volume requiring seamless cloud-based automation."),
          risk_flags: []
        },
        prospect_insights: {
          organization_mission: t("Automatiser la gestion des dépenses pour les entreprises globales.", "Automating expense management for global enterprises."),
          organization_context: t("FinTech américaine leader en hyper-croissance avec une culture forte de l'efficacité tech.", "Leading US FinTech in hyper-growth with a strong culture of tech efficiency."),
          role_context: t("Marcus orchestre la scalabilité d'une licorne gérant des flux financiers critiques.", "Marcus orchestrates the scalability of a unicorn managing critical financial flows."),
          campaign_fit_summary: t("Timing parfait : phase d'expansion US + besoin de structuration des données financières.", "Perfect timing: US expansion phase + need for financial data structuring."),
          career_context: t("Ascension de Stripe à Square jusqu'au poste de CTO chez NovaPay, expert des flux massifs.", "Rise from Stripe to Square to CTO at NovaPay, expert in massive flows."),
          personalization_hooks: isEn ? ["NovaPay engineering hiring spike", "Stripe to Square scalability expertise", "US Financial automation roadmap"] : ["Pic de recrutement engineering NovaPay", "Expertise scalabilité Stripe/Square", "Roadmap automatisation financière US"],
          suggested_opening: t("Marcus, NovaPay accélère son expansion technique avec ces nouveaux recrutements Engineering. Votre expérience chez Square sur les flux massifs doit être un atout précieux dans cette phase.", "Marcus, NovaPay is accelerating its technical expansion with these new Engineering hires. Your experience at Square with massive flows must be a valuable asset in this phase.")
        },
        matched_criteria: isEn ? ["Industry: FinTech", "Signal: High Hiring", "Role: CTO", "Momentum: Expansion"] : ["Industrie: FinTech", "Signal: Fort Recrutement", "Rôle: CTO", "Momentum: Expansion"],
        unmatched_criteria: [],
        recommended_action: "send_outreach"
      };
    }

    if (fullName === "Sarah Jenkins") {
      return {
        score: 95,
        qualified: true,
        reasoning: {
          icp_match: t("Sarah pilote le nouveau centre opérationnel de la côte Est, un projet charnière pour LogiCore. Cette phase de transition vers une logistique 100% digitale aux USA crée une douleur immédiate sur la gestion des flux hybrides.", "Sarah leads the new East Coast operational center, a pivotal project for LogiCore. This transition phase towards 100% digital logistics in the US creates immediate pain in managing hybrid flows."),
          title_relevance: t("VP Operations avec un pouvoir décisionnel sur les outils de pilotage flux globaux.", "VP Operations with decision-making power over global flow monitoring tools."),
          company_fit: t("Géant de la logistique US en pleine transformation numérique globale.", "US logistics giant in the midst of global digital transformation."),
          risk_flags: []
        },
        prospect_insights: {
          organization_mission: t("Optimiser la supply chain mondiale via l'innovation opérationnelle.", "Optimizing the global supply chain through operational innovation."),
          organization_context: t("Leader mondial du transport gérant des volumes de flux critiques aux USA.", "World transport leader managing critical flow volumes in the US."),
          role_context: t("Sarah est en première ligne sur la digitalisation des hubs logistiques nord-américains.", "Sarah is on the frontline of North American logistics hub digitalization."),
          campaign_fit_summary: t("Signal fort : Ouverture de centre opérationnel + Migration digitale en cours.", "Strong signal: Operational center opening + Digital migration in progress."),
          career_context: t("Passage par FedEx où elle a dirigé l'automatisation du tri, puis montée en puissance chez LogiCore.", "Time at FedEx where she led sorting automation, then rising through the ranks at LogiCore."),
          personalization_hooks: isEn ? ["New East Coast Hub opening", "FedEx automation background", "Digital logistics initiative"] : ["Ouverture nouveau Hub côte Est", "Héritage automatisation FedEx", "Initiative logistique digitale"],
          suggested_opening: t("Sarah, le pilotage opérationnel de LogiCore sur la côte Est prend une nouvelle dimension avec ce Hub. Votre regard sur l'automatisation du tri chez FedEx doit être crucial pour ce projet.", "Sarah, LogiCore's operational management on the East Coast is taking on a new dimension with this Hub. Your perspective on sorting automation at FedEx must be crucial for this project.")
        },
        matched_criteria: isEn ? ["Industry: Logistics", "Signal: New Hub Opening", "Role: VP Ops", "Momentum: Digital Shift"] : ["Industrie: Logistique", "Signal: Ouverture de Hub", "Rôle: VP Ops", "Momentum: Virage Digital"],
        unmatched_criteria: [],
        recommended_action: "send_outreach"
      };
    }

    if (fullName === "Jonathan Reed") {
      return {
        score: 92,
        qualified: true,
        reasoning: {
          icp_match: t("Post-acquisition de RetailStream, Jonathan gère l'unification des systèmes e-commerce. La marketplace explose en volume de références, ce qui sature probablement les processus manuels actuels.", "Post-acquisition of RetailStream, Jonathan manages the unification of e-commerce systems. The marketplace is exploding in reference volume, likely saturating current manual processes."),
          title_relevance: t("CDO avec une vision transverse sur l'efficacité des flux omnicanaux aux USA.", "CDO with a cross-functional vision on US omnichannel flow efficiency."),
          company_fit: t("E-commerce à très large échelle avec des problématiques de réconciliation de données.", "Large-scale e-commerce with data reconciliation issues."),
          risk_flags: []
        },
        prospect_insights: {
          organization_mission: t("Réinventer la distribution omnicanale pour l'ère du digital.", "Reinventing omnichannel distribution for the digital age."),
          organization_context: t("Leader américain du retail en pleine refonte de sa stack marketplace.", "US retail leader in the midst of a marketplace stack overhaul."),
          role_context: t("Jonathan porte la responsabilité de l'unification technologique du groupe.", "Jonathan bears responsibility for the group's technological unification."),
          campaign_fit_summary: t("Signal : Croissance Marketplace + Complexité post-acquisition.", "Signal: Marketplace Growth + Post-acquisition complexity."),
          career_context: t("Pionnier Amazon ayant survécu à l'âge d'or avant de structurer la marketplace de RetailStream.", "Amazon pioneer who survived the golden age before structuring the RetailStream marketplace."),
          personalization_hooks: isEn ? ["RetailStream marketplace scaling", "Amazon e-commerce heritage", "Omnichannel unification"] : ["Scaling marketplace RetailStream", "Héritage e-commerce Amazon", "Unification omnicanale"],
          suggested_opening: t("Jonathan, l'unification des flux après l'acquisition de RetailStream est un chantier titanesque. Votre expérience sur le lancement de la marketplace chez Amazon doit être un pilier pour cette transition.", "Jonathan, unifying flows after the RetailStream acquisition is a titanic task. Your experience launching the marketplace at Amazon must be a pillar for this transition.")
        },
        matched_criteria: isEn ? ["Industry: E-commerce", "Signal: Post-Acquisition Sync", "Role: CDO", "Momentum: Scaling"] : ["Industrie: E-commerce", "Signal: Sync Post-Acquisition", "Rôle: CDO", "Momentum: Scaling"],
        unmatched_criteria: [],
        recommended_action: "send_outreach"
      };
    }

    if (fullName === "Chloe Parker") {
      return {
        score: 88,
        qualified: true,
        reasoning: {
          icp_match: t("CarePulse accélère sur le recrutement de profils Data Security et Product Innovation. Ce recrutement suggère une levée de verrous sur l'automatisation sécurisée des parcours de santé complexes aux USA.", "CarePulse is accelerating hiring for Data Security and Product Innovation roles. This recruitment suggests a breakthrough in secure automation for complex US health journeys."),
          title_relevance: t("Responsable Innovation, idéale pour introduire des solutions de rupture IA en santé.", "Innovation Manager, ideal for introducing disruptive AI solutions in healthcare."),
          company_fit: t("HealthTech majeure soumise à des flux de données HIPAA hautement sensibles.", "Major HealthTech subject to highly sensitive HIPAA data flows."),
          risk_flags: []
        },
        prospect_insights: {
          organization_mission: t("Fluidifier l'accès aux soins par la technologie aux USA.", "Smoothing access to care through technology in the US."),
          organization_context: t("Licorne e-santé en phase de diversification produits (téléconsultation, gestion).", "E-health unicorn in product diversification phase (teleconsultation, management)."),
          role_context: t("Chloe fait le pont entre les besoins praticiens et les solutions tech de pointe.", "Chloe bridges practitioner needs and cutting-edge tech solutions."),
          campaign_fit_summary: t("Signal : Expansion de stack HealthTech + Background Silicon Valley (Innovation).", "Signal: HealthTech stack expansion + Silicon Valley background (Innovation)."),
          career_context: t("Ancienne scout HealthTech dans la Valley avec une vision claire sur les solutions d'automatisation.", "Former HealthTech scout in the Valley with a clear vision on automation solutions."),
          personalization_hooks: isEn ? ["CarePulse data security hiring", "Silicon Valley innovation network", "Healthcare digitalization"] : ["Recrutement Data Security CarePulse", "Réseau innovation Silicon Valley", "Digitalisation santé"],
          suggested_opening: t("Chloe, CarePulse franchit une nouvelle étape avec ces initiatives Data Security. Votre regard d'ex-scout dans la Valley sur les technologies d'automatisation sécurisées m'intéresse.", "Chloe, CarePulse is reaching a new milestone with these Data Security initiatives. Your perspective as a former Valley scout on secure automation technologies interests me.")
        },
        matched_criteria: isEn ? ["Industry: HealthTech", "Signal: Product Expansion", "Role: Innovation", "Momentum: Security Focus"] : ["Industrie: HealthTech", "Signal: Expansion Produit", "Rôle: Innovation", "Momentum: Focus Sécurité"],
        unmatched_criteria: [],
        recommended_action: "send_outreach"
      };
    }

    if (fullName === "Tom Miller") {
      return {
        score: 55,
        qualified: false,
        reasoning: {
          icp_match: t("Tom gère des projets IT isolés chez SteelFront. Le momentum business est faible car l'entreprise reste très silotée opérationnellement, rendant une approche d'automatisation globale difficile sans sponsorship CDO.", "Tom manages isolated IT projects at SteelFront. Business momentum is low as the company remains operationally siloed, making a global automation approach difficult without CDO sponsorship."),
          title_relevance: t("Opérationnel IT (Chef de projet) sans vision sur la stratégie flux globale.", "IT operational (Project Manager) without vision on global flow strategy."),
          company_fit: t("Industrie de la construction avec une maturité digitale hétérogène selon les divisions aux USA.", "US construction industry with heterogeneous digital maturity across divisions."),
          risk_flags: isEn ? ["Siloed organization", "Lack of strategic sponsorship"] : ["Organisation silotée", "Manque de sponsorship stratégique"]
        },
        prospect_insights: {
          organization_mission: t("Construire durablement via l'excellence opérationnelle.", "Building sustainably through operational excellence."),
          organization_context: t("Acteur mondial de la construction fonctionnant par business units autonomes.", "Global construction player operating through autonomous business units."),
          role_context: t("Tom est concentré sur le déploiement d'outils digitaux terrain.", "Tom is focused on deploying digital field tools."),
          campaign_fit_summary: t("Faible : Manque de momentum centralisé sur l'automatisation.", "Low: Lack of centralized momentum on automation."),
          career_context: t("Ancien de chez IBM, habitué à la gestion de projet classique.", "Former IBM, used to traditional project management."),
          personalization_hooks: isEn ? ["Field digital deployment", "SteelFront BUnits structure", "IBM heritage"] : ["Déploiement digital terrain", "Structure BUnits SteelFront", "Héritage IBM"],
          suggested_opening: t("Tom, le déploiement digital chez SteelFront est un défi de structuration. Votre parcours chez IBM doit vous aider à gérer ces silos complexes.", "Tom, digital deployment at SteelFront is a structuring challenge. Your background at IBM must help you manage these complex silos.")
        },
        matched_criteria: isEn ? ["Industry: Construction", "Role: IT Project", "Momentum: Low"] : ["Industrie: Construction", "Rôle: Projet IT", "Momentum: Faible"],
        unmatched_criteria: isEn ? ["Centralized Strategy", "Decision Maker Level"] : ["Stratégie centralisée", "Niveau décisionnel"],
        recommended_action: "manual_review"
      };
    }

    if (fullName === "Lucy Bennett") {
      return {
        score: 15,
        qualified: false,
        reasoning: {
          icp_match: t("Aucun momentum business. Lucy gère le marketing d'un café local. Pas de volume de données critiques ni de besoin d'automatisation d'infrastructure.", "No business momentum. Lucy manages marketing for a local coffee shop. No critical data volume or infrastructure automation needs."),
          title_relevance: t("Responsable Marketing (TPE), hors cible opérationnelle.", "Marketing Manager (Small business), off operational target."),
          company_fit: t("Commerce de proximité n'ayant pas la maturité pour une solution enterprise.", "Local business lacking maturity for an enterprise solution."),
          risk_flags: isEn ? ["Sector mismatch (Food)", "Zero scalability pain"] : ["Secteur inadapté (Food)", "Aucune douleur de scalabilité"]
        },
        prospect_insights: {
          organization_mission: t("Valoriser le café artisanal de quartier.", "Promoting artisanal neighborhood coffee."),
          organization_context: t("Café local à Boston en phase de communication de quartier.", "Local Boston coffee shop in neighborhood communication phase."),
          role_context: t("Lucy gère l'image et l'accueil client.", "Lucy manages branding and customer service."),
          campaign_fit_summary: t("Hors cible absolue : pas de flux métier à automatiser.", "Absolute off-target: no business flows to automate."),
          career_context: t("Parcours orienté retail de proximité.", "Career focused on local retail."),
          personalization_hooks: isEn ? ["Artisanal branding", "Local Boston coffee shop"] : ["Branding artisanal", "Café local Boston"],
          suggested_opening: t("Lucy, votre café artisanal fait la fierté du quartier. Notre solution s'adresse aux flux d'infrastructure massifs, ce qui est très éloigné de votre quotidien.", "Lucy, your artisanal coffee is the pride of the neighborhood. Our solution addresses massive infrastructure flows, which is very far from your daily operations.")
        },
        matched_criteria: [],
        unmatched_criteria: isEn ? ["Enterprise Scale", "Infrastructure Need", "Industry"] : ["Échelle Entreprise", "Besoin Infrastructure", "Industrie"],
        recommended_action: "discard"
      };
    }
  }

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

--- SOURCES PUBLIQUES RECENTES SERP ---
${recentSerpSources.length ? JSON.stringify(recentSerpSources, null, 2) : "aucune source recente disponible"}

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

--- PLAYBOOK METIER DE PROSPECTION ---
${playbook ? playbookPromptSummary(playbook) : "aucun playbook fourni"}

Seuil de qualification minimum : ${QUALIFICATION_THRESHOLD}/100
Langue de sortie demandée : ${input.language ?? "français"}

Dans reasoning.icp_match, construis un argumentaire de timing business (Why Now?). Ne liste pas les critères, explique la dynamique (ex: "Phase d'expansion Tech + Recrutements Ops = Moment charnière pour l'automatisation").
Dans prospect_insights.organization_mission, indique la mission stratégique.
Dans prospect_insights.career_context, synthétise le parcours comme une preuve de légitimité pour le sujet abordé.
Dans prospect_insights.personalization_hooks, liste des faits de momentum (croissance, actu, stack).
Dans prospect_insights.suggested_opening, propose une accroche orientée "contexte/signal" plutôt que "compliment générique".

REDACTION : Tu DOIS impérativement rédiger TOUS les textes en ${input.language ?? "français"}.
Interdiction absolue d'utiliser des formulations comme "CTO aligné avec la campagne" ou "Entreprise Fintech en croissance". Sois précis sur les signaux.
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
