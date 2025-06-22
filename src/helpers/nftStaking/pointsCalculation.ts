import { POINTS_PER_SECOND_PER_NFT } from "../../constants";

/**
 * Get the bonus rate for a given number of NFTs
 */
export function getBonusRate(numNFTs: number): number {
  if (numNFTs >= 10) return 0.50;
  if (numNFTs >= 5) return 0.20;
  if (numNFTs >= 2) return 0.15;
  return 0.00;
}

/**
 * Get the bonus tier for a given number of NFTs
 * 0 = no bonus, 1 = 2+ NFTs (15%), 2 = 5+ NFTs (20%), 3 = 10+ NFTs (50%)
 */
export function getBonusTier(numNFTs: number): number {
  if (numNFTs >= 10) return 3;
  if (numNFTs >= 5) return 2;
  if (numNFTs >= 2) return 1;
  return 0;
}

/**
 * Calculate the total points per second for a given number of NFTs
 */
export function calculateRate(numNFTs: number): number {
  if (numNFTs === 0) return 0;
  const bonusRate = getBonusRate(numNFTs);
  return numNFTs * POINTS_PER_SECOND_PER_NFT * (1 + bonusRate);
}

/**
 * Calculate base points for a single NFT over a time period
 */
export function calculateBasePoints(durationSeconds: number): number {
  return durationSeconds * POINTS_PER_SECOND_PER_NFT;
}

/**
 * Calculate bonus points for a time period with a specific number of NFTs
 */
export function calculateBonusPoints(durationSeconds: number, numNFTs: number): number {
  const bonusRate = getBonusRate(numNFTs);
  const basePoints = calculateBasePoints(durationSeconds);
  return basePoints * bonusRate;
}

/**
 * Interface for ActiveStake data
 */
export interface ActiveStakeData {
  nftId: string;
  stakeTimestamp: number;
}

/**
 * Interface for StakingEvent data
 */
export interface StakingEventData {
  eventId: string;
  stakerId: string;
  eventType: 'STAKE' | 'UNSTAKE';
  nftId: string;
  timestamp: number;
}

/**
 * Calculate bonus forfeiture when unstaking an NFT
 * This requires going through the event history to recalculate bonuses
 */
export function calculateBonusForfeiture(
  nftToUnstake: ActiveStakeData,
  eventHistory: StakingEventData[],
  unstakeTimestamp: number
): number {
  // Filter events for this staker since the NFT was staked
  const relevantEvents = eventHistory
    .filter(event => event.timestamp >= nftToUnstake.stakeTimestamp)
    .sort((a, b) => a.timestamp - b.timestamp);
  
  let totalBonusLost = 0;
  let currentNFTCount = 0;
  let lastEventTime = nftToUnstake.stakeTimestamp;
  
  // Track NFT count at the time the NFT being unstaked was staked
  const nftsAtStakeTime = eventHistory
    .filter(event => event.timestamp < nftToUnstake.stakeTimestamp)
    .reduce((count, event) => {
      return event.eventType === 'STAKE' ? count + 1 : count - 1;
    }, 0);
  
  currentNFTCount = nftsAtStakeTime + 1; // +1 for the NFT being unstaked
  
  // Go through each event to calculate bonus differences
  for (const event of relevantEvents) {
    const timePeriod = event.timestamp - lastEventTime;
    
    if (timePeriod > 0) {
      // Calculate bonus with the NFT being unstaked
      const bonusWithNFT = calculateBonusPoints(timePeriod, currentNFTCount);
      
      // Calculate bonus without the NFT being unstaked
      const bonusWithoutNFT = calculateBonusPoints(timePeriod, Math.max(0, currentNFTCount - 1));
      
      // The difference is what we lose
      totalBonusLost += bonusWithNFT - bonusWithoutNFT;
    }
    
    // Update NFT count for next iteration
    if (event.eventType === 'STAKE') {
      currentNFTCount++;
    } else if (event.eventType === 'UNSTAKE') {
      currentNFTCount--;
    }
    
    lastEventTime = event.timestamp;
  }
  
  // Handle the final period from last event to unstake
  const finalPeriod = unstakeTimestamp - lastEventTime;
  if (finalPeriod > 0) {
    const bonusWithNFT = calculateBonusPoints(finalPeriod, currentNFTCount);
    const bonusWithoutNFT = calculateBonusPoints(finalPeriod, Math.max(0, currentNFTCount - 1));
    totalBonusLost += bonusWithNFT - bonusWithoutNFT;
  }
  
  return totalBonusLost;
} 