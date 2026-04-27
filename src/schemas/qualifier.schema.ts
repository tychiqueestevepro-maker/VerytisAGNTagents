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
