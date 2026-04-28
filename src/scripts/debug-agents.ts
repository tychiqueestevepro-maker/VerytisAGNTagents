import { getDb } from "../db/supabase.js";

async function check() {
  const db = getDb();
  const { data: agents, error } = await db
    .from("agents")
    .select("*");

  if (error) {
    console.error("Error fetching agents:", error);
    return;
  }

  console.log("Registered Agents:");
  console.table(agents);
}

check();
