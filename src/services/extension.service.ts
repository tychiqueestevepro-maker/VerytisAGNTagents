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
import { ProspectSchema }  from "../schemas/prospect.schema.js";

const log = createLogger("service:extension");

// ─────────────────────────────────────────────────────────────────────────────
// Raw payload from the browser extension
// ─────────────────────────────────────────────────────────────────────────────

const ExtensionPayloadSchema = z.object({
  /** Extension-specific version for compatibility checks */
  extension_version: z.string().optional(),
  /** The scrape source URL (e.g. LinkedIn profile URL) */
  source_url:        z.string().url(),
  /** Client ID sending this data */
  client_id:         z.string().uuid(),
  /** Raw scraped data — keys vary by extension implementation */
  raw: z.object({
    firstName:   z.string().min(1),
    lastName:    z.string().min(1),
    headline:    z.string().optional(),
    company:     z.string().min(1),
    position:    z.string().optional(),
    location:    z.string().optional(),
    profileUrl:  z.string().url().optional(),
    email:       z.string().email().optional(),
    phone:       z.string().optional(),
  }),
});

export type ExtensionPayload = z.infer<typeof ExtensionPayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses and normalises a raw extension payload into a typed Prospect.
 * Returns null if the payload fails validation.
 */
export function normaliseExtensionPayload(
  raw: unknown
): z.infer<typeof ProspectSchema> | null {
  const parsed = ExtensionPayloadSchema.safeParse(raw);

  if (!parsed.success) {
    log.warn("Extension payload validation failed", {
      issues: parsed.error.issues.map((i) => i.message),
    });
    return null;
  }

  const { raw: data, client_id, source_url } = parsed.data;

  // Map extension fields → Prospect schema
  const prospect = ProspectSchema.safeParse({
    first_name:  data.firstName,
    last_name:   data.lastName,
    full_name:   `${data.firstName} ${data.lastName}`,
    email:       data.email,
    phone:       data.phone,
    linkedin:    data.profileUrl ?? source_url,
    title:       data.position ?? data.headline ?? "Unknown",
    company:     data.company,
    geography:   data.location,
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

  log.info("Extension payload normalised", {
    prospect: `${prospect.data.first_name} ${prospect.data.last_name}`,
    company:  prospect.data.company,
  });

  return prospect.data;
}
