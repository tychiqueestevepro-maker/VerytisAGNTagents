/**
 * src/db/supabase.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Typed Supabase client — singleton, uses the service-role key so agents
 * can read/write across all tenant data server-side.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { createLogger } from "../logs/logger.js";

const log = createLogger("db:supabase");

// ─────────────────────────────────────────────────────────────────────────────
// Database type definition (aligned with reference schema)
// ─────────────────────────────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string;
          name: string;
          company_name: string | null;
          industry: string | null;
          website: string | null;
          main_contact_name: string | null;
          main_contact_email: string | null;
          status: "active" | "inactive" | "paused" | "archived";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          company_name?: string | null;
          industry?: string | null;
          website?: string | null;
          main_contact_name?: string | null;
          main_contact_email?: string | null;
          status?: "active" | "inactive" | "paused" | "archived";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["clients"]["Row"]>;
        Relationships: [];
      };
      client_configs: {
        Row: {
          id: string;
          client_id: string;
          target_icp: Record<string, unknown>;
          excluded_sectors: string[];
          min_fit_score: number;
          linkedin_required: boolean;
          required_fields: string[];
          tone: string | null;
          offer_type: string | null;
          message_style: string | null;
          crm_mapping: Record<string, unknown>;
          agent_rules: Record<string, unknown>;
          extra_config: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          target_icp?: Record<string, unknown>;
          excluded_sectors?: string[];
          min_fit_score?: number;
          linkedin_required?: boolean;
          required_fields?: string[];
          tone?: string | null;
          offer_type?: string | null;
          message_style?: string | null;
          crm_mapping?: Record<string, unknown>;
          agent_rules?: Record<string, unknown>;
          extra_config?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["client_configs"]["Row"]>;
        Relationships: [];
      };
      client_flows: {
        Row: {
          id: string;
          client_id: string;
          workflow_id: string | null;
          flow_key: string;
          status: "setup_required" | "active" | "paused" | "archived";
          config: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          workflow_id?: string | null;
          flow_key: string;
          status?: "setup_required" | "active" | "paused" | "archived";
          config?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["client_flows"]["Row"]>;
        Relationships: [];
      };
      workflows: {
        Row: {
          id: string;
          client_id: string;
          name: string;
          workflow_type: "prospecting" | "enrichment" | "messaging" | "validation" | "extension" | "custom";
          status: "active" | "paused" | "archived";
          description: string | null;
          config: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          name: string;
          workflow_type?: "prospecting" | "enrichment" | "messaging" | "validation" | "extension" | "custom";
          status?: "active" | "paused" | "archived";
          description?: string | null;
          config?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["workflows"]["Row"]>;
        Relationships: [];
      };
      workflow_steps: {
        Row: {
          id: string;
          workflow_id: string;
          agent_id: string;
          step_order: number;
          name: string;
          description: string | null;
          input_status: string;
          success_status: string;
          failure_status: string;
          is_active: boolean;
          retry_limit: number;
          timeout_seconds: number | null;
          config: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workflow_id: string;
          agent_id: string;
          step_order: number;
          name: string;
          description?: string | null;
          input_status: string;
          success_status: string;
          failure_status: string;
          is_active?: boolean;
          retry_limit?: number;
          timeout_seconds?: number | null;
          config?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["workflow_steps"]["Row"]>;
        Relationships: [];
      };
      agents: {
        Row: {
          id: string;
          name: string;
          slug: "orchestrator" | "hunter" | "qualifier" | "enrichment" | "copywriter" | "qa" | "whatsapp_validation" | "extension_ops";
          role: string;
          description: string | null;
          system_prompt: string | null;
          model_provider: string | null;
          model_name: string | null;
          temperature: number;
          is_active: boolean;
          default_config: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: "orchestrator" | "hunter" | "qualifier" | "enrichment" | "copywriter" | "qa" | "whatsapp_validation" | "extension_ops";
          role: string;
          description?: string | null;
          system_prompt?: string | null;
          model_provider?: string | null;
          model_name?: string | null;
          temperature?: number;
          is_active?: boolean;
          default_config?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["agents"]["Row"]>;
        Relationships: [];
      };
      prospects: {
        Row: {
          id: string;
          client_id: string;
          company_id: string | null;
          company_name: string | null;
          website: string | null;
          linkedin_url: string | null;
          decision_maker: string | null;
          role: string | null;
          email: string | null;
          phone: string | null;
          location: string | null;
          fit_score: number | null;
          priority: "low" | "medium" | "high" | "urgent";
          status: string;
          source: string | null;
          source_url: string | null;
          qualification_reason: string | null;
          recommended_offer: string | null;
          confidence_score: number | null;
          extra_data: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          company_id?: string | null;
          company_name?: string | null;
          website?: string | null;
          linkedin_url?: string | null;
          decision_maker?: string | null;
          role?: string | null;
          email?: string | null;
          phone?: string | null;
          location?: string | null;
          fit_score?: number | null;
          priority?: "low" | "medium" | "high" | "urgent";
          status?: string;
          source?: string | null;
          source_url?: string | null;
          qualification_reason?: string | null;
          recommended_offer?: string | null;
          confidence_score?: number | null;
          extra_data?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["prospects"]["Row"]>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          client_id: string;
          prospect_id: string;
          channel: "email" | "linkedin" | "whatsapp" | "phone" | "crm" | "other";
          message_type: "outreach" | "follow_up" | "reply" | "validation" | "internal_note";
          subject: string | null;
          body: string;
          angle: string | null;
          tone: string | null;
          cta: string | null;
          status: "draft" | "qa_pending" | "qa_rejected" | "ready_for_validation" | "approved" | "rejected" | "ready_to_send" | "sent" | "replied";
          version: number;
          generated_by_agent_run_id: string | null;
          approved_at: string | null;
          sent_at: string | null;
          extra_data: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          prospect_id: string;
          channel: "email" | "linkedin" | "whatsapp" | "phone" | "crm" | "other";
          message_type?: "outreach" | "follow_up" | "reply" | "validation" | "internal_note";
          subject?: string | null;
          body: string;
          angle?: string | null;
          tone?: string | null;
          cta?: string | null;
          status?: "draft" | "qa_pending" | "qa_rejected" | "ready_for_validation" | "approved" | "rejected" | "ready_to_send" | "sent" | "replied";
          version?: number;
          generated_by_agent_run_id?: string | null;
          approved_at?: string | null;
          sent_at?: string | null;
          extra_data?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Row"]>;
        Relationships: [];
      };
      agent_runs: {
        Row: {
          id: string;
          client_id: string;
          agent_id: string;
          prospect_id: string | null;
          company_id: string | null;
          message_id: string | null;
          run_type: string;
          input: Record<string, unknown>;
          output: Record<string, unknown>;
          status: "queued" | "running" | "completed" | "failed" | "cancelled";
          error_message: string | null;
          started_at: string | null;
          completed_at: string | null;
          duration_ms: number | null;
          token_input: number;
          token_output: number;
          cost_estimate: number;
          created_at: string;
          workflow_id: string | null;
          workflow_step_id: string | null;
        };
        Insert: {
          id?: string;
          client_id: string;
          agent_id: string;
          prospect_id?: string | null;
          company_id?: string | null;
          message_id?: string | null;
          run_type: string;
          input?: Record<string, unknown>;
          output?: Record<string, unknown>;
          status?: "queued" | "running" | "completed" | "failed" | "cancelled";
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          duration_ms?: number | null;
          token_input?: number;
          token_output?: number;
          cost_estimate?: number;
          created_at?: string;
          workflow_id?: string | null;
          workflow_step_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["agent_runs"]["Row"]>;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          client_id: string;
          prospect_id: string | null;
          company_id: string | null;
          message_id: string | null;
          assigned_agent_id: string | null;
          task_type: string;
          status: "pending" | "running" | "completed" | "failed" | "cancelled";
          priority: "low" | "medium" | "high" | "urgent";
          payload: Record<string, unknown>;
          result: Record<string, unknown>;
          scheduled_at: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
          workflow_id: string | null;
          workflow_step_id: string | null;
        };
        Insert: {
          id?: string;
          client_id: string;
          prospect_id?: string | null;
          company_id?: string | null;
          message_id?: string | null;
          assigned_agent_id?: string | null;
          task_type: string;
          status?: "pending" | "running" | "completed" | "failed" | "cancelled";
          priority?: "low" | "medium" | "high" | "urgent";
          payload?: Record<string, unknown>;
          result?: Record<string, unknown>;
          scheduled_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          workflow_id?: string | null;
          workflow_step_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Row"]>;
        Relationships: [];
      };
      agent_events: {
        Row: {
          id: string;
          client_id: string;
          agent_run_id: string;
          agent_id: string | null;
          slug: string | null;
          event_type: "started" | "thought" | "decision" | "tool_call" | "tool_result" | "status_change" | "validation_requested" | "error" | "completed";
          title: string | null;
          payload: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          agent_run_id: string;
          agent_id?: string | null;
          slug?: string | null;
          event_type: "started" | "thought" | "decision" | "tool_call" | "tool_result" | "status_change" | "validation_requested" | "error" | "completed";
          title?: string | null;
          payload?: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["agent_events"]["Row"]>;
        Relationships: [];
      };
      agent_memory: {
        Row: {
          id: string;
          client_id: string;
          agent_id: string | null;
          agent_run_id: string | null;
          scope_type: "client" | "workflow" | "prospect" | "company" | "conversation" | "run";
          scope_id: string | null;
          memory_type: "instruction" | "preference" | "context" | "summary" | "decision" | "lesson" | "error";
          content: Record<string, unknown>;
          importance: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          agent_id?: string | null;
          agent_run_id?: string | null;
          scope_type: "client" | "workflow" | "prospect" | "company" | "conversation" | "run";
          scope_id?: string | null;
          memory_type: "instruction" | "preference" | "context" | "summary" | "decision" | "lesson" | "error";
          content?: Record<string, unknown>;
          importance?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["agent_memory"]["Row"]>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          client_id: string | null;
          actor_type: "user" | "agent" | "system" | "integration";
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          before_data: Record<string, unknown> | null;
          after_data: Record<string, unknown> | null;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id?: string | null;
          actor_type: "user" | "agent" | "system" | "integration";
          actor_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          before_data?: Record<string, unknown> | null;
          after_data?: Record<string, unknown> | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

let _client: SupabaseClient<Database> | null = null;

export function getDb(): SupabaseClient<Database> {
  if (!_client) {
    log.debug("Initialising Supabase client");
    _client = createClient<Database>(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
  }
  return _client;
}

export type Db = SupabaseClient<Database>;
