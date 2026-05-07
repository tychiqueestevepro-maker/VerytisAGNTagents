/**
 * src/services/extension.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Extension Service — handles data ingested from the Chrome browser extension.
 *
 * The extension POSTs scraped LinkedIn profiles to a webhook endpoint.
 * This service validates, normalises, and queues them as prospects.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z }               from "zod";
import { createLogger }    from "../logs/logger.js";
import { ProspectSchema, type Prospect }  from "../schemas/prospect.schema.js";

const log = createLogger("service:extension");

// ─────────────────────────────────────────────────────────────────────────────
// Raw payload from the browser extension
// ─────────────────────────────────────────────────────────────────────────────

const OptionalStringSchema = z.string().nullable().optional();

const ExtensionOrganizationSchema = z.object({
  name:        OptionalStringSchema,
  description: OptionalStringSchema,
  mission:     OptionalStringSchema,
  location:    OptionalStringSchema,
  website:     OptionalStringSchema,
  linkedinUrl: OptionalStringSchema,
  linkedin_url: OptionalStringSchema,
  industry:    OptionalStringSchema,
  companySize: OptionalStringSchema,
  company_size: OptionalStringSchema,
}).passthrough();

const ExtensionExperienceSchema = z.object({
  title:     OptionalStringSchema,
  role:      OptionalStringSchema,
  company:   OptionalStringSchema,
  companyName: OptionalStringSchema,
  company_name: OptionalStringSchema,
  location:  OptionalStringSchema,
  dateRange: OptionalStringSchema,
  date_range: OptionalStringSchema,
  duration:  OptionalStringSchema,
  isCurrent: z.boolean().optional(),
  is_current: z.boolean().optional(),
}).passthrough();

const ExtensionPayloadSchema = z.object({
  /** Extension-specific version for compatibility checks */
  extension_version: z.string().optional(),
  /** The scrape source URL (e.g. LinkedIn profile URL) */
  source_url:        z.string().url(),
  /** Client ID sending this data */
  client_id:         z.string().uuid(),
  /** Raw scraped data — keys vary by extension implementation */
  raw: z.object({
    firstName: z.string().min(1).optional(),
    first_name: OptionalStringSchema,
    lastName:  z.string().min(1).optional(),
    last_name: OptionalStringSchema,
    fullName:  OptionalStringSchema,
    full_name: OptionalStringSchema,
    name:      OptionalStringSchema,
    headline:  OptionalStringSchema,
    title:     OptionalStringSchema,
    role:      OptionalStringSchema,
    roleTitle: OptionalStringSchema,
    role_title: OptionalStringSchema,
    company:   OptionalStringSchema,
    companyName: OptionalStringSchema,
    company_name: OptionalStringSchema,
    position:  OptionalStringSchema,
    location:  OptionalStringSchema,
    profileLocation: OptionalStringSchema,
    profile_location: OptionalStringSchema,
    profileUrl: OptionalStringSchema,
    profile_url: OptionalStringSchema,
    page_url:   OptionalStringSchema,
    linkedinUrl: OptionalStringSchema,
    linkedin_url: OptionalStringSchema,
    email:      OptionalStringSchema,
    phone:      OptionalStringSchema,
    currentExperience: ExtensionExperienceSchema.nullable().optional(),
    current_experience: ExtensionExperienceSchema.nullable().optional(),
    experiences: z.array(ExtensionExperienceSchema).optional(),

    /** Data scraped after opening/clicking the LinkedIn organization page */
    organization:            ExtensionOrganizationSchema.nullable().optional(),
    organizationDescription: OptionalStringSchema,
    organization_description: OptionalStringSchema,
    organizationMission:     OptionalStringSchema,
    organization_mission:    OptionalStringSchema,
    organizationLocation:    OptionalStringSchema,
    organization_location:   OptionalStringSchema,
    organizationLinkedinUrl: OptionalStringSchema,
    organization_linkedin_url: OptionalStringSchema,

    /** Backward/alternate names used by extension builds */
    companyDescription: OptionalStringSchema,
    company_description: OptionalStringSchema,
    companyLocation:    OptionalStringSchema,
    company_location:   OptionalStringSchema,
    companyLinkedinUrl: OptionalStringSchema,
    company_linkedin_url: OptionalStringSchema,
    companyWebsite:     OptionalStringSchema,
    company_website:    OptionalStringSchema,
    companySize:        OptionalStringSchema,
    company_size:       OptionalStringSchema,
    industry:           OptionalStringSchema,
    rawResultText:      OptionalStringSchema,
    raw_result_text:    OptionalStringSchema,
  }).passthrough(),
});

export type ExtensionPayload = z.infer<typeof ExtensionPayloadSchema>;
export type ExtensionRawPayload = ExtensionPayload["raw"];

export interface NormalisedExtensionProspect extends Prospect {
  decision_maker: string;
  role_title: string;
  company_name: string;
  location?: string;
  linkedin_url?: string;
  profile_url?: string;
  website_url?: string;
  company_description?: string;
  raw_data: Record<string, unknown>;
  extra_data: Record<string, unknown>;
}

type FieldCandidate = {
  value: string;
  source: string;
};

type ExperienceCandidate = {
  item: Record<string, unknown>;
  source: string;
};

function normaliseSpace(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return normaliseSpace(value);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function safeUrl(...values: unknown[]): string | undefined {
  const value = pickString(...values);
  if (!value) return undefined;

  try {
    return new URL(value).toString();
  } catch {
    return undefined;
  }
}

function safeEmail(...values: unknown[]): string | undefined {
  const value = pickString(...values);
  if (!value) return undefined;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : undefined;
}

function isLinkedInProfileUrl(value: string | undefined): boolean {
  return Boolean(value && /linkedin\.com\/(?:in|sales\/lead)\//i.test(value));
}

function splitName(value: string | undefined): { first_name?: string; last_name?: string } {
  const cleaned = normaliseSpace(value)
    .replace(/[|,].*$/g, "")
    .replace(/\([^)]*\)/g, "");
  const parts = cleaned.split(/\s+/).filter(Boolean);

  if (parts.length === 0) return {};
  if (parts.length === 1) return { first_name: parts[0], last_name: "Inconnu" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

function stripEmoji(value: string): string {
  return value.replace(/[\u{1f300}-\u{1faff}\u{2600}-\u{27bf}\ufe0f]/gu, "");
}

function stripLinkedInNoise(value: string): string {
  return normaliseSpace(stripEmoji(value)
    .replace(/\b(?:open\s+to\s+work|hiring|recrute|recrutement)\b/gi, "")
    .replace(/\b\d+(?:st|nd|rd|th|er|e)\b/gi, "")
    .replace(/\b(?:followers?|abonnés?|relations?|connections?|connexions?(?:\s+mutuelles?)?)\b/gi, "")
    .replace(/[•·]+/g, " "));
}

function looksLikeRole(value: string): boolean {
  return /\b(?:founder|co[-\s]?founder|fondateur|fondatrice|ceo|cto|coo|cfo|cmo|cro|directeur|directrice|dirigeant|responsable|manager|head|lead|sales|marketing|consultant|avocat|associ[eé]|partner|pr[eé]sident|owner|g[eé]rant|recruiter|developer|engineer|designer|freelance|student|étudiant|etudiant)\b/i
    .test(value);
}

function isOnlyLocationOrContract(value: string): boolean {
  return /^(france|paris|lyon|marseille|remote|hybrid|on-site|onsite|à distance|a distance|temps plein|full-time|part-time|freelance|self-employed|indépendant|independant)$/i
    .test(value);
}

function cleanTitle(value: unknown): string | undefined {
  const cleaned = stripLinkedInNoise(pickString(value) ?? "")
    .replace(/\s+(?:chez|at|@)\s+.+$/i, "")
    .trim();

  if (!cleaned || isOnlyLocationOrContract(cleaned)) return undefined;

  const segments = cleaned
    .split(/\s+(?:\||-|–|—)\s+|[\n\r]+/)
    .map((segment) => normaliseSpace(segment))
    .filter(Boolean);

  return segments.find((segment) => looksLikeRole(segment)) ?? segments[0] ?? cleaned;
}

function cleanCompany(value: unknown): string | undefined {
  const raw = pickString(value);
  if (!raw) return undefined;

  const firstSegment = raw.split(/\n/)[0]?.split(/[•·|]/)[0] ?? "";
  const cleaned = stripLinkedInNoise(firstSegment)
    .replace(/\b(?:temps plein|full-time|part-time|freelance|self-employed|indépendant|independant)\b/gi, "")
    .trim();

  if (!cleaned || cleaned.length < 2) return undefined;
  if (isOnlyLocationOrContract(cleaned)) return undefined;
  if (looksLikeRole(cleaned) && cleaned.split(/\s+/).length <= 3) return undefined;
  return normaliseSpace(cleaned);
}

function candidate(
  value: unknown,
  source: string,
  cleaner: (value: unknown) => string | undefined
): FieldCandidate | null {
  const cleaned = cleaner(value);
  return cleaned ? { value: cleaned, source } : null;
}

function pickCandidate(candidates: Array<FieldCandidate | null>): FieldCandidate | null {
  const seen = new Set<string>();
  for (const item of candidates) {
    if (!item) continue;
    const key = item.value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    return item;
  }
  return null;
}

function parseHeadline(value: unknown): { title?: string; company?: string } {
  const headline = stripLinkedInNoise(pickString(value) ?? "");
  if (!headline) return {};

  const explicit = headline.match(/^(.+?)\s+(?:chez|at|@)\s+(.+?)(?:\s+(?:\||-|–|—)\s+.*)?$/i);
  if (explicit) {
    return {
      title: cleanTitle(explicit[1]),
      company: cleanCompany(explicit[2]),
    };
  }

  const [first, second] = headline
    .split(/\s+(?:\||-|–|—)\s+|[•·]/)
    .map((segment) => normaliseSpace(segment))
    .filter(Boolean);

  return {
    title: cleanTitle(first ?? headline),
    company: second && !looksLikeRole(second) ? cleanCompany(second) : undefined,
  };
}

function experienceCandidates(data: ExtensionRawPayload): ExperienceCandidate[] {
  const direct = [
    data.currentExperience ? { item: data.currentExperience as Record<string, unknown>, source: "raw.currentExperience" } : null,
    data.current_experience ? { item: data.current_experience as Record<string, unknown>, source: "raw.current_experience" } : null,
  ].filter((value): value is ExperienceCandidate => Boolean(value));
  const experiences = ((data.experiences ?? []) as Array<Record<string, unknown>>)
    .map((item, index) => ({ item, source: `raw.experiences[${index}]` }));
  const current = experiences.filter(({ item }) => item.isCurrent === true || item.is_current === true);

  return [...direct, ...current, ...experiences].filter((item, index, all) => (
    all.findIndex((candidateItem) => candidateItem.item === item.item) === index
  ));
}

function normalizeCompanySize(value: unknown): Prospect["company_size"] | undefined {
  const normalized = pickString(value)?.toLowerCase();
  if (!normalized) return undefined;
  if (/^1\s*-\s*10$/.test(normalized) || normalized.includes("1-10")) return "1-10";
  if (/^11\s*-\s*50$/.test(normalized) || normalized.includes("11-50")) return "11-50";
  if (/^51\s*-\s*200$/.test(normalized) || normalized.includes("51-200")) return "51-200";
  if (/^201\s*-\s*500$/.test(normalized) || normalized.includes("201-500")) return "201-500";
  if (normalized.includes("500+")) return "500+";

  const numberMatch = normalized.match(/\d+/);
  if (!numberMatch) return undefined;

  const count = Number(numberMatch[0]);
  if (!Number.isFinite(count)) return undefined;
  if (count <= 10) return "1-10";
  if (count <= 50) return "11-50";
  if (count <= 200) return "51-200";
  if (count <= 500) return "201-500";
  return "500+";
}

function extractionConfidence(role: FieldCandidate | null, company: FieldCandidate | null): number {
  const weight = (source: string) => {
    if (source.includes("currentExperience")) return 45;
    if (source.includes("organization")) return 45;
    if (source.includes("raw.")) return 35;
    if (source.includes("headline")) return 20;
    return 10;
  };

  const score = (role ? weight(role.source) : 0) + (company ? weight(company.source) : 0) + (role && company ? 10 : 0);
  return Math.min(100, score);
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses and normalises a raw extension payload into a typed Prospect.
 * Returns null if the payload fails validation.
 */
export function normaliseExtensionPayload(
  raw: unknown
): NormalisedExtensionProspect | null {
  const parsed = ExtensionPayloadSchema.safeParse(raw);

  if (!parsed.success) {
    log.warn("Extension payload validation failed", {
      issues: parsed.error.issues.map((i) => i.message),
    });
    return null;
  }

  const { raw: data, client_id, source_url } = parsed.data;
  const organization = data.organization ?? {};
  const experiences = experienceCandidates(data);
  const primaryExperience = experiences[0]?.item ?? {};
  const parsedHeadline = parseHeadline(data.headline);

  const nameParts = splitName(pickString(
    data.fullName,
    data.full_name,
    data.name,
    `${pickString(data.firstName, data.first_name) ?? ""} ${pickString(data.lastName, data.last_name) ?? ""}`
  ));
  const firstName = pickString(data.firstName, data.first_name, nameParts.first_name);
  const lastName = pickString(data.lastName, data.last_name, nameParts.last_name);

  const role = pickCandidate([
    ...experiences.map(({ item, source }) => candidate(item.title ?? item.role, `${source}.title`, cleanTitle)),
    candidate(data.position, "raw.position", cleanTitle),
    candidate(data.roleTitle, "raw.roleTitle", cleanTitle),
    candidate(data.role_title, "raw.role_title", cleanTitle),
    candidate(data.role, "raw.role", cleanTitle),
    candidate(data.title, "raw.title", cleanTitle),
    candidate(parsedHeadline.title, "raw.headline.title", cleanTitle),
    candidate(data.headline, "raw.headline", cleanTitle),
  ]);

  const company = pickCandidate([
    candidate(organization.name, "raw.organization.name", cleanCompany),
    ...experiences.map(({ item, source }) => candidate(
      item.company ?? item.companyName ?? item.company_name,
      `${source}.company`,
      cleanCompany
    )),
    candidate(data.companyName, "raw.companyName", cleanCompany),
    candidate(data.company_name, "raw.company_name", cleanCompany),
    candidate(data.company, "raw.company", cleanCompany),
    candidate(parsedHeadline.company, "raw.headline.company", cleanCompany),
  ]);

  const sourceProfileUrl = safeUrl(
    data.profileUrl,
    data.profile_url,
    data.linkedinUrl,
    data.linkedin_url,
    data.page_url
  );
  const sourceUrlAsProfile = isLinkedInProfileUrl(source_url) ? safeUrl(source_url) : undefined;
  const profileUrl = sourceProfileUrl ?? sourceUrlAsProfile;
  const location = pickString(
    data.location,
    data.profileLocation,
    data.profile_location,
    data.companyLocation,
    data.company_location,
    data.organizationLocation,
    data.organization_location,
    primaryExperience.location,
    organization.location
  );
  const companyDescription = pickString(
    data.companyDescription,
    data.company_description,
    data.organizationDescription,
    data.organization_description,
    data.organizationMission,
    data.organization_mission,
    organization.description,
    organization.mission
  );
  const companyLinkedinUrl = safeUrl(
    data.companyLinkedinUrl,
    data.company_linkedin_url,
    data.organizationLinkedinUrl,
    data.organization_linkedin_url,
    organization.linkedinUrl,
    organization.linkedin_url
  );
  const websiteUrl = safeUrl(
    data.companyWebsite,
    data.company_website,
    organization.website
  );
  const companySize = normalizeCompanySize(
    pickString(data.companySize, data.company_size, organization.companySize, organization.company_size)
  );
  const industry = pickString(data.industry, organization.industry);
  const rawResultText = pickString(data.rawResultText, data.raw_result_text);
  const extraction = {
    role_source: role?.source ?? null,
    company_source: company?.source ?? null,
    confidence_score: extractionConfidence(role, company),
  };

  // Map extension fields → Prospect schema
  const prospect = ProspectSchema.safeParse({
    first_name:  firstName,
    last_name:   lastName,
    full_name:   `${firstName ?? ""} ${lastName ?? ""}`.trim(),
    email:       safeEmail(data.email),
    phone:       pickString(data.phone),
    linkedin:    profileUrl,
    title:       role?.value ?? "Role inconnu",
    company:     company?.value ?? "Organisation inconnue",
    industry,
    company_size: companySize,
    geography:   location,
    source:      "extension",
    source_url,
    client_id,
  });

  if (!prospect.success) {
    log.warn("Prospect normalisation failed", {
      issues: prospect.error.issues.map((i) => i.message),
    });
    return null;
  }

  const normalised: NormalisedExtensionProspect = {
    ...prospect.data,
    decision_maker: `${prospect.data.first_name} ${prospect.data.last_name}`.trim(),
    role_title: prospect.data.title,
    company_name: prospect.data.company,
    location,
    linkedin_url: prospect.data.linkedin,
    profile_url: prospect.data.linkedin,
    website_url: websiteUrl,
    company_description: companyDescription,
    raw_data: {
      ...data,
      first_name: prospect.data.first_name,
      last_name: prospect.data.last_name,
      full_name: prospect.data.full_name,
      title: prospect.data.title,
      role: prospect.data.title,
      company: prospect.data.company,
      company_name: prospect.data.company,
      currentExperience: Object.keys(primaryExperience).length ? primaryExperience : undefined,
      location,
      company_description: companyDescription,
      company_linkedin_url: companyLinkedinUrl,
      website_url: websiteUrl,
      company_size: companySize,
      industry,
      extraction,
    },
    extra_data: {
      imported_via: "chrome_extension",
      original_headline: pickString(data.headline),
      raw_result_text: rawResultText,
      extraction,
      current_experience: Object.keys(primaryExperience).length ? primaryExperience : null,
      organization: {
        ...organization,
        name: company?.value ?? pickString(organization.name, data.companyName, data.company_name, data.company),
        description: companyDescription,
        location,
        linkedin_url: companyLinkedinUrl,
        website_url: websiteUrl,
        company_size: companySize,
        industry,
      },
      company_description: companyDescription,
    },
  };

  log.info("Extension payload normalised", {
    prospect: `${normalised.first_name} ${normalised.last_name}`,
    company:  normalised.company,
    role_source: extraction.role_source,
    company_source: extraction.company_source,
    extraction_confidence: extraction.confidence_score,
    has_location: Boolean(normalised.location),
    has_company_description: Boolean(normalised.company_description),
  });

  return normalised;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reply Handling
// ─────────────────────────────────────────────────────────────────────────────

const ExtensionReplyPayloadSchema = z.object({
  client_id: z.string().uuid(),
  linkedin_url: z.string().url(),
  message_content: z.string().optional(),
});

/**
 * Handles a "reply detected" event from the extension.
 * Updates the prospect status to 'replied' so the workflow runner stops.
 */
export async function handleExtensionReply(
  raw: unknown
): Promise<{ success: boolean; prospectId?: string; decision_maker?: string }> {
  const parsed = ExtensionReplyPayloadSchema.safeParse(raw);

  if (!parsed.success) {
    log.warn("Extension reply payload validation failed", {
      issues: parsed.error.issues.map((i) => i.message),
    });
    return { success: false };
  }

  const { client_id, linkedin_url, message_content } = parsed.data;
  const { getDb } = await import("../db/supabase.js");
  const db = getDb();

  // 1. Find the prospect
  const { data: prospect, error: fetchErr } = await db
    .from("prospects")
    .select("id, decision_maker, campaign_id")
    .eq("client_id", client_id)
    .eq("linkedin_url", linkedin_url)
    .maybeSingle();

  if (fetchErr || !prospect) {
    log.warn("Received reply for unknown prospect", { client_id, linkedin_url });
    return { success: false };
  }

  // 2. Mark as replied
  const { error: updateErr } = await db
    .from("prospects")
    .update({
      status: "replied",
      updated_at: new Date().toISOString(),
    })
    .eq("id", prospect.id);

  if (updateErr) {
    log.error("Failed to update prospect status on reply", {
      prospectId: prospect.id,
      error: updateErr.message,
    });
    return { success: false };
  }

  log.info("Prospect marked as replied via extension", {
    prospectId: prospect.id,
    decision_maker: prospect.decision_maker,
  });

  return {
    success: true,
    prospectId: prospect.id,
    decision_maker: prospect.decision_maker || undefined
  };
}
