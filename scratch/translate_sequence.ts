
import { getDb } from "../src/db/supabase.js";

const SEQUENCE_ID = "b76f8285-0f6d-4aa5-91e6-715ff1d382cb";

async function translateSequenceSteps() {
  const db = getDb();
  
  // Fetch steps to identify them
  const { data: steps, error: fetchError } = await db
    .from('sequence_steps')
    .select('*')
    .eq('sequence_id', SEQUENCE_ID);

  if (fetchError) {
    console.error('Error fetching steps:', fetchError);
    return;
  }

  const translations: Record<string, string> = {
    "Visite de Profil": "Profile Visit",
    "Attente après visite": "Wait after visit",
    "Envoi d'Invitation": "Send Invitation",
    "Attente après invitation": "Wait after invitation",
    "Message de Suivi après Réponse": "Follow-up after Reply"
  };

  for (const step of steps) {
    const englishName = translations[step.name];
    if (englishName) {
      const { error: updateError } = await db
        .from('sequence_steps')
        .update({ name: englishName })
        .eq('id', step.id);
      
      if (updateError) {
        console.error(`Error updating step ${step.id}:`, updateError);
      } else {
        console.log(`Updated step ${step.id} to ${englishName}`);
      }
    }
  }
}

translateSequenceSteps();
