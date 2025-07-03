import type {
  CapsuleHolder,
  HandlerContext,
} from "generated";
import { ZERO_ADDRESS, CAPSULE_STAKING_CONTRACT_ADDRESS } from "../../constants";

type CountChange = 1 | -1 | 0;

/**
 * Calculate staking bonus tier based on staked capsules count
 */
function calculateStakingBonusTier(stakedCapsules: number): number {
  if (stakedCapsules >= 10) return 3;
  if (stakedCapsules >= 5) return 2;
  if (stakedCapsules >= 2) return 1;
  return 0;
}

/**
 * Calculate points per second based on staking bonus tier and staked capsules count
 */
function calculatePointsPerSecondFromTier(tier: number, stakedCapsules: number): number {
  // If no capsules are staked, no points are earned
  if (stakedCapsules === 0) {
    return 0;
  }
  
  const base_rate = 0.2;
  
  let quantity_multiplier = 1.0;
  if (tier === 3) quantity_multiplier = 1.5;      // 10+ NFTs
  else if (tier === 2) quantity_multiplier = 1.2; // 5+ NFTs  
  else if (tier === 1) quantity_multiplier = 1.15; // 2+ NFTs
  // tier 0 = multiplier 1.0

  return base_rate * quantity_multiplier;
}

/**
 * Get an existing CapsuleHolder or create a new one with default values
 */
export async function getOrCreateCapsuleHolder(
  context: HandlerContext,
  address: string
): Promise<CapsuleHolder> {
  const normalizedAddress = address.toLowerCase();
  
  return await context.CapsuleHolder.getOrCreate({
    id: normalizedAddress,
    totalCapsules: 0,
    stakedCapsules: 0,
    stakingBonusTier: 0,
    pointsPerSecond: 0, // Start with 0 since no capsules are staked initially
  });
}

/**
 * Update and save holder statistics (counts, staking bonus tier, and points per second)
 */
export async function updateHolderStats(
  context: HandlerContext,
  holderAddress: string,
  totalChange: CountChange,
  stakedChange: CountChange,
  preloadedHolder?: CapsuleHolder
): Promise<CapsuleHolder> {
  if (shouldExcludeFromHolderTracking(holderAddress)) {
    // For excluded addresses, we might not have a preloadedHolder, return a dummy one
    return preloadedHolder || {
      id: holderAddress,
      totalCapsules: 0,
      stakedCapsules: 0,
      stakingBonusTier: 0,
      pointsPerSecond: 0,
    };
  }

  const holder = preloadedHolder ?? await getOrCreateCapsuleHolder(context, holderAddress);
  
  // Development assertion: log when we fallback to DB query (should be rare)
  if (!preloadedHolder) {
    context.log.warn(`[CapsuleHolder] No preloaded holder for ${holderAddress}, falling back to DB query`);
  }

  const newStakedCount = Math.max(0, holder.stakedCapsules + stakedChange);
  const newStakingBonusTier = calculateStakingBonusTier(newStakedCount);
  
  // Always recalculate pointsPerSecond to handle the 0 staked capsules case correctly
  const newPointsPerSecond = calculatePointsPerSecondFromTier(newStakingBonusTier, newStakedCount);

  const updatedHolder: CapsuleHolder = {
    ...holder,
    totalCapsules: Math.max(0, holder.totalCapsules + totalChange),
    stakedCapsules: newStakedCount,
    stakingBonusTier: newStakingBonusTier,
    pointsPerSecond: newPointsPerSecond,
  };

  context.CapsuleHolder.set(updatedHolder);
  
  const logParts = [
    `[CapsuleHolder] Updated ${holderAddress}:`,
    `total=${updatedHolder.totalCapsules} (${totalChange >= 0 ? '+' : ''}${totalChange})`,
    `staked=${updatedHolder.stakedCapsules} (${stakedChange >= 0 ? '+' : ''}${stakedChange})`,
    `tier=${updatedHolder.stakingBonusTier}`,
    `pointsPerSecond=${updatedHolder.pointsPerSecond}`
  ];
  
  // Log tier change if it occurred
  if (newStakingBonusTier !== holder.stakingBonusTier) {
    logParts.push(`tierChange: ${holder.stakingBonusTier}→${newStakingBonusTier}`);
    logParts.push(`pointsPerSecondChange: ${holder.pointsPerSecond}→${newPointsPerSecond}`);
  }
  
  context.log.info(logParts.join(', '));

  return updatedHolder;
}

/**
 * Check if an address should be excluded from holder tracking
 */
export function shouldExcludeFromHolderTracking(address: string): boolean {
  const normalizedAddress = address.toLowerCase();
  return (
    normalizedAddress === ZERO_ADDRESS ||
    normalizedAddress === CAPSULE_STAKING_CONTRACT_ADDRESS
  );
} 