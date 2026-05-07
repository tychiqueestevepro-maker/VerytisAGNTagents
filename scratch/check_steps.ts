
import { getDb } from "../src/db/supabase.js";

const CAMPAIGN_ID = "2cbd3612-afc6-4d4b-aa87-f573e27b4a4c";

async function checkSequenceSteps() {
  const db = getDb();
  
  // 1. Get sequence_id from campaign
  const { data: campaign, error: cError } = await db
    .from('campaigns')
    .select('sequence_id')
    .eq('id', CAMPAIGN_ID)
    .single();

  if (cError || !campaign?.sequence_id) {
    console.error('Error fetching campaign sequence_id:', cError);
    return;
  }

  console.log('Sequence ID:', campaign.sequence_id);

  // 2. Get steps from sequence_steps
  const { data: steps, error: sError } = await db
    .from('sequence_steps')
    .select('*')
    .eq('sequence_id', campaign.sequence_id)
    .order('order_index', { ascending: true });

  if (sError) {
    console.error('Error fetching sequence steps:', sError);
    return;
  }

  console.log('Sequence Steps:', JSON.stringify(steps, null, 2));
}

checkSequenceSteps();
