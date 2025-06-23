import type {
  Capsule,
  HandlerContext,
} from "generated";
import { getCapsuleType } from "../monsterCapsule/capsuleMetadata";

/**
 * Create and save a new Capsule entity
 */
export function createMonsterCapsule(
  context: HandlerContext,
  tokenId: bigint,
  owner: string
): Capsule {
  const normalizedOwner = owner.toLowerCase();
  
  const newCapsule: Capsule = {
    id: tokenId.toString(),
    tokenId: tokenId,
    owner_id: normalizedOwner,
    ownerAddress: normalizedOwner,
    isStaked: false,
    capsuleType: getCapsuleType(Number(tokenId)),
    stakedAt: BigInt(0),
  };

  context.Capsule.set(newCapsule);
  context.log.info(`[Capsule] Created capsule ${tokenId} for ${normalizedOwner}`);
  
  return newCapsule;
}

/**
 * Update and save Capsule ownership
 */
export function updateMonsterCapsuleOwner(
  context: HandlerContext,
  capsule: Capsule,
  newOwner: string
): Capsule {
  const normalizedOwner = newOwner.toLowerCase();
  
  const updatedCapsule: Capsule = {
    ...capsule,
    owner_id: normalizedOwner,
    ownerAddress: normalizedOwner,
  };

  context.Capsule.set(updatedCapsule);
  context.log.info(`[Capsule] Updated capsule ${capsule.tokenId} owner to ${normalizedOwner}`);
  
  return updatedCapsule;
}

/**
 * Update and save Capsule staking status
 */
export function updateMonsterCapsuleStaking(
  context: HandlerContext,
  capsule: Capsule,
  isStaked: boolean,
  timestamp?: number
): Capsule {
  const updatedCapsule: Capsule = {
    ...capsule,
    isStaked,
    stakedAt: isStaked && timestamp ? BigInt(timestamp) : BigInt(0),
  };

  context.Capsule.set(updatedCapsule);
  context.log.info(`[Capsule] Updated capsule ${capsule.tokenId} staking status to ${isStaked}`);
  
  return updatedCapsule;
}

/**
 * Update capsule ownership and unstake it
 */
export function updateMonsterCapsuleOwnerAndUnstake(
  context: HandlerContext,
  capsule: Capsule,
  newOwner: string
): Capsule {
  const normalizedOwner = newOwner.toLowerCase();
  
  const updatedCapsule: Capsule = {
    ...capsule,
    owner_id: normalizedOwner,
    ownerAddress: normalizedOwner,
    isStaked: false,
    stakedAt: BigInt(0),
  };

  context.Capsule.set(updatedCapsule);
  context.log.info(`[Capsule] Updated capsule ${capsule.tokenId} owner to ${normalizedOwner} and unstaked`);
  
  return updatedCapsule;
}

/**
 * Delete a Capsule entity safely
 */
export function deleteMonsterCapsule(
  context: HandlerContext,
  tokenId: bigint
): void {
  context.Capsule.deleteUnsafe(tokenId.toString());
  context.log.info(`[Capsule] Deleted capsule ${tokenId}`);
} 