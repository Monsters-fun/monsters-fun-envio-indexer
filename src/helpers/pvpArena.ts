import { createCloudTasksContext } from './cloudTasksClient';
import {
  BACKEND_URL,
  PVP_ARENA_CLOUD_TASKS_SECRET,
  PVP_ARENA_QUEUE_NAME,
} from '../config';

const EVENT_METADATA = {
  ChallengeCreated: {
    path: '/pvp-arena/indexer/challenge-created',
    taskName: 'pvp-arena-challenge-created',
  },
  MatchStarted: {
    path: '/pvp-arena/indexer/match-started',
    taskName: 'pvp-arena-match-started',
  },
  MatchResolved: {
    path: '/pvp-arena/indexer/match-resolved',
    taskName: 'pvp-arena-match-resolved',
  },
  MatchDrawn: {
    path: 'pvp-arena/indexer/match-drawn',
    taskName: 'pvp-arena-match-drawn',
  },
  MatchCancelled: {
    path: '/pvp-arena/indexer/match-cancelled',
    taskName: 'pvp-arena-match-cancelled',
  },
} as const;

export type PvpArenaEventType = keyof typeof EVENT_METADATA;

export interface ArenaTaskPayload {
  txHash: string;
  logIndex?: number;
}

let environmentValidated = false;

function validateEnvironment(): void {
  if (environmentValidated) return;

  const missing: string[] = [];
  if (!BACKEND_URL) missing.push('BACKEND_URL');
  if (!PVP_ARENA_CLOUD_TASKS_SECRET) missing.push('PVP_ARENA_CLOUD_TASKS_SECRET');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  environmentValidated = true;
}

export async function scheduleArenaTask(eventType: PvpArenaEventType, payload: ArenaTaskPayload): Promise<void> {
  validateEnvironment();

  const metadata = EVENT_METADATA[eventType];
  const { client, parent } = createCloudTasksContext({ queueName: PVP_ARENA_QUEUE_NAME });

  const body: Record<string, string | number> = {
    txHash: payload.txHash,
  };

  if (typeof payload.logIndex === 'number') {
    body.logIndex = payload.logIndex;
  }

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: `${BACKEND_URL}${metadata.path}`,
      headers: {
        'Content-Type': 'application/json',
        'x-monsters-cloudtasks-secret': PVP_ARENA_CLOUD_TASKS_SECRET,
        'X-Cloud-Task': metadata.taskName,
        'X-Source': 'envio-indexer',
      },
      body: Buffer.from(JSON.stringify(body)).toString('base64'),
    },
  };

  try {
    await client.createTask({ parent, task });
  } catch (error: any) {
    throw new Error(`Failed to create PVP arena Cloud Task (${eventType}) for tx ${payload.txHash}: ${error.message}`);
  }
}
