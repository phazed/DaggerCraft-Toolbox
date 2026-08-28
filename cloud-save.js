import { supabase } from "./supabase-client.js";

const TOOLBOX_SAVE_NAME = "main";

// These are the localStorage keys your current toolbox already uses.
// Add new tool keys here later, like a hex stocker key.
const DB_BUNDLE_KEYS = [
  "vrahuneGeneratorsV4",
  "vrahuneFolderStateV1",
  "vrahuneEncounterToolStateV7",
  "vrahuneMonsterVaultStateV2",
  "vrahuneStatblockImporterDraftsV3",
  "daggerCraftHexStockerStateV1"
];

function safeReadLocalJson(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function safeWriteLocalJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function collectLocalToolboxBundle() {
  const keys = {};

  for (const key of DB_BUNDLE_KEYS) {
    const value = safeReadLocalJson(key);
    if (value !== undefined) {
      keys[key] = value;
    }
  }

  return {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    keys
  };
}

export function applyToolboxBundle(bundle) {
  if (!bundle || !bundle.keys || typeof bundle.keys !== "object") {
    throw new Error("Invalid toolbox bundle.");
  }

  for (const [key, value] of Object.entries(bundle.keys)) {
    safeWriteLocalJson(key, value);
  }

  return true;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function saveToolboxToCloud() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("You must sign in before saving to cloud.");
  }

  const bundle = collectLocalToolboxBundle();

  const { data, error } = await supabase
    .from("toolbox_cloud_saves")
    .upsert(
      {
        owner_id: user.id,
        save_name: TOOLBOX_SAVE_NAME,
        data: bundle,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "owner_id,save_name"
      }
    )
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function loadToolboxFromCloud() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("You must sign in before loading from cloud.");
  }

  const { data, error } = await supabase
    .from("toolbox_cloud_saves")
    .select("data, updated_at")
    .eq("owner_id", user.id)
    .eq("save_name", TOOLBOX_SAVE_NAME)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return null;
  }

  applyToolboxBundle(data.data);

  return data;
}
