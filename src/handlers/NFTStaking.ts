import {
  NFTStaking,
  ActiveStake,
  Staker,
  StakingEvent,
  handlerContext,
  BigDecimal,
} from "generated";

import {
  calculateRate,
  calculateBasePoints,
  calculateBonusForfeiture,
  getBonusTier,
  ActiveStakeData,
  StakingEventData,
} from "../helpers/nftStaking/pointsCalculation";

/**
 * Helper function to get or create staker entity
 */
async function getOrCreateStaker(
  context: handlerContext,
  stakerAddress: string,
  timestamp: number
): Promise<Staker> {
  let staker = await context.Staker.get(stakerAddress);
  
  if (!staker) {
    staker = {
      id: stakerAddress,
      stakerId: stakerAddress,
      pointsAtLastUpdate: new BigDecimal(0),
      currentPointsPerSecond: new BigDecimal(0),
      lastUpdateTimestamp: new BigDecimal(timestamp),
      bonusTier: 0,
      activeStakesCount: 0,
      totalStakesCount: 0,
    };
    context.Staker.set(staker);
  }
  
  return staker;
}

/**
 * Helper function to log events for historical tracking
 */
async function logEvent(
  context: handlerContext,
  eventId: string,
  stakerId: string,
  eventType: 'STAKE' | 'UNSTAKE',
  nftId: string,
  timestamp: number,
  blockNumber: bigint,
  transactionHash: string
): Promise<void> {
  const stakingEvent: StakingEvent = {
    id: eventId,
    eventId,
    stakerId,
    eventType,
    nftId,
    timestamp: new BigDecimal(timestamp),
    blockNumber,
    transactionHash,
  };
  
  context.StakingEvent.set(stakingEvent);
}

/**
 * STAKE Event Handler
 */
NFTStaking.Staked.handlerWithLoader({
  loader: async ({ event, context }) => {
    const userAddress = event.params.owner.toLowerCase();
    const staker = await getOrCreateStaker(context, userAddress, Number(event.params.timestamp));
    const activeStakes = await context.ActiveStake.getWhere.owner.eq(userAddress);
    return { staker, activeStakes };
  },
  handler: async ({ event, context, loaderReturn }) => {
    const { staker, activeStakes } = loaderReturn;
    const { owner, tokenId, timestamp } = event.params;
    const userAddress = owner.toLowerCase();
    const nftId = tokenId.toString();
    const eventTimestamp = Number(timestamp);
    const { logIndex, block } = event;
    const eventId = `${block.number}-${logIndex}-${nftId}`;

    context.log.info(
      `[STAKE] User ${userAddress} staked NFT ${nftId} at ${eventTimestamp}`
    );

    // Step 1: Calculate & Update Points
    const elapsedTime = eventTimestamp - Number(staker.lastUpdateTimestamp);
    const accruedPoints = new BigDecimal(elapsedTime).multipliedBy(staker.currentPointsPerSecond);
    const updatedPointsAtLastUpdate = staker.pointsAtLastUpdate.plus(accruedPoints);

    // Step 2: Create new ActiveStake
    const newActiveStake: ActiveStake = {
      id: nftId,
      nftId,
      owner: userAddress,
      stakeTimestamp: new BigDecimal(eventTimestamp),
    };
    context.ActiveStake.set(newActiveStake);

    // Step 3: Update Staker with new rate and bonus tier
    const newActiveStakeCount = activeStakes.length + 1;
    const newRate = calculateRate(newActiveStakeCount);
    const newBonusTier = getBonusTier(newActiveStakeCount);
    
    const updatedStaker: Staker = {
      ...staker,
      pointsAtLastUpdate: updatedPointsAtLastUpdate,
      currentPointsPerSecond: new BigDecimal(newRate),
      lastUpdateTimestamp: new BigDecimal(eventTimestamp),
      bonusTier: newBonusTier,
      activeStakesCount: newActiveStakeCount,
      totalStakesCount: staker.totalStakesCount + 1,
    };
    context.Staker.set(updatedStaker);

    // Step 4: Log the event
    await logEvent(
      context,
      eventId,
      userAddress,
      'STAKE',
      nftId,
      eventTimestamp,
      BigInt(block.number),
      block.hash
    );

    context.log.info(
      `[STAKE] Updated staker ${userAddress}: points=${updatedPointsAtLastUpdate.toFixed(2)}, rate=${newRate.toFixed(4)}/s, count=${newActiveStakeCount}`
    );
  },
});

/**
 * UNSTAKE Event Handler
 */
NFTStaking.Unstaked.handlerWithLoader({
  loader: async ({ event, context }) => {
    const userAddress = event.params.owner.toLowerCase();
    const tokenId = event.params.tokenId.toString();
    
    const staker = await context.Staker.get(userAddress);
    const nftToUnstake = await context.ActiveStake.get(tokenId);
    const activeStakes = await context.ActiveStake.getWhere.owner.eq(userAddress);
    const eventHistory = await context.StakingEvent.getWhere.stakerId.eq(userAddress);
    
    return { staker, nftToUnstake, activeStakes, eventHistory };
  },
  handler: async ({ event, context, loaderReturn }) => {
    const { staker, nftToUnstake, activeStakes, eventHistory } = loaderReturn;
    const { owner, tokenId, timestamp } = event.params;
    const userAddress = owner.toLowerCase();
    const nftId = tokenId.toString();
    const eventTimestamp = Number(timestamp);
    const { logIndex, block } = event;
    const eventId = `${block.number}-${logIndex}-${nftId}`;

    if (!staker) {
      context.log.error(`[UNSTAKE] Staker ${userAddress} not found`);
      return;
    }

    if (!nftToUnstake) {
      context.log.error(`[UNSTAKE] NFT ${nftId} not found or not staked by ${userAddress}`);
      return;
    }

    context.log.info(
      `[UNSTAKE] Staker ${userAddress} unstaking NFT ${nftId} at ${eventTimestamp}`
    );

    // Step 1: Calculate & Update Points before forfeiture
    const elapsedTime = eventTimestamp - Number(staker.lastUpdateTimestamp);
    const accruedPoints = new BigDecimal(elapsedTime).multipliedBy(staker.currentPointsPerSecond);
    let updatedPoints = staker.pointsAtLastUpdate.plus(accruedPoints);

    // Step 2: Calculate forfeiture
    const nftStakeData: ActiveStakeData = {
      nftId: nftToUnstake.nftId,
      stakeTimestamp: Number(nftToUnstake.stakeTimestamp),
    };

    const eventHistoryData: StakingEventData[] = eventHistory.map((e: any) => ({
      eventId: e.eventId,
      stakerId: e.stakerId,
      eventType: e.eventType as 'STAKE' | 'UNSTAKE',
      nftId: e.nftId,
      timestamp: Number(e.timestamp),
    }));

    // Calculate base points lost
    const stakingDuration = eventTimestamp - Number(nftToUnstake.stakeTimestamp);
    const basePointsLost = calculateBasePoints(stakingDuration);

    // Calculate bonus points lost
    const bonusPointsLost = calculateBonusForfeiture(
      nftStakeData,
      eventHistoryData,
      eventTimestamp
    );

    const totalPointsToForfeit = basePointsLost + bonusPointsLost;

    context.log.info(
      `[UNSTAKE] Forfeiture calculation: base=${basePointsLost.toFixed(2)}, bonus=${bonusPointsLost.toFixed(2)}, total=${totalPointsToForfeit.toFixed(2)}`
    );

    // Step 3: Apply forfeiture
    updatedPoints = updatedPoints.minus(new BigDecimal(totalPointsToForfeit));
    
    // Ensure points don't go negative
    if (updatedPoints.isLessThan(0)) {
      updatedPoints = new BigDecimal(0);
    }

    // Step 4: Remove ActiveStake
    context.ActiveStake.deleteUnsafe(nftId);

    // Step 5: Update Staker with new rate and bonus tier
    const newActiveStakeCount = Math.max(0, activeStakes.length - 1);
    const newRate = calculateRate(newActiveStakeCount);
    const newBonusTier = getBonusTier(newActiveStakeCount);

    const updatedStaker: Staker = {
      ...staker,
      pointsAtLastUpdate: updatedPoints,
      currentPointsPerSecond: new BigDecimal(newRate),
      lastUpdateTimestamp: new BigDecimal(eventTimestamp),
      bonusTier: newBonusTier,
      activeStakesCount: newActiveStakeCount,
    };
    context.Staker.set(updatedStaker);

    // Step 6: Log the event
    await logEvent(
      context,
      eventId,
      userAddress,
      'UNSTAKE',
      nftId,
      eventTimestamp,
      BigInt(block.number),
      block.hash
    );

    context.log.info(
      `[UNSTAKE] Updated staker ${userAddress}: points=${updatedPoints.toFixed(2)}, rate=${newRate.toFixed(4)}/s, count=${newActiveStakeCount}`
    );
  },
});

/**
 * EMERGENCY WITHDRAW Event Handler
 */
NFTStaking.EmergencyWithdraw.handlerWithLoader({
  loader: async ({ event, context }) => {
    const userAddress = event.params.owner.toLowerCase();
    const tokenId = event.params.tokenId.toString();
    
    const staker = await context.Staker.get(userAddress);
    const nftToWithdraw = await context.ActiveStake.get(tokenId);
    const activeStakes = await context.ActiveStake.getWhere.owner.eq(userAddress);
    const eventHistory = await context.StakingEvent.getWhere.stakerId.eq(userAddress);
    
    return { staker, nftToWithdraw, activeStakes, eventHistory };
  },
  handler: async ({ event, context, loaderReturn }) => {
    const { staker, nftToWithdraw, activeStakes, eventHistory } = loaderReturn;
    const { owner, tokenId, recipient } = event.params;
    const userAddress = owner.toLowerCase();
    const nftId = tokenId.toString();
    const eventTimestamp = event.block.timestamp;
    const { logIndex, block } = event;
    const eventId = `${block.number}-${logIndex}-${nftId}`;

    if (!staker) {
      context.log.error(`[EMERGENCY] Staker ${userAddress} not found`);
      return;
    }

    if (!nftToWithdraw) {
      context.log.info(`[EMERGENCY] NFT ${nftId} not found or not staked by ${userAddress}`);
      return;
    }

    context.log.info(
      `[EMERGENCY] Staker ${userAddress} emergency withdrew NFT ${nftId} to ${recipient}`
    );

    // Step 1: Calculate & Update Points before forfeiture
    const elapsedTime = Number(eventTimestamp) - Number(staker.lastUpdateTimestamp);
    const accruedPoints = new BigDecimal(elapsedTime).multipliedBy(staker.currentPointsPerSecond);
    let updatedPoints = staker.pointsAtLastUpdate.plus(accruedPoints);

    // Step 2: Calculate forfeiture (same logic as unstake)
    const nftStakeData: ActiveStakeData = {
      nftId: nftToWithdraw.nftId,
      stakeTimestamp: Number(nftToWithdraw.stakeTimestamp),
    };

    const eventHistoryData: StakingEventData[] = eventHistory.map((e: any) => ({
      eventId: e.eventId,
      stakerId: e.stakerId,
      eventType: e.eventType as 'STAKE' | 'UNSTAKE',
      nftId: e.nftId,
      timestamp: Number(e.timestamp),
    }));

    // Calculate base points lost
    const stakingDuration = Number(eventTimestamp) - Number(nftToWithdraw.stakeTimestamp);
    const basePointsLost = calculateBasePoints(stakingDuration);

    // Calculate bonus points lost
    const bonusPointsLost = calculateBonusForfeiture(
      nftStakeData,
      eventHistoryData,
      Number(eventTimestamp)
    );

    const totalPointsToForfeit = basePointsLost + bonusPointsLost;

    context.log.info(
      `[EMERGENCY] Forfeiture calculation: base=${basePointsLost.toFixed(2)}, bonus=${bonusPointsLost.toFixed(2)}, total=${totalPointsToForfeit.toFixed(2)}`
    );

    // Step 3: Apply forfeiture
    updatedPoints = updatedPoints.minus(new BigDecimal(totalPointsToForfeit));
    if (updatedPoints.isLessThan(0)) {
      updatedPoints = new BigDecimal(0);
    }

    // Step 4: Remove ActiveStake
    context.ActiveStake.deleteUnsafe(nftId);

    // Step 5: Update Staker with new rate and bonus tier
    const newActiveStakeCount = Math.max(0, activeStakes.length - 1);
    const newRate = calculateRate(newActiveStakeCount);
    const newBonusTier = getBonusTier(newActiveStakeCount);

    const updatedStaker: Staker = {
      ...staker,
      pointsAtLastUpdate: updatedPoints,
      currentPointsPerSecond: new BigDecimal(newRate),
      lastUpdateTimestamp: new BigDecimal(Number(eventTimestamp)),
      bonusTier: newBonusTier,
      activeStakesCount: newActiveStakeCount,
    };
    context.Staker.set(updatedStaker);

    // Step 6: Log the event as UNSTAKE
    await logEvent(
      context,
      eventId,
      userAddress,
      'UNSTAKE',
      nftId,
      Number(eventTimestamp),
      BigInt(block.number),
      block.hash
    );

    context.log.info(
      `[EMERGENCY] Updated staker ${userAddress}: points=${updatedPoints.toFixed(2)}, rate=${newRate.toFixed(4)}/s, count=${newActiveStakeCount}`
    );
  },
}); 