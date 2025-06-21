import type {
  Capsule,
  HandlerContext,
} from "generated";
import { getCapsuleType } from "../monsterCapsule/capsuleMetadata";

/**
 * Create a new Capsule entity
 */
export function createMonsterCapsule(
  tokenId: bigint,
  owner: string
): Capsule {
  const normalizedOwner = owner.toLowerCase();
  
  return {
    id: tokenId.toString(),
    tokenId: tokenId,
    owner_id: normalizedOwner,
    ownerAddress: normalizedOwner,
    isStaked: false,
    capsuleType: getCapsuleType(Number(tokenId)),
  };
}

/**
 * Update Capsule ownership
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
  
  return updatedCapsule;
}

/**
 * Update Capsule staking status
 */
export function updateMonsterCapsuleStaking(
  context: HandlerContext,
  capsule: Capsule,
  isStaked: boolean,
  newOwner?: string
): Capsule {
  const updatedCapsule: Capsule = {
    ...capsule,
    isStaked,
    ...(newOwner && { owner_id: newOwner.toLowerCase() }),
  };

  context.Capsule.set(updatedCapsule);
  
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