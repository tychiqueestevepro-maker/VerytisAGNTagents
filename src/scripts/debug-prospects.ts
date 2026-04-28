import { getDb } from "../db/supabase.js";

async function check() {
  const db = getDb();
  const { data, error } = await db
    .from("prospects")
    .select("id, status, decision_maker, client_id, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Error fetching prospects:", error);
    return;
  }

  console.log("Recent prospects:");
  console.table(data);

  const pending = data?.filter(p => p.status === "discovered");
  console.log(`\nFound ${pending?.length || 0} prospects with status "discovered"`);
}

check();
