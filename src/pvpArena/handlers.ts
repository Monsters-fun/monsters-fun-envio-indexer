import { MonstersPvpArenaV1 } from 'generated';
import { getPvpArenaConfig } from './config';
import { schedulePvpArenaTask, type PvpArenaEventType } from './tasks';

type ArenaEvent = {
  srcAddress: string;
  logIndex: number;
  transaction?: { hash?: string };
  block: { number: number };
};

type ArenaLogger = {
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
};

const config = getPvpArenaConfig();

const matchesArenaContract = (address: string): boolean =>
  !config.address || address.toLowerCase() === config.address;

const queueArenaEvent = async (
  eventType: PvpArenaEventType,
  event: ArenaEvent,
  logger: ArenaLogger,
): Promise<void> => {
  if (!matchesArenaContract(event.srcAddress)) {
    logger.info('Ignoring non PVP arena contract event', {
      eventType,
      contractAddress: event.srcAddress,
      logIndex: event.logIndex,
      targetAddress: config.address,
      txHash: event.transaction?.hash,
    });
    return;
  }

  const blockNumber = BigInt(event.block.number);
  if (config.minBlock > 0n && blockNumber < config.minBlock) {
    logger.info('Skipping PVP arena event below min block threshold', {
      eventType,
      blockNumber: blockNumber.toString(),
      minBlock: config.minBlock.toString(),
      txHash: event.transaction?.hash,
      logIndex: event.logIndex,
    });
    return;
  }

  const txHash = event.transaction?.hash;
  if (!txHash) {
    logger.warn('Missing transaction hash for PVP arena event', {
      eventType,
      logIndex: event.logIndex,
      address: event.srcAddress,
    });
    return;
  }

  logger.info('Detected PVP arena event', {
    eventType,
    txHash,
    logIndex: event.logIndex,
    blockNumber: blockNumber.toString(),
    contractAddress: event.srcAddress,
  });

  try {
    await schedulePvpArenaTask(eventType, { txHash, logIndex: event.logIndex });
  } catch (error) {
    logger.error('Failed to enqueue PVP arena Cloud Task', {
      eventType,
      txHash,
      logIndex: event.logIndex,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const registerPvpArenaHandlers = (): void => {
  MonstersPvpArenaV1.ChallengeCreated.handler(async ({ event, context }) => {
    await queueArenaEvent('ChallengeCreated', event, context.log);
  });

  MonstersPvpArenaV1.MatchStarted.handler(async ({ event, context }) => {
    await queueArenaEvent('MatchStarted', event, context.log);
  });

  MonstersPvpArenaV1.MatchResolved.handler(async ({ event, context }) => {
    await queueArenaEvent('MatchResolved', event, context.log);
  });

  MonstersPvpArenaV1.MatchDrawn.handler(async ({ event, context }) => {
    await queueArenaEvent('MatchDrawn', event, context.log);
  });

  MonstersPvpArenaV1.MatchCancelled.handler(async ({ event, context }) => {
    await queueArenaEvent('MatchCancelled', event, context.log);
  });
};
