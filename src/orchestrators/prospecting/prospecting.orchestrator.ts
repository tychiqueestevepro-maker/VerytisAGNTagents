/**
 * src/orchestrators/prospecting/prospecting.orchestrator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Prospecting Orchestrator — unique point d'entrée du pipeline de prospection.
 *
 * L'appelant (route API, job schedulé, webhook) passe :
 *   clientId, agentId (orchestrateur), prospectId, workflowId
 *
 * Le WorkflowRunner dispatche ensuite chaque step avec le bon agentId de step.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z }                from "zod";
import { runWorkflowFromDb } from "../../engine/workflowRunner.js";
import { createLogger }     from "../../logs/logger.js";
import { getDb }            from "../../db/supabase.js";
import { ProspectSchema }   from "../../schemas/prospect.schema.js";
import type { QualificationResult } from "../../schemas/qualifier.schema.js";
import type { MessageBundle }  from "../../schemas/message.schema.js";
import type { QAResult }    from "../../agents/prospecting/qa.agent.js";

const log = createLogger("orchestrator:prospecting");

// ─────────────────────────────────────────────────────────────────────────────
// Contexte partagé qui circule d'une étape à l'autre
// ─────────────────────────────────────────────────────────────────────────────

export interface ProspectingContext {
  prospect:      z.infer<typeof ProspectSchema>;
  config:        ProspectingConfig;
  campaign_context?: Record<string, unknown>;
  organization_context?: Record<string, unknown>;
  raw_signals?: string[];
  enrichment?:   Record<string, unknown>;
  qualification?: QualificationResult;
  messageBundle?: MessageBundle;
  qaResult?:     QAResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schémas d'entrée
// ─────────────────────────────────────────────────────────────────────────────

const ProspectingConfigSchema = z.object({
  icp: z.object({
    industries:       z.array(z.string()).min(1),
    company_sizes:    z.array(z.string()).min(1),
    geographies:      z.array(z.string()),
    job_titles:       z.array(z.string()).min(1),
    exclude_keywords: z.array(z.string()).default([]),
  }),
  channels:      z.array(z.enum(["email", "linkedin", "sms"])).min(1),
  tone:          z.enum(["formal", "conversational", "technical"]).default("conversational"),
  language:      z.string().length(2).default("fr"),
  brand_context: z.string().min(10),
});

export type ProspectingConfig = z.infer<typeof ProspectingConfigSchema>;

const ProspectingInputSchema = z.object({
  // ── IDs requis ──────────────────────────────────────────────────────────
  clientId:   z.string().uuid(),
  /** UUID du prospect (déjà inséré dans la table `prospects`) */
  prospectId: z.string().uuid(),
  /** UUID du workflow actif (table `workflows`) */
  workflowId: z.string().uuid(),
  // ── Données ─────────────────────────────────────────────────────────────
  prospect:   ProspectSchema,
  config:     ProspectingConfigSchema,
  trigger:    z.enum(["manual", "scheduled", "webhook", "event"]).default("manual"),
});

export type ProspectingInput = z.infer<typeof ProspectingInputSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────────────────────

export interface ProspectingOutput {
  status:        "completed" | "failed" | "disqualified";
  qualified:     boolean;
  score:         number | null;
  messageBundle: MessageBundle | null;
  qaApproved:    boolean;
  stepResults:   Array<{ step: string; runId: string; status: string }>;
  error?:        string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrateur
// ─────────────────────────────────────────────────────────────────────────────

export async function runProspectingOrchestrator(
  rawInput: unknown
): Promise<ProspectingOutput> {

  // 1. Validation
  const input = ProspectingInputSchema.parse(rawInput);

  log.info("Prospecting orchestrator started", {
    prospect:   `${input.prospect.first_name} ${input.prospect.last_name}`,
    prospectId: input.prospectId,
    clientId:   input.clientId,
  });

  // 1b. Vérifier l'activation du flow pour ce client
  const db = getDb();
  const { data: flow, error: flowErr } = await db
    .from("client_flows")
    .select("*")
    .eq("client_id", input.clientId)
    .eq("flow_key", "prospecting")
    .in("status", ["setup_required", "active", "paused"])
    .maybeSingle();

  if (flowErr || !flow) {
    log.warn("Prospecting flow not active or not found for client", {
      clientId: input.clientId,
      error:    flowErr?.message,
    });
    return {
      status:      "failed",
      qualified:    false,
      score:        null,
      messageBundle: null,
      qaApproved:   false,
      stepResults:  [],
      error:        "Prospecting flow is not active for this client",
    };
  }

  // 2. Contexte initial
  const initialCtx: ProspectingContext = {
    prospect: input.prospect,
    config:   input.config,
  };

  // 3. Lancer le workflow depuis la DB
  const result = await runWorkflowFromDb<ProspectingContext>(
    {
      clientId:   input.clientId,
      prospectId: input.prospectId,
      workflowId: input.workflowId,
    },
    initialCtx
  );

  const ctx = result.finalContext;

  // 4. Interpréter le résultat
  if (result.status === "failed") {
    return {
      status:        "failed",
      qualified:     false,
      score:         null,
      messageBundle: null,
      qaApproved:    false,
      stepResults:   result.stepResults,
      error:         result.error,
    };
  }

  const qualified    = ctx.qualification?.qualified ?? false;
  const score        = ctx.qualification?.score ?? null;
  const messageBundle = ctx.messageBundle ?? null;
  const qaApproved   = ctx.qaResult?.approved ?? false;

  log.info("Prospecting orchestrator completed", {
    qualified, score, qaApproved,
  });

  return {
    status:        qualified ? "completed" : "disqualified",
    qualified,
    score,
    messageBundle,
    qaApproved,
    stepResults:   result.stepResults,
  };
}
