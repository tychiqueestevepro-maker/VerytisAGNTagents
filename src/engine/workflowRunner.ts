/**
 * src/engine/workflowRunner.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * WorkflowRunner — séquence les étapes d'un workflow.
 *
 * Chaque WorkflowStep fusionne :
 *   • StepDefinition  (données de l'étape, miroir de workflow_steps en DB)
 *   • task            (logique métier de l'agent, fonction TypeScript)
 *   • skip            (prédicat optionnel de court-circuit)
 *
 * Le WorkflowRunner ne sait pas ce que fait chaque agent —
 * il délègue entièrement à runTask() et transmet le WorkflowRunMeta.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  runTask,
  type WorkflowRunMeta,
  type StepDefinition,
  type Task,
  type TaskResult,
} from "./taskRunner.js";
import { createLogger }  from "../logs/logger.js";
import { getDb }         from "../db/supabase.js";
import { AgentRegistry } from "../agents/registry.js";

const log = createLogger("engine:workflowRunner");

// ─────────────────────────────────────────────────────────────────────────────
// Types & Roadmap
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ROADMAP NOTE: Server-Side Sync
 * Currently, reply detection is handled by the browser extension (Ghost Monitoring).
 * Future implementation should move this to a dedicated headless service (Server-Side)
 * to ensure 24/7 autonomous sequence halting even when the user browser is closed.
 */

/**
 * Une étape de workflow = données (StepDefinition) + logique (Task) + skip.
 * Le type générique TCtx est à la fois l'input et le conteneur de résultats
 * (les étapes enrichissent le contexte en passant).
 */
export interface WorkflowStep<TCtx> extends StepDefinition {
  /** Logique métier de l'agent pour cette étape */
  task:  Task<TCtx, Partial<TCtx>>;
  /**
   * Prédicat optionnel — retourne `true` pour ignorer cette étape.
   * Reçoit le contexte courant (après les étapes précédentes).
   */
  skip?: (ctx: TCtx) => boolean;
}

export interface WorkflowDefinition<TCtx> {
  name:  string;
  steps: WorkflowStep<TCtx>[];
}

export interface StepResultSummary {
  step:    string;
  taskId:  string;
  runId:   string;
  status:  "completed" | "skipped" | "failed";
  error?:  string;
}

export interface WorkflowResult<TCtx> {
  workflowName: string;
  status:       "completed" | "failed";
  finalContext: TCtx;
  stepResults:  StepResultSummary[];
  error?:       string;
}

// Re-export for convenience
export type { WorkflowRunMeta, StepDefinition, Task, TaskResult };

// ─────────────────────────────────────────────────────────────────────────────
// runWorkflow
// ─────────────────────────────────────────────────────────────────────────────

export async function runWorkflow<TCtx extends object>(
  meta:       WorkflowRunMeta,
  workflow:   WorkflowDefinition<TCtx>,
  initialCtx: TCtx
): Promise<WorkflowResult<TCtx>> {
  log.info(`Workflow starting: ${workflow.name}`, {
    clientId:   meta.clientId,
    prospectId: meta.prospectId,
    workflowId: meta.workflowId,
    steps:      workflow.steps.length,
  });

  let ctx = { ...initialCtx };
  const stepResults: StepResultSummary[] = [];

  for (const step of workflow.steps) {
    const stepName = step.task.name;

    // ── Stop if prospect replied ──────────────────────────────────────────
    if (meta.prospectId) {
      const db = getDb();
      const { data: prospect } = await db
        .from("prospects")
        .select("status, qualification_status")
        .eq("id", meta.prospectId)
        .single();
      
      if (prospect?.status === "replied" || prospect?.qualification_status === "replied") {
        log.info(`Stopping workflow: prospect has replied`, { prospectId: meta.prospectId });
        return {
          workflowName: workflow.name,
          status:       "completed", // It's a successful termination
          finalContext: ctx,
          stepResults,
        };
      }
    }

    // ── Skip gate ─────────────────────────────────────────────────────────
    if (step.skip?.(ctx)) {
      log.info(`Skipping step: ${stepName}`, { runType: step.runType });
      stepResults.push({ step: stepName, taskId: "", runId: "", status: "skipped" });
      continue;
    }

    // ── Exécuter la tâche ─────────────────────────────────────────────────
    // On extrait la StepDefinition (sans task ni skip) pour la passer à runTask
    const stepDef: StepDefinition = {
      agentId:         step.agentId,
      agentSlug:       step.agentSlug,
      workflowStepId:  step.workflowStepId,
      runType:         step.runType,
      inputStatus:     step.inputStatus,
      successStatus:   step.successStatus,
      failureStatus:   step.failureStatus,
      config:          step.config,
    };

    const result = await runTask<TCtx, Partial<TCtx>>(meta, stepDef, step.task, ctx);

    if (result.status === "failed") {
      stepResults.push({
        step:   stepName,
        taskId: result.taskId,
        runId:  result.runId,
        status: "failed",
        error:  result.error,
      });

      return {
        workflowName: workflow.name,
        status:       "failed",
        finalContext: ctx,
        stepResults,
        error:        `Step "${stepName}" [${step.runType}] failed: ${result.error ?? "unknown error"}`,
      };
    }

    // Fusionner l'output de l'étape dans le contexte courant
    if (result.output) {
      ctx = { ...ctx, ...result.output };
    }

    stepResults.push({
      step:   stepName,
      taskId: result.taskId,
      runId:  result.runId,
      status: "completed",
    });
  }

  log.info(`Workflow completed: ${workflow.name}`, {
    steps_run: stepResults.filter((s) => s.status !== "skipped").length,
    steps_skipped: stepResults.filter((s) => s.status === "skipped").length,
  });

  return {
    workflowName: workflow.name,
    status:       "completed",
    finalContext: ctx,
    stepResults,
  };
}
// ─────────────────────────────────────────────────────────────────────────────
// runWorkflowFromDb
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Charge un workflow depuis la DB et l'exécute étape par étape.
 * Récupère les steps actifs de `workflow_steps` join `agents`.
 */
export async function runWorkflowFromDb<TCtx extends object>(
  meta:       WorkflowRunMeta,
  initialCtx: TCtx
): Promise<WorkflowResult<TCtx>> {
  if (!meta.workflowId) {
    throw new Error("runWorkflowFromDb: workflowId is required");
  }

  const db = getDb();

  // 1. Charger le workflow
  const { data: workflow, error: wfErr } = await db
    .from("workflows")
    .select("*, campaigns(id)")
    .eq("id", meta.workflowId)
    .single();

  if (wfErr || !workflow) {
    throw new Error(`Workflow not found: ${meta.workflowId} (${wfErr?.message})`);
  }

  // Enrich meta with campaignId if available
  const campaignId = (workflow as any).campaigns?.[0]?.id;
  if (campaignId && !meta.campaignId) {
    meta.campaignId = campaignId;
  }

  // 2. Charger les steps actifs
  const { data: steps, error: stepsErr } = await db
    .from("workflow_steps")
    .select(`
      *,
      agents (*)
    `)
    .eq("workflow_id", meta.workflowId)
    .eq("is_active", true)
    .order("step_order", { ascending: true });

  if (stepsErr || !steps) {
    throw new Error(`Failed to load workflow steps: ${stepsErr?.message}`);
  }

  log.info(`Workflow from DB starting: ${(workflow as any).name}`, {
    workflowId: meta.workflowId,
    steps:      steps.length,
  });

  // 3. Mapper vers WorkflowDefinition
  const workflowDef: WorkflowDefinition<TCtx> = {
    name: (workflow as any).name,
    steps: steps.map((s: any) => {
      const agent = s.agents;
      const task = AgentRegistry[agent.slug];
      const agentInactive = agent?.is_active === false;

      if (!task) {
        log.warn(`Agent logic not found for slug: ${agent.slug}. Step will be skipped.`);
      }
      if (agentInactive) {
        log.warn(`Agent inactive for slug: ${agent.slug}. Step will be skipped.`);
      }

      return {
        agentId:         s.agent_id,
        agentSlug:       agent.slug,
        workflowStepId:  s.id,
        runType:         s.name.toLowerCase(), 
        inputStatus:     s.input_status,
        successStatus:   s.success_status,
        failureStatus:   s.failure_status,
        config:          (s.config as Record<string, unknown>) ?? {},
        task:            task || { name: "no-op", run: async () => ({}) },
        skip:            task && !agentInactive ? undefined : () => true,
      };
    }),
  };

  // 4. Exécuter
  return runWorkflow<TCtx>(meta, workflowDef, initialCtx);
}
