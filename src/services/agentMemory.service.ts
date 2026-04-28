import { getDb } from "../db/supabase.js";
import { createLogger } from "../logs/logger.js";
import { randomUUID } from "crypto";

const log = createLogger("service:agentMemory");

export interface MemoryQueryOptions {
  clientId: string;
  workflowId?: string;
  prospectId?: string;
  agentId?: string;
  memoryType?: "instruction" | "preference" | "context" | "summary" | "decision" | "lesson" | "error";
  limit?: number;
}

export interface CreateMemoryOptions {
  clientId: string;
  agentId?: string;
  agentRunId?: string;
  scopeType: "client" | "workflow" | "prospect" | "company" | "conversation" | "run";
  scopeId?: string;
  memoryType: "instruction" | "preference" | "context" | "summary" | "decision" | "lesson" | "error";
  content: Record<string, unknown>;
  importance?: number;
}

export class AgentMemoryService {
  /**
   * Retrieves relevant memories for a given execution context.
   * It prioritizes retrieving client-wide memory, then optionally workflow-specific memory.
   */
  static async getContextMemories(opts: MemoryQueryOptions) {
    const db = getDb();
    let query = db.from("agent_memory").select("*").eq("client_id", opts.clientId);

    if (opts.memoryType) {
      query = query.eq("memory_type", opts.memoryType);
    }
    if (opts.agentId) {
      query = query.eq("agent_id", opts.agentId);
    }

    const orConditions: string[] = [`scope_type.eq.client`];
    
    if (opts.workflowId) {
      orConditions.push(`and(scope_type.eq.workflow,scope_id.eq.${opts.workflowId})`);
    }
    if (opts.prospectId) {
      orConditions.push(`and(scope_type.eq.prospect,scope_id.eq.${opts.prospectId})`);
    }

    query = query.or(orConditions.join(","));
    query = query.order("importance", { ascending: false });
    query = query.order("created_at", { ascending: false });
    
    query = query.limit(opts.limit ?? 10);

    const { data, error } = await query;

    if (error) {
      log.error("Failed to retrieve agent memories", { error: error.message, opts });
      return [];
    }

    return data || [];
  }

  static async addMemory(opts: CreateMemoryOptions) {
    const db = getDb();
    const memoryId = randomUUID();

    const { error } = await db.from("agent_memory").insert({
      id: memoryId,
      client_id: opts.clientId,
      agent_id: opts.agentId ?? null,
      agent_run_id: opts.agentRunId ?? null,
      scope_type: opts.scopeType,
      scope_id: opts.scopeId ?? null,
      memory_type: opts.memoryType,
      content: opts.content,
      importance: opts.importance ?? 50,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      log.error("Failed to insert agent memory", { error: error.message, opts });
      throw error;
    }

    return memoryId;
  }
}
