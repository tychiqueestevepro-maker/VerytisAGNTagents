/**
 * src/worker.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Verytis Agent Worker — Background processor for autonomous agents.
 *
 * This worker polls the database for new prospects and runs the cheap
 * campaign-based pre-score. LLM qualification stays behind an explicit user
 * click in the app.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getDb } from "./db/supabase.js";
import { createLogger } from "./logs/logger.js";
import { preScoreProspect } from "./services/prospectScoring.service.js";

const log = createLogger("engine:worker");

const POLL_INTERVAL_MS = 10000; // 10 seconds

/**
 * Main worker loop
 */
export async function startWorker() {
  log.info("Agent Worker started. Polling for tasks...");

  while (true) {
    try {
      await processPendingProspects();
    } catch (error: any) {
      log.error("Worker loop encountered an error", { error: error.message });
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

/**
 * Fetches and pre-scores collected prospects without using the LLM.
 */
async function processPendingProspects() {
  const db = getDb();

  // 1. Fetch prospects waiting for cheap pre-score.
  const { data: prospects, error: fetchErr } = await db
    .from("prospects")
    .select("*")
    .eq("status", "discovered")
    .or("qualification_status.is.null,qualification_status.eq.collected")
    .limit(5); // Process in small batches

  if (fetchErr) {
    log.error("Failed to fetch pending prospects", { error: fetchErr.message });
    return;
  }

  if (!prospects || prospects.length === 0) {
    return;
  }

  log.info(`Found ${prospects.length} prospects to pre-score`);

  for (const prospect of prospects) {
    try {
      log.info(`Pre-scoring prospect: ${prospect.decision_maker}`, { id: prospect.id });

      const { data: campaign, error: campaignErr } = prospect.campaign_id
        ? await db
            .from("campaigns")
            .select("*")
            .eq("id", prospect.campaign_id)
            .maybeSingle()
        : { data: null, error: null };

      if (campaignErr) {
        log.warn("Unable to fetch campaign for pre-score. Falling back to available prospect data.", {
          prospectId: prospect.id,
          campaignId: prospect.campaign_id,
          error: campaignErr.message,
        });
      }

      const result = preScoreProspect(prospect, campaign);

      const updateData: any = {
        fit_score: result.score,
        pre_score: result.score,
        pre_score_level: result.level,
        qualification_status: "pre_scored",
        full_name: prospect.full_name || prospect.decision_maker,
        role_title: prospect.role_title || prospect.role,
        profile_url: prospect.profile_url || prospect.linkedin_url,
        website_url: prospect.website_url || prospect.website,
        raw_data: prospect.raw_data && Object.keys(prospect.raw_data).length > 0 ? prospect.raw_data : prospect.extra_data || {},
        updated_at: new Date().toISOString(),
      };

      await db.from("prospects").update(updateData).eq("id", prospect.id);

      log.info("Prospect pre-scored without LLM", {
        prospectId: prospect.id,
        preScore:   result.score,
        level:      result.level,
      });

    } catch (err: any) {
      log.error("Failed to pre-score prospect", {
        prospectId: prospect.id,
        error:      err.message,
      });
    }
  }
}

// Auto-start if run directly
if (import.meta.url.endsWith("worker.ts") || import.meta.url.endsWith("worker.js")) {
  startWorker().catch(err => {
    console.error("Worker failed to start:", err);
    process.exit(1);
  });
}
