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
  campaignId?: string;
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
  meta:       WorkflowRunMeta,
  action:     string,
  metadata:   Record<string, unknown>
): Promise<void> {
  await db.from("audit_logs").insert({
    client_id:   meta.clientId,
    actor_type:  "agent",
    action,
    entity_type: meta.prospectId ? "prospect" : (meta.companyId ? "company" : "task"),
    entity_id:   meta.prospectId || meta.companyId || null,
    metadata: {
      ...metadata,
      campaign_id: meta.campaignId || null,
      workflow_id: meta.workflowId || null,
    },
  });
}

function qualificationLevelFromScore(score: number): "high" | "medium" | "low" {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  return "low";
}

type PersistableQualification = {
  score: number;
  qualified: boolean;
  reasoning?: {
    icp_match?: string;
    title_relevance?: string;
    company_fit?: string;
    risk_flags?: string[];
  };
  prospect_insights?: {
    organization_mission?: string;
    organization_context?: string;
    role_context?: string;
    campaign_fit_summary?: string;
    career_context?: string;
    personalization_hooks?: string[];
    suggested_opening?: string;
  };
  matched_criteria?: string[];
  unmatched_criteria?: string[];
  recommended_action?: string;
};

function isQualificationResult(value: unknown): value is PersistableQualification {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.score === "number" && typeof candidate.qualified === "boolean";
}

function qualificationReason(qualification: PersistableQualification): string {
  const reasoning = qualification.reasoning ?? {};
  const insights = qualification.prospect_insights ?? {};
  const hooks = Array.isArray(insights.personalization_hooks)
    ? insights.personalization_hooks.filter(Boolean).slice(0, 3)
    : [];
  const parts = [
    reasoning.icp_match,
    reasoning.title_relevance,
    reasoning.company_fit,
    insights.campaign_fit_summary,
    insights.career_context && insights.career_context !== "inconnu" ? `Parcours: ${insights.career_context}` : "",
    hooks.length ? `Hooks message: ${hooks.join("; ")}` : "",
    insights.suggested_opening ? `Ouverture suggeree: ${insights.suggested_opening}` : "",
    qualification.recommended_action ? `Action recommandee: ${qualification.recommended_action}` : "",
  ].filter((part): part is string => Boolean(part));

  return parts.join(" | ").slice(0, 1000);
}

async function persistQualificationResult(
  db: Db,
  prospectId: string,
  qualification: unknown
): Promise<void> {
  if (!isQualificationResult(qualification)) return;

  const updateData: any = {
    fit_score:             qualification.score,
    qualification_status:  qualification.qualified ? "qualified" : "rejected",
    qualification_level:   qualificationLevelFromScore(qualification.score),
    qualification_reason:  qualificationReason(qualification),
    confidence_score:      qualification.score,
    status:                qualification.qualified ? "qualified" : "rejected",
    updated_at:            new Date().toISOString(),
  };

  const { error } = await db.from("prospects").update(updateData).eq("id", prospectId);

  if (error) {
    log.warn("persistQualificationResult: prospect update failed", {
      prospectId,
      error: error.message,
    });
  }
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
  await auditLog(db, meta, `task.${task.name}.started`, {
    task_id:          taskId,
    agent_slug:       step.agentSlug,
    workflow_step_id: step.workflowStepId ?? null,
    run_type:         step.runType,
    input_status:     step.inputStatus,
  });

  // ── 4. startRun → agent_run + exécution + output/error + duration ─────────
  
  // Enrich config with personalized message if available for this prospect and step
  let finalConfig = { ...step.config };
  if (meta.prospectId && step.workflowStepId) {
    try {
      const { data: prospect } = await db
        .from("prospects")
        .select("extra_data")
        .eq("id", meta.prospectId)
        .single();
        
      const personalizedSequence = prospect?.extra_data?.personalized_sequence as any;
      if (personalizedSequence && Array.isArray(personalizedSequence.steps)) {
        const personalizedStep = personalizedSequence.steps.find((s: any) => s.step_id === step.workflowStepId);
        if (personalizedStep?.personalized_message) {
          log.info("Personalized message found for this prospect and step", {
            prospectId: meta.prospectId,
            stepId: step.workflowStepId
          });
          finalConfig.personalized_message = personalizedStep.personalized_message;
        }
      }
    } catch (err) {
      log.warn("Failed to fetch personalized message for prospect", { error: err });
    }
  }

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
    (_runId) => task.run(input, finalConfig, meta)
  );

  const duration_ms = Date.now() - globalStart;

  // ── 5. updateTaskResult (successStatus | failureStatus) ──────────────────
  const finalTaskStatus = agentRunResult.status === "completed" ? "completed" : "failed";
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

  // ── 5c. Persist qualifier output on the prospect row ──────────────────────
  if (finalTaskStatus === "completed" && meta.prospectId && outputRecord.qualification) {
    await persistQualificationResult(db, meta.prospectId, outputRecord.qualification);
  }

  // ── 6. Audit : task.completed | task.failed ───────────────────────────────
  await auditLog(db, meta, `task.${task.name}.${finalTaskStatus}`, {
    task_id:        taskId,
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
