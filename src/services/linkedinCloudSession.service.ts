/**
 * Encrypts and stores Playwright LinkedIn sessions for the cloud runner.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { getDb } from "../db/supabase.js";

type EncryptedStorageState = {
  storage_state_ciphertext: string;
  storage_state_iv: string;
  storage_state_tag: string;
};

function encryptionKey() {
  if (!env.LINKEDIN_SESSION_SECRET) {
    throw new Error("LINKEDIN_SESSION_SECRET is required to store LinkedIn cloud sessions");
  }

  return createHash("sha256").update(env.LINKEDIN_SESSION_SECRET).digest();
}

export function encryptStorageState(storageState: unknown): EncryptedStorageState {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(storageState), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    storage_state_ciphertext: ciphertext.toString("base64"),
    storage_state_iv: iv.toString("base64"),
    storage_state_tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptStorageState(session: EncryptedStorageState) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(session.storage_state_iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(session.storage_state_tag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(session.storage_state_ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(plaintext);
}

export async function loadLinkedInCloudSession(clientId: string) {
  const db = getDb() as any;
  const { data, error } = await db
    .from("linkedin_cloud_sessions")
    .select("*")
    .eq("client_id", clientId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    row: data,
    storageState: decryptStorageState(data),
  };
}

export async function saveLinkedInCloudSession(input: {
  clientId: string;
  integrationId?: string | null;
  storageState: unknown;
  linkedinAccountName?: string | null;
  linkedinAccountUrl?: string | null;
}) {
  const db = getDb() as any;
  const encrypted = encryptStorageState(input.storageState);
  const now = new Date().toISOString();

  const { data, error } = await db
    .from("linkedin_cloud_sessions")
    .upsert(
      {
        client_id: input.clientId,
        integration_id: input.integrationId || null,
        status: "active",
        ...encrypted,
        linkedin_account_name: input.linkedinAccountName || null,
        linkedin_account_url: input.linkedinAccountUrl || null,
        last_verified_at: now,
        error_message: null,
        extra_data: {
          captured_at: now,
          runner_type: "cloud",
        },
        updated_at: now,
      },
      { onConflict: "client_id" },
    )
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function markLinkedInCloudSessionError(clientId: string, errorMessage: string) {
  const db = getDb() as any;
  const now = new Date().toISOString();

  await db
    .from("linkedin_cloud_sessions")
    .update({
      status: "error",
      error_message: errorMessage,
      updated_at: now,
    })
    .eq("client_id", clientId);
}
