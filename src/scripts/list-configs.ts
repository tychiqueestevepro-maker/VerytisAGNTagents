import { getDb } from "../db/supabase.js";

async function check() {
  const db = getDb();
  const { data: configs, error } = await db
    .from("client_configs")
    .select("*");

  if (error) {
    console.error("Error fetching configs:", error);
    return;
  }

  console.log("Client Configs:");
  console.table(configs);
}

check();
