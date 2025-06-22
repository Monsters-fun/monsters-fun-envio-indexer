export const WIN_POINTS_MULTIPLIER: number = 0.01;
export const TRADE_POINTS_MULTIPLIER: number = 50;
export const MONSTER_XP_MULTIPLIER: number = 2; 

export const TEN_TO_THE_17: bigint = 10n ** 17n;
export const ZERO_ADDRESS: string = "0x0000000000000000000000000000000000000000";
export const WEI_TO_ETHER_STRING: string = "1e18";

export const CAPSULE_STAKING_CONTRACT_ADDRESS: string =
  "0x0fb5663424320838bf46dc70f094c5e249b0db65".toLowerCase();

// ================================
// NFT Staking Points System Constants
// ================================

// Base rate: 1 point every 5 seconds per NFT = 0.2 points/second/NFT
export const POINTS_PER_SECOND_PER_NFT: number = 1 / 5; // 0.2