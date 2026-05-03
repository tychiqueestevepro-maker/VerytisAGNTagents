import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '/Users/tychiqueesteve/VerytisAGNTAPP/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCampaign() {
  const campaignId = 'e788c408-cceb-4222-953c-17fcc547079c';
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('organization_id, flow_id')
    .eq('id', campaignId)
    .single();

  if (error) {
    console.error('Error fetching campaign:', error);
    return;
  }

  console.log(`Campaign ${campaignId} belongs to Client: ${campaign.organization_id}`);
}

checkCampaign();
