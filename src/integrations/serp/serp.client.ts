import type { SerpSearchInput, SerpOrganicResult, SerpCountryConfig } from './serp.types.js';

export const COUNTRY_MAPPING: Record<string, SerpCountryConfig> = {
  FR: { gl: "fr", hl: "fr", googleDomain: "google.fr" },
  BE: { gl: "be", hl: "fr", googleDomain: "google.be" },
  CH: { gl: "ch", hl: "fr", googleDomain: "google.ch" },
  CA: { gl: "ca", hl: "fr", googleDomain: "google.ca" },
  US: { gl: "us", hl: "en", googleDomain: "google.com" },
  GB: { gl: "gb", hl: "en", googleDomain: "google.co.uk" }
};

export async function searchSerpApi(input: SerpSearchInput): Promise<SerpOrganicResult[]> {
  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) {
    throw new Error('SERP_API_KEY is missing from environment variables.');
  }

  const countryConfig = COUNTRY_MAPPING[input.country.toUpperCase()] || { gl: "us", hl: "en", googleDomain: "google.com" };
  const limit = input.limit || 10;

  const params = new URLSearchParams({
    q: input.query,
    gl: countryConfig.gl,
    hl: countryConfig.hl,
    google_domain: countryConfig.googleDomain,
    num: limit.toString(),
    api_key: apiKey,
    engine: 'google'
  });

  const endpoint = `https://serpapi.com/search.json?${params.toString()}`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`SERP API HTTP error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  return data.organic_results || [];
}
