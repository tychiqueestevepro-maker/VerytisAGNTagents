import { getDb } from "../db/supabase.js";

async function check() {
  const db = getDb();
  const { data: runs, error } = await db
    .from("agent_runs")
    .select("id, status, run_type, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Error fetching agent runs:", error);
    return;
  }

  console.log("Recent Agent Runs:");
  console.table(runs);
}

check();
