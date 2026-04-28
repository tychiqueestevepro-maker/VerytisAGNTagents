import { getDb } from "../db/supabase.js";

async function check() {
  const db = getDb();
  const { data, error } = await db.storage.listBuckets();
  
  if (error) {
    console.error("Error listing buckets:", error);
    return;
  }

  console.log("Existing Buckets:");
  console.table(data);
}

check();
