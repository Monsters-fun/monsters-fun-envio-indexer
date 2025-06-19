import { handlerContext, Stake as StakeEntity, UserStats as UserStatsEntity } from "generated";

export interface StakeData {
  tokenId: bigint;
  owner: string;
  stakedAt: bigint;
  isActive: boolean;
  earnedPoints: bigint;
}

export interface UserStatsCalcResult {
  historicalPoints: bigint;
  currentActivePoints: bigint;
  totalPoints: bigint;
  pointsPerSecond: bigint; // stored as milli-points for extra precision
  quantityTier: number;
  activeStakesCount: number;
  totalStakesCount: number;
}

const BASE_RATE = 0.2; // ≈ 1 point every 5 seconds for a single NFT

function quantityMultiplier(activeStakesCount: number): number {
  if (activeStakesCount >= 10) return 1.5;
  if (activeStakesCount >= 5) return 1.2;
  return 1.0;
}

export function getQuantityTier(activeStakesCount: number): number {
  if (activeStakesCount >= 10) return 2;
  if (activeStakesCount >= 5) return 1;
  return 0;
}

/**
 * Calculate the points earned for a single NFT once it is unstaked.
 */
export function calculateSingleNFTPoints(
  stakingDuration: bigint,
  totalUserActiveStakes: number
): number {
  const secondsStaked = Number(stakingDuration);
  const multiplier = quantityMultiplier(totalUserActiveStakes);
  return Math.floor(BASE_RATE * secondsStaked * multiplier);
}

/**
 * Calculate the points-per-second rate for live accrual.
 */
export function calculatePointsPerSecondRate(activeStakesCount: number): number {
  return BASE_RATE * quantityMultiplier(activeStakesCount);
}

/**
 * Aggregate all user stakes to build leaderboard stats.
 */
export function calculateUserStats(
  userStakes: StakeData[],
  currentTimestamp: bigint
): UserStatsCalcResult {
  const active = userStakes.filter((s) => s.isActive);
  const inactive = userStakes.filter((s) => !s.isActive);

  const activeCount = active.length;
  const multiplier = quantityMultiplier(activeCount);
  const tier = getQuantityTier(activeCount);

  // Current active points (non-finalized)
  let activePoints = 0;
  for (const s of active) {
    const secondsStaked = Number(currentTimestamp - s.stakedAt);
    activePoints += Math.floor(BASE_RATE * secondsStaked * multiplier);
  }

  // Historical (finalized) points
  const historical = inactive.reduce((sum, s) => sum + Number(s.earnedPoints), 0);

  const pps = calculatePointsPerSecondRate(activeCount);

  return {
    historicalPoints: BigInt(historical),
    currentActivePoints: BigInt(activePoints),
    totalPoints: BigInt(historical + activePoints),
    pointsPerSecond: BigInt(Math.floor(pps * 1000)), // milli-points
    quantityTier: tier,
    activeStakesCount: activeCount,
    totalStakesCount: userStakes.length,
  };
}

/**
 * Persist a recalculated UserStats entity.
 */
export async function persistUserStats(
  context: handlerContext,
  userAddress: string,
  stats: UserStatsCalcResult,
  updatedAt: bigint
): Promise<void> {
  const entity: UserStatsEntity = {
    id: userAddress,
    userAddress,
    historicalPoints: stats.historicalPoints,
    currentActivePoints: stats.currentActivePoints,
    totalPoints: stats.totalPoints,
    pointsPerSecond: stats.pointsPerSecond,
    activeStakesCount: stats.activeStakesCount,
    totalStakesCount: stats.totalStakesCount,
    quantityTier: stats.quantityTier,
    lastUpdatedAt: updatedAt,
  };

  context.UserStats.set(entity);
}

/**
 * Utility that recalculates user stats from a list of stakes.
 * Keeps the handler code clean.
 */
export async function recalculateUserStats(
  context: handlerContext,
  userAddress: string,
  currentTimestamp: bigint,
  userStakes: StakeEntity[]
): Promise<void> {
  const data: StakeData[] = userStakes.map((s) => ({
    tokenId: s.tokenId,
    owner: s.owner,
    stakedAt: s.stakedAt,
    isActive: s.isActive,
    earnedPoints: s.earnedPoints,
  }));

  const stats = calculateUserStats(data, currentTimestamp);
  await persistUserStats(context, userAddress, stats, currentTimestamp);

  context.log.info(
    `[USER_STATS] ${userAddress}: total=${stats.totalPoints.toString()} active=${stats.activeStakesCount}`
  );
} 