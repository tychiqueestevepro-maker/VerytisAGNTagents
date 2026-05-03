import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Use the env file from the APP directory
dotenv.config({ path: '/Users/tychiqueesteve/VerytisAGNTAPP/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLogs() {
  const { data: logs, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching logs:', error);
    return;
  }

  console.log('--- LAST 10 AUDIT LOGS ---');
  logs.forEach(log => {
    console.log(`[${log.created_at}] Action: ${log.action} | Campaign ID in Metadata: ${log.metadata?.campaign_id} | Client ID: ${log.client_id}`);
  });
}

checkLogs();
