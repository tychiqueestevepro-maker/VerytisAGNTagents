import { getDb } from "../db/supabase.js";

async function check() {
  const db = getDb();
  const { data: workflows, error } = await db
    .from("workflows")
    .select("*");

  if (error) {
    console.error("Error fetching workflows:", error);
    return;
  }

  console.log("Available Workflows:");
  console.table(workflows);
}

check();
