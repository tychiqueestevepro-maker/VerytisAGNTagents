/**
 * src/llm/generateObject.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Typed wrapper around Vercel AI SDK `generateObject`.
 * Returns a validated Zod object — no runtime surprises.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { generateObject as aiGenerateObject, type ModelMessage as CoreMessage } from "ai";
import { type ZodType, type z } from "zod";
import { type ModelId, getModel } from "./providers.js";
import { createLogger } from "../logs/logger.js";

const log = createLogger("llm:generateObject");

export interface GenerateObjectOptions<TSchema extends ZodType> {
  /** Zod schema that the LLM output must conform to */
  schema:       TSchema;
  /** System prompt */
  system:       string;
  /** User prompt or message history */
  prompt:       string | CoreMessage[];
  /** Override the default model */
  model?:       ModelId;
  /** Max retries on schema validation failure */
  maxRetries?:  number;
}

/**
 * Call an LLM and get back a fully typed, Zod-validated object.
 * Uses structured output / function-calling under the hood.
 */
export async function generateObject<TSchema extends ZodType>(
  opts: GenerateObjectOptions<TSchema>
): Promise<z.infer<TSchema>> {
  const model = getModel(opts.model ?? "gpt-4o");

  const messages: CoreMessage[] =
    typeof opts.prompt === "string"
      ? [{ role: "user", content: opts.prompt }]
      : opts.prompt;

  log.debug("generateObject called", { model: opts.model ?? "gpt-4o" });

  const result = await aiGenerateObject({
    model,
    schema:     opts.schema,
    system:     opts.system,
    messages,
    maxRetries: opts.maxRetries ?? 2,
  });

  log.debug("generateObject success", { usage: result.usage });

  return result.object as z.infer<TSchema>;
}
