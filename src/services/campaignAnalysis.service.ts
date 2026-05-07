/**
 * src/services/campaignAnalysis.service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Campaign Analysis Service — orchestrates website scraping and AI analysis
 * to generate a campaign-specific playbook.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { scrapeWebsite } from "./scraper.service.js";
import { runAnalystAgent } from "../agents/prospecting/analyst.agent.js";
import { createLogger } from "../logs/logger.js";
import { getDb } from "../db/supabase.js";
import type { ProspectionPlaybook } from "./prospectingPlaybook.service.js";

const log = createLogger("service:campaignAnalysis");

export interface AnalysisResult {
  playbook: ProspectionPlaybook;
  scraped_data: {
    title: string;
    url: string;
  };
}

/**
 * Analyzes a website and generates a playbook for a campaign.
 * Can optionally persist it to a campaign in the DB.
 */
export async function analyzeCampaignWebsite(
  url: string,
  campaignId?: string
): Promise<AnalysisResult> {
  log.info("Starting campaign website analysis", { url, campaignId });

  // 1. Scrape the website
  const scrape = await scrapeWebsite(url);
  if (scrape.status === "error") {
    throw new Error(`Failed to scrape website: ${scrape.error}`);
  }

  // 2. Run AI analysis
  const playbook = await runAnalystAgent({
    website_url: scrape.url,
    website_title: scrape.title,
    website_content: scrape.content,
  });

  // 3. Persist to DB if campaignId is provided
  if (campaignId) {
    const db = getDb();
    
    // Load current campaign config
    const { data: campaign, error: loadErr } = await db
      .from("campaigns")
      .select("config")
      .eq("id", campaignId)
      .single();

    if (loadErr || !campaign) {
      log.error("Failed to load campaign for persistence", { campaignId, error: loadErr?.message });
    } else {
      const currentConfig = (campaign.config as Record<string, unknown>) || {};
      
      // Update config with the new playbook
      const updatedConfig = {
        ...currentConfig,
        prospection_playbook: playbook,
      };

      const { error: updateErr } = await db
        .from("campaigns")
        .update({ config: updatedConfig })
        .eq("id", campaignId);

      if (updateErr) {
        log.error("Failed to update campaign with playbook", { campaignId, error: updateErr.message });
      } else {
        log.info("Campaign playbook updated successfully", { campaignId });
      }
    }
  }

  return {
    playbook,
    scraped_data: {
      title: scrape.title,
      url: scrape.url,
    }
  };
}
