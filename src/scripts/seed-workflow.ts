import { getDb } from "../db/supabase.js";
import { randomUUID } from "crypto";

async function seed() {
  const db = getDb();
  const clientId = "24a04860-27f4-4833-b50d-f914eb2e0029";
  const workflowId = randomUUID();

  console.log("Seeding default workflow...");

  // 1. Create Workflow
  const { error: wfErr } = await db.from("workflows").insert({
    id: workflowId,
    client_id: clientId,
    name: "Prospection IA Standard",
    workflow_type: "prospecting",
    status: "active",
    description: "Flux de prospection automatique : Nettoyage -> Enrichissement -> Qualification -> Rédaction -> QA",
    config: {}
  });

  if (wfErr) {
    console.error("Error creating workflow:", wfErr);
    return;
  }

  // 2. Fetch Agents to get IDs
  const { data: agents } = await db.from("agents").select("id, slug");
  const agentMap = Object.fromEntries(agents?.map(a => [a.slug, a.id]) || []);

  // 3. Create Steps
  const steps = [
    { name: "Nettoyage", slug: "extension_ops", order: 1 },
    { name: "Enrichissement", slug: "enrichment", order: 2 },
    { name: "Qualification", slug: "qualifier", order: 3 },
    { name: "Rédaction", slug: "copywriter", order: 4 },
    { name: "Contrôle Qualité", slug: "qa", order: 5 },
  ];

  for (const step of steps) {
    const { error: stepErr } = await db.from("workflow_steps").insert({
      workflow_id: workflowId,
      agent_id: agentMap[step.slug],
      step_order: step.order,
      name: step.name,
      input_status: "discovered",
      success_status: step.slug === "qa" ? "ready_to_send" : "processing",
      failure_status: "failed",
      is_active: true,
      retry_limit: 2,
      config: {}
    });

    if (stepErr) console.error(`Error creating step ${step.name}:`, stepErr);
  }

  // 4. Link Workflow to Client Flow with Valid Config
  const defaultConfig = {
    icp: {
      industries: ["Tech", "SaaS", "E-commerce"],
      company_sizes: ["11-50", "51-200"],
      geographies: ["France", "Europe"],
      job_titles: ["CEO", "COO", "CTO", "Founder"],
      exclude_keywords: ["Intern", "Student"]
    },
    channels: ["linkedin", "email"],
    tone: "conversational",
    language: "fr",
    brand_context: "Verytis est une agence spécialisée dans l automation d agents IA pour le CRM."
  };

  const { error: flowErr } = await db
    .from("client_flows")
    .update({ 
      workflow_id: workflowId,
      config: defaultConfig
    })
    .eq("client_id", clientId)
    .eq("flow_key", "prospecting");

  if (flowErr) {
    console.error("Error updating client flow:", flowErr);
    return;
  }

  console.log("Seed completed! Workflow linked to client flow.");
}

seed();
