/**
 * src/worker.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Verytis Agent Worker — Background processor for autonomous agents.
 *
 * This worker polls the database for new prospects and triggers the
 * prospecting orchestrator for each one based on client-specific flows.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getDb } from "./db/supabase.js";
import { runProspectingOrchestrator } from "./orchestrators/prospecting/prospecting.orchestrator.js";
import { createLogger } from "./logs/logger.js";
import type { ProspectingConfig } from "./orchestrators/prospecting/prospecting.orchestrator.js";

const log = createLogger("engine:worker");

const FLOW_KEY = process.env.FLOW_KEY || "prospecting";

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
 * Fetches and processes prospects in 'discovered' status
 */
async function processPendingProspects() {
  const db = getDb();

  // 1. Fetch prospects waiting for processing
  const { data: prospects, error: fetchErr } = await db
    .from("prospects")
    .select("*")
    .eq("status", "discovered")
    .limit(5); // Process in small batches

  if (fetchErr) {
    log.error("Failed to fetch pending prospects", { error: fetchErr.message });
    return;
  }

  if (!prospects || prospects.length === 0) {
    return;
  }

  log.info(`Found ${prospects.length} prospects to process`);

  for (const prospect of prospects) {
    try {
      log.info(`Processing prospect: ${prospect.decision_maker}`, { id: prospect.id });

      // 2. Fetch the active prospecting flow for this client
      const { data: flow, error: flowErr } = await db
        .from("client_flows")
        .select("*")
        .eq("client_id", prospect.client_id)
        .eq("flow_key", FLOW_KEY)
        .eq("status", "active")
        .maybeSingle();

      if (flowErr || !flow || !flow.workflow_id) {
        log.warn("No active workflow linked to flow. Skipping.", {
          clientId: prospect.client_id,
          prospectId: prospect.id,
        });
        continue;
      }

      // 3. Fetch client config for parameters (ICP, tone, etc.)
      const { data: clientConfig } = await db
        .from("client_configs")
        .select("*")
        .eq("client_id", prospect.client_id)
        .single();

      // 4. Map to ProspectingConfig with fallbacks
      const config: ProspectingConfig = {
        icp: {
          industries:       (clientConfig?.target_icp as any)?.industries || ["Tech"],
          company_sizes:    (clientConfig?.target_icp as any)?.company_sizes || ["11-50", "51-200"],
          geographies:      (clientConfig?.target_icp as any)?.geographies || ["France"],
          job_titles:       (clientConfig?.target_icp as any)?.job_titles || ["CEO", "COO", "Founder"],
          exclude_keywords: (clientConfig?.target_icp as any)?.exclude_keywords || [],
        },
        channels:      ["linkedin", "email"],
        tone:          (clientConfig?.tone as any) || "conversational",
        language:      "fr",
        brand_context: "Verytis - Agence d'automatisation IA.",
      };

      // 5. Run the Orchestrator
      const result = await runProspectingOrchestrator({
        clientId:   prospect.client_id,
        prospectId: prospect.id,
        workflowId: flow.workflow_id,
        prospect: {
          first_name: prospect.decision_maker?.split(" ")[0] || "Unknown",
          last_name:  prospect.decision_maker?.split(" ").slice(1).join(" ") || "Unknown",
          title:      prospect.role || "Unknown",
          company:    prospect.company_name || "Unknown",
          linkedin:   prospect.linkedin_url || undefined,
          client_id:  prospect.client_id,
        },
        config,
        trigger: "scheduled",
      });

      // 6. Sauvegarder les résultats dans la table prospects
      // Note: On ne récupère pas encore les données nettoyées du contexte, 
      // mais on met au moins à jour le statut et le score.
      const updateData: any = {
        status: result.status,
        updated_at: new Date().toISOString()
      };
      
      if (result.score !== null) {
        updateData.fit_score = result.score;
      }
      
      await db.from("prospects").update(updateData).eq("id", prospect.id);

      log.info("Orchestrator execution finished & prospect updated", {
        prospectId: prospect.id,
        status:     result.status,
        score:      result.score
      });

    } catch (err: any) {
      log.error("Failed to process prospect", {
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
