import { getDb } from "../db/supabase.js";

async function setup() {
  const db = getDb();
  
  console.log("Creating bucket 'prospect-photos'...");
  const { data, error } = await db.storage.createBucket("prospect-photos", {
    public: true,
    fileSizeLimit: 5242880, // 5MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"]
  });

  if (error) {
    if (error.message.includes("already exists")) {
      console.log("Bucket already exists.");
    } else {
      console.error("Error creating bucket:", error);
    }
  } else {
    console.log("Bucket created successfully:", data);
  }
}

setup();
