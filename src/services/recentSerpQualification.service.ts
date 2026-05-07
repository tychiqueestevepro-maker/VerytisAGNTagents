import { searchSerpApi } from "../integrations/serp/serp.client.js";

export interface RecentSerpQualificationInput {
  prospect: {
    fullName?: string;
    roleTitle?: string;
    companyName?: string;
    location?: string;
  };
  campaign: {
    objective?: string;
    targetDescription?: string;
    targetIndustries?: string[];
    targetLocations?: string[];
  };
}

export interface RecentSerpQualificationSource {
  title: string;
  url: string;
  snippet: string;
  source: string;
  published_at: string | null;
  query: string;
  freshness: "dated_by_serp" | "filtered_recent_not_dated";
  recency_filter: string;
}

export interface RecentSerpQualificationContext {
  used: boolean;
  reason?: string;
  generated_at: string;
  recency_months: number;
  queries: string[];
  sources: RecentSerpQualificationSource[];
}

const DEFAULT_RECENCY_MONTHS = 3;
const DEFAULT_MAX_QUERIES = 2;
const DEFAULT_RESULTS_PER_QUERY = 5;

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function hasSerpKey(): boolean {
  return Boolean((process.env.SERPAPI_API_KEY || process.env.SERP_API_KEY || "").trim());
}

function pickCountry(location: string | undefined): string {
  const normalized = (location ?? "").toLowerCase();
  if (normalized.includes("belg")) return "BE";
  if (normalized.includes("suisse") || normalized.includes("switzerland")) return "CH";
  if (normalized.includes("canada")) return "CA";
  if (normalized.includes("united states") || normalized.includes("usa") || normalized.includes("etats-unis")) return "US";
  if (normalized.includes("united kingdom") || normalized.includes("royaume-uni")) return "GB";
  return "FR";
}

function compact(value: string, max = 280): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function quoted(value: string | undefined): string {
  const clean = (value ?? "").replace(/"/g, "").trim();
  return clean ? `"${clean}"` : "";
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

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function buildQueries(input: RecentSerpQualificationInput): string[] {
  const company = quoted(input.prospect.companyName);
  if (!company) return [];

  const industry = input.campaign.targetIndustries?.[0]
    ? quoted(input.campaign.targetIndustries[0])
    : "";
  const role = quoted(input.prospect.roleTitle);
  const location = input.prospect.location || input.campaign.targetLocations?.[0] || "";
  const offerHint = `${input.campaign.targetDescription ?? ""} ${input.campaign.objective ?? ""}`;
  const offerWords = unique(
    offerHint
      .split(/\s+/)
      .map((word) => word.replace(/[^\p{L}\p{N}-]/gu, "").trim())
      .filter((word) => word.length >= 5)
      .slice(0, 4),
  );

  return unique([
    `${company} actualite OR annonce OR lancement OR recrutement OR recrute OR hiring OR croissance OR partenariat`,
    [company, industry, location, offerWords.slice(0, 2).join(" ")].filter(Boolean).join(" "),
    [company, role, "LinkedIn OR nomination OR prise de poste"].filter(Boolean).join(" "),
  ]).slice(0, DEFAULT_MAX_QUERIES);
}

export async function getRecentSerpQualificationContext(
  input: RecentSerpQualificationInput
): Promise<RecentSerpQualificationContext> {
  const generatedAt = new Date().toISOString();
  const recencyMonths = Math.min(Math.max(envNumber("SERP_RECENCY_MONTHS", DEFAULT_RECENCY_MONTHS), 1), 12);
  const resultsPerQuery = Math.min(Math.max(envNumber("SERP_RESULTS_PER_QUERY", DEFAULT_RESULTS_PER_QUERY), 1), 10);
  const queries = buildQueries(input);

  if (!queries.length) {
    return {
      used: false,
      reason: "Entreprise absente, aucune requete SERP fiable construite",
      generated_at: generatedAt,
      recency_months: recencyMonths,
      queries: [],
      sources: [],
    };
  }

  if (!hasSerpKey()) {
    return {
      used: false,
      reason: "Cle SERP non configuree",
      generated_at: generatedAt,
      recency_months: recencyMonths,
      queries,
      sources: [],
    };
  }

  const sources: RecentSerpQualificationSource[] = [];
  const seenUrls = new Set<string>();
  const recencyFilter = `Google SERP ${recencyMonths} dernier(s) mois`;
  const country = pickCountry(input.prospect.location || input.campaign.targetLocations?.[0]);

  const resultSets = await Promise.all(queries.map(async (query) => {
    try {
      const results = await searchSerpApi({
        query,
        country,
        location: input.prospect.location || input.campaign.targetLocations?.[0],
        limit: resultsPerQuery,
        recencyMonths,
      });
      return { query, results };
    } catch (error) {
      if (process.env.LOG_LEVEL === "debug") {
        console.warn("[qualification] Recent SERP query skipped", {
          query,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return { query, results: [] };
    }
  }));

  for (const { query, results } of resultSets) {
    for (const result of results) {
      const url = result.link?.trim();
      const title = result.title?.trim();
      if (!url || !title || seenUrls.has(url)) continue;

      seenUrls.add(url);
      sources.push({
        title: compact(title, 160),
        url,
        snippet: compact(result.snippet ?? "", 420),
        source: result.source || result.displayed_link || hostFromUrl(url),
        published_at: result.date?.trim() || null,
        query,
        freshness: result.date ? "dated_by_serp" : "filtered_recent_not_dated",
        recency_filter: recencyFilter,
      });
    }
  }

  return {
    used: sources.length > 0,
    reason: sources.length > 0 ? undefined : "Aucune source recente pertinente retournee par SERP",
    generated_at: generatedAt,
    recency_months: recencyMonths,
    queries,
    sources: sources.slice(0, 8),
  };
}
