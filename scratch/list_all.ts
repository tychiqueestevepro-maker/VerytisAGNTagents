
import { getDb } from "../src/db/supabase.js";

async function listAll() {
  const db = getDb();
  
  const { data: clients, error: cError } = await db
    .from('clients')
    .select('*');
    
  if (cError) {
    console.error('Error fetching clients:', cError);
  } else {
    console.log('Clients:', JSON.stringify(clients, null, 2));
  }
  
  const { data: campaigns, error: camError } = await db
    .from('campaigns')
    .select('*');
    
  if (camError) {
    console.error('Error fetching campaigns:', camError);
  } else {
    console.log('Campaigns:', JSON.stringify(campaigns, null, 2));
  }
}

listAll();
