import type {
  CapsuleHolder,
  HandlerContext,
} from "generated";
import { ZERO_ADDRESS, CAPSULE_STAKING_CONTRACT_ADDRESS } from "../../constants";

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
  });
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