/**
 * src/engine/runEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * RunEngine — primitive atomique.
 *
 * Crée UNE ligne `agent_runs`, exécute le callback fourni, puis met à jour
 * le statut, les tokens consommés et l'éventuelle erreur.
 * Chaque agent (qualifier, enrichment, copywriter, qa…) appelle `startRun`
 * pour son propre run — il n'y a PAS de run "chapeau" au niveau workflow.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { randomUUID }   from "crypto";
import { getDb }        from "../db/supabase.js";
import { createLogger } from "../logs/logger.js";

const log = createLogger("engine:runEngine");

// ─────────────────────────────────────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentRunOptions {
  clientId:       string;
  agentId:        string;
  prospectId?:    string;
  companyId?:     string;
  messageId?:     string;
  workflowId?:    string;
  workflowStepId?: string;
  /** Discriminateur lisible : "qualification", "enrichment", "copywriting", "qa" … */
  runType:        string;
  input:          Record<string, unknown>;
}

export interface AgentRunResult<TOutput> {
  runId:   string;
  status:  "completed" | "failed";
  output:  TOutput | null;
  error?:  string;
}

// ─────────────────────────────────────────────────────────────────────────────
// startRun
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enregistre un `agent_runs` row, exécute `execute(runId)`, puis finalise
 * la ligne avec le statut, duration_ms et output.
 *
 * @param opts   Métadonnées du run (IDs, type, input)
 * @param execute  Callback métier qui reçoit le runId et retourne l'output
 */
export async function startRun<TOutput>(
  opts:    AgentRunOptions,
  execute: (runId: string) => Promise<TOutput>
): Promise<AgentRunResult<TOutput>> {
  const db        = getDb();
  const runId     = randomUUID();
  const startTime = Date.now();

  log.info("Agent run starting", {
    runId,
    runType:  opts.runType,
    agentId:  opts.agentId,
    clientId: opts.clientId,
  });

  // ── 1. Insert agent_run (status = queued → running) ───────────────────────
  const { error: insertErr } = await db.from("agent_runs").insert({
    id:               runId,
    client_id:        opts.clientId,
    agent_id:         opts.agentId,
    prospect_id:      opts.prospectId   ?? null,
    company_id:       opts.companyId    ?? null,
    message_id:       opts.messageId    ?? null,
    workflow_id:      opts.workflowId   ?? null,
    workflow_step_id: opts.workflowStepId ?? null,
    run_type:         opts.runType,
    input:            opts.input,
    output:           {},
    status:           "running",
    started_at:       new Date().toISOString(),
    token_input:      0,
    token_output:     0,
    cost_estimate:    0,
  });

  if (insertErr) {
    log.warn("Failed to insert agent_run row", { error: insertErr.message, runId });
  }

  // ── 2. Execute business logic ──────────────────────────────────────────────
  try {
    const output      = await execute(runId);
    const duration_ms = Date.now() - startTime;

    await db.from("agent_runs").update({
      status:       "completed",
      output:       output as Record<string, unknown>,
      completed_at: new Date().toISOString(),
      duration_ms,
    }).eq("id", runId);

    log.info("Agent run completed", { runId, duration_ms });

    return { runId, status: "completed", output };

  } catch (err: unknown) {
    const duration_ms   = Date.now() - startTime;
    const error_message = err instanceof Error ? err.message : String(err);

    await db.from("agent_runs").update({
      status:        "failed",
      error_message,
      completed_at:  new Date().toISOString(),
      duration_ms,
    }).eq("id", runId);

    log.error("Agent run failed", { runId, error: error_message, duration_ms });

    return { runId, status: "failed", output: null, error: error_message };
  }
}
