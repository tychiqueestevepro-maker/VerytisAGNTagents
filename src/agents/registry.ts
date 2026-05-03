/**
 * src/agents/registry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Agent Registry — maps technical agent slugs to their TypeScript logic.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { runQualifierAgent }  from "./prospecting/qualifier.agent.js";
import { runCopywriterAgent } from "./prospecting/copywriter.agent.js";
import { runQAAgent }         from "./prospecting/qa.agent.js";
import { runSequenceAgent }    from "./prospecting/sequence.agent.js";
import type { Task }          from "../engine/taskRunner.js";
import { createLogger }      from "../logs/logger.js";

const log = createLogger("agents:registry");

/**
 * Registry of all available technical agents.
 * The keys must match the `slug` column in the `agents` table.
 */
export const AgentRegistry: Record<string, Task<any, any>> = {
  sequence: {
    name: "sequence",
    run: async (ctx, config, meta) => {
      const sequence = await runSequenceAgent({
        campaign_name:      ctx.campaign_name,
        campaign_objective: ctx.campaign_objective,
        target_description: ctx.target_description,
        target_roles:       ctx.target_roles,
        target_industries:  ctx.target_industries,
        tone:               ctx.tone,
        brand_context:      ctx.brand_context,
      }, config);
      return { sequence };
    },
  },
  qualifier: {
    name: "qualifier",
    run:  async (ctx, _config, meta) => {
      return {
        qualification: await runQualifierAgent({
          prospect:             ctx.prospect,
          icp:                  ctx.config.icp,
          campaign_context:     ctx.campaign_context,
          organization_context: ctx.organization_context,
          experience_context:   ctx.experience_context,
          raw_signals:          ctx.raw_signals,
        }),
      };
    },
  },
  // enrichment is intentionally not registered for automatic workflows.
  // The current implementation does not call verified providers; see
  // enrichment.agent.ts before re-enabling it.
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
  // hunter/SERP, extension_ops, enrichment and whatsapp_validation are
  // intentionally not registered. Imports/cleanup happen in the app/extension;
  // validation happens in-app; enrichment needs a verified provider first.
};
