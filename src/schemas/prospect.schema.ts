/**
 * src/schemas/prospect.schema.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Zod schema for a raw prospect / lead coming from any source
 * (browser extension, CSV import, webhook, etc.)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z } from "zod";

export const ProspectSchema = z.object({
  // ── Identity ───────────────────────────────────────────────────────────────
  first_name: z.string().min(1),
  last_name:  z.string().min(1),
  full_name:  z.string().optional(),

  // ── Contact ────────────────────────────────────────────────────────────────
  email:      z.string().email().optional(),
  phone:      z.string().optional(),
  linkedin:   z.string().url().optional(),
  whatsapp:   z.string().optional(),

  // ── Professional ──────────────────────────────────────────────────────────
  title:      z.string().min(1),
  company:    z.string().min(1),
  industry:   z.string().optional(),
  company_size: z
    .enum(["1-10", "11-50", "51-200", "201-500", "500+"])
    .optional(),
  geography:  z.string().optional(),

  // ── Source tracking ───────────────────────────────────────────────────────
  source:     z.enum(["linkedin", "extension", "csv", "webhook", "manual"]).default("manual"),
  source_url: z.string().url().optional(),

  // ── Tenant ────────────────────────────────────────────────────────────────
  client_id:  z.string().uuid(),
}).strict();

export type Prospect = z.infer<typeof ProspectSchema>;
