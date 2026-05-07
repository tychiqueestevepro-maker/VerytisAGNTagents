import type { SerpSearchInput, SerpOrganicResult, SerpCountryConfig } from './serp.types.js';

export const SERP_NOT_CONFIGURED_NOTE =
  "SERP search is not configured. Set SERPAPI_API_KEY or SERP_API_KEY to enable recent public-source qualification.";

export const COUNTRY_MAPPING: Record<string, SerpCountryConfig> = {
  FR: { gl: "fr", hl: "fr", googleDomain: "google.fr" },
  BE: { gl: "be", hl: "fr", googleDomain: "google.be" },
  CH: { gl: "ch", hl: "fr", googleDomain: "google.ch" },
  CA: { gl: "ca", hl: "fr", googleDomain: "google.ca" },
  US: { gl: "us", hl: "en", googleDomain: "google.com" },
  GB: { gl: "gb", hl: "en", googleDomain: "google.co.uk" }
};

type SerpApiResponse = {
  organic_results?: SerpOrganicResult[];
  error?: string;
};

function serpApiKey(): string {
  return (
    process.env.SERPAPI_API_KEY ||
    process.env.SERP_API_KEY ||
    ""
  ).trim();
}

function recencyToken(months: number | undefined): string | undefined {
  if (!months) return undefined;
  const safeMonths = Math.min(Math.max(Math.round(months), 1), 12);
  return safeMonths === 1 ? "qdr:m" : `qdr:m${safeMonths}`;
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function searchSerpApi(input: SerpSearchInput): Promise<SerpOrganicResult[]> {
  const key = serpApiKey();
  if (!key) throw new Error(SERP_NOT_CONFIGURED_NOTE);

  const country = COUNTRY_MAPPING[input.country.toUpperCase()] ?? COUNTRY_MAPPING.FR;
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 10);
  const params = new URLSearchParams({
    engine: "google",
    q: input.query,
    api_key: key,
    gl: country.gl,
    hl: country.hl,
    google_domain: country.googleDomain,
    num: String(limit),
    safe: "active",
    filter: "0",
  });
  const tbs = recencyToken(input.recencyMonths);
  if (tbs) params.set("tbs", tbs);
  if (input.location?.trim()) params.set("location", input.location.trim());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), envNumber("SERP_TIMEOUT_MS", 5500));

  try {
    const response = await fetch(`https://serpapi.com/search?${params.toString()}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`SERP HTTP ${response.status}`);

    const payload = await response.json() as SerpApiResponse;
    if (payload.error) throw new Error(payload.error);

    return (payload.organic_results ?? []).slice(0, limit);
  } finally {
    clearTimeout(timeout);
  }
}
