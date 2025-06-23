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
  updateHolderStats,
} from "../entities/capsuleHolder";
import {
  createMonsterCapsule,
  updateMonsterCapsuleOwner,
  updateMonsterCapsuleStaking,
  updateMonsterCapsuleOwnerAndUnstake,
  deleteMonsterCapsule,
} from "../entities/monsterCapsule";

// --- Logic Handlers ---

export async function handleStaking(
  context: HandlerContext,
  event: any,
  fromAddress: string,
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
  
  // Update capsule staking status
  updateMonsterCapsuleStaking(context, capsule, true, event.block.timestamp);
  
  // Update holder stats: no change in total, +1 staked
  await updateHolderStats(context, fromAddress, 0, 1, fromHolder);
  
  context.log.info(`[MC-Stake] Staked token ${tokenId} for ${fromAddress}`);
}

export async function handleUnstaking(
  context: HandlerContext,
  event: any,
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
  
  context.log.info(`[MC-Unstake] BEFORE: Token ${tokenId} isStaked=${capsule.isStaked}, owner=${capsule.ownerAddress}, stakedAt=${capsule.stakedAt}`);
  
  // Update capsule: change owner and unstake
  updateMonsterCapsuleOwnerAndUnstake(context, capsule, toAddress);
  
  // Update holder stats: +1 total, -1 staked for the receiver
  await updateHolderStats(context, toAddress, 1, -1, toHolder);
  
  context.log.info(`[MC-Unstake] Unstaked token ${tokenId} to ${toAddress}`);
}

export async function handleMint(
  context: HandlerContext,
  toAddress: string,
  tokenId: bigint,
  toHolder?: CapsuleHolder
): Promise<void> {
  // Create new capsule
  createMonsterCapsule(context, tokenId, toAddress);
  
  // Update holder stats: +1 total, no change in staked
  await updateHolderStats(context, toAddress, 1, 0, toHolder);
  
  context.log.info(`[MC-Transfer] Minted token ${tokenId} to ${toAddress}`);
}

export async function handleBurn(
  context: HandlerContext,
  fromAddress: string,
  tokenId: bigint,
  fromHolder?: CapsuleHolder,
  capsule?: Capsule
): Promise<void> {
  // Delete capsule
  deleteMonsterCapsule(context, tokenId);
  
  // Determine if the burned capsule was staked
  const wasStaked = capsule?.isStaked ?? false;
  const stakedChange = wasStaked ? -1 : 0;
  
  // Update holder stats: -1 total, -1 staked if it was staked
  await updateHolderStats(context, fromAddress, -1, stakedChange, fromHolder);
  
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
  if (!capsule) {
    // First seen transfer - create capsule entity
    createMonsterCapsule(context, tokenId, toAddress);
    context.log.warn(
      `[MC-Transfer] First seen transfer for token ${tokenId}. Created entity.`
    );
    
    // Only update receiver stats: +1 total, no change in staked
    await updateHolderStats(context, toAddress, 1, 0, toHolder);
  } else {
    // Regular transfer - update ownership
    updateMonsterCapsuleOwner(context, capsule, toAddress);
    
    // Determine if the transferred capsule is staked
    const isStaked = capsule.isStaked;
    const stakedChange = isStaked ? 1 : 0;
    
    // Update holder stats for both parties
    await Promise.all([
      updateHolderStats(context, fromAddress, -1, isStaked ? -1 : 0, fromHolder),
      updateHolderStats(context, toAddress, 1, stakedChange, toHolder)
    ]);
    
    context.log.info(
      `[MC-Transfer] Transferred token ${tokenId} from ${fromAddress} to ${toAddress} (staked: ${isStaked})`
    );
  }
}

// --- Main Transfer Processor ---

/**
 * Process a transfer event with pre-normalized addresses
 * Note: from and to addresses are already normalized (toLowerCase) at the handler level
 */
export async function processTransfer(
  event: any,
  context: HandlerContext,
  from: string,
  to: string,
  tokenId: bigint,
  capsule: Capsule | undefined,
  fromHolder?: CapsuleHolder,
  toHolder?: CapsuleHolder
): Promise<void> {
  context.log.info(`[MC-Transfer] Processing transfer of token ${tokenId} from ${from} to ${to}`);
  
  if (to === CAPSULE_STAKING_CONTRACT_ADDRESS) {
    // Transfer TO staking contract = User stakes their NFT
    await handleStaking(context, event, from, tokenId, capsule, fromHolder);
  } else if (from === CAPSULE_STAKING_CONTRACT_ADDRESS) {
    // Transfer FROM staking contract = User unstakes their NFT
    await handleUnstaking(context, event, to, tokenId, capsule, toHolder);
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

 