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
import { runHunterAgent }     from "./prospecting/hunter.agent.js";
import { runExtensionOpsAgent } from "./prospecting/extension_ops.agent.js";
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
    run:  async (ctx, _config, meta) => {
      return { qualification: await runQualifierAgent({ prospect: ctx.prospect, icp: ctx.config.icp }) };
    },
  },
  enrichment: {
    name: "enrichment",
    run:  async (ctx, _config, meta) => {
      const out = await runEnrichmentAgent({ prospect: ctx.prospect });
      return { prospect: out.prospect, enrichment: out.enrichment };
    },
  },
  copywriter: {
    name: "copywriter",
    run:  async (ctx, config, meta) => {
      const bundle = await runCopywriterAgent({
        prospect:      ctx.prospect,
        qualification: ctx.qualification,
        channels:      ctx.config.channels,
        tone:          ctx.config.tone,
        language:      ctx.config.language,
        brand_context: ctx.config.brand_context,
      }, config, meta);
      return { messageBundle: bundle };
    },
  },
  qa: {
    name: "qa",
    run:  async (ctx, config, meta) => {
      const qa = await runQAAgent(ctx.messageBundle);
      return { qaResult: qa };
    },
  },
  hunter: {
    name: "hunter",
    run:  async (ctx, config, meta) => {
      // Hunter now handles SERP discovery
      const out = await runHunterAgent({ 
        searchConfig: ctx.config?.search_config || config?.search_config 
      });
      return { discoveryResults: out.results };
    },
  },
  extension_ops: {
    name: "extension_ops",
    run:  async (ctx, _config, meta) => {
      const out = await runExtensionOpsAgent({
        raw_name:    ctx.prospect.full_name || `${ctx.prospect.first_name} ${ctx.prospect.last_name}`,
        raw_title:   ctx.prospect.title,
        raw_company: ctx.prospect.company,
        source_url:  ctx.prospect.linkedin || ctx.prospect.source_url || "",
      });
      return { prospect: { ...ctx.prospect, ...out.prospect } };
    },
  },
};
