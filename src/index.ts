/**
 * src/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Public API — single entry point for the agents-engine package.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Engine primitives ────────────────────────────────────────────────────────
export { startRun }            from "./engine/runEngine.js";
export { runWorkflow, runWorkflowFromDb } from "./engine/workflowRunner.js";
export { runTask }             from "./engine/taskRunner.js";

// ── Orchestrators ────────────────────────────────────────────────────────────
export { runProspectingOrchestrator } from "./orchestrators/prospecting/prospecting.orchestrator.js";

// ── Schemas ──────────────────────────────────────────────────────────────────
export { ProspectSchema }                                        from "./schemas/prospect.schema.js";
export { QualificationResultSchema, QUALIFICATION_THRESHOLD }   from "./schemas/qualifier.schema.js";
export { MessageSchema, MessageBundleSchema, OutreachChannelSchema } from "./schemas/message.schema.js";

// ── Services ─────────────────────────────────────────────────────────────────
export { normaliseExtensionPayload } from "./services/extension.service.js";
export { qualifyProspect }            from "./services/prospectQualification.service.js";
export { preScoreProspect }           from "./services/prospectScoring.service.js";
export { buildDefaultProspectionPlaybook, normalizeProspectionPlaybook } from "./services/prospectingPlaybook.service.js";
export { processOneLinkedInCloudAction, startLinkedInCloudRunner } from "./services/linkedinCloudRunner.service.js";

// ── Infrastructure ───────────────────────────────────────────────────────────
export { createLogger }                                          from "./logs/logger.js";
export { getDb }                                                 from "./db/supabase.js";
export { getModel, defaultModel, fastModel, reasoningModel }    from "./llm/providers.js";
export { generateObject }                                        from "./llm/generateObject.js";

// ── Types ────────────────────────────────────────────────────────────────────
// Engine
export type { AgentRunOptions, AgentRunResult }                  from "./engine/runEngine.js";
export type { Task, TaskResult }                                 from "./engine/taskRunner.js";
export type { WorkflowRunMeta, WorkflowStep, WorkflowDefinition, WorkflowResult } from "./engine/workflowRunner.js";

// Orchestrators
export type { ProspectingInput, ProspectingOutput, ProspectingContext, ProspectingConfig } from "./orchestrators/prospecting/prospecting.orchestrator.js";

// Schemas
export type { Prospect }                                         from "./schemas/prospect.schema.js";
export type { QualificationResult }                              from "./schemas/qualifier.schema.js";
export type { Message, MessageBundle, OutreachChannel }          from "./schemas/message.schema.js";

// Agents
export type { QAResult }                                         from "./agents/prospecting/qa.agent.js";
export type { CopywriterInput }                                  from "./agents/prospecting/copywriter.agent.js";
export type { QualifierInput }                                   from "./agents/prospecting/qualifier.agent.js";
export type { EnrichmentInput, EnrichmentOutput }                from "./agents/prospecting/enrichment.agent.js";
export type { QualifyProspectInput, QualifyProspectOutput }      from "./services/prospectQualification.service.js";
export type { PreScoreResult, PreScoreLevel }                    from "./services/prospectScoring.service.js";
export type { ProspectionPlaybook }                              from "./services/prospectingPlaybook.service.js";
export type { ExtensionPayload, ExtensionRawPayload, NormalisedExtensionProspect } from "./services/extension.service.js";
