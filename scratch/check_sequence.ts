
import { getDb } from "../src/db/supabase.js";

const CAMPAIGN_ID = "2cbd3612-afc6-4d4b-aa87-f573e27b4a4c";

async function checkCampaignSequence() {
  const db = getDb();
  const { data, error } = await db
    .from('campaigns')
    .select('sequence, config')
    .eq('id', CAMPAIGN_ID)
    .single();

  if (error) {
    console.error('Error fetching campaign sequence:', error);
    return;
  }

  console.log('Campaign Sequence/Config:', JSON.stringify(data, null, 2));
}

checkCampaignSequence();
