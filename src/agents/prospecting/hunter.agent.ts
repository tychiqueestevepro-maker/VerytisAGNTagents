/**
 * src/agents/prospecting/hunter.agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hunter Agent — Uses SERP (Search Engine Results Page) to find prospects
 * or missing information on the internet.
 *
 * Contrary to its name, it focuses on search-based discovery rather than
 * just email finding.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createLogger }         from "../../logs/logger.js";
import { runSerpPeopleSearch }   from "../../integrations/serp/serp.search.js";
import type { PeopleSearchConfig } from "../../integrations/serp/serp.search.js";
import type { NormalizedSerpResult } from "../../integrations/serp/serp.types.js";

const log = createLogger("agent:hunter");

export interface HunterInput {
  searchConfig: PeopleSearchConfig;
}

export interface HunterOutput {
  results: NormalizedSerpResult[];
}

/**
 * Runs the Hunter agent to discover new prospects or info via SERP.
 */
export async function runHunterAgent(
  input: HunterInput
): Promise<HunterOutput> {
  const { searchConfig } = input;

  log.info("Hunter agent (Discovery) started", { 
    industry: searchConfig.industry,
    location: searchConfig.location 
  });

  try {
    const results = await runSerpPeopleSearch(searchConfig);
    
    log.info("Hunter agent completed", { 
      results_found: results.length 
    });

    return { results };
  } catch (error: any) {
    log.error("Hunter agent failed", { error: error.message });
    throw error;
  }
}
