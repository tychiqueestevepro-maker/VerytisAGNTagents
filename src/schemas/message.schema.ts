/**
 * src/schemas/message.schema.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Zod schema for an outreach message produced by the copywriter agent.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z } from "zod";

export const OutreachChannelSchema = z.enum([
  "email",
  "linkedin",
  "whatsapp",
  "sms",
]);

export type OutreachChannel = z.infer<typeof OutreachChannelSchema>;

export const MessageSchema = z.object({
  /** Channel this message is written for */
  channel: OutreachChannelSchema,

  /** Email / LinkedIn subject line (not used for WhatsApp/SMS) */
  subject: z.string().optional(),

  /** Main message body */
  body: z.string().min(10),

  /** Optional P.S. or postscript */
  ps: z.string().optional(),

  /** CTA text embedded in the message */
  cta: z.string().describe("Call to action, e.g. 'Dispo pour un appel de 15min ?'"),

  /** ISO 639-1 language code */
  language: z.string().length(2).default("fr"),

  /** Estimated reading time in seconds */
  estimated_read_time_s: z.number().int().positive().optional(),

  /** Variables injected into the message (for template traceability) */
  variables_used: z.array(z.string()).default([]),
}).strict();

export type Message = z.infer<typeof MessageSchema>;

/** A bundle of messages for the same prospect across channels */
export const MessageBundleSchema = z.object({
  prospect_ref: z.string().describe("Prospect identifier"),
  messages:     z.array(MessageSchema).min(1),
  created_at:   z.string().datetime().optional(),
}).strict();

export type MessageBundle = z.infer<typeof MessageBundleSchema>;
