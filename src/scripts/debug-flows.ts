import { getDb } from "../db/supabase.js";

async function check() {
  const db = getDb();
  const clientId = "24a04860-27f4-4833-b50d-f914eb2e0029";
  
  const { data: flows, error } = await db
    .from("client_flows")
    .select("*")
    .eq("client_id", clientId);

  if (error) {
    console.error("Error fetching flows:", error);
    return;
  }

  console.log(`Flows for client ${clientId}:`);
  console.table(flows);
}

check();
