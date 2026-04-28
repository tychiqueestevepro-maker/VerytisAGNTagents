import { searchSerpApi } from './serp.client.js';
import { normalizeSerpResults } from './serp.mapper.js';
import type { NormalizedSerpResult } from './serp.types.js';

export interface PeopleSearchConfig {
  target_personas: string[];
  decision_makers: string[];
  industry: string;
  location: string;
  country: string;
  company_type?: string;
  keywords?: string[];
  daily_target?: number;
}

export function buildPeopleProspectingQueries(config: PeopleSearchConfig): string[] {
  const { decision_makers, industry, location, company_type } = config;
  
  const decisionMaker = decision_makers[0] || 'contact';
  const compType = company_type || '';

  const queries = [
    // 1. site:linkedin.com/in {decision_maker} {industry} {location}
    `site:linkedin.com/in ${decisionMaker} ${industry} ${location}`,
    
    // 2. "{decision_maker}" "{industry}" "{location}" "LinkedIn"
    `"${decisionMaker}" "${industry}" "${location}" "LinkedIn"`,
    
    // 3. "{company_type}" "{industry}" "{location}" "contact"
    compType 
      ? `"${compType}" "${industry}" "${location}" "contact"` 
      : `"${industry}" "${location}" "contact"`,
      
    // 4. "{industry}" "{location}" "email" "téléphone"
    `"${industry}" "${location}" "email" "téléphone"`,
    
    // 5. "{industry}" "{location}" "{decision_maker}"
    `"${industry}" "${location}" "${decisionMaker}"`
  ];

  return queries.slice(0, 5);
}

export async function runSerpPeopleSearch(config: PeopleSearchConfig): Promise<NormalizedSerpResult[]> {
  const queries = buildPeopleProspectingQueries(config);
  let allResults: NormalizedSerpResult[] = [];

  for (const query of queries) {
    try {
      const organicResults = await searchSerpApi({
        query,
        country: config.country,
        location: config.location,
        limit: 10
      });
      
      const normalized = normalizeSerpResults(organicResults);
      allResults = [...allResults, ...normalized];
    } catch (error) {
      console.error(`Error executing SERP query "${query}":`, error);
    }
  }

  // Deduplicate by URL
  const uniqueUrls = new Set<string>();
  const deduplicatedResults: NormalizedSerpResult[] = [];

  for (const result of allResults) {
    if (!uniqueUrls.has(result.url)) {
      uniqueUrls.add(result.url);
      deduplicatedResults.push(result);
    }
  }

  return deduplicatedResults;
}
