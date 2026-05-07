/**
 * src/config/env.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all environment variables.
 * Validated with Zod at startup — the process exits immediately if any
 * required variable is missing or malformed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z } from "zod";
import "dotenv/config";

const OptionalSecretSchema = z.preprocess(
  (value) => value === "" ? undefined : value,
  z.string().min(1).optional()
);

const EnvSchema = z.object({
  // ── Supabase ───────────────────────────────────────────────────────────────
  SUPABASE_URL:              z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // ── LLM providers ─────────────────────────────────────────────────────────
  OPENAI_API_KEY:   z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  // ── Services ───────────────────────────────────────────────────────────────
  WHATSAPP_API_URL:   z.string().url().optional(),
  WHATSAPP_API_TOKEN: z.string().min(1).optional(),
  SERPAPI_API_KEY:    OptionalSecretSchema,
  SERP_API_KEY:       OptionalSecretSchema,
  SERP_RECENCY_MONTHS: z.coerce.number().int().min(1).max(12).default(3),
  SERP_RESULTS_PER_QUERY: z.coerce.number().int().min(1).max(10).default(5),
  SERP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(5500),

  // ── LinkedIn cloud runner ─────────────────────────────────────────────────
  LINKEDIN_SESSION_SECRET: z.string().min(16).optional(),
  LINKEDIN_RUNNER_DAILY_LIMIT: z.coerce.number().int().min(1).default(30),
  LINKEDIN_RUNNER_DELAY_OPTIONS_MINUTES: z.string().default("5,10,15"),
  LINKEDIN_RUNNER_POLL_MS: z.coerce.number().int().min(5000).default(30000),
  LINKEDIN_RUNNER_HEADLESS: z.enum(["true", "false"]).default("true"),

  // ── Agent UUIDs (depuis la table `agents` après seed) ─────────────────────
  AGENT_ID_ENRICHMENT: z.string().uuid().optional(),
  AGENT_ID_QUALIFIER:  z.string().uuid().optional(),
  AGENT_ID_COPYWRITER: z.string().uuid().optional(),
  AGENT_ID_QA:         z.string().uuid().optional(),

  // ── Workflow step UUIDs (depuis la table `workflow_steps` après seed) ──────
  STEP_ID_ENRICHMENT: z.string().uuid().optional(),
  STEP_ID_QUALIFIER:  z.string().uuid().optional(),
  STEP_ID_COPYWRITER: z.string().uuid().optional(),
  STEP_ID_QA:         z.string().uuid().optional(),

  // ── Runtime ────────────────────────────────────────────────────────────────
  NODE_ENV:  z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`[Config] Invalid environment variables:\n${issues}`);
  }

  return result.data;
}

export const env = parseEnv();
