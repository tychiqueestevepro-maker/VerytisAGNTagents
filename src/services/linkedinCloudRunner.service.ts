/**
 * Cloud LinkedIn runner.
 *
 * Consumes extension_actions where runner_type='cloud', executes them with
 * Playwright, and records real send results without requiring the user's PC.
 */

import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { env } from "../config/env.js";
import { getDb } from "../db/supabase.js";
import { createLogger } from "../logs/logger.js";
import {
  loadLinkedInCloudSession,
  markLinkedInCloudSessionError,
} from "./linkedinCloudSession.service.js";

const log = createLogger("service:linkedin-cloud-runner");

const CONTACT_ACTION_TYPES = ["connect", "connect_with_message", "send_message"];
const LOCK_MINUTES = 10;

type LinkedInAction = {
  id: string;
  client_id: string;
  campaign_id?: string | null;
  prospect_id?: string | null;
  message_id?: string | null;
  action_type: string;
  linkedin_url?: string | null;
  payload?: Record<string, unknown> | null;
  attempt_count?: number | null;
};

type ProcessResult =
  | { processed: false; reason: "none" | "quota" | "no_session" | "skipped" }
  | { processed: true; actionId: string; clientId: string; delayMs: number };

function db() {
  return getDb() as any;
}

function isContactAction(actionType: string) {
  return CONTACT_ACTION_TYPES.includes(actionType);
}

function delayOptionsMs() {
  const options = env.LINKEDIN_RUNNER_DELAY_OPTIONS_MINUTES
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);

  const minutes = options.length ? options : [5, 10, 15];
  return minutes.map((value) => value * 60 * 1000);
}

function randomDelayMs() {
  const options = delayOptionsMs();
  const index = Math.floor(Math.random() * options.length);
  return options[index] || 10 * 60 * 1000;
}

function nextUtcDayWithDelay() {
  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    8,
    0,
    0,
    0,
  ));
  return new Date(next.getTime() + randomDelayMs()).toISOString();
}

function startOfUtcDayIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function endOfUtcDayIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

async function countSentToday(clientId: string) {
  const { count, error } = await db()
    .from("extension_actions")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("runner_type", "cloud")
    .eq("status", "completed")
    .in("action_type", CONTACT_ACTION_TYPES)
    .gte("completed_at", startOfUtcDayIso())
    .lt("completed_at", endOfUtcDayIso());

  if (error) throw new Error(error.message);
  return count || 0;
}

async function postponeForDailyQuota(action: LinkedInAction) {
  const scheduledAt = nextUtcDayWithDelay();
  const payload = {
    ...(action.payload || {}),
    quota_postponed_at: new Date().toISOString(),
    quota_limit: env.LINKEDIN_RUNNER_DAILY_LIMIT,
  };

  await db()
    .from("extension_actions")
    .update({
      scheduled_at: scheduledAt,
      locked_until: null,
      payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", action.id);

  log.info("Daily LinkedIn quota reached. Action postponed.", {
    actionId: action.id,
    clientId: action.client_id,
    scheduledAt,
  });
}

async function fetchCandidateActions() {
  const nowIso = new Date().toISOString();
  const { data, error } = await db()
    .from("extension_actions")
    .select("*")
    .eq("runner_type", "cloud")
    .eq("status", "ready")
    .lte("scheduled_at", nowIso)
    .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
    .order("scheduled_at", { ascending: true })
    .limit(10);

  if (error) throw new Error(error.message);
  return (data || []) as LinkedInAction[];
}

async function lockAction(action: LinkedInAction) {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + LOCK_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await db()
    .from("extension_actions")
    .update({
      locked_until: lockedUntil,
      attempt_count: Number(action.attempt_count || 0) + 1,
      runner_last_heartbeat_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", action.id)
    .eq("status", "ready")
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as LinkedInAction | null;
}

async function shouldRunAction(action: LinkedInAction) {
  const [{ data: campaign }, { data: prospect }] = await Promise.all([
    action.campaign_id
      ? db().from("campaigns").select("id, status").eq("id", action.campaign_id).maybeSingle()
      : Promise.resolve({ data: null }),
    action.prospect_id
      ? db().from("prospects").select("id, status").eq("id", action.prospect_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (campaign?.status === "paused") {
    await db()
      .from("extension_actions")
      .update({
        locked_until: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", action.id);
    return false;
  }

  if (prospect?.status === "replied") {
    await db()
      .from("extension_actions")
      .update({
        status: "cancelled",
        locked_until: null,
        error_message: "Prospect replied before this action ran",
        updated_at: new Date().toISOString(),
      })
      .eq("id", action.id);
    return false;
  }

  return true;
}

async function nextRunnableAction() {
  const actions = await fetchCandidateActions();

  for (const action of actions) {
    if (!(await shouldRunAction(action))) continue;

    if (isContactAction(action.action_type)) {
      const sentToday = await countSentToday(action.client_id);
      if (sentToday >= env.LINKEDIN_RUNNER_DAILY_LIMIT) {
        await postponeForDailyQuota(action);
        return null;
      }
    }

    const locked = await lockAction(action);
    if (locked) return locked;
  }

  return null;
}

async function firstVisibleLocator(locators: Locator[]) {
  for (const locator of locators) {
    try {
      const first = locator.first();
      await first.waitFor({ state: "visible", timeout: 2500 });
      return first;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

async function clickFirstVisible(locators: Locator[], errorMessage: string) {
  const locator = await firstVisibleLocator(locators);
  if (!locator) throw new Error(errorMessage);
  await locator.click();
  return locator;
}

async function fillEditable(locator: Locator, message: string) {
  await locator.click();
  await locator.evaluate((element, value) => {
    const target = element as HTMLElement & { value?: string };
    target.focus();

    if ("value" in target) {
      target.value = value;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    document.execCommand("selectAll", false);
    const inserted = document.execCommand("insertText", false, value);
    if (!inserted) {
      target.textContent = value;
      target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    }
  }, message);
}

async function ensureLoggedIn(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  const loginField = page.locator('input[name="session_key"], input#username').first();
  if (page.url().includes("/login") || await loginField.isVisible().catch(() => false)) {
    throw new Error("LinkedIn cloud session expired");
  }
}

async function gotoLinkedInProfile(page: Page, url: string) {
  if (!url.includes("linkedin.com/")) throw new Error("URL LinkedIn invalide");
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await ensureLoggedIn(page);
  await page.waitForTimeout(1500);
}

function messageButtonLocators(page: Page) {
  return [
    page.getByRole("button", { name: /^message$/i }),
    page.getByRole("link", { name: /^message$/i }),
    page.getByRole("button", { name: /envoyer un message/i }),
    page.getByRole("link", { name: /envoyer un message/i }),
  ];
}

function connectButtonLocators(page: Page) {
  return [
    page.getByRole("button", { name: /^se connecter$/i }),
    page.getByRole("button", { name: /^connect$/i }),
    page.getByRole("button", { name: /^ajouter$/i }),
  ];
}

function sendButtonLocators(page: Page) {
  return [
    page.getByRole("button", { name: /^envoyer$/i }),
    page.getByRole("button", { name: /^send$/i }),
    page.getByRole("button", { name: /send invitation/i }),
    page.getByRole("button", { name: /envoyer une invitation/i }),
  ];
}

async function openConnectDialog(page: Page) {
  const directConnect = await firstVisibleLocator(connectButtonLocators(page));
  if (directConnect) {
    await directConnect.click();
    return;
  }

  const more = await firstVisibleLocator([
    page.getByRole("button", { name: /^plus$/i }),
    page.getByRole("button", { name: /^more$/i }),
  ]);
  if (!more) throw new Error("Bouton de connexion LinkedIn introuvable");

  await more.click();
  await clickFirstVisible(connectButtonLocators(page), "Option de connexion LinkedIn introuvable");
}

async function clickSend(page: Page, errorMessage: string) {
  await page.waitForTimeout(700);
  await clickFirstVisible(sendButtonLocators(page), errorMessage);
  await page.waitForTimeout(1200);
}

async function sendMessage(page: Page, message: string) {
  if (!message.trim()) throw new Error("Message manquant pour l'envoi LinkedIn");

  await clickFirstVisible(messageButtonLocators(page), "Bouton Message introuvable sur le profil LinkedIn");

  const editor = await firstVisibleLocator([
    page.locator('.msg-form__contenteditable[contenteditable="true"]'),
    page.locator('.msg-form__msg-content-container div[contenteditable="true"]'),
    page.locator('div[role="textbox"][contenteditable="true"]'),
    page.locator('.ql-editor[contenteditable="true"]'),
  ]);
  if (!editor) throw new Error("Zone de rédaction LinkedIn introuvable");

  await fillEditable(editor, message);
  await clickSend(page, "Bouton Envoyer introuvable dans la messagerie LinkedIn");

  return { message_sent: true, mode: "message" };
}

async function connectWithMessage(page: Page, message: string) {
  if (!message.trim()) throw new Error("Message manquant pour l'invitation LinkedIn");

  await openConnectDialog(page);
  await page.waitForTimeout(700);

  const addNote = await firstVisibleLocator([
    page.getByRole("button", { name: /ajouter une note/i }),
    page.getByRole("button", { name: /add a note/i }),
  ]);
  if (addNote) {
    await addNote.click();
    await page.waitForTimeout(500);
  }

  const editor = await firstVisibleLocator([
    page.locator('textarea[name="message"]'),
    page.locator("textarea"),
    page.locator('div[role="textbox"][contenteditable="true"]'),
  ]);
  if (!editor) throw new Error("Zone de note d'invitation introuvable");

  await fillEditable(editor, message);
  await clickSend(page, "Bouton d'envoi d'invitation introuvable");

  return { invitation_sent: true, message_sent: true, mode: "connect_with_message" };
}

async function connectWithoutMessage(page: Page) {
  await openConnectDialog(page);
  await clickSend(page, "Bouton d'envoi d'invitation introuvable");
  return { invitation_sent: true, mode: "connect" };
}

async function messageForAction(action: LinkedInAction) {
  const payloadMessage = action.payload?.message;
  if (typeof payloadMessage === "string" && payloadMessage.trim()) {
    return payloadMessage.trim();
  }

  if (!action.message_id) return "";

  const { data, error } = await db()
    .from("messages")
    .select("body")
    .eq("id", action.message_id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return typeof data?.body === "string" ? data.body.trim() : "";
}

async function executeLinkedInAction(page: Page, action: LinkedInAction) {
  await gotoLinkedInProfile(page, action.linkedin_url || "");

  if (action.action_type === "view_profile") {
    return { profile_viewed: true };
  }

  if (action.action_type === "connect") {
    return await connectWithoutMessage(page);
  }

  const message = await messageForAction(action);

  if (action.action_type === "connect_with_message") {
    return await connectWithMessage(page, message);
  }

  if (action.action_type === "send_message") {
    return await sendMessage(page, message);
  }

  throw new Error(`Action non supportée: ${action.action_type}`);
}

async function createBrowserContext(clientId: string) {
  const session = await loadLinkedInCloudSession(clientId);
  if (!session) return null;

  const browser = await chromium.launch({
    headless: env.LINKEDIN_RUNNER_HEADLESS === "true",
  });
  const context = await browser.newContext({
    storageState: session.storageState,
    viewport: { width: 1440, height: 1000 },
    locale: "fr-FR",
  });

  return { browser, context };
}

async function markActionCompleted(action: LinkedInAction, details: Record<string, unknown>) {
  const now = new Date().toISOString();
  const payload = {
    ...(action.payload || {}),
    last_result: {
      success: true,
      received_at: now,
      details,
    },
  };

  await db()
    .from("extension_actions")
    .update({
      status: "completed",
      completed_at: now,
      locked_until: null,
      error_message: null,
      payload,
      updated_at: now,
    })
    .eq("id", action.id);

  if (action.message_id) {
    const { data: message } = await db()
      .from("messages")
      .select("extra_data")
      .eq("id", action.message_id)
      .maybeSingle();

    await db()
      .from("messages")
      .update({
        status: "sent",
        sent_at: now,
        extra_data: {
          ...((message?.extra_data as Record<string, unknown> | null) || {}),
          sent_by_cloud_runner_at: now,
          extension_result: details,
        },
        updated_at: now,
      })
      .eq("id", action.message_id);
  }

  if (action.prospect_id && isContactAction(action.action_type)) {
    const { data: prospect } = await db()
      .from("prospects")
      .select("status, extra_data")
      .eq("id", action.prospect_id)
      .maybeSingle();

    if (!["replied", "not_interested", "converted"].includes(String(prospect?.status || ""))) {
      await db()
        .from("prospects")
        .update({
          status: "contacted",
          extra_data: {
            ...((prospect?.extra_data as Record<string, unknown> | null) || {}),
            last_contacted_at: now,
            last_contact_action_type: action.action_type,
            last_extension_action_id: action.id,
            runner_type: "cloud",
          },
          updated_at: now,
        })
        .eq("id", action.prospect_id);
    }
  }
}

async function markActionFailed(action: LinkedInAction, errorMessage: string) {
  const now = new Date().toISOString();
  const payload = {
    ...(action.payload || {}),
    last_result: {
      success: false,
      received_at: now,
      error_message: errorMessage,
    },
  };

  await db()
    .from("extension_actions")
    .update({
      status: "failed",
      completed_at: null,
      locked_until: null,
      error_message: errorMessage,
      payload,
      updated_at: now,
    })
    .eq("id", action.id);

  if (action.message_id) {
    const { data: message } = await db()
      .from("messages")
      .select("extra_data")
      .eq("id", action.message_id)
      .maybeSingle();

    await db()
      .from("messages")
      .update({
        extra_data: {
          ...((message?.extra_data as Record<string, unknown> | null) || {}),
          last_cloud_runner_error: errorMessage,
        },
        updated_at: now,
      })
      .eq("id", action.message_id);
  }
}

export async function processOneLinkedInCloudAction(): Promise<ProcessResult> {
  const action = await nextRunnableAction();
  if (!action) return { processed: false, reason: "none" };

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    const sessionContext = await createBrowserContext(action.client_id);
    if (!sessionContext) {
      await markActionFailed(action, "Session LinkedIn cloud absente");
      return { processed: false, reason: "no_session" };
    }

    browser = sessionContext.browser;
    context = sessionContext.context;
    const page = await context.newPage();
    const details = await executeLinkedInAction(page, action);

    await markActionCompleted(action, details);
    log.info("LinkedIn cloud action completed", {
      actionId: action.id,
      clientId: action.client_id,
      actionType: action.action_type,
    });

    return {
      processed: true,
      actionId: action.id,
      clientId: action.client_id,
      delayMs: isContactAction(action.action_type) ? randomDelayMs() : env.LINKEDIN_RUNNER_POLL_MS,
    };
  } catch (error: any) {
    const errorMessage = error?.message || "LinkedIn cloud action failed";
    await markActionFailed(action, errorMessage);

    if (errorMessage.includes("session expired")) {
      await markLinkedInCloudSessionError(action.client_id, errorMessage);
    }

    log.error("LinkedIn cloud action failed", {
      actionId: action.id,
      clientId: action.client_id,
      error: errorMessage,
    });

    return {
      processed: true,
      actionId: action.id,
      clientId: action.client_id,
      delayMs: env.LINKEDIN_RUNNER_POLL_MS,
    };
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

export async function startLinkedInCloudRunner() {
  log.info("LinkedIn cloud runner started", {
    dailyLimit: env.LINKEDIN_RUNNER_DAILY_LIMIT,
    delayOptionsMinutes: env.LINKEDIN_RUNNER_DELAY_OPTIONS_MINUTES,
    headless: env.LINKEDIN_RUNNER_HEADLESS,
  });

  while (true) {
    try {
      const result = await processOneLinkedInCloudAction();
      const delayMs = result.processed ? result.delayMs : env.LINKEDIN_RUNNER_POLL_MS;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (error: any) {
      log.error("LinkedIn cloud runner loop failed", { error: error?.message || error });
      await new Promise((resolve) => setTimeout(resolve, env.LINKEDIN_RUNNER_POLL_MS));
    }
  }
}
