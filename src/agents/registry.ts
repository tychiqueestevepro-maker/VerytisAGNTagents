/**
 * src/agents/registry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Agent Registry — maps technical agent slugs to their TypeScript logic.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { runQualifierAgent }  from "./prospecting/qualifier.agent.js";
import { runEnrichmentAgent } from "./prospecting/enrichment.agent.js";
import { runCopywriterAgent } from "./prospecting/copywriter.agent.js";
import { runQAAgent }         from "./prospecting/qa.agent.js";
import type { Task }          from "../engine/taskRunner.js";
import { createLogger }      from "../logs/logger.js";

const log = createLogger("agents:registry");

/**
 * Registry of all available technical agents.
 * The keys must match the `slug` column in the `agents` table.
 */
export const AgentRegistry: Record<string, Task<any, any>> = {
  qualifier: {
    name: "qualifier",
    run:  async (ctx, _config) => {
      return { qualification: await runQualifierAgent({ prospect: ctx.prospect, icp: ctx.config.icp }) };
    },
  },
  enrichment: {
    name: "enrichment",
    run:  async (ctx, _config) => {
      const out = await runEnrichmentAgent({ prospect: ctx.prospect });
      return { prospect: out.prospect, enrichment: out.enrichment };
    },
  },
  copywriter: {
    name: "copywriter",
    run:  async (ctx, config) => {
      const bundle = await runCopywriterAgent({
        prospect:      ctx.prospect,
        qualification: ctx.qualification,
        channels:      ctx.config.channels,
        tone:          ctx.config.tone,
        language:      ctx.config.language,
        brand_context: ctx.config.brand_context,
      });
      return { messageBundle: bundle };
    },
  },
  qa: {
    name: "qa",
    run:  async (ctx, config) => {
      const qa = await runQAAgent(ctx.messageBundle);
      return { qaResult: qa };
    },
  },
  // Placeholders for new agents
  hunter: {
    name: "hunter",
    run:  async (ctx, _config) => {
      log.info("Hunter agent called (mock)");
      return {};
    },
  },
  whatsapp_validation: {
    name: "whatsapp_validation",
    run:  async (ctx, _config) => {
      log.info("WhatsApp validation agent called (mock)");
      return {};
    },
  },
  extension_ops: {
    name: "extension_ops",
    run:  async (ctx, _config) => {
      log.info("Extension Ops agent called (mock)");
      return {};
    },
  },
};
