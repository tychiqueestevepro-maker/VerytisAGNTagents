
import { getDb } from "../src/db/supabase.js";

const SEQUENCE_ID = "b76f8285-0f6d-4aa5-91e6-715ff1d382cb";

async function checkSteps() {
  const db = getDb();
  const { data, error } = await db
    .from('sequence_steps')
    .select('*')
    .eq('sequence_id', SEQUENCE_ID);

  if (error) {
    console.error('Error fetching steps:', error);
    return;
  }

  console.log('Steps:', JSON.stringify(data, null, 2));
}

checkSteps();
