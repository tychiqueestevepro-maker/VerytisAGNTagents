import { getDb } from "../db/supabase.js";

async function check() {
  const db = getDb();
  const { data, error } = await db.from("client_flows").select("*").limit(1);
  
  if (error) {
    console.error("Error:", error);
    return;
  }

  if (data && data.length > 0) {
    console.log("Columns in client_flows:", Object.keys(data[0]));
  } else {
    console.log("No data in client_flows to inspect columns.");
  }
}

check();
