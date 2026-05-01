/**
 * src/agents/prospecting/enrichment.agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Enrichment Agent — augments a prospect with additional data points.
 *
 * In production: calls Clay, Apollo, Hunter.io, or similar APIs.
 * Current policy: disabled for automatic runs because the LinkedIn extension
 * already provides the useful profile fields, and LLM inference from those same
 * fields is expensive and may hallucinate industry/company size/geography.
 *
 * Re-enable this step when enrichment is backed by verified external data from
 * Apollo, Clay, Hunter.io, LinkedIn API, or another deterministic provider.
 *
 * Input  : Partial Prospect
 * Output : Enriched Prospect (fields merged back in)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createLogger }     from "../../logs/logger.js";
import type { Prospect }    from "../../schemas/prospect.schema.js";

const log = createLogger("agent:enrichment");

export const ENRICHMENT_DISABLED_NOTE =
  "Enrichment is disabled in automatic prospecting: LinkedIn extension imports already carry the useful profile fields, and LLM-only enrichment would guess from the same data. Re-enable when backed by Apollo, Clay, Hunter.io, LinkedIn API, or another verified external data source.";

type EnrichmentResult = {
  industry: string | null;
  company_size: Prospect["company_size"] | null;
  geography: string | null;
  context_notes: string;
  confidence: number;
};

export interface EnrichmentInput {
  prospect: Prospect;
}

export interface EnrichmentOutput {
  prospect:    Prospect;
  enrichment:  EnrichmentResult;
}

export async function runEnrichmentAgent(
  input: EnrichmentInput
): Promise<EnrichmentOutput> {
  const { prospect } = input;

  log.info("Enrichment agent skipped", {
    company: prospect.company,
    reason:  ENRICHMENT_DISABLED_NOTE,
  });

  const enrichment: EnrichmentResult = {
    industry:      prospect.industry ?? null,
    company_size:  prospect.company_size ?? null,
    geography:     prospect.geography ?? null,
    context_notes: ENRICHMENT_DISABLED_NOTE,
    confidence:    0,
  };

  return { prospect, enrichment };
}
