
import { getDb } from "../src/db/supabase.js";

const CAMPAIGN_ID = "2cbd3612-afc6-4d4b-aa87-f573e27b4a4c";

async function rebrandCampaign() {
  const db = getDb();
  
  const updates = {
    objective: "Scale American businesses with AI-driven business flow automation.",
    target_description: "Verytis automates complex business flows with robust infrastructure, transforming raw data into actionable insights. The solution stands out for its ability to adapt to specific enterprise needs, ensuring precise and autonomous execution.",
    target_roles: [
      "CTO",
      "Head of Operations",
      "Chief Digital Officer",
      "Head of Data Management",
      "IT Project Manager",
      "Head of Innovation"
    ],
    target_industries: [
      "Fintech",
      "E-commerce",
      "Consulting",
      "Logistics",
      "Healthcare"
    ],
    target_locations: [
      "USA",
      "North America"
    ],
    target_company_size: [
      "Startup",
      "SMB",
      "Mid-market",
      "Enterprise"
    ],
    tone: "Strategic and Analytical",
    config: {
      language: "english",
      goal: "Scale American businesses with AI-driven business flow automation.",
      offer: "Verytis provides robust infrastructure for business flow automation, tailored for the US market."
    }
  };

  const { data, error } = await db
    .from('campaigns')
    .update(updates)
    .eq('id', CAMPAIGN_ID)
    .select();

  if (error) {
    console.error('Error updating campaign:', error);
    return;
  }

  console.log('Campaign successfully rebranded to English:', JSON.stringify(data, null, 2));
}

rebrandCampaign();
