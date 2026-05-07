
import { getDb } from "../src/db/supabase.js";

const CLIENT_ID = "24a04860-27f4-4833-b50d-f914eb2e0029";
const CAMPAIGN_ID = "2cbd3612-afc6-4d4b-aa87-f573e27b4a4c";

const fakeProspects = [
  {
    full_name: "Marcus Sterling",
    decision_maker: "Marcus Sterling",
    role: "CTO",
    role_title: "Chief Technology Officer",
    company_name: "NovaPay",
    website_url: "https://www.novapay.com",
    location: "San Francisco, CA",
    status: "discovered",
    qualification_status: "to_qualify",
    source: "linkedin",
    email: "m.sterling@novapay.com",
    phone: "+1 415 555 0123",
    profile_url: "https://www.linkedin.com/in/msterling/",
    raw_data: {
      headline: "CTO @ NovaPay | Scaling Global Fintech Infrastructure",
      about: "Passionate about financial flow automation and building planet-scale infrastructure.",
      experience: [
        { title: "CTO", company: "NovaPay", duration: "3 years", description: "Scaling payment infrastructure for global markets." },
        { title: "VP Engineering", company: "Square", duration: "5 years", description: "Led an organization of 200+ engineers." },
        { title: "Senior Software Engineer", company: "Stripe", duration: "4 years", description: "Optimized core payment APIs." }
      ],
      organization: {
        description: "NovaPay is a global payment platform providing unified spend management for modern enterprises.",
        industry: "FinTech",
        size: "501-1000 employees",
        linkedin_url: "https://www.linkedin.com/company/novapay/"
      }
    }
  },
  {
    full_name: "Sarah Jenkins",
    decision_maker: "Sarah Jenkins",
    role: "VP Operations",
    role_title: "VP of Operations",
    company_name: "LogiCore",
    website_url: "https://www.logicore.io",
    location: "New York, NY",
    status: "discovered",
    qualification_status: "to_qualify",
    source: "linkedin",
    email: "sarah.jenkins@logicore.io",
    phone: "+1 212 555 0198",
    profile_url: "https://www.linkedin.com/in/sarahjenkins/",
    raw_data: {
      headline: "VP Operations @ LogiCore | Supply Chain Digital Transformation",
      about: "Optimizing global supply chains and hybrid data flows for modern logistics.",
      experience: [
        { title: "VP Operations", company: "LogiCore", duration: "4 years", description: "Optimizing North American logistics hubs." },
        { title: "Director of Operations", company: "FedEx", duration: "6 years", description: "Managed the NYC regional sorting facility." },
        { title: "Project Manager", company: "Maersk", duration: "3 years", description: "Digitalization of maritime freight documentation." }
      ],
      organization: {
        description: "LogiCore is a leading provider of end-to-end logistics solutions in North America.",
        industry: "Logistics & Supply Chain",
        size: "10000+ employees",
        linkedin_url: "https://www.linkedin.com/company/logicore/"
      }
    }
  },
  {
    full_name: "Jonathan Reed",
    decision_maker: "Jonathan Reed",
    role: "Chief Digital Officer",
    role_title: "Chief Digital Officer",
    company_name: "RetailStream",
    website_url: "https://www.retailstream.com",
    location: "Seattle, WA",
    status: "discovered",
    qualification_status: "to_qualify",
    source: "linkedin",
    email: "jreed@retailstream.com",
    phone: "+1 206 555 0456",
    profile_url: "https://www.linkedin.com/in/jonathanreed/",
    raw_data: {
      headline: "Chief Digital Officer @ RetailStream | Omnichannel Retail Innovation",
      about: "Driving digital transformation and e-commerce marketplace automation.",
      experience: [
        { title: "Chief Digital Officer", company: "RetailStream", duration: "5 years", description: "Unifying multi-brand e-commerce ecosystem." },
        { title: "Director of Product", company: "Amazon", duration: "4 years", description: "Launched the Amazon 3P Marketplace tools." },
        { title: "VP E-commerce", company: "eBay", duration: "7 years", description: "Led vertical growth for electronics." }
      ],
      organization: {
        description: "RetailStream is a premier US retailer focusing on omnichannel electronics and home appliances.",
        industry: "Retail / E-commerce",
        size: "10000+ employees",
        linkedin_url: "https://www.linkedin.com/company/retailstream/"
      }
    }
  },
  {
    full_name: "Chloe Parker",
    decision_maker: "Chloe Parker",
    role: "Head of Innovation",
    role_title: "Head of Innovation",
    company_name: "CarePulse",
    website_url: "https://www.carepulse.health",
    location: "Austin, TX",
    status: "discovered",
    qualification_status: "to_qualify",
    source: "linkedin",
    email: "chloe.parker@carepulse.health",
    phone: "+1 512 555 0876",
    profile_url: "https://www.linkedin.com/in/chloeparker/",
    raw_data: {
      headline: "Head of Innovation @ CarePulse | Healthcare Tech Futurist",
      about: "Exploring disruptive technologies to improve patient access and data security.",
      experience: [
        { title: "Head of Innovation", company: "CarePulse", duration: "2 years", description: "Scaling HIPAA-compliant telehealth services." },
        { title: "Innovation Manager", company: "UnitedHealth", duration: "4 years", description: "Digital health strategy lead." },
        { title: "Venture Scout", company: "Y Combinator", duration: "2 years", description: "Focus on HealthTech and Biotech startups." }
      ],
      organization: {
        description: "CarePulse is the leading digital healthcare platform in the US.",
        industry: "HealthTech",
        size: "1001-5000 employees",
        linkedin_url: "https://www.linkedin.com/company/carepulse/"
      }
    }
  },
  {
    full_name: "Tom Miller",
    decision_maker: "Tom Miller",
    role: "IT Project Manager",
    role_title: "IT Project Manager",
    company_name: "SteelFront",
    website_url: "https://www.steelfront.com",
    location: "Chicago, IL",
    status: "discovered",
    qualification_status: "to_qualify",
    source: "linkedin",
    email: "tmiller@steelfront.com",
    phone: "+1 312 555 0245",
    profile_url: "https://www.linkedin.com/in/tommiller/",
    raw_data: {
      headline: "IT Project Manager @ SteelFront | Industrial Digitalization",
      about: "Managing IT projects for the heavy industrial sector.",
      experience: [
        { title: "IT Project Manager", company: "SteelFront", duration: "3 years", description: "Deploying onsite mobile solutions for steel plants." },
        { title: "IT Consultant", company: "IBM", duration: "5 years", description: "Consulting for Fortune 500 manufacturing clients." }
      ],
      organization: {
        description: "SteelFront is a global player in industrial infrastructure and manufacturing.",
        industry: "Construction / Manufacturing",
        size: "10000+ employees",
        linkedin_url: "https://www.linkedin.com/company/steelfront/"
      }
    }
  },
  {
    full_name: "Lucy Bennett",
    decision_maker: "Lucy Bennett",
    role: "Marketing Manager",
    role_title: "Marketing Manager",
    company_name: "Bennett's Coffee",
    website_url: "https://www.bennettscoffee.com",
    location: "Boston, MA",
    status: "discovered",
    qualification_status: "to_qualify",
    source: "linkedin",
    email: "lucy@bennettscoffee.com",
    phone: "+1 617 555 0321",
    profile_url: "https://www.linkedin.com/in/lucybennett/",
    raw_data: {
      headline: "Marketing Manager @ Bennett's Coffee | Local Business Branding",
      about: "Passionate about artisanal coffee and community-driven marketing.",
      experience: [
        { title: "Marketing Manager", company: "Bennett's Coffee", duration: "4 years", description: "Managing local brand image and community outreach." },
        { title: "Store Manager", company: "Starbucks", duration: "2 years", description: "Led a high-volume retail team." }
      ],
      organization: {
        description: "Traditional artisanal coffee roastery and café.",
        industry: "Food & Beverages",
        size: "11-50 employees",
        linkedin_url: "https://www.linkedin.com/company/bennetts-coffee/"
      }
    }
  }
] as const;

async function insertFakeProspects() {
  const db = getDb();
  
  // First, delete existing prospects for this campaign to avoid mess
  const { error: dError } = await db
    .from('prospects')
    .delete()
    .eq('campaign_id', CAMPAIGN_ID);
    
  if (dError) {
    console.error('Error deleting existing prospects:', dError);
    return;
  }
  
  const prospectsToInsert = fakeProspects.map(p => ({
    ...p,
    client_id: CLIENT_ID,
    campaign_id: CAMPAIGN_ID,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    qualification_status: p.qualification_status as "to_qualify",
  }));
  
  const { data, error } = await db
    .from('prospects')
    .insert(prospectsToInsert as any)
    .select();
    
  if (error) {
    console.error('Error inserting prospects:', error);
  } else {
    console.log(`Successfully inserted ${data?.length} fake prospects.`);
  }
}

insertFakeProspects();
