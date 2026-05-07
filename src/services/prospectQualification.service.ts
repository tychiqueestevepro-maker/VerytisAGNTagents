/**
 * src/services/prospectQualification.service.ts
 * ---------------------------------------------------------------------------
 * Manual qualification entrypoint.
 *
 * This is the service to call when the user clicks "Qualifier" in the app:
 * it loads the prospect, resolves the campaign target, normalizes available
 * LinkedIn/import data, runs only the qualifier agent, and persists the result.
 * ---------------------------------------------------------------------------
 */

import { AgentRegistry } from "../agents/registry.js";
import { getDb, type Database } from "../db/supabase.js";
import { runTask, type StepDefinition } from "../engine/taskRunner.js";
import { createLogger } from "../logs/logger.js";
import { ProspectSchema, type Prospect } from "../schemas/prospect.schema.js";
import type { QualificationResult } from "../schemas/qualifier.schema.js";
import type { ProspectingConfig, ProspectingContext } from "../orchestrators/prospecting/prospecting.orchestrator.js";
import { preScoreProspect, type PreScoreResult } from "./prospectScoring.service.js";
import { normalizeProspectionPlaybook } from "./prospectingPlaybook.service.js";
import {
  getRecentSerpQualificationContext,
  type RecentSerpQualificationContext,
} from "./recentSerpQualification.service.js";

const log = createLogger("service:prospectQualification");

type ProspectRow = Database["public"]["Tables"]["prospects"]["Row"];
type ProspectUpdate = Database["public"]["Tables"]["prospects"]["Update"];
type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];
type ClientConfigRow = Database["public"]["Tables"]["client_configs"]["Row"];
type AgentRow = Database["public"]["Tables"]["agents"]["Row"];
type WorkflowStepRow = Database["public"]["Tables"]["workflow_steps"]["Row"];

export interface QualifyProspectInput {
  prospectId: string;
  clientId?: string;
  campaignId?: string;
  workflowId?: string;
}

export interface QualifyProspectOutput {
  prospectId: string;
  campaignId: string | null;
  taskId: string;
  runId: string;
  status: "qualified" | "rejected" | "failed";
  score: number | null;
  preScore: PreScoreResult;
  qualification: QualificationResult | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,;\n|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    return new URL(value.trim()).toString();
  } catch {
    return undefined;
  }
}

function splitName(value: string): { first_name: string; last_name: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "Prospect", last_name: "Inconnu" };
  if (parts.length === 1) return { first_name: parts[0] ?? "Prospect", last_name: "Inconnu" };
  return { first_name: parts[0] ?? "Prospect", last_name: parts.slice(1).join(" ") || "Inconnu" };
}

function allowedSource(value: unknown): Prospect["source"] {
  if (value === "linkedin" || value === "extension" || value === "csv" || value === "webhook" || value === "manual") {
    return value;
  }
  return "manual";
}

function normalizeCompanySize(value: string): Prospect["company_size"] | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (/^1\s*-\s*10$/.test(normalized) || normalized.includes("1-10")) return "1-10";
  if (/^11\s*-\s*50$/.test(normalized) || normalized.includes("11-50")) return "11-50";
  if (/^51\s*-\s*200$/.test(normalized) || normalized.includes("51-200")) return "51-200";
  if (/^201\s*-\s*500$/.test(normalized) || normalized.includes("201-500")) return "201-500";
  if (normalized.includes("500+")) return "500+";
  const numberMatch = normalized.match(/\d+/);
  if (!numberMatch) return undefined;
  const count = Number(numberMatch[0]);
  if (!Number.isFinite(count)) return undefined;
  if (count <= 10) return "1-10";
  if (count <= 50) return "11-50";
  if (count <= 200) return "51-200";
  if (count <= 500) return "201-500";
  return "500+";
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function rawBundle(prospect: ProspectRow): Record<string, unknown> {
  const extraData = asRecord(prospect.extra_data);
  const rawData = asRecord(prospect.raw_data);
  const nestedRaw = asRecord(extraData.raw_data);
  return { ...nestedRaw, ...rawData, extra_data: extraData };
}

function camelKey(value: string): string {
  return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

function rawStringAny(raw: Record<string, unknown>, ...keys: string[]): string {
  const extraData = asRecord(raw.extra_data);
  const organization = asRecord(raw.organization ?? extraData.organization);
  const currentExperience = asRecord(raw.currentExperience ?? raw.current_experience ?? extraData.currentExperience ?? extraData.current_experience);
  const values: unknown[] = [];

  for (const key of keys) {
    const camel = camelKey(key);
    values.push(
      raw[key],
      raw[camel],
      extraData[key],
      extraData[camel],
      organization[key],
      organization[camel],
      currentExperience[key],
      currentExperience[camel]
    );
  }

  return pickString(...values);
}

function rawValueAny(raw: Record<string, unknown>, ...keys: string[]): unknown {
  const extraData = asRecord(raw.extra_data);
  const organization = asRecord(raw.organization ?? extraData.organization);
  const currentExperience = asRecord(raw.currentExperience ?? raw.current_experience ?? extraData.currentExperience ?? extraData.current_experience);

  for (const key of keys) {
    const camel = camelKey(key);
    const values = [
      raw[key],
      raw[camel],
      extraData[key],
      extraData[camel],
      organization[key],
      organization[camel],
      currentExperience[key],
      currentExperience[camel],
    ];
    const found = values.find((value) => {
      if (Array.isArray(value)) return value.length > 0;
      if (isRecord(value)) return Object.keys(value).length > 0;
      if (typeof value === "string") return Boolean(value.trim());
      return value !== null && value !== undefined;
    });
    if (found !== undefined) return found;
  }

  return undefined;
}

function rawArrayAny(raw: Record<string, unknown>, ...keys: string[]): unknown[] {
  const value = rawValueAny(raw, ...keys);
  return Array.isArray(value) ? value : [];
}

function rawString(raw: Record<string, unknown>, key: string): string {
  return rawStringAny(raw, key);
}

function extractedTitle(prospect: ProspectRow): string {
  const raw = rawBundle(prospect);
  return pickString(
    prospect.role_title,
    prospect.role,
    rawStringAny(raw, "title", "role", "position", "headline")
  );
}

function extractedCompanyName(prospect: ProspectRow): string {
  const raw = rawBundle(prospect);
  return pickString(
    prospect.company_name,
    rawStringAny(raw, "company", "company_name", "name")
  );
}

function buildRawSignals(prospect: ProspectRow): string[] {
  const raw = rawBundle(prospect);
  return unique([
    prospect.company_description ?? "",
    rawStringAny(raw, "about"),
    rawStringAny(raw, "headline", "original_headline"),
    rawStringAny(raw, "raw_result_text"),
    rawStringAny(raw, "company_description", "organization_description", "organization_mission", "description", "mission"),
    ...toArray(rawValueAny(raw, "experience_highlights", "experienceHighlights")),
    ...toArray(rawValueAny(raw, "personalization_signals", "personalizationSignals")),
  ]).map((signal) => signal.slice(0, 800));
}

function buildProspect(prospect: ProspectRow): Prospect {
  const raw = rawBundle(prospect);
  const extraData = asRecord(prospect.extra_data);
  const rawName = pickString(
    rawString(raw, "name"),
    prospect.full_name,
    prospect.decision_maker
  );
  const nameParts = splitName(rawName);
  const firstName = pickString(rawString(raw, "first_name"), nameParts.first_name);
  const lastName = pickString(rawString(raw, "last_name"), nameParts.last_name);
  const title = extractedTitle(prospect) || "Role inconnu";
  const company = extractedCompanyName(prospect) || "Organisation inconnue";
  const companySize = normalizeCompanySize(pickString(
    rawString(raw, "company_size"),
    rawString(raw, "size_range"),
    rawString(raw, "companySize"),
    extraData.company_size,
    extraData.size_range
  ));

  return ProspectSchema.parse({
    first_name: firstName,
    last_name:  lastName,
    full_name:  `${firstName} ${lastName}`.trim(),
    email:      prospect.email ?? undefined,
    phone:      prospect.phone ?? undefined,
    linkedin:   safeUrl(prospect.profile_url) ?? safeUrl(prospect.linkedin_url) ?? safeUrl(rawString(raw, "profile_url")) ?? safeUrl(rawString(raw, "linkedin_url")),
    title,
    company,
    industry:   pickString(rawString(raw, "industry"), extraData.industry) || undefined,
    company_size: companySize,
    geography:  pickString(
      prospect.location,
      rawStringAny(raw, "location", "profile_location", "company_location", "organization_location"),
      extraData.location
    ) || undefined,
    source:     allowedSource(prospect.source ?? rawString(raw, "source")),
    source_url: safeUrl(prospect.source_url) ?? safeUrl(rawStringAny(raw, "page_url", "profile_url", "profileUrl")) ?? safeUrl(prospect.profile_url) ?? safeUrl(prospect.linkedin_url),
    client_id:  prospect.client_id,
  });
}

function buildConfig(
  campaign: CampaignRow | null,
  clientConfig: ClientConfigRow | null
): ProspectingConfig {
  const campaignConfig = asRecord(campaign?.config);
  const clientExtraConfig = asRecord(clientConfig?.extra_config);
  const targetIcp = {
    ...asRecord(clientConfig?.target_icp),
    ...asRecord(campaignConfig.target_icp),
  };
  const prospection = asRecord(campaignConfig.prospection);

  const industries = unique([
    ...toArray(campaign?.target_industries),
    ...toArray(campaignConfig.target_industries),
    ...toArray(campaignConfig.icp_industries),
    ...toArray(targetIcp.industries),
    ...toArray(targetIcp.sectors),
    pickString(prospection.sector),
  ]);

  const companySizes = unique([
    ...toArray(campaign?.target_company_size),
    ...toArray(campaignConfig.target_company_size),
    ...toArray(campaignConfig.company_sizes),
    ...toArray(targetIcp.company_size),
    ...toArray(targetIcp.company_sizes),
  ]);

  const geographies = unique([
    ...toArray(campaign?.target_locations),
    ...toArray(campaignConfig.target_locations),
    ...toArray(campaignConfig.locations),
    ...toArray(targetIcp.geographies),
    ...toArray(targetIcp.locations),
    pickString(prospection.location),
  ]);

  const jobTitles = unique([
    ...toArray(campaign?.target_roles),
    ...toArray(campaignConfig.target_roles),
    ...toArray(campaignConfig.icp_roles),
    ...toArray(campaignConfig.personas),
    ...toArray(targetIcp.job_titles),
    ...toArray(targetIcp.roles),
    pickString(prospection.decision_maker),
  ]);

  const brandContext = pickString(
    campaignConfig.offer,
    campaign?.target_description,
    campaign?.objective,
    campaign?.description,
    "Qualification de prospects B2B selon la cible de campagne."
  );

  return {
    icp: {
      industries:       industries.length ? industries : ["Non precise"],
      company_sizes:    companySizes.length ? companySizes : ["Non precise"],
      geographies,
      job_titles:       jobTitles.length ? jobTitles : ["Decision maker"],
      exclude_keywords: [
        ...toArray(clientConfig?.excluded_sectors),
        ...toArray(campaignConfig.exclude_keywords),
      ],
    },
    channels:      ["linkedin"],
    tone:          "conversational",
    language:      pickString(campaignConfig.language, clientExtraConfig.language, "fr"),
    brand_context: brandContext,
    prospection_playbook: normalizeProspectionPlaybook(
      campaignConfig.prospection_playbook,
      {
        goal: pickString(campaign?.objective, campaignConfig.goal, brandContext),
        offer: brandContext,
        tone: pickString(campaign?.tone, campaignConfig.tone),
        roles: jobTitles,
        industries,
        companySizes,
        locations: geographies,
        exclusions: [
          ...toArray(clientConfig?.excluded_sectors),
          ...toArray(campaignConfig.exclude_keywords),
        ],
      }
    ),
  };
}

function campaignContext(campaign: CampaignRow | null): ProspectingContext["campaign_context"] {
  const config = asRecord(campaign?.config);
  return {
    name:               campaign?.display_name ?? campaign?.name ?? "",
    objective:          campaign?.objective ?? "",
    target_description: campaign?.target_description ?? campaign?.description ?? "",
    offer:              pickString(config.offer, campaign?.objective, campaign?.target_description),
  };
}

function organizationContext(prospect: ProspectRow): ProspectingContext["organization_context"] {
  const raw = rawBundle(prospect);
  const website = pickString(prospect.website_url, prospect.website, rawStringAny(raw, "website_url", "website", "company_website"));
  return {
    company_description: pickString(
      prospect.company_description,
      rawStringAny(raw, "company_description", "organization_description", "organization_mission", "description", "mission"),
      rawStringAny(raw, "about"),
      rawStringAny(raw, "raw_result_text")
    ),
    website,
    linkedin_url:  pickString(
      prospect.profile_url,
      prospect.linkedin_url,
      rawStringAny(raw, "company_linkedin_url", "organization_linkedin_url", "linkedin_url", "profile_url")
    ),
    mission_hint:  pickString(rawStringAny(raw, "mission", "organization_mission", "about"), rawStringAny(raw, "headline")),
  };
}

function experienceContext(prospect: ProspectRow): ProspectingContext["experience_context"] {
  const raw = rawBundle(prospect);
  const currentExperience = asRecord(rawValueAny(raw, "current_experience", "currentExperience"));
  const experienceHighlights = toArray(rawValueAny(raw, "experience_highlights", "experienceHighlights"));
  const personalizationSignals = toArray(rawValueAny(raw, "personalization_signals", "personalizationSignals"));

  return {
    current_experience: currentExperience,
    experiences: rawArrayAny(raw, "experiences"),
    experience_highlights: experienceHighlights,
    personalization_signals: personalizationSignals,
    current_role_start: pickString(
      rawStringAny(raw, "current_role_start", "currentRoleStart"),
      currentExperience.start
    ),
    current_role_duration: pickString(
      rawStringAny(raw, "current_role_duration", "currentRoleDuration"),
      currentExperience.duration
    ),
    current_role_is_recent: rawValueAny(raw, "current_role_is_recent", "currentRoleIsRecent") === true
      || rawValueAny(raw, "current_role_is_recent", "currentRoleIsRecent") === "true"
      || currentExperience.isRecent === true,
  };
}

async function loadProspect(prospectId: string, clientId?: string): Promise<ProspectRow> {
  const db = getDb();
  let query = db.from("prospects").select("*").eq("id", prospectId);
  if (clientId) query = query.eq("client_id", clientId);

  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    throw new Error(`Prospect not found: ${prospectId}${error ? ` (${error.message})` : ""}`);
  }
  return data;
}

async function loadClientConfig(clientId: string): Promise<ClientConfigRow | null> {
  const db = getDb();
  const { data, error } = await db
    .from("client_configs")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    log.warn("Unable to load client config", { clientId, error: error.message });
  }

  return data ?? null;
}

async function loadClientFlow(clientId: string): Promise<{ id: string; workflow_id: string | null } | null> {
  const db = getDb();
  const { data, error } = await db
    .from("client_flows")
    .select("id, workflow_id")
    .eq("client_id", clientId)
    .eq("flow_key", "prospecting")
    .in("status", ["setup_required", "active", "paused"])
    .maybeSingle();

  if (error) {
    log.warn("Unable to load prospecting flow", { clientId, error: error.message });
  }

  return data ?? null;
}

async function loadCampaign(
  prospect: ProspectRow,
  flowId: string | null,
  campaignId?: string
): Promise<CampaignRow | null> {
  const db = getDb();
  const resolvedCampaignId = campaignId ?? prospect.campaign_id ?? undefined;

  if (resolvedCampaignId) {
    const { data, error } = await db
      .from("campaigns")
      .select("*")
      .eq("id", resolvedCampaignId)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load campaign ${resolvedCampaignId}: ${error.message}`);
    }

    return data ?? null;
  }

  if (!flowId) return null;

  const { data, error } = await db
    .from("campaigns")
    .select("*")
    .eq("flow_id", flowId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    log.warn("Unable to auto-resolve active campaign", {
      prospectId: prospect.id,
      flowId,
      error: error.message,
    });
  }

  return data ?? null;
}

async function loadQualifierAgent(): Promise<AgentRow> {
  const db = getDb();
  const { data, error } = await db
    .from("agents")
    .select("*")
    .eq("slug", "qualifier")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Active qualifier agent not found${error ? `: ${error.message}` : ""}`);
  }

  return data;
}

async function loadQualifierStep(
  workflowId: string | null | undefined,
  agentId: string
): Promise<WorkflowStepRow | null> {
  if (!workflowId) return null;

  const db = getDb();
  const { data, error } = await db
    .from("workflow_steps")
    .select("*")
    .eq("workflow_id", workflowId)
    .eq("agent_id", agentId)
    .eq("is_active", true)
    .order("step_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    log.warn("Unable to load qualifier workflow step", {
      workflowId,
      agentId,
      error: error.message,
    });
  }

  return data ?? null;
}

function normalizedProspectUpdate(
  prospect: ProspectRow,
  normalized: Prospect,
  preScore: PreScoreResult,
  campaign: CampaignRow | null
): ProspectUpdate {
  const raw = rawBundle(prospect);
  const context = organizationContext(prospect);
  const title = extractedTitle(prospect);
  const companyName = extractedCompanyName(prospect);

  return {
    campaign_id:          campaign?.id ?? prospect.campaign_id,
    decision_maker:       normalized.full_name ?? `${normalized.first_name} ${normalized.last_name}`.trim(),
    full_name:            normalized.full_name ?? `${normalized.first_name} ${normalized.last_name}`.trim(),
    role:                 title || prospect.role,
    role_title:           title || prospect.role_title,
    company_name:         companyName || prospect.company_name,
    profile_url:          normalized.linkedin ?? prospect.profile_url,
    website_url:          pickString(prospect.website_url, prospect.website, rawStringAny(raw, "website_url", "website", "company_website")) || null,
    location:             normalized.geography ?? prospect.location,
    company_description:  pickString(context?.company_description, prospect.company_description) || null,
    pre_score:            preScore.score,
    pre_score_level:      preScore.level,
    qualification_status: "to_qualify",
    raw_data:             Object.keys(asRecord(prospect.raw_data)).length ? prospect.raw_data : raw,
    updated_at:           new Date().toISOString(),
  };
}

function serpSourcesToRawSignals(recentSerp: RecentSerpQualificationContext): string[] {
  return recentSerp.sources.map((source) => {
    const dateHint = source.published_at ?? source.recency_filter;
    return `[SERP recent ${dateHint}] ${source.title}: ${source.snippet} (${source.url})`;
  });
}

function qualificationExtraData(
  prospect: ProspectRow,
  campaign: CampaignRow | null,
  preScore: PreScoreResult,
  qualification: QualificationResult,
  runId: string,
  recentSerp: RecentSerpQualificationContext
): Record<string, unknown> {
  const { sources, ...recentSerpContext } = recentSerp;
  return {
    ...asRecord(prospect.extra_data),
    qualification: {
      run_id: runId,
      campaign_id: campaign?.id ?? prospect.campaign_id,
      pre_score: preScore,
      result: qualification,
      recent_serp_sources: sources,
      recent_serp_context: recentSerpContext,
      qualified_at: new Date().toISOString(),
    },
  };
}

export async function qualifyProspect(
  input: QualifyProspectInput
): Promise<QualifyProspectOutput> {
  const db = getDb();
  const prospect = await loadProspect(input.prospectId, input.clientId);
  const flow = await loadClientFlow(prospect.client_id);
  const campaign = await loadCampaign(prospect, flow?.id ?? null, input.campaignId);
  const clientConfig = await loadClientConfig(prospect.client_id);
  const normalizedProspect = buildProspect(prospect);
  const companyName = extractedCompanyName(prospect);
  const title = extractedTitle(prospect);
  const config = buildConfig(campaign, clientConfig);
  const preScore = preScoreProspect(
    {
      ...prospect,
      full_name: normalizedProspect.full_name,
      role_title: title || prospect.role_title,
      role: title || prospect.role,
      company_name: companyName || prospect.company_name,
      location: normalizedProspect.geography,
      profile_url: normalizedProspect.linkedin,
    },
    campaign
  );
  const campaignCtx = campaignContext(campaign);
  const organizationCtx = organizationContext(prospect);
  const experienceCtx = experienceContext(prospect);
  const recentSerp = await getRecentSerpQualificationContext({
    prospect: {
      fullName: normalizedProspect.full_name,
      roleTitle: title || prospect.role_title || prospect.role || undefined,
      companyName: companyName || prospect.company_name || normalizedProspect.company,
      location: normalizedProspect.geography ?? prospect.location ?? undefined,
    },
    campaign: {
      objective: pickString(campaignCtx?.objective, campaign?.objective),
      targetDescription: pickString(campaignCtx?.target_description, campaign?.target_description, campaign?.description),
      targetIndustries: config.icp.industries,
      targetLocations: config.icp.geographies,
    },
  });

  await db
    .from("prospects")
    .update(normalizedProspectUpdate(prospect, normalizedProspect, preScore, campaign))
    .eq("id", prospect.id);

  const agent = await loadQualifierAgent();
  const qualifierTask = AgentRegistry.qualifier;
  if (!qualifierTask) {
    throw new Error("Qualifier task is not registered");
  }
  const workflowId = input.workflowId ?? flow?.workflow_id ?? undefined;
  const qualifierStep = await loadQualifierStep(workflowId, agent.id);

  const step: StepDefinition = {
    agentId:        agent.id,
    agentSlug:      "qualifier",
    workflowStepId: qualifierStep?.id,
    runType:        "qualification",
    inputStatus:    prospect.status,
    successStatus:  "qualified",
    failureStatus:  "rejected",
    config:         qualifierStep?.config ?? {},
  };

  const ctx: ProspectingContext = {
    prospect:             normalizedProspect,
    config,
    campaign_context:     campaignCtx,
    organization_context: organizationCtx,
    experience_context:   experienceCtx,
    raw_signals:          [...buildRawSignals(prospect), ...serpSourcesToRawSignals(recentSerp)],
    recent_serp_sources:  recentSerp.sources,
  };

  log.info("Manual prospect qualification started", {
    prospectId: prospect.id,
    campaignId: campaign?.id ?? null,
    preScore: preScore.score,
    recentSerpSources: recentSerp.sources.length,
  });

  const result = await runTask<ProspectingContext, Partial<ProspectingContext>>(
    {
      clientId:   prospect.client_id,
      prospectId: prospect.id,
      companyId:  prospect.company_id ?? undefined,
      workflowId,
    },
    step,
    qualifierTask,
    ctx
  );

  if (result.status === "failed") {
    await db.from("prospects").update({
      qualification_reason: result.error ?? "Qualification failed",
      updated_at: new Date().toISOString(),
    }).eq("id", prospect.id);

    return {
      prospectId: prospect.id,
      campaignId: campaign?.id ?? prospect.campaign_id,
      taskId: result.taskId,
      runId: result.runId,
      status: "failed",
      score: null,
      preScore,
      qualification: null,
    };
  }

  const qualification = result.output?.qualification ?? null;
  if (!qualification) {
    throw new Error("Qualifier completed without qualification output");
  }

  await db.from("prospects").update({
    recommended_offer: pickString(asRecord(campaign?.config).offer, campaign?.objective, campaign?.target_description) || null,
    extra_data:        qualificationExtraData(prospect, campaign, preScore, qualification, result.runId, recentSerp),
    updated_at:        new Date().toISOString(),
  }).eq("id", prospect.id);

  log.info("Manual prospect qualification completed", {
    prospectId: prospect.id,
    score: qualification.score,
    qualified: qualification.qualified,
  });

  return {
    prospectId: prospect.id,
    campaignId: campaign?.id ?? prospect.campaign_id,
    taskId: result.taskId,
    runId: result.runId,
    status: qualification.qualified ? "qualified" : "rejected",
    score: qualification.score,
    preScore,
    qualification,
  };
}
