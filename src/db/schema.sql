-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.agent_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  prospect_id uuid,
  company_id uuid,
  message_id uuid,
  run_type text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued'::text CHECK (status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])),
  error_message text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  token_input integer NOT NULL DEFAULT 0 CHECK (token_input >= 0),
  token_output integer NOT NULL DEFAULT 0 CHECK (token_output >= 0),
  cost_estimate numeric NOT NULL DEFAULT 0 CHECK (cost_estimate >= 0::numeric),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  workflow_id uuid,
  workflow_step_id uuid,
  CONSTRAINT agent_runs_pkey PRIMARY KEY (id),
  CONSTRAINT agent_runs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT agent_runs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id),
  CONSTRAINT agent_runs_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES public.prospects(id),
  CONSTRAINT agent_runs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT agent_runs_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id),
  CONSTRAINT agent_runs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id),
  CONSTRAINT agent_runs_workflow_step_id_fkey FOREIGN KEY (workflow_step_id) REFERENCES public.workflow_steps(id)
);

CREATE TABLE public.agents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug = ANY (ARRAY['orchestrator'::text, 'hunter'::text, 'qualifier'::text, 'enrichment'::text, 'copywriter'::text, 'qa'::text, 'whatsapp_validation'::text, 'extension_ops'::text])),
  role text NOT NULL,
  description text,
  system_prompt text,
  model_provider text,
  model_name text,
  temperature numeric NOT NULL DEFAULT 0.20 CHECK (temperature >= 0::numeric AND temperature <= 2::numeric),
  is_active boolean NOT NULL DEFAULT true,
  default_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT agents_pkey PRIMARY KEY (id)
);

CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  actor_type text NOT NULL CHECK (actor_type = ANY (ARRAY['user'::text, 'agent'::text, 'system'::text, 'integration'::text])),
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT audit_logs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);

CREATE TABLE public.client_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE,
  target_icp jsonb NOT NULL DEFAULT '{}'::jsonb,
  excluded_sectors ARRAY NOT NULL DEFAULT '{}'::text[],
  min_fit_score integer NOT NULL DEFAULT 70 CHECK (min_fit_score >= 0 AND min_fit_score <= 100),
  linkedin_required boolean NOT NULL DEFAULT true,
  required_fields ARRAY NOT NULL DEFAULT '{}'::text[],
  tone text,
  offer_type text,
  message_style text,
  crm_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  agent_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  extra_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT client_configs_pkey PRIMARY KEY (id),
  CONSTRAINT client_configs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);

CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_name text,
  industry text,
  website text,
  main_contact_name text,
  main_contact_email text,
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'paused'::text, 'archived'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT clients_pkey PRIMARY KEY (id)
);

CREATE TABLE public.companies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  name text NOT NULL,
  website text,
  linkedin_url text,
  industry text,
  location text,
  size_range text,
  revenue_range text,
  description text,
  source text,
  confidence_score numeric CHECK (confidence_score >= 0::numeric AND confidence_score <= 100::numeric),
  extra_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT companies_pkey PRIMARY KEY (id),
  CONSTRAINT companies_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);

CREATE TABLE public.conversation_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  prospect_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction = ANY (ARRAY['inbound'::text, 'outbound'::text])),
  channel text NOT NULL CHECK (channel = ANY (ARRAY['email'::text, 'linkedin'::text, 'whatsapp'::text, 'phone'::text, 'crm'::text, 'other'::text])),
  body text NOT NULL,
  external_message_id text,
  sent_at timestamp with time zone,
  received_at timestamp with time zone,
  extra_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT conversation_messages_pkey PRIMARY KEY (id),
  CONSTRAINT conversation_messages_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT conversation_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id),
  CONSTRAINT conversation_messages_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES public.prospects(id)
);

CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  prospect_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel = ANY (ARRAY['email'::text, 'linkedin'::text, 'whatsapp'::text, 'phone'::text, 'crm'::text, 'other'::text])),
  external_thread_id text,
  status text NOT NULL DEFAULT 'open'::text CHECK (status = ANY (ARRAY['open'::text, 'waiting'::text, 'closed'::text, 'converted'::text, 'archived'::text])),
  last_message_at timestamp with time zone,
  summary text,
  extra_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT conversations_pkey PRIMARY KEY (id),
  CONSTRAINT conversations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT conversations_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES public.prospects(id)
);

CREATE TABLE public.cost_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  agent_run_id uuid,
  provider text NOT NULL,
  model text NOT NULL,
  token_input integer NOT NULL DEFAULT 0 CHECK (token_input >= 0),
  token_output integer NOT NULL DEFAULT 0 CHECK (token_output >= 0),
  cost numeric NOT NULL DEFAULT 0 CHECK (cost >= 0::numeric),
  currency text NOT NULL DEFAULT 'USD'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT cost_logs_pkey PRIMARY KEY (id),
  CONSTRAINT cost_logs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT cost_logs_agent_run_id_fkey FOREIGN KEY (agent_run_id) REFERENCES public.agent_runs(id)
);

CREATE TABLE public.daily_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  agent_id uuid,
  limit_type text NOT NULL CHECK (limit_type = ANY (ARRAY['cost'::text, 'tokens'::text, 'prospects'::text, 'messages'::text, 'extension_actions'::text, 'agent_runs'::text])),
  limit_value integer NOT NULL CHECK (limit_value >= 0),
  current_value integer NOT NULL DEFAULT 0 CHECK (current_value >= 0),
  reset_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT daily_limits_pkey PRIMARY KEY (id),
  CONSTRAINT daily_limits_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT daily_limits_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id)
);

CREATE TABLE public.extension_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  prospect_id uuid,
  message_id uuid,
  action_type text NOT NULL,
  linkedin_url text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'ready'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])),
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT extension_actions_pkey PRIMARY KEY (id),
  CONSTRAINT extension_actions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT extension_actions_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES public.prospects(id),
  CONSTRAINT extension_actions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id)
);

CREATE TABLE public.integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  integration_type text NOT NULL CHECK (integration_type = ANY (ARRAY['hubspot'::text, 'pipedrive'::text, 'notion'::text, 'airtable'::text, 'google_sheets'::text, 'whatsapp'::text, 'chrome_extension'::text, 'email_provider'::text])),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'connected'::text, 'disconnected'::text, 'error'::text, 'paused'::text])),
  credentials_ref text,
  mapping_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  sync_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at timestamp with time zone,
  extra_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT integrations_pkey PRIMARY KEY (id),
  CONSTRAINT integrations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);

CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  prospect_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel = ANY (ARRAY['email'::text, 'linkedin'::text, 'whatsapp'::text, 'phone'::text, 'crm'::text, 'other'::text])),
  message_type text NOT NULL DEFAULT 'outreach'::text CHECK (message_type = ANY (ARRAY['outreach'::text, 'follow_up'::text, 'reply'::text, 'validation'::text, 'internal_note'::text])),
  subject text,
  body text NOT NULL,
  angle text,
  tone text,
  cta text,
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'qa_pending'::text, 'qa_rejected'::text, 'ready_for_validation'::text, 'approved'::text, 'rejected'::text, 'ready_to_send'::text, 'sent'::text, 'replied'::text])),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  generated_by_agent_run_id uuid,
  approved_at timestamp with time zone,
  sent_at timestamp with time zone,
  extra_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT messages_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES public.prospects(id),
  CONSTRAINT messages_generated_by_agent_run_id_fkey FOREIGN KEY (generated_by_agent_run_id) REFERENCES public.agent_runs(id)
);

CREATE TABLE public.prospects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  company_id uuid,
  company_name text,
  website text,
  linkedin_url text,
  decision_maker text,
  role text,
  email text,
  phone text,
  location text,
  fit_score integer CHECK (fit_score >= 0 AND fit_score <= 100),
  priority text NOT NULL DEFAULT 'medium'::text CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])),
  status text NOT NULL DEFAULT 'discovered'::text CHECK (status = ANY (ARRAY['discovered'::text, 'qualified'::text, 'rejected'::text, 'enriched'::text, 'blocked_no_linkedin'::text, 'message_ready'::text, 'qa_validated'::text, 'waiting_whatsapp_validation'::text, 'approved'::text, 'rejected_by_user'::text, 'contact_ready'::text, 'contacted'::text, 'replied'::text, 'not_interested'::text, 'converted'::text])),
  source text,
  source_url text,
  qualification_reason text,
  recommended_offer text,
  confidence_score numeric CHECK (confidence_score >= 0::numeric AND confidence_score <= 100::numeric),
  extra_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT prospects_pkey PRIMARY KEY (id),
  CONSTRAINT prospects_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT prospects_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE public.sources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  prospect_id uuid,
  company_id uuid,
  source_type text NOT NULL,
  source_name text,
  source_url text,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  extracted_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_score numeric CHECK (confidence_score >= 0::numeric AND confidence_score <= 100::numeric),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT sources_pkey PRIMARY KEY (id),
  CONSTRAINT sources_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT sources_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES public.prospects(id),
  CONSTRAINT sources_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);

CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  prospect_id uuid,
  company_id uuid,
  message_id uuid,
  assigned_agent_id uuid,
  task_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])),
  priority text NOT NULL DEFAULT 'medium'::text CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at timestamp with time zone,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  workflow_id uuid,
  workflow_step_id uuid,
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT tasks_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES public.prospects(id),
  CONSTRAINT tasks_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT tasks_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id),
  CONSTRAINT tasks_assigned_agent_id_fkey FOREIGN KEY (assigned_agent_id) REFERENCES public.agents(id),
  CONSTRAINT tasks_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id),
  CONSTRAINT tasks_workflow_step_id_fkey FOREIGN KEY (workflow_step_id) REFERENCES public.workflow_steps(id)
);

CREATE TABLE public.validations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  prospect_id uuid NOT NULL,
  message_id uuid,
  validation_channel text NOT NULL CHECK (validation_channel = ANY (ARRAY['app'::text, 'whatsapp'::text, 'email'::text, 'crm'::text])),
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'modification_requested'::text])),
  feedback text,
  validated_by text,
  validated_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT validations_pkey PRIMARY KEY (id),
  CONSTRAINT validations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT validations_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES public.prospects(id),
  CONSTRAINT validations_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id)
);

CREATE TABLE public.workflow_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  step_order integer NOT NULL CHECK (step_order > 0),
  name text NOT NULL,
  description text,
  input_status text NOT NULL,
  success_status text NOT NULL,
  failure_status text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  retry_limit integer NOT NULL DEFAULT 0 CHECK (retry_limit >= 0),
  timeout_seconds integer CHECK (timeout_seconds IS NULL OR timeout_seconds > 0),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT workflow_steps_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_steps_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id),
  CONSTRAINT workflow_steps_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id)
);

CREATE TABLE public.workflows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  name text NOT NULL,
  workflow_type text NOT NULL DEFAULT 'prospecting'::text CHECK (workflow_type = ANY (ARRAY['prospecting'::text, 'enrichment'::text, 'messaging'::text, 'validation'::text, 'extension'::text, 'custom'::text])),
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'archived'::text])),
  description text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT workflows_pkey PRIMARY KEY (id),
  CONSTRAINT workflows_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);

CREATE TABLE public.agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  agent_run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,

  scope_type text NOT NULL CHECK (
    scope_type = ANY (ARRAY[
      'client',
      'workflow',
      'prospect',
      'company',
      'conversation',
      'run'
    ])
  ),

  scope_id uuid,

  memory_type text NOT NULL CHECK (
    memory_type = ANY (ARRAY[
      'instruction',
      'preference',
      'context',
      'summary',
      'decision',
      'lesson',
      'error'
    ])
  ),

  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  importance integer NOT NULL DEFAULT 50 CHECK (importance >= 0 AND importance <= 100),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  agent_run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  slug text UNIQUE,
  event_type text NOT NULL CHECK (
    event_type = ANY (ARRAY[
      'started',
      'thought',
      'decision',
      'tool_call',
      'tool_result',
      'status_change',
      'validation_requested',
      'error',
      'completed'
    ])
  ),

  title text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);
