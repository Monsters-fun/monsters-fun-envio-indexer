import { createCloudTasksContext } from '../helpers/cloudTasksClient';
import { getPvpArenaConfig } from './config';

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
    path: '/pvp-arena/indexer/match-drawn',
    taskName: 'pvp-arena-match-drawn',
  },
  MatchCancelled: {
    path: '/pvp-arena/indexer/match-cancelled',
    taskName: 'pvp-arena-match-cancelled',
  },
} as const;

export type PvpArenaEventType = keyof typeof EVENT_METADATA;

export interface PvpArenaTaskPayload {
  txHash: string;
  logIndex?: number;
}

export const schedulePvpArenaTask = async (
  eventType: PvpArenaEventType,
  payload: PvpArenaTaskPayload,
): Promise<void> => {
  const config = getPvpArenaConfig();
  const metadata = EVENT_METADATA[eventType];

  const { client, parent } = createCloudTasksContext({ queueName: config.queueName });

  const body: Record<string, string | number> = {
    txHash: payload.txHash,
  };

  if (typeof payload.logIndex === 'number') {
    body.logIndex = payload.logIndex;
  }

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: `${config.backendUrl}${metadata.path}`,
      headers: {
        'Content-Type': 'application/json',
        'x-monsters-cloudtasks-secret': config.secret,
        'X-Cloud-Task': metadata.taskName,
        'X-Source': 'envio-indexer',
      },
      body: Buffer.from(JSON.stringify(body)).toString('base64'),
    },
  };

  try {
    await client.createTask({ parent, task });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create PVP arena Cloud Task (${eventType}) for tx ${payload.txHash}: ${message}`);
  }
};
