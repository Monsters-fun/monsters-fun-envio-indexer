import {
  BACKEND_URL,
  GCP_LOCATION,
  GCP_PROJECT_ID,
  GOOGLE_APPLICATION_CREDENTIALS,
  GOOGLE_APPLICATION_CREDENTIALS_JSON,
  PAYMENTS_CLOUD_TASKS_SECRET,
  bigIntEnv,
  env,
  optionalEnv,
} from '../config';

export interface DuelTradeCoreConfig {
  address: string;
  backendUrl: string;
  queueName: string;
  indexerSecret: string;
  minBlock: bigint;
  projectId?: string;
  location?: string;
  credentialsJson?: string;
  credentialsPath?: string;
}

let cachedConfig: DuelTradeCoreConfig | null = null;

export const getDuelTradeCoreConfig = (): DuelTradeCoreConfig => {
  if (cachedConfig) return cachedConfig;

  const address = env('DUEL_TRADE_CORE_ADDRESS', '0xfFf5454a2231CFac95BadD9563069f55A5fa88c9').toLowerCase();
  const backendUrl = env('DUEL_TRADE_CORE_BACKEND_URL', BACKEND_URL).trim();
  const queueName = env('DUEL_TRADE_CORE_QUEUE_NAME', 'duel-trade').trim();
  const indexerSecret = env('DUEL_TRADE_CORE_INDEXER_SECRET', PAYMENTS_CLOUD_TASKS_SECRET).trim();
  const minBlock = bigIntEnv('DUEL_TRADE_CORE_MIN_BLOCK', 0n);

  if (!backendUrl) {
    throw new Error('DUEL_TRADE_CORE_BACKEND_URL must be configured (or fallback BACKEND_URL must be non-empty)');
  }

  if (!queueName) {
    throw new Error('DUEL_TRADE_CORE_QUEUE_NAME must be configured (non-empty string)');
  }

  if (!indexerSecret) {
    throw new Error(
      'DUEL_TRADE_CORE_INDEXER_SECRET must be configured (or fallback PAYMENTS_CLOUD_TASKS_SECRET must be non-empty)',
    );
  }

  const projectId = optionalEnv('DUEL_TRADE_CORE_GCP_PROJECT_ID') ?? GCP_PROJECT_ID;
  const location = optionalEnv('DUEL_TRADE_CORE_GCP_LOCATION') ?? GCP_LOCATION;
  const credentialsJson = optionalEnv('DUEL_TRADE_CORE_GOOGLE_APPLICATION_CREDENTIALS_JSON')
    ?? GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const credentialsPath = optionalEnv('DUEL_TRADE_CORE_GOOGLE_APPLICATION_CREDENTIALS')
    ?? GOOGLE_APPLICATION_CREDENTIALS;

  cachedConfig = {
    address,
    backendUrl,
    queueName,
    indexerSecret,
    minBlock,
    projectId: projectId?.trim() || undefined,
    location: location?.trim() || undefined,
    credentialsJson: credentialsJson?.trim() || undefined,
    credentialsPath: credentialsPath?.trim() || undefined,
  };

  return cachedConfig;
};
