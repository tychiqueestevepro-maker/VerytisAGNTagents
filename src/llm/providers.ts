/**
 * src/llm/providers.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vercel AI SDK provider instances — one place to configure all LLM providers.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createOpenAI }    from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { env }             from "../config/env.js";

// ── OpenAI ────────────────────────────────────────────────────────────────────

const openaiProvider = createOpenAI({ apiKey: env.OPENAI_API_KEY });

// ── Anthropic (optional) ──────────────────────────────────────────────────────

const anthropicProvider = env.ANTHROPIC_API_KEY
  ? createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })
  : null;

// ─────────────────────────────────────────────────────────────────────────────
// Model registry
// ─────────────────────────────────────────────────────────────────────────────

export type ModelId =
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gpt-4-turbo"
  | "claude-3-5-sonnet-20241022"
  | "claude-3-haiku-20240307";

/**
 * Returns a Vercel AI SDK LanguageModel instance for the given model ID.
 * Throws if the required provider is not configured.
 */
export function getModel(modelId: ModelId = "gpt-4o") {
  if (modelId.startsWith("claude-")) {
    if (!anthropicProvider) {
      throw new Error(
        `[providers] ANTHROPIC_API_KEY is required to use model "${modelId}"`
      );
    }
    return anthropicProvider(modelId);
  }

  return openaiProvider(modelId);
}

// Convenience defaults
export const defaultModel      = () => getModel("gpt-4o");
export const fastModel         = () => getModel("gpt-4o-mini");
export const reasoningModel    = () => getModel("claude-3-5-sonnet-20241022");
