import { BACKEND_URL, PAYMENTS_CLOUD_TASKS_SECRET, bigIntEnv, env } from '../config';

export interface PvpArenaConfig {
  address: string;
  backendUrl: string;
  queueName: string;
  secret: string;
  minBlock: bigint;
}

let cachedConfig: PvpArenaConfig | null = null;

export const getPvpArenaConfig = (): PvpArenaConfig => {
  if (cachedConfig) return cachedConfig;

  const address = env('PVP_ARENA_ADDRESS', '0x95eF8b998c504410cbc101A2Fc93A134a30bA619').toLowerCase();
  const backendUrl = env('PVP_ARENA_BACKEND_URL', BACKEND_URL).trim();
  const queueName = env('PVP_ARENA_QUEUE_NAME', 'pvp-arena').trim();
  const secret = env('PVP_ARENA_CLOUD_TASKS_SECRET', PAYMENTS_CLOUD_TASKS_SECRET).trim();
  const minBlock = bigIntEnv('PVP_ARENA_MIN_BLOCK', 0n);

  if (!backendUrl) {
    throw new Error('PVP_ARENA_BACKEND_URL must be configured (or fallback BACKEND_URL must be non-empty)');
  }

  if (!queueName) {
    throw new Error('PVP_ARENA_QUEUE_NAME must be configured (non-empty string)');
  }

  if (!secret) {
    throw new Error(
      'PVP_ARENA_CLOUD_TASKS_SECRET must be configured (or fallback PAYMENTS_CLOUD_TASKS_SECRET must be non-empty)',
    );
  }

  cachedConfig = {
    address,
    backendUrl,
    queueName,
    secret,
    minBlock,
  };

  return cachedConfig;
};
