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

const ExtensionOrganizationSchema = z.object({
  name:        z.string().optional(),
  description: z.string().optional(),
  mission:     z.string().optional(),
  location:    z.string().optional(),
  website:     z.string().url().optional(),
  linkedinUrl: z.string().url().optional(),
  industry:    z.string().optional(),
  companySize: z.string().optional(),
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
    firstName: z.string().min(1),
    lastName:  z.string().min(1),
    headline:  z.string().optional(),
    company:   z.string().min(1),
    position:  z.string().optional(),
    location:  z.string().optional(),
    profileLocation: z.string().optional(),
    profileUrl: z.string().url().optional(),
    email:      z.string().email().optional(),
    phone:      z.string().optional(),

    /** Data scraped after opening/clicking the LinkedIn organization page */
    organization:            ExtensionOrganizationSchema.optional(),
    organizationDescription: z.string().optional(),
    organizationMission:     z.string().optional(),
    organizationLocation:    z.string().optional(),
    organizationLinkedinUrl: z.string().url().optional(),

    /** Backward/alternate names used by extension builds */
    companyDescription: z.string().optional(),
    companyLocation:    z.string().optional(),
    companyLinkedinUrl: z.string().url().optional(),
    companyWebsite:     z.string().url().optional(),
    companySize:        z.string().optional(),
    industry:           z.string().optional(),
    rawResultText:      z.string().optional(),
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
  const location =
    data.location ??
    data.profileLocation ??
    data.companyLocation ??
    data.organizationLocation ??
    organization.location;
  const companyDescription =
    data.companyDescription ??
    data.organizationDescription ??
    data.organizationMission ??
    organization.description ??
    organization.mission;
  const companyLinkedinUrl =
    data.companyLinkedinUrl ??
    data.organizationLinkedinUrl ??
    organization.linkedinUrl;
  const websiteUrl =
    data.companyWebsite ??
    organization.website;
  const companySize =
    data.companySize ??
    organization.companySize;
  const industry =
    data.industry ??
    organization.industry;

  // Map extension fields → Prospect schema
  const prospect = ProspectSchema.safeParse({
    first_name:  data.firstName,
    last_name:   data.lastName,
    full_name:   `${data.firstName} ${data.lastName}`,
    email:       data.email,
    phone:       data.phone,
    linkedin:    data.profileUrl ?? source_url,
    title:       data.position ?? data.headline ?? "Unknown",
    company:     organization.name ?? data.company,
    industry,
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
      location,
      company_description: companyDescription,
      company_linkedin_url: companyLinkedinUrl,
      website_url: websiteUrl,
      company_size: companySize,
      industry,
    },
    extra_data: {
      imported_via: "chrome_extension",
      original_headline: data.headline,
      raw_result_text: data.rawResultText,
      organization: {
        ...organization,
        name: organization.name ?? data.company,
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
