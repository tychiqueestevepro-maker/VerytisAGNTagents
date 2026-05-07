export interface SerpCountryConfig {
  gl: string;
  hl: string;
  googleDomain: string;
}

export interface SerpSearchInput {
  query: string;
  country: string;
  location?: string;
  limit?: number;
  recencyMonths?: number;
}

export interface SerpOrganicResult {
  title: string;
  link: string;
  snippet?: string;
  position?: number;
  displayed_link?: string;
  source?: string;
  date?: string;
}

export interface NormalizedSerpResult {
  title: string;
  url: string;
  snippet?: string;
  source: "serp";
  position?: number;
  detected_type?: "linkedin_profile" | "company_website" | "directory" | "contact_page" | "unknown";
}
