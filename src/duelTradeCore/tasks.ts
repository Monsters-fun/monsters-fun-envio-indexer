import { createCloudTasksContext } from '../helpers/cloudTasksClient';
import { getDuelTradeCoreConfig } from './config';

export const DUEL_TRADE_CORE_EVENT_TYPES = [
  'StrategyRegistered',
  'StrategyOwnerUpdated',
  'StrategyStatusChanged',
  'PayoutProposed',
  'PayoutChanged',
  'PayoutChangeCancelled',
  'DefaultFeeUpdated',
  'StrategyFeeUpdated',
  'PaymentReceived',
  'WithdrawalRequested',
  'WithdrawalBlocked',
  'WithdrawalReleased',
  'PlatformFeesForwarded',
  'PlatformFeesForwardFailed',
  'PlatformFeesWithdrawn',
  'StrategySlashed',
  'PlatformTreasuryProposed',
  'PlatformTreasuryChanged',
  'Paused',
  'Unpaused',
] as const;

export type DuelTradeCoreEventType = (typeof DUEL_TRADE_CORE_EVENT_TYPES)[number];

const toKebabCase = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

const buildTaskHeaders = (eventType: DuelTradeCoreEventType, secret: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  'x-internal-secret': secret,
  'X-Cloud-Task': `duel-trade-core-${toKebabCase(eventType)}`,
  'X-Source': 'envio-indexer',
});

export interface DuelTradeCoreTaskPayload {
  blockchainEventType: DuelTradeCoreEventType;
  type: string;
  payload: Record<string, unknown>;
}

export const scheduleDuelTradeEvent = async (payload: DuelTradeCoreTaskPayload): Promise<void> => {
  const config = getDuelTradeCoreConfig();

  const { client, parent } = createCloudTasksContext({
    queueName: config.queueName,
    projectId: config.projectId,
    location: config.location,
    credentialsJson: config.credentialsJson,
    credentialsPath: config.credentialsPath,
  });

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: `${config.backendUrl}/internal/indexer/events`,
      headers: buildTaskHeaders(payload.blockchainEventType, config.indexerSecret),
      body: Buffer.from(
        JSON.stringify({
          type: payload.type,
          payload: payload.payload,
        }),
      ).toString('base64'),
    },
  };

  console.log('task', task);

  try {
    await client.createTask({ parent, task });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to create DuelTradeCore Cloud Task (${payload.blockchainEventType}) for type ${payload.type}: ${message}`,
    );
  }
};
