import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '/Users/tychiqueesteve/VerytisAGNTAPP/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMetadataType() {
  const { data: logs, error } = await supabase
    .from('audit_logs')
    .select('metadata')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !logs.length) {
    console.error('Error fetching logs:', error);
    return;
  }

  const cid = logs[0].metadata?.campaign_id;
  console.log('Campaign ID Value:', cid);
  console.log('Type of Campaign ID:', typeof cid);
  console.log('Is Array?', Array.isArray(cid));
}

checkMetadataType();
