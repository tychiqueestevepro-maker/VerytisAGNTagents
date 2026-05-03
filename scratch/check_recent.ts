import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '/Users/tychiqueesteve/VerytisAGNTAPP/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRecentLogs() {
  const { data: logs, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching logs:', error);
    return;
  }

  console.log('--- RECENT AUDIT LOGS ---');
  logs.forEach(log => {
    console.log(`[${log.created_at}] Action: ${log.action} | Metadata:`, JSON.stringify(log.metadata));
  });
}

checkRecentLogs();
