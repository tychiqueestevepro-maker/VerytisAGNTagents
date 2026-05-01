import type { SerpSearchInput, SerpOrganicResult, SerpCountryConfig } from './serp.types.js';

export const SERP_DISABLED_NOTE =
  "SERP discovery is disabled: it does not match the LinkedIn extension scraping quality and adds avoidable cost/complexity. Use extension or CSV imports, then manual qualification.";

export const COUNTRY_MAPPING: Record<string, SerpCountryConfig> = {
  FR: { gl: "fr", hl: "fr", googleDomain: "google.fr" },
  BE: { gl: "be", hl: "fr", googleDomain: "google.be" },
  CH: { gl: "ch", hl: "fr", googleDomain: "google.ch" },
  CA: { gl: "ca", hl: "fr", googleDomain: "google.ca" },
  US: { gl: "us", hl: "en", googleDomain: "google.com" },
  GB: { gl: "gb", hl: "en", googleDomain: "google.co.uk" }
};

export async function searchSerpApi(input: SerpSearchInput): Promise<SerpOrganicResult[]> {
  void input;
  throw new Error(SERP_DISABLED_NOTE);
}
