import { DuelTradeCore } from 'generated';
import { getDuelTradeCoreConfig } from './config';
import { buildDuelTradeCoreEventEnvelope } from './serializer';
import { scheduleDuelTradeEvent, type DuelTradeCoreEventType } from './tasks';

type DuelTradeCoreLogger = {
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
};

type DuelTradeCoreHandlerEvent = {
  params: Record<string, unknown>;
  srcAddress: string;
  logIndex: number;
  transaction?: { hash?: string };
  chainId?: number | string | bigint;
  block: {
    number: number | string | bigint;
    timestamp: number | string | bigint;
  };
};

const config = getDuelTradeCoreConfig();

const matchesTargetContract = (address: string): boolean =>
  !config.address || address.toLowerCase() === config.address;

const parseBigInt = (
  value: number | string | bigint,
  label: string,
  logger: DuelTradeCoreLogger,
  meta: Record<string, unknown>,
): bigint | null => {
  try {
    return BigInt(value);
  } catch (error) {
    logger.error(`Failed to parse ${label} for DuelTradeCore event`, {
      ...meta,
      value,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

const toUnixSeconds = (
  timestamp: bigint,
  logger: DuelTradeCoreLogger,
  meta: Record<string, unknown>,
): number | null => {
  const numeric = Number(timestamp);
  if (!Number.isSafeInteger(numeric)) {
    logger.error('Block timestamp exceeds safe integer range for DuelTradeCore event', {
      ...meta,
      timestamp: timestamp.toString(),
    });
    return null;
  }
  return numeric;
};

const createHandler =
  (eventType: DuelTradeCoreEventType) =>
  async ({
    event,
    context,
  }: {
    event: DuelTradeCoreHandlerEvent;
    context: { log: DuelTradeCoreLogger };
  }): Promise<void> => {
    const logger = context.log;

    if (!matchesTargetContract(event.srcAddress)) {
      logger.info('Ignoring DuelTradeCore event for non-target contract', {
        eventType,
        observedAddress: event.srcAddress,
        targetAddress: config.address,
        logIndex: event.logIndex,
        txHash: event.transaction?.hash,
      });
      return;
    }

    const txHash = event.transaction?.hash;
    if (!txHash) {
      logger.warn('Missing transaction hash for DuelTradeCore event', {
        eventType,
        logIndex: event.logIndex,
        address: event.srcAddress,
      });
      return;
    }

    const logContext = {
      eventType,
      txHash,
      logIndex: event.logIndex,
      contractAddress: event.srcAddress,
    };

    const blockNumber = parseBigInt(event.block.number, 'block number', logger, logContext);
    if (blockNumber === null) return;

    if (config.minBlock > 0n && blockNumber < config.minBlock) {
      logger.info('Skipping DuelTradeCore event below min block threshold', {
        ...logContext,
        blockNumber: blockNumber.toString(),
        minBlock: config.minBlock.toString(),
      });
      return;
    }

    const blockTimestamp = parseBigInt(event.block.timestamp, 'block timestamp', logger, logContext);
    if (blockTimestamp === null) return;

    const blockTimestampUnix = toUnixSeconds(blockTimestamp, logger, logContext);
    if (blockTimestampUnix === null) return;

    const blockTimestampIso = new Date(blockTimestampUnix * 1000).toISOString();

    let envelope;
    try {
      envelope = buildDuelTradeCoreEventEnvelope(eventType, event, {
        txHash,
        logIndex: event.logIndex,
        blockNumber,
        blockTimestamp,
        blockTimestampIso,
        blockTimestampUnix,
        contractAddress: event.srcAddress,
        chainId: event.chainId,
      });
    } catch (error) {
      logger.error('Failed to construct DuelTradeCore indexer payload', {
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    logger.info('Detected DuelTradeCore event', {
      ...logContext,
      blockNumber: blockNumber.toString(),
      indexerEventType: envelope.type,
    });

    try {
      await scheduleDuelTradeEvent({
        blockchainEventType: eventType,
        type: envelope.type,
        payload: envelope.payload,
      });
    } catch (error) {
      logger.error('Failed to enqueue DuelTradeCore Cloud Task', {
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

export const registerDuelTradeCoreHandlers = (): void => {
  const handler = createHandler;

  DuelTradeCore.StrategyRegistered.handler(handler('StrategyRegistered'));
  DuelTradeCore.StrategyOwnerUpdated.handler(handler('StrategyOwnerUpdated'));
  DuelTradeCore.StrategyStatusChanged.handler(handler('StrategyStatusChanged'));
  DuelTradeCore.PayoutProposed.handler(handler('PayoutProposed'));
  DuelTradeCore.PayoutChanged.handler(handler('PayoutChanged'));
  DuelTradeCore.PayoutChangeCancelled.handler(handler('PayoutChangeCancelled'));
  DuelTradeCore.DefaultFeeUpdated.handler(handler('DefaultFeeUpdated'));
  DuelTradeCore.StrategyFeeUpdated.handler(handler('StrategyFeeUpdated'));
  DuelTradeCore.PaymentReceived.handler(handler('PaymentReceived'));
  DuelTradeCore.WithdrawalRequested.handler(handler('WithdrawalRequested'));
  DuelTradeCore.WithdrawalBlocked.handler(handler('WithdrawalBlocked'));
  DuelTradeCore.WithdrawalReleased.handler(handler('WithdrawalReleased'));
  DuelTradeCore.PlatformFeesForwarded.handler(handler('PlatformFeesForwarded'));
  DuelTradeCore.PlatformFeesForwardFailed.handler(handler('PlatformFeesForwardFailed'));
  DuelTradeCore.PlatformFeesWithdrawn.handler(handler('PlatformFeesWithdrawn'));
  DuelTradeCore.StrategySlashed.handler(handler('StrategySlashed'));
  DuelTradeCore.PlatformTreasuryProposed.handler(handler('PlatformTreasuryProposed'));
  DuelTradeCore.PlatformTreasuryChanged.handler(handler('PlatformTreasuryChanged'));
  DuelTradeCore.Paused.handler(handler('Paused'));
  DuelTradeCore.Unpaused.handler(handler('Unpaused'));
};
