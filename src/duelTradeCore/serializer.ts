import type { DuelTradeCoreEventType } from './tasks';

export interface RawDuelTradeCoreEvent {
  params: Record<string, unknown>;
}

export interface DuelTradeCoreEventContext {
  txHash: string;
  logIndex: number;
  blockNumber: bigint;
  blockTimestamp: bigint;
  blockTimestampIso: string;
  blockTimestampUnix: number;
  contractAddress?: string;
  chainId?: number | string | bigint;
}

export interface DuelTradeCoreEventEnvelope {
  type: string;
  payload: Record<string, unknown>;
}

type PaymentReceivedParams = {
  paymentId: bigint;
  strategyId: bigint;
  payer: string;
  beneficiary: string;
  amount: bigint;
  feeBps: bigint;
  platformFee: bigint;
  netToStrategy: bigint;
  offchainRef: unknown;
  accessDurationSec: bigint;
};

type StrategyRegisteredParams = {
  strategyId: bigint;
  owner: string;
  operator: string;
  payout: string;
};

type WithdrawalRequestedParams = {
  requestId: bigint;
  strategyId: bigint;
  operator: string;
  payout: string;
  amount: bigint;
  unlockTime: bigint;
};

type WithdrawalBlockedParams = {
  requestId: bigint;
  strategyId: bigint;
  by: string;
  reason: string;
};

type WithdrawalReleasedParams = {
  requestId: bigint;
  strategyId: bigint;
  operator: string;
  to: string;
  amount: bigint;
  remainingEscrow: bigint;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toHex = (value: Uint8Array): string =>
  value.length === 0 ? '0x' : `0x${Buffer.from(value).toString('hex')}`;

const normalizeValue = (value: unknown): unknown => {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value instanceof Uint8Array) {
    return toHex(value);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, normalizeValue(nested)]));
  }

  return value;
};

const normalizeParams = (params: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(params).map(([key, value]) => [key, normalizeValue(value)]));

const bigintToNumber = (value: bigint): number | null => {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : null;
};

const requireSafeNumber = (value: bigint, label: string): number => {
  const numeric = bigintToNumber(value);
  if (numeric === null) {
    throw new Error(`${label} exceeds safe integer range`);
  }
  return numeric;
};

const toIsoFromSeconds = (value: bigint, label: string): string => {
  const unixSeconds = requireSafeNumber(value, label);
  return new Date(unixSeconds * 1000).toISOString();
};

const appendChainId = (
  payload: Record<string, unknown>,
  chainId: DuelTradeCoreEventContext['chainId'],
): void => {
  if (chainId === undefined) return;
  if (typeof chainId === 'bigint') {
    payload.chainId = chainId.toString();
  } else if (typeof chainId === 'number') {
    payload.chainId = chainId;
  } else {
    payload.chainId = String(chainId);
  }
};

const buildPaymentEnvelope = (
  params: Record<string, unknown>,
  basePayload: Record<string, unknown>,
): DuelTradeCoreEventEnvelope => {
  const payment = params as Partial<PaymentReceivedParams>;

  if (
    typeof payment.payer !== 'string' ||
    typeof payment.beneficiary !== 'string' ||
    typeof payment.paymentId !== 'bigint' ||
    typeof payment.strategyId !== 'bigint' ||
    typeof payment.amount !== 'bigint' ||
    typeof payment.platformFee !== 'bigint' ||
    typeof payment.netToStrategy !== 'bigint' ||
    typeof payment.feeBps !== 'bigint' ||
    typeof payment.accessDurationSec !== 'bigint'
  ) {
    throw new Error('PaymentReceived params missing or invalid');
  }

  const feeBpsNumber = bigintToNumber(payment.feeBps);
  const accessDurationNumber = bigintToNumber(payment.accessDurationSec);
  const paymentIdNumber = requireSafeNumber(payment.paymentId, 'paymentId');
  const strategyIdNumber = requireSafeNumber(payment.strategyId, 'strategyId');

  return {
    type: 'payment.received',
    payload: {
      ...basePayload,
      paymentId: paymentIdNumber,
      strategyId: strategyIdNumber,
      payer: payment.payer.toLowerCase(),
      beneficiary: payment.beneficiary.toLowerCase(),
      amountAtomic: payment.amount.toString(),
      platformFeeAtomic: payment.platformFee.toString(),
      netToStrategyAtomic: payment.netToStrategy.toString(),
      feeBps: feeBpsNumber ?? undefined,
      accessDurationSec: accessDurationNumber ?? undefined,
      offchainRef: normalizeValue(payment.offchainRef),
    },
  };
};

const buildStrategyRegisteredEnvelope = (
  params: Record<string, unknown>,
  basePayload: Record<string, unknown>,
): DuelTradeCoreEventEnvelope => {
  const strategy = params as Partial<StrategyRegisteredParams>;

  if (
    typeof strategy.strategyId !== 'bigint' ||
    typeof strategy.owner !== 'string' ||
    typeof strategy.operator !== 'string' ||
    typeof strategy.payout !== 'string'
  ) {
    throw new Error('StrategyRegistered params missing or invalid');
  }

  const strategyIdNumber = requireSafeNumber(strategy.strategyId, 'strategyId');

  return {
    type: 'strategy.registered',
    payload: {
      ...basePayload,
      strategyId: strategyIdNumber,
      owner: strategy.owner.toLowerCase(),
      operator: strategy.operator.toLowerCase(),
      payout: strategy.payout.toLowerCase(),
    },
  };
};

const buildWithdrawalRequestedEnvelope = (
  params: Record<string, unknown>,
  basePayload: Record<string, unknown>,
): DuelTradeCoreEventEnvelope => {
  const request = params as Partial<WithdrawalRequestedParams>;

  if (
    typeof request.requestId !== 'bigint' ||
    typeof request.strategyId !== 'bigint' ||
    typeof request.amount !== 'bigint' ||
    typeof request.unlockTime !== 'bigint' ||
    typeof request.operator !== 'string' ||
    typeof request.payout !== 'string'
  ) {
    throw new Error('WithdrawalRequested params missing or invalid');
  }

  const requestIdNumber = requireSafeNumber(request.requestId, 'requestId');
  const strategyIdNumber = requireSafeNumber(request.strategyId, 'strategyId');

  return {
    type: 'withdrawal.requested',
    payload: {
      ...basePayload,
      requestId: requestIdNumber,
      strategyId: strategyIdNumber,
      operator: request.operator.toLowerCase(),
      payout: request.payout.toLowerCase(),
      amountAtomic: request.amount.toString(),
      unlockTime: toIsoFromSeconds(request.unlockTime, 'unlockTime'),
    },
  };
};

const buildWithdrawalBlockedEnvelope = (
  params: Record<string, unknown>,
  basePayload: Record<string, unknown>,
): DuelTradeCoreEventEnvelope => {
  const blocked = params as Partial<WithdrawalBlockedParams>;

  if (
    typeof blocked.requestId !== 'bigint' ||
    typeof blocked.strategyId !== 'bigint' ||
    typeof blocked.by !== 'string' ||
    typeof blocked.reason !== 'string'
  ) {
    throw new Error('WithdrawalBlocked params missing or invalid');
  }

  const requestIdNumber = requireSafeNumber(blocked.requestId, 'requestId');
  const strategyIdNumber = requireSafeNumber(blocked.strategyId, 'strategyId');

  return {
    type: 'withdrawal.blocked',
    payload: {
      ...basePayload,
      requestId: requestIdNumber,
      strategyId: strategyIdNumber,
      actor: blocked.by.toLowerCase(),
      reason: blocked.reason,
    },
  };
};

const buildWithdrawalReleasedEnvelope = (
  params: Record<string, unknown>,
  basePayload: Record<string, unknown>,
): DuelTradeCoreEventEnvelope => {
  const released = params as Partial<WithdrawalReleasedParams>;

  if (
    typeof released.requestId !== 'bigint' ||
    typeof released.strategyId !== 'bigint' ||
    typeof released.amount !== 'bigint' ||
    typeof released.remainingEscrow !== 'bigint' ||
    typeof released.operator !== 'string' ||
    typeof released.to !== 'string'
  ) {
    throw new Error('WithdrawalReleased params missing or invalid');
  }

  const requestIdNumber = requireSafeNumber(released.requestId, 'requestId');
  const strategyIdNumber = requireSafeNumber(released.strategyId, 'strategyId');

  return {
    type: 'withdrawal.released',
    payload: {
      ...basePayload,
      requestId: requestIdNumber,
      strategyId: strategyIdNumber,
      operator: released.operator.toLowerCase(),
      recipient: released.to.toLowerCase(),
      amountAtomic: released.amount.toString(),
      remainingEscrowAtomic: released.remainingEscrow.toString(),
    },
  };
};

const toKebabCase = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

const buildGenericEnvelope = (
  eventType: DuelTradeCoreEventType,
  params: Record<string, unknown>,
  basePayload: Record<string, unknown>,
): DuelTradeCoreEventEnvelope => ({
  type: `duel-trade-core.${toKebabCase(eventType)}`,
  payload: {
    ...basePayload,
    params: normalizeParams(params),
  },
});

export const buildDuelTradeCoreEventEnvelope = (
  eventType: DuelTradeCoreEventType,
  event: RawDuelTradeCoreEvent,
  context: DuelTradeCoreEventContext,
): DuelTradeCoreEventEnvelope => {
  const basePayload: Record<string, unknown> = {
    txHash: context.txHash,
    blockTimestamp: context.blockTimestampIso,
  };

  const blockNumberNumber = bigintToNumber(context.blockNumber);
  if (blockNumberNumber !== null) {
    basePayload.blockNumber = blockNumberNumber;
  }

  appendChainId(basePayload, context.chainId);

  if (eventType === 'PaymentReceived') {
    return buildPaymentEnvelope(event.params, basePayload);
  }

  if (eventType === 'StrategyRegistered') {
    return buildStrategyRegisteredEnvelope(event.params, basePayload);
  }

  if (eventType === 'WithdrawalRequested') {
    return buildWithdrawalRequestedEnvelope(event.params, basePayload);
  }

  if (eventType === 'WithdrawalBlocked') {
    return buildWithdrawalBlockedEnvelope(event.params, basePayload);
  }

  if (eventType === 'WithdrawalReleased') {
    return buildWithdrawalReleasedEnvelope(event.params, basePayload);
  }

  return buildGenericEnvelope(eventType, event.params, basePayload);
};
