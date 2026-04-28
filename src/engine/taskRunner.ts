/**
 * src/engine/taskRunner.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TaskRunner — exécute une tâche d'agent selon le protocole exact :
 *
 *   createTask()         → INSERT tasks  (status = pending)
 *   markTaskRunning()    → UPDATE tasks  (status = running, started_at = now)
 *   audit task.started
 *   startRun()           → agent_runs + exécution + output/error + duration
 *   updateTaskResult()   → UPDATE tasks  (result + successStatus | failureStatus)
 *   audit task.completed | task.failed
 *
 * startRun() ne prend aucune décision de workflow — il logue et exécute.
 * La décision (succès / échec / statut prospect) appartient au taskRunner.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { randomUUID }   from "crypto";
import { getDb }        from "../db/supabase.js";
import { startRun }     from "./runEngine.js";
import { createLogger } from "../logs/logger.js";
import type { Db }      from "../db/supabase.js";

const log = createLogger("engine:taskRunner");

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Métadonnées partagées par le WorkflowRunner à travers toutes les tâches */
export interface WorkflowRunMeta {
  clientId:    string;
  prospectId?: string;
  companyId?:  string;
  workflowId?: string;
}

/**
 * Définition d'une étape — miroir exact des colonnes `workflow_steps` en DB.
 * Ces valeurs sont DÉCLARATIVES : elles décrivent ce que fait l'étape,
 * pas comment elle le fait (ça, c'est le rôle de Task.run).
 */
export interface StepDefinition {
  /** UUID de l'agent responsable (table `agents`) */
  agentId:         string;
  /** Slug lisible de l'agent (ex: "qualifier") — pour les logs et audit */
  agentSlug:       string;
  /** UUID de la ligne `workflow_steps` */
  workflowStepId?: string;
  /** Label stocké dans `agent_runs.run_type` (ex: "qualification") */
  runType:         string;
  /** Statut attendu en entrée (ex: "discovered") */
  inputStatus:     string;
  /** Statut appliqué au prospect si succès (ex: "qualified") */
  successStatus:   string;
  /** Statut appliqué au prospect si échec (ex: "rejected") */
  failureStatus:   string;
  /** Config spécifique à l'étape (mirrors workflow_steps.config) */
  config:          Record<string, unknown>;
}

/** La logique métier pure de l'agent */
export interface Task<TInput, TOutput> {
  name: string;
  run:  (input: TInput, config: Record<string, unknown>, meta: WorkflowRunMeta) => Promise<TOutput>;
}

export interface TaskResult<TOutput> {
  taskId:      string;
  runId:       string;
  taskName:    string;
  status:      "completed" | "failed";
  output?:     TOutput;
  error?:      string;
  duration_ms: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internes
// ─────────────────────────────────────────────────────────────────────────────

async function createTask(
  db:   Db,
  meta: WorkflowRunMeta,
  step: StepDefinition,
  input: Record<string, unknown>
): Promise<string> {
  const taskId = randomUUID();

  const { error } = await db.from("tasks").insert({
    id:               taskId,
    client_id:        meta.clientId,
    prospect_id:      meta.prospectId   ?? null,
    company_id:       meta.companyId    ?? null,
    workflow_id:      meta.workflowId   ?? null,
    workflow_step_id: step.workflowStepId ?? null,
    assigned_agent_id: null,  // résolu après seed si besoin
    task_type:        step.runType,
    status:           "pending",          // ← toujours pending à la création
    priority:         "medium",
    payload:          input,
    result:           {},
  });

  if (error) {
    log.warn("createTask: insert failed", { error: error.message });
  }

  return taskId;
}

async function markTaskRunning(db: Db, taskId: string): Promise<void> {
  const { error } = await db.from("tasks").update({
    status:     "running",
    started_at: new Date().toISOString(),
  }).eq("id", taskId);

  if (error) {
    log.warn("markTaskRunning: update failed", { error: error.message, taskId });
  }
}

async function updateTaskResult(
  db:     Db,
  taskId: string,
  status: "completed" | "failed",
  result: Record<string, unknown>
): Promise<void> {
  const { error } = await db.from("tasks").update({
    status,
    result,
    completed_at: new Date().toISOString(),
  }).eq("id", taskId);

  if (error) {
    log.warn("updateTaskResult: update failed", { error: error.message, taskId });
  }
}

async function auditLog(
  db:         Db,
  clientId:   string,
  action:     string,
  entityId:   string,
  metadata:   Record<string, unknown>
): Promise<void> {
  await db.from("audit_logs").insert({
    client_id:   clientId,
    actor_type:  "agent",
    action,
    entity_type: "task",
    entity_id:   entityId,
    metadata,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// runTask — point d'entrée public
// ─────────────────────────────────────────────────────────────────────────────

export async function runTask<TInput, TOutput>(
  meta: WorkflowRunMeta,
  step: StepDefinition,
  task: Task<TInput, TOutput>,
  input: TInput
): Promise<TaskResult<TOutput>> {
  const db          = getDb();
  const globalStart = Date.now();

  log.info(`Task starting: ${task.name}`, {
    agent:    step.agentSlug,
    runType:  step.runType,
    clientId: meta.clientId,
  });

  // ── 1. createTask (status = pending) ─────────────────────────────────────
  const taskId = await createTask(db, meta, step, input as Record<string, unknown>);

  // ── 2. markTaskRunning (status = running, started_at = maintenant) ────────
  await markTaskRunning(db, taskId);

  // ── 3. Audit : task.started ───────────────────────────────────────────────
  await auditLog(db, meta.clientId, `task.${task.name}.started`, taskId, {
    agent_slug:       step.agentSlug,
    workflow_step_id: step.workflowStepId ?? null,
    run_type:         step.runType,
    input_status:     step.inputStatus,
  });

  // ── 4. startRun → agent_run + exécution + output/error + duration ─────────
  const agentRunResult = await startRun<TOutput>(
    {
      clientId:        meta.clientId,
      agentId:         step.agentId,
      prospectId:      meta.prospectId,
      companyId:       meta.companyId,
      workflowId:      meta.workflowId,
      workflowStepId:  step.workflowStepId,
      runType:         step.runType,
      input:           input as Record<string, unknown>,
    },
    (_runId) => task.run(input, step.config, meta)
  );

  const duration_ms = Date.now() - globalStart;

  // ── 5. updateTaskResult (successStatus | failureStatus) ──────────────────
  const outputRecord = (agentRunResult.output ?? {}) as Record<string, unknown>;

  await updateTaskResult(
    db,
    taskId,
    finalTaskStatus,
    outputRecord
  );

  // ── 5b. Update prospect with cleaned data if present ────────────────────────
  if (finalTaskStatus === "completed" && meta.prospectId && outputRecord.prospect) {
    const p = outputRecord.prospect as any;
    const updateData: any = {};
    if (p.first_name || p.last_name) {
      updateData.decision_maker = `${p.first_name || ""} ${p.last_name || ""}`.trim();
    }
    if (p.title) updateData.role = p.title;
    if (p.company) updateData.company_name = p.company;

    if (Object.keys(updateData).length > 0) {
      await db.from("prospects").update(updateData).eq("id", meta.prospectId);
    }
  }

  // ── 6. Audit : task.completed | task.failed ───────────────────────────────
  await auditLog(db, meta.clientId, `task.${task.name}.${finalTaskStatus}`, taskId, {
    run_id:         agentRunResult.runId,
    duration_ms,
    success_status: step.successStatus,
    failure_status: step.failureStatus,
    error:          agentRunResult.error ?? null,
  });

  if (finalTaskStatus === "failed") {
    log.error(`Task failed: ${task.name}`, { error: agentRunResult.error, duration_ms });

    return {
      taskId,
      runId:    agentRunResult.runId,
      taskName: task.name,
      status:   "failed",
      error:    agentRunResult.error,
      duration_ms,
    };
  }

  log.info(`Task completed: ${task.name}`, { duration_ms });

  return {
    taskId,
    runId:    agentRunResult.runId,
    taskName: task.name,
    status:   "completed",
    output:   agentRunResult.output ?? undefined,
    duration_ms,
  };
}
