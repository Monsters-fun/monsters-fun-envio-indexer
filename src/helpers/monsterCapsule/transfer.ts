import type {
  CapsuleHolder,
  HandlerContext,
  Capsule,
} from "generated";
import {
  CAPSULE_STAKING_CONTRACT_ADDRESS,
  ZERO_ADDRESS,
} from "../../constants";
import {
  getOrCreateCapsuleHolder,
  shouldExcludeFromHolderTracking,
  createMonsterCapsule,
  updateMonsterCapsuleOwner,
  updateMonsterCapsuleStaking,
  deleteMonsterCapsule,
} from "../entities";

type CountChange = 1 | -1 | 0;

/**
 * Update holder capsule counts with preloaded optimization
 */
export async function updateHolderCounts(
  context: HandlerContext,
  holderAddress: string,
  totalChange: CountChange,
  stakedChange: CountChange,
  preloadedHolder?: CapsuleHolder
): Promise<void> {
  if (shouldExcludeFromHolderTracking(holderAddress)) return;

  const holder = preloadedHolder ?? await getOrCreateCapsuleHolder(context, holderAddress);

  const updatedHolder: CapsuleHolder = {
    ...holder,
    totalCapsules: Math.max(0, holder.totalCapsules + totalChange),
    stakedCapsules: Math.max(0, holder.stakedCapsules + stakedChange),
  };

  context.CapsuleHolder.set(updatedHolder);
}

// --- Logic Handlers ---

export async function handleStaking(
  context: HandlerContext,
  tokenId: bigint,
  capsule: Capsule | undefined,
  fromHolder?: CapsuleHolder
): Promise<void> {
  if (!capsule) {
    context.log.error(
      `[MC-Stake] Attempted to stake a token that does not exist: ${tokenId}`
    );
    return;
  }
  
  context.log.info(`[MC-Stake] BEFORE: Token ${tokenId} isStaked=${capsule.isStaked}, owner=${capsule.ownerAddress}`);
  
  // Create updated capsule with staked status
  const updatedCapsule: Capsule = {
    ...capsule,
    isStaked: true,
    // owner_id and ownerAddress stay the same - we don't want the staking contract as owner
  };
  
  // Save the updated capsule
  context.Capsule.set(updatedCapsule);
  
  // Update holder counts
  await updateHolderCounts(context, capsule.ownerAddress, 0, 1, fromHolder);
  
  context.log.info(`[MC-Stake] AFTER: Token ${tokenId} isStaked=${updatedCapsule.isStaked}, owner=${updatedCapsule.ownerAddress}`);
  context.log.info(`[MC-Transfer] Staked token ${tokenId}. Holder: ${capsule.ownerAddress}`);
}

export async function handleUnstaking(
  context: HandlerContext,
  toAddress: string,
  tokenId: bigint,
  capsule: Capsule | undefined,
  toHolder?: CapsuleHolder
): Promise<void> {
  if (!capsule) {
    context.log.error(
      `[MC-Unstake] Attempted to unstake a token that does not exist: ${tokenId}`
    );
    return;
  }
  
  context.log.info(`[MC-Unstake] BEFORE: Token ${tokenId} isStaked=${capsule.isStaked}, owner=${capsule.ownerAddress}`);
  
  const normalizedToAddress = toAddress.toLowerCase();
  
  // Create updated capsule with unstaked status and correct owner
  const updatedCapsule: Capsule = {
    ...capsule,
    isStaked: false,
    owner_id: normalizedToAddress, // Update owner relation
    ownerAddress: normalizedToAddress, // Update direct address access
  };
  
  // Save the updated capsule
  context.Capsule.set(updatedCapsule);
  
  // Update holder counts (+1 total, -1 staked for the receiver)
  await updateHolderCounts(context, normalizedToAddress, 1, -1, toHolder);
  
  context.log.info(`[MC-Unstake] AFTER: Token ${tokenId} isStaked=${updatedCapsule.isStaked}, owner=${updatedCapsule.ownerAddress}`);
  context.log.info(`[MC-Transfer] Unstaked token ${tokenId} to ${normalizedToAddress}`);
}

export async function handleMint(
  context: HandlerContext,
  toAddress: string,
  tokenId: bigint,
  toHolder?: CapsuleHolder
): Promise<void> {
  const newCapsule = createMonsterCapsule(tokenId, toAddress);
  context.Capsule.set(newCapsule);
  
  // Update holder counts (+1 total, no change in staked)
  await updateHolderCounts(context, toAddress, 1, 0, toHolder);
  
  context.log.info(`[MC-Transfer] Minted token ${tokenId} to ${toAddress.toLowerCase()}`);
}

export async function handleBurn(
  context: HandlerContext,
  fromAddress: string,
  tokenId: bigint,
  fromHolder?: CapsuleHolder,
  capsule?: Capsule
): Promise<void> {
  deleteMonsterCapsule(context, tokenId);
  
  // Determine if the burned capsule was staked
  const wasStaked = capsule?.isStaked ?? false;
  const stakedChange: CountChange = wasStaked ? -1 : 0;
  
  // Update holder counts (-1 total, -1 staked if it was staked)
  await updateHolderCounts(context, fromAddress, -1, stakedChange, fromHolder);
  
  context.log.info(`[MC-Transfer] Burned token ${tokenId} (was staked: ${wasStaked})`);
}

export async function handleRegularTransfer(
  context: HandlerContext,
  fromAddress: string,
  toAddress: string,
  tokenId: bigint,
  capsule: Capsule | undefined,
  fromHolder?: CapsuleHolder,
  toHolder?: CapsuleHolder
): Promise<void> {
  const normalizedFromAddress = fromAddress.toLowerCase();
  const normalizedToAddress = toAddress.toLowerCase();
  
  if (!capsule) {
    // First seen transfer - create capsule entity
    const newCapsule = createMonsterCapsule(tokenId, normalizedToAddress);
    context.Capsule.set(newCapsule);
    context.log.warn(
      `[MC-Transfer] First seen transfer for token ${tokenId}. Created entity.`
    );
  } else {
    // Regular transfer - update ownership
    const updatedCapsule: Capsule = {
      ...capsule,
      owner_id: normalizedToAddress,
      ownerAddress: normalizedToAddress,
    };
    context.Capsule.set(updatedCapsule);
    
    context.log.info(
      `[MC-Transfer] Transferred token ${tokenId} from ${normalizedFromAddress} to ${normalizedToAddress}`
    );
  }
  
  // Determine if the transferred capsule is staked
  const isStaked = capsule?.isStaked ?? false;
  const stakedChange: CountChange = isStaked ? 1 : 0;
  
  // Update holder counts
  await updateHolderCounts(context, normalizedFromAddress, -1, isStaked ? -1 : 0, fromHolder);
  await updateHolderCounts(context, normalizedToAddress, 1, stakedChange, toHolder);
}

// --- Main Transfer Processor ---

export async function processTransfer(
  context: HandlerContext,
  from: string,
  to: string,
  tokenId: bigint,
  capsule: Capsule | undefined,
  fromHolder?: CapsuleHolder,
  toHolder?: CapsuleHolder
): Promise<void> {
  if (to === CAPSULE_STAKING_CONTRACT_ADDRESS) {
    // Transfer TO staking contract = User stakes their NFT
    await handleStaking(context, tokenId, capsule, fromHolder);
  } else if (from === CAPSULE_STAKING_CONTRACT_ADDRESS) {
    // Transfer FROM staking contract = User unstakes their NFT
    await handleUnstaking(context, to, tokenId, capsule, toHolder);
  } else if (from === ZERO_ADDRESS) {
    // Transfer FROM zero address = New NFT is minted
    await handleMint(context, to, tokenId, toHolder);
  } else if (to === ZERO_ADDRESS) {
    // Transfer TO zero address = NFT is burned/destroyed
    await handleBurn(context, from, tokenId, fromHolder, capsule);
  } else {
    // Regular transfer between two users
    await handleRegularTransfer(context, from, to, tokenId, capsule, fromHolder, toHolder);
  }
}

 