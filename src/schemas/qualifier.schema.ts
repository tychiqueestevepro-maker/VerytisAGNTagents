/**
 * src/schemas/qualifier.schema.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Zod schema for the output of the qualifier agent.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z } from "zod";

export const QualificationResultSchema = z.object({
  /** 0–100 ICP match score */
  score: z.number().int().min(0).max(100),

  /** Whether this prospect passes the minimum threshold */
  qualified: z.boolean(),

  /** Structured reasoning from the LLM */
  reasoning: z.object({
    icp_match:       z.string().describe("How well the prospect matches the ICP"),
    title_relevance: z.string().describe("How relevant the job title is"),
    company_fit:     z.string().describe("Whether the company is a good fit"),
    risk_flags:      z.array(z.string()).describe("Any disqualifying signals"),
  }),

  /** Useful business context extracted during qualification */
  prospect_insights: z.object({
    organization_mission: z.string().describe("Best-known mission or value proposition of the prospect's organization, or unknown if unavailable"),
    organization_context: z.string().describe("Useful facts about the organization and market context"),
    role_context:         z.string().describe("Why the prospect's role matters for this campaign"),
    campaign_fit_summary: z.string().describe("Short explanation of fit against the campaign target"),
    career_context:       z.string().describe("Useful facts about the prospect's tenure, recent hire signal, internal move, or relevant past experience"),
    personalization_hooks: z.array(z.string()).describe("Specific, verified hooks that can be used to personalize outreach"),
    suggested_opening:    z.string().describe("A short opening angle for outreach, based only on verified facts"),
  }),

  /** Which ICP criteria were met */
  matched_criteria: z.array(z.string()),

  /** Which ICP criteria were NOT met */
  unmatched_criteria: z.array(z.string()),

  /** Recommended next action */
  recommended_action: z.enum([
    "send_outreach",
    "enrich_first",
    "manual_review",
    "discard",
  ]),
}).strict();

export type QualificationResult = z.infer<typeof QualificationResultSchema>;

/** Minimum score to consider a prospect qualified */
export const QUALIFICATION_THRESHOLD = 65;
