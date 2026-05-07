import { z } from "zod";

const RuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  weight: z.number().int().min(0).max(100).default(10),
  keywords: z.array(z.string()).default([]),
}).passthrough();

const ValidationPolicySchema = z.object({
  auto_accept_above: z.number().int().min(0).max(100).default(80),
  human_review_between: z.tuple([
    z.number().int().min(0).max(100),
    z.number().int().min(0).max(100),
  ]).default([50, 79]),
  reject_below: z.number().int().min(0).max(100).default(50),
  require_human_validation: z.boolean().default(true),
}).passthrough();

const MessageStrategySchema = z.object({
  tone: z.string().default("professionnel, direct et utile"),
  angle: z.string().default("automatiser un process existant sans changer la maniere de travailler"),
  cta: z.string().default("proposer un echange court"),
  avoid: z.array(z.string()).default([
    "promesses vagues",
    "IA magique",
    "scraping massif",
    "ton trop commercial",
  ]),
}).passthrough();

const OperatingRulesSchema = z.object({
  source_policy: z.string().default("Importer une liste brute puis qualifier avant toute action."),
  dedupe_policy: z.string().default("Ignorer les doublons de profil ou de societe deja presents."),
  human_review_triggers: z.array(z.string()).default([
    "score moyen",
    "donnees incompletes",
    "message avec faible personnalisation",
  ]),
  next_action_for_high: z.string().default("preparer le message et proposer validation"),
  next_action_for_medium: z.string().default("mettre en revue humaine"),
  next_action_for_low: z.string().default("rejeter ou garder en veille"),
}).passthrough();

export const ProspectionPlaybookSchema = z.object({
  version: z.literal("v1").default("v1"),
  goal: z.string().default("Transformer une liste brute en opportunites commerciales qualifiees."),
  method: z.string().default("Qualifier, prioriser, personnaliser, valider, puis organiser la prochaine action."),
  qualification_rules: z.array(RuleSchema).default([]),
  exclusion_rules: z.array(RuleSchema).default([]),
  priority_rules: z.array(RuleSchema).default([]),
  validation_policy: z.preprocess((value) => value ?? {}, ValidationPolicySchema),
  message_strategy: z.preprocess((value) => value ?? {}, MessageStrategySchema),
  operating_rules: z.preprocess((value) => value ?? {}, OperatingRulesSchema),
}).passthrough();

export type ProspectionPlaybook = z.infer<typeof ProspectionPlaybookSchema>;

type PlaybookContext = {
  goal?: string;
  offer?: string;
  tone?: string;
  roles?: string[];
  industries?: string[];
  companySizes?: string[];
  locations?: string[];
  exclusions?: string[];
};

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,;\n|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildRules(values: string[], baseName: string, weight: number) {
  return unique(values).map((value) => ({
    name: value,
    description: `${baseName}: ${value}`,
    weight,
    keywords: [value],
  }));
}

export function buildDefaultProspectionPlaybook(context: PlaybookContext = {}): ProspectionPlaybook {
  const roles = unique(context.roles ?? []);
  const industries = unique(context.industries ?? []);
  const companySizes = unique(context.companySizes ?? []);
  const locations = unique(context.locations ?? []);
  const exclusions = unique(context.exclusions ?? []);
  const goal = pickString(
    context.goal,
    context.offer,
    "Transformer une liste brute en opportunites commerciales qualifiees."
  );

  return ProspectionPlaybookSchema.parse({
    version: "v1",
    goal,
    method: "Importer une liste brute, appliquer le playbook commercial, prioriser les meilleurs comptes, preparer le message et garder une validation humaine sur les cas limites.",
    qualification_rules: [
      {
        name: "decision_maker",
        description: "Le prospect doit pouvoir decider ou influencer l'achat.",
        weight: 30,
        keywords: roles,
      },
      {
        name: "company_fit",
        description: "La societe doit correspondre aux secteurs, tailles et zones cibles.",
        weight: 30,
        keywords: [...industries, ...companySizes, ...locations],
      },
      {
        name: "business_need",
        description: "Prioriser les structures avec un process repetitif, commercial ou operationnel, qui peut etre automatise.",
        weight: 25,
        keywords: ["process", "operation", "prospection", "crm", "recrutement", "support", "automatisation"],
      },
    ],
    exclusion_rules: [
      ...buildRules(exclusions, "Exclusion explicite", 50),
      {
        name: "low_authority",
        description: "Exclure les profils sans pouvoir de decision apparent.",
        weight: 30,
        keywords: ["stagiaire", "intern", "student", "etudiant", "alternant"],
      },
    ],
    priority_rules: [
      {
        name: "timing_signal",
        description: "Prioriser croissance, recrutement, lancement, nouvelle offre ou forte activite.",
        weight: 20,
        keywords: ["recrute", "hiring", "lancement", "croissance", "nouvelle offre", "expansion"],
      },
      {
        name: "strong_icp_match",
        description: "Prioriser les prospects qui cumulent role cible, societe cible et contexte clair.",
        weight: 20,
        keywords: [...roles, ...industries],
      },
    ],
    validation_policy: {
      auto_accept_above: 80,
      human_review_between: [50, 79],
      reject_below: 50,
      require_human_validation: true,
    },
    message_strategy: {
      tone: context.tone || "professionnel, direct et utile",
      angle: "automatisation du process existant de la structure",
      cta: "proposer un echange court pour comprendre leur maniere d'operer",
      avoid: ["promesses vagues", "IA magique", "scraping massif", "ton trop commercial"],
    },
    operating_rules: {
      source_policy: "Importer ou ajouter des prospects, puis qualifier avant toute action.",
      dedupe_policy: "Ignorer les doublons et conserver l'historique des decisions.",
      human_review_triggers: ["score moyen", "donnees manquantes", "message peu personnalise"],
      next_action_for_high: "preparer le message et proposer validation",
      next_action_for_medium: "mettre en revue humaine",
      next_action_for_low: "rejeter ou garder en veille",
    },
  });
}

export function normalizeProspectionPlaybook(
  raw: unknown,
  context: PlaybookContext = {}
): ProspectionPlaybook {
  const defaults = buildDefaultProspectionPlaybook(context);
  const candidate = asRecord(raw);

  const merged = {
    ...defaults,
    ...candidate,
    qualification_rules: toArray(candidate.qualification_rules).length
      ? candidate.qualification_rules
      : defaults.qualification_rules,
    exclusion_rules: Array.isArray(candidate.exclusion_rules)
      ? candidate.exclusion_rules
      : defaults.exclusion_rules,
    priority_rules: Array.isArray(candidate.priority_rules)
      ? candidate.priority_rules
      : defaults.priority_rules,
    validation_policy: {
      ...defaults.validation_policy,
      ...asRecord(candidate.validation_policy),
    },
    message_strategy: {
      ...defaults.message_strategy,
      ...asRecord(candidate.message_strategy),
    },
    operating_rules: {
      ...defaults.operating_rules,
      ...asRecord(candidate.operating_rules),
    },
  };

  return ProspectionPlaybookSchema.parse(merged);
}

export function playbookPromptSummary(playbook: ProspectionPlaybook): string {
  return JSON.stringify({
    goal: playbook.goal,
    method: playbook.method,
    qualification_rules: playbook.qualification_rules,
    exclusion_rules: playbook.exclusion_rules,
    priority_rules: playbook.priority_rules,
    validation_policy: playbook.validation_policy,
    message_strategy: playbook.message_strategy,
    operating_rules: playbook.operating_rules,
  }, null, 2);
}

export function playbookRuleKeywords(playbook: ProspectionPlaybook, key: "qualification_rules" | "exclusion_rules" | "priority_rules"): string[] {
  return unique(playbook[key].flatMap((rule) => [
    rule.name,
    rule.description,
    ...toArray(rule.keywords),
  ]));
}
