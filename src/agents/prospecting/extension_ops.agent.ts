/**
 * src/agents/prospecting/extension_ops.agent.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Extension Ops Agent — Cleans and structures data scraped from the browser.
 *
 * It handles the transition from raw LinkedIn HTML extraction to structured
 * Prospect entities ready for enrichment and qualification.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createLogger }     from "../../logs/logger.js";
import type { Prospect }    from "../../schemas/prospect.schema.js";

const log = createLogger("agent:extension-ops");

export interface ExtensionOpsInput {
  raw_name:    string;
  raw_title?:   string;
  raw_company?: string;
  source_url:  string;
}

export interface ExtensionOpsOutput {
  prospect: Partial<Prospect>;
}

function normalizeSpace(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripEmoji(value: string): string {
  return value.replace(/[\u{1f300}-\u{1faff}\u{2600}-\u{27bf}\ufe0f]/gu, "");
}

function stripLinkedInNoise(value: string): string {
  return normalizeSpace(stripEmoji(value)
    .replace(/\b(?:open\s+to\s+work|hiring|recrute|recrutement)\b/gi, "")
    .replace(/\b\d+(?:st|nd|rd|th|er|e)\b/gi, "")
    .replace(/\b(?:followers?|abonnés?|relations?|connections?|connexions?(?:\s+mutuelles?)?)\b/gi, "")
    .replace(/[•·]+/g, " "));
}

function cleanProfileName(value: string): { first_name?: string; last_name?: string } {
  const cleaned = stripLinkedInNoise(value)
    .replace(/[|,].*$/g, "")
    .replace(/\([^)]*\)/g, "")
    .trim();

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};

  return {
    first_name: parts[0],
    last_name: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
  };
}

function cleanTitle(value: string | null | undefined): string | undefined {
  const cleaned = stripLinkedInNoise(value ?? "")
    .replace(/\s+(?:chez|at|@)\s+.+$/i, "")
    .trim();

  if (!cleaned) return undefined;

  const segments = cleaned
    .split(/\s+(?:\||•|·|–|—)\s+|[\n\r]+/)
    .map((segment) => normalizeSpace(segment))
    .filter(Boolean);

  const rolePattern = /\b(?:founder|co[-\s]?founder|fondateur|ceo|cto|coo|cfo|directeur|directrice|dirigeant|responsable|manager|head|lead|sales|marketing|consultant|avocat|associé|associe|partner|président|president|owner|gérant|gerant)\b/i;
  return segments.find((segment) => rolePattern.test(segment)) ?? segments[0] ?? cleaned;
}

function cleanCompany(value: string | null | undefined): string | undefined {
  const firstSegment = (value ?? "").split(/\n/)[0]?.split(/[•·|]/)[0] ?? "";
  const cleaned = stripLinkedInNoise(firstSegment)
    .replace(/\b(?:temps plein|full-time|part-time|freelance|indépendant|independant)\b/gi, "")
    .trim();

  if (!cleaned || cleaned.length < 2) return undefined;
  if (/^(france|paris|lyon|marseille|remote|à distance|a distance)$/i.test(cleaned)) return undefined;
  return normalizeSpace(cleaned);
}

/**
 * Runs Extension Ops without LLM.
 *
 * The Chrome extension and import API already send normalized fields
 * (first_name, last_name, title/headline, company, linkedin_url). This step is
 * kept as a deterministic safety pass for old payloads and workflow
 * compatibility, so it costs zero tokens and never invents missing data.
 */
export async function runExtensionOpsAgent(
  input: ExtensionOpsInput
): Promise<ExtensionOpsOutput> {
  log.info("Extension Ops agent started", { raw_name: input.raw_name });

  const nameParts = cleanProfileName(input.raw_name);
  const title = cleanTitle(input.raw_title);
  const company = cleanCompany(input.raw_company);
  const prospect: Partial<Prospect> = { ...nameParts };

  if (title) prospect.title = title;
  if (company) prospect.company = company;

  log.info("Extension Ops agent completed without LLM", {
    has_first_name: Boolean(prospect.first_name),
    has_last_name:  Boolean(prospect.last_name),
    has_title:      Boolean(prospect.title),
    has_company:    Boolean(prospect.company),
  });

  return { prospect };
}
