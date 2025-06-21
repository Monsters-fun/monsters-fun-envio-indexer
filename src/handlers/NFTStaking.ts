import {
  NFTStaking,
  Stake as StakeEntity,
} from "generated";

import {
  calculateSingleNFTPoints,
  recalculateUserStats,
} from "../helpers/staking";

NFTStaking.Staked.handlerWithLoader({
  loader: async ({ event, context }) => {
    const userAddress = event.params.owner.toLowerCase();
    const existingStakes = await context.Stake.getWhere.owner.eq(userAddress);
    return { userAddress, existingStakes };
  },
  handler: async ({ event, context, loaderReturn }) => {
    const { userAddress, existingStakes } = loaderReturn;
    const { tokenId, timestamp } = event.params;
    const blockTimestamp = BigInt(event.block.timestamp);

    context.log.info(
      `[STAKED] ${userAddress} staked token ${tokenId.toString()} at ${timestamp.toString()}`
    );

    const newStake: StakeEntity = {
      id: tokenId.toString(),
      tokenId,
      owner: userAddress,
      stakedAt: timestamp,
      unstakedAt: undefined,
      isActive: true,
      earnedPoints: 0n,
    };

    context.Stake.set(newStake);

    await recalculateUserStats(
      context,
      userAddress,
      blockTimestamp,
      [...existingStakes, newStake]
    );
  },
});

NFTStaking.Unstaked.handlerWithLoader({
  loader: async ({ event, context }) => {
    const userAddress = event.params.owner.toLowerCase();
    const allUserStakes = await context.Stake.getWhere.owner.eq(userAddress);
    const stakeToUpdate = await context.Stake.get(event.params.tokenId.toString());
    return { userAddress, allUserStakes, stakeToUpdate };
  },
  handler: async ({ event, context, loaderReturn }) => {
    const { tokenId, timestamp, stakingDuration } = event.params;
    const { userAddress, allUserStakes, stakeToUpdate } = loaderReturn;
    const blockTimestamp = BigInt(event.block.timestamp);

    if (!stakeToUpdate) {
      context.log.error(`[UNSTAKED] Stake not found for token ${tokenId.toString()}`);
      return;
    }

    const activeCount = allUserStakes.filter((s: StakeEntity) => s.isActive).length;
    const finalPoints = calculateSingleNFTPoints(stakingDuration, activeCount);

    const updatedStake: StakeEntity = {
      ...stakeToUpdate,
      unstakedAt: timestamp,
      isActive: false,
      earnedPoints: BigInt(finalPoints),
    };

    context.Stake.set(updatedStake);

    const updatedStakes = allUserStakes.map((s: StakeEntity) =>
      s.id === updatedStake.id ? updatedStake : s
    );

    await recalculateUserStats(
      context,
      userAddress,
      blockTimestamp,
      updatedStakes
    );
  },
});

NFTStaking.EmergencyWithdraw.handlerWithLoader({
  loader: async ({ event, context }) => {
    const userAddress = event.params.owner.toLowerCase();
    const stakeToUpdate = await context.Stake.get(event.params.tokenId.toString());
    const allUserStakes = await context.Stake.getWhere.owner.eq(userAddress);
    return { userAddress, stakeToUpdate, allUserStakes };
  },
  handler: async ({ event, context, loaderReturn }) => {
    const { tokenId, recipient } = event.params;
    const { userAddress, stakeToUpdate, allUserStakes } = loaderReturn;
    const blockTimestamp = BigInt(event.block.timestamp);

    if (!stakeToUpdate || !stakeToUpdate.isActive) {
      context.log.info(`[EMERGENCY] No active stake for token ${tokenId.toString()}`);
      return;
    }

    context.log.info(
      `[EMERGENCY] ${userAddress} emergency withdrew token ${tokenId.toString()} to ${recipient}`
    );

    const updatedStake: StakeEntity = {
      ...stakeToUpdate,
      unstakedAt: blockTimestamp,
      isActive: false,
      earnedPoints: 0n,
    };

    context.Stake.set(updatedStake);

    const updatedStakes = allUserStakes.map((s: StakeEntity) =>
      s.id === updatedStake.id ? updatedStake : s
    );

    await recalculateUserStats(
      context,
      userAddress,
      blockTimestamp,
      updatedStakes
    );
  },
}); 