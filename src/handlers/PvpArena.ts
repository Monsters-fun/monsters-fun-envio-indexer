import { MonstersPvpArenaV1 } from 'generated';
import { scheduleArenaTask, type PvpArenaEventType } from '../helpers/pvpArena';
import { PVP_ARENA_ADDRESS, PVP_ARENA_MIN_BLOCK } from '../config';

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

const TARGET_ADDRESS = PVP_ARENA_ADDRESS;

function matchesArenaContract(address: string): boolean {
  if (!TARGET_ADDRESS) {
    return true;
  }
  return address.toLowerCase() === TARGET_ADDRESS;
}

async function queueArenaEvent(eventType: PvpArenaEventType, event: ArenaEvent, logger: ArenaLogger): Promise<void> {
  if (!matchesArenaContract(event.srcAddress)) {
    return;
  }

  const blockNumber = BigInt(event.block.number);
  if (PVP_ARENA_MIN_BLOCK > 0n && blockNumber < PVP_ARENA_MIN_BLOCK) {
    logger.info('Skipping PVP arena event below min block threshold', {
      eventType,
      blockNumber: blockNumber.toString(),
      minBlock: PVP_ARENA_MIN_BLOCK.toString(),
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
  });

  try {
    await scheduleArenaTask(eventType, { txHash, logIndex: event.logIndex });
  } catch (error) {
    logger.error('Failed to enqueue PVP arena Cloud Task', {
      eventType,
      txHash,
      logIndex: event.logIndex,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

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
