/**
 * src/services/whatsapp.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * WhatsApp Service — sends messages via WhatsApp Business API.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z }            from "zod";
import { env }          from "../config/env.js";
import { createLogger } from "../logs/logger.js";

const log = createLogger("service:whatsapp");

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

const SendMessageInputSchema = z.object({
  to:      z.string().min(1).describe("Recipient phone number (E.164 format)"),
  body:    z.string().min(1),
  /** Optional template name for pre-approved WhatsApp templates */
  template?: z.string(),
});

export type WhatsAppSendInput = z.infer<typeof SendMessageInputSchema>;

const WhatsAppResponseSchema = z.object({
  message_id: z.string(),
  status:     z.enum(["queued", "sent", "failed"]),
  error:      z.string().optional(),
});

export type WhatsAppResponse = z.infer<typeof WhatsAppResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export async function sendWhatsAppMessage(
  input: WhatsAppSendInput
): Promise<WhatsAppResponse> {
  const validated = SendMessageInputSchema.parse(input);

  if (!env.WHATSAPP_API_URL || !env.WHATSAPP_API_TOKEN) {
    log.warn("WhatsApp not configured — message skipped", { to: validated.to });
    return { message_id: "mock_" + Date.now(), status: "queued" };
  }

  log.info("Sending WhatsApp message", { to: validated.to });

  const res = await fetch(`${env.WHATSAPP_API_URL}/messages`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${env.WHATSAPP_API_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to:                validated.to,
      type:              validated.template ? "template" : "text",
      text:              validated.template ? undefined : { body: validated.body },
      template:          validated.template
        ? { name: validated.template, language: { code: "fr" } }
        : undefined,
    }),
  });

  const data = await res.json() as unknown;

  if (!res.ok) {
    const msg = typeof data === "object" && data !== null && "error" in data
      ? String((data as Record<string, unknown>)["error"])
      : `HTTP ${res.status}`;

    log.error("WhatsApp API error", { error: msg, to: validated.to });
    return { message_id: "", status: "failed", error: msg };
  }

  const parsed = WhatsAppResponseSchema.safeParse(data);
  if (!parsed.success) {
    log.warn("WhatsApp response parse error", { issues: parsed.error.issues });
    return { message_id: "unknown", status: "sent" };
  }

  log.info("WhatsApp message sent", { id: parsed.data.message_id });
  return parsed.data;
}
