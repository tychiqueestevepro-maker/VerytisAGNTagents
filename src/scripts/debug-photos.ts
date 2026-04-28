import { getDb } from "../db/supabase.js";

async function check() {
  const db = getDb();
  const { data, error } = await db
    .from("prospects")
    .select("id, decision_maker, photo_url")
    .not("photo_url", "is", null)
    .limit(10);

  if (error) {
    console.error("Error fetching photos:", error);
    return;
  }

  console.log("Prospects with photos:");
  console.table(data);
}

check();
