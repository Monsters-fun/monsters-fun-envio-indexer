// Centralized environment configuration
// Read process.env here only; everywhere else import these values

const readEnv = (key: string): string | undefined => {
  const direct = process.env[key];
  if (typeof direct === "string" && direct.length > 0) return direct;

  const prefixed = process.env[`ENVIO_${key}`];
  if (typeof prefixed === "string" && prefixed.length > 0) return prefixed;

  return undefined;
};

const env = (key: string, defaultValue = ""): string => {
  const value = readEnv(key);
  return value !== undefined ? value : defaultValue;
};

const boolEnv = (key: string, defaultValue = true): boolean => {
  const raw = readEnv(key);
  if (raw === undefined) return defaultValue;
  const val = String(raw).trim().toLowerCase();
  return val === "1" || val === "true" || val === "yes" || val === "on";
};

const bigIntEnv = (key: string, defaultValue: bigint = 0n): bigint => {
  const raw = readEnv(key);
  if (raw === undefined) return defaultValue;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return defaultValue;

  try {
    const value = BigInt(trimmed);
    if (value < 0n) {
      throw new Error(`${key} must be a non-negative integer`);
    }
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid value for ${key}: ${message}`);
  }
};

// Backend
export const BACKEND_URL = env("BACKEND_URL", "https://monster-be-mainnet-467490125245.us-central1.run.app");

// Google Cloud Tasks
export const GCP_PROJECT_ID = env("GCP_PROJECT_ID", "linear-quasar-443107-q2");
export const GCP_LOCATION = env("GCP_LOCATION", "us-central1");
export const GCP_QUEUE_NAME = env("GCP_QUEUE_NAME", "payments");
export const GOOGLE_APPLICATION_CREDENTIALS = env("GOOGLE_APPLICATION_CREDENTIALS");
export const GOOGLE_APPLICATION_CREDENTIALS_JSON = env("GOOGLE_APPLICATION_CREDENTIALS_JSON");
export const PAYMENTS_CLOUD_TASKS_SECRET = env("PAYMENTS_CLOUD_TASKS_SECRET");
export const PAYMENT_CONFIRMATION_MIN_BLOCK = bigIntEnv("PAYMENT_CONFIRMATION_MIN_BLOCK", 0n);

export const PVP_ARENA_QUEUE_NAME = env("PVP_ARENA_QUEUE_NAME", "pvp-arena");
export const PVP_ARENA_CLOUD_TASKS_SECRET = env("PVP_ARENA_CLOUD_TASKS_SECRET", PAYMENTS_CLOUD_TASKS_SECRET);
export const PVP_ARENA_MIN_BLOCK = bigIntEnv("PVP_ARENA_MIN_BLOCK", 0n);

// PVP arena configuration
export const PVP_ARENA_ADDRESS = env("PVP_ARENA_ADDRESS", "0x2c21D6C0C81f7dB8fCa08F701aAAe17A1054D8D2").toLowerCase();

// Payments addresses
export const PAYMENT_DESTINATION_ADDRESS = env("PAYMENT_DESTINATION_ADDRESS", "0xB783448d31Ce8768B1F296fa3541A297fC1353c7").toLowerCase();
export const PAYMENT_ETH_DESTINATION_ADDRESS = env("PAYMENT_ETH_DESTINATION_ADDRESS", "0xB783448d31Ce8768B1F296fa3541A297fC1353c7").toLowerCase();

// Feature flags derived from env
// Feature toggles
export const PAYMENT_FORWARDING_ENABLED_GLOBAL = boolEnv("PAYMENT_FORWARDING_ENABLED_GLOBAL", true);
export const PAYMENT_FORWARDING_ERC20_ENABLED = boolEnv("PAYMENT_FORWARDING_ERC20_ENABLED", true);
export const PAYMENT_FORWARDING_ETH_ENABLED = boolEnv("PAYMENT_FORWARDING_ETH_ENABLED", true);

// Effective mode flags (require config + toggles)
export const IS_ERC20_PAYMENT_FORWARDING_ENABLED = Boolean(
  PAYMENT_FORWARDING_ENABLED_GLOBAL &&
  PAYMENT_FORWARDING_ERC20_ENABLED &&
  PAYMENT_DESTINATION_ADDRESS &&
  BACKEND_URL,
);

export const IS_ETH_PAYMENT_FORWARDING_ENABLED = Boolean(
  PAYMENT_FORWARDING_ENABLED_GLOBAL &&
  PAYMENT_FORWARDING_ETH_ENABLED &&
  PAYMENT_ETH_DESTINATION_ADDRESS &&
  BACKEND_URL,
);
