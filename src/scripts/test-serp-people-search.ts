import { runSerpPeopleSearch } from '../integrations/serp/serp.search.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('Testing SERP People Search...\n');
  
  if (!process.env.SERPAPI_API_KEY && !process.env.SERP_API_KEY) {
    console.error('SERPAPI_API_KEY or SERP_API_KEY is not defined in the environment.');
    console.log('Please run the script with SERPAPI_API_KEY=your_key npx tsx ...');
    return;
  }

  const results = await runSerpPeopleSearch({
    target_personas: ["associé", "fondateur"],
    decision_makers: ["associé"],
    industry: "cabinet avocat",
    location: "Lyon",
    country: "FR",
    company_type: "cabinet"
  });

  console.log(`✅ Found ${results.length} unique results.\n`);

  results.forEach(res => {
    console.log(`- [${(res.detected_type || 'UNKNOWN').toUpperCase()}] ${res.title}`);
    console.log(`  URL: ${res.url}`);
    if (res.snippet) {
      console.log(`  Snippet: ${res.snippet.substring(0, 100)}...`);
    }
    console.log();
  });
}

main().catch(console.error);
