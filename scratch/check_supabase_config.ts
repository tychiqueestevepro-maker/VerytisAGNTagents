
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkConfigs() {
  console.log("Checking global_configs...");
  const { data: global, error: globalErr } = await supabase
    .from("global_configs")
    .select("*");
  
  if (globalErr) {
    console.error("Error global_configs:", globalErr.message);
  } else {
    console.table(global);
  }

  console.log("\nChecking client_configs (extra_config)...");
  const { data: client, error: clientErr } = await supabase
    .from("client_configs")
    .select("client_id, extra_config");
  
  if (clientErr) {
    console.error("Error client_configs:", clientErr.message);
  } else {
    client.forEach(c => {
      console.log(`Client ${c.client_id}:`, JSON.stringify(c.extra_config, null, 2));
    });
  }
}

checkConfigs();
