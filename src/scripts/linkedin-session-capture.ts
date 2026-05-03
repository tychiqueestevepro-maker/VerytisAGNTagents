/**
 * Manual LinkedIn cloud-session capture.
 *
 * Usage:
 *   npm run linkedin:login -- <client_id>
 *
 * Opens a headed Chromium window. Log into LinkedIn, then press Enter in
 * the terminal. The Playwright storage state is encrypted and saved to Supabase.
 */

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";
import { getDb } from "../db/supabase.js";
import { saveLinkedInCloudSession } from "../services/linkedinCloudSession.service.js";

const clientIdArg = process.argv[2];

if (!clientIdArg) {
  console.error("Usage: npm run linkedin:login -- <client_id>");
  process.exit(1);
}

const clientId = clientIdArg;

async function upsertCloudIntegration(clientIdValue: string) {
  const db = getDb() as any;
  const now = new Date().toISOString();

  const { data: existing, error: findError } = await db
    .from("integrations")
    .select("id, extra_data")
    .eq("client_id", clientIdValue)
    .eq("integration_type", "chrome_extension")
    .limit(1)
    .maybeSingle();

  if (findError) throw new Error(findError.message);

  const extraData = {
    ...((existing?.extra_data as Record<string, unknown> | null) || {}),
    runner_type: "cloud",
    runner_mode: "cloud",
    daily_action_limit: 30,
    action_delay_options_minutes: [5, 10, 15],
    cloud_session_captured_at: now,
  };

  if (existing) {
    const { data, error } = await db
      .from("integrations")
      .update({
        status: "connected",
        name: "Runner LinkedIn Cloud",
        extra_data: extraData,
        last_sync_at: now,
        updated_at: now,
      })
      .eq("id", existing.id)
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return data.id as string;
  }

  const { data, error } = await db
    .from("integrations")
    .insert({
      client_id: clientIdValue,
      integration_type: "chrome_extension",
      name: "Runner LinkedIn Cloud",
      status: "connected",
      extra_data: extraData,
      last_sync_at: now,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "fr-FR",
  });
  const page = await context.newPage();
  await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" });

  const rl = readline.createInterface({ input, output });
  await rl.question("Connecte-toi à LinkedIn dans Chromium, puis appuie sur Entrée ici...");
  rl.close();

  await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const storageState = await context.storageState();
  const integrationId = await upsertCloudIntegration(clientId);
  const title = await page.title().catch(() => null);
  const currentUrl = page.url();

  await saveLinkedInCloudSession({
    clientId,
    integrationId,
    storageState,
    linkedinAccountName: title,
    linkedinAccountUrl: currentUrl.includes("linkedin.com") ? currentUrl : null,
  });

  await browser.close();
  console.log(`Session LinkedIn cloud sauvegardée pour le client ${clientId}.`);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
