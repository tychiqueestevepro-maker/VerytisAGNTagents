import type { SerpOrganicResult, NormalizedSerpResult } from './serp.types.js';

const DIRECTORIES = [
  'pagesjaunes', 'societe.com', 'kompass.com', 'europages.com', 
  'yelp.com', 'trustpilot.com', 'annuaire', 'pappers.fr', 'infogreffe.fr'
];
const SOCIALS = ['linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'x.com'];

function isDirectory(hostname: string): boolean {
  return DIRECTORIES.some(dir => hostname.includes(dir));
}

function isCompanyWebsite(hostname: string): boolean {
  if (SOCIALS.some(soc => hostname.includes(soc))) return false;
  if (isDirectory(hostname)) return false;
  return true;
}

export function normalizeSerpResults(results: SerpOrganicResult[]): NormalizedSerpResult[] {
  return results
    .filter(result => !!result.link)
    .map(result => {
      let detected_type: NormalizedSerpResult['detected_type'] = 'unknown';

      const urlLower = result.link.toLowerCase();
      const titleLower = result.title.toLowerCase();

      try {
        const urlObj = new URL(result.link);
        const hostname = urlObj.hostname;

        if (urlLower.includes('linkedin.com/in')) {
          detected_type = 'linkedin_profile';
        } else if (urlLower.includes('contact') || titleLower.includes('contact')) {
          detected_type = 'contact_page';
        } else if (isDirectory(hostname)) {
          detected_type = 'directory';
        } else if (isCompanyWebsite(hostname)) {
          detected_type = 'company_website';
        }
      } catch (e) {
        // Fallback for invalid URLs
      }

      return {
        title: result.title,
        url: result.link,
        snippet: result.snippet,
        position: result.position,
        source: 'serp',
        detected_type
      };
    });
}
