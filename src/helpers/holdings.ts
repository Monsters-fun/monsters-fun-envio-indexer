import { handlerContext, CurrentHoldings, Monster, BigDecimal } from "generated";
import { ZERO_ADDRESS } from "../constants";

/**
 * Updates holder balances when Transfer events occur.
 * Only modifies balance - does NOT update totalHoldingsCost/Sales.
 * Financial tracking (costs/sales) is handled exclusively by Trade events.
 */
export const createOrUpdateHoldingsTransfer = async (
  context: handlerContext, 
  monster: Monster, 
  trader: string, 
  balance: BigDecimal, 
  price: BigDecimal, 
  hash: string, 
  logIndex: number, 
  srcAddress: string, 
  blockTimestamp: number
) => {
  const holdingId = `${monster.id}-${trader}`;
  let holding: CurrentHoldings | undefined = await context.CurrentHoldings.get(holdingId);
  
  if (!holding) {
    if (balance.isLessThan(0) && trader != ZERO_ADDRESS) {
      context.log.error("A sell or transfer_out on a trader that doesn't have any holdings")
      return;
    }    
    holding = {
      id: holdingId,
      monster_id: monster.id,
      trader: trader,
      balance: balance,
      lastTradePrice: price,
      lastTradeMarketCap: balance.multipliedBy(price),
      totalHoldingsCost: new BigDecimal(0), // Initialized to 0, will be updated by Trade events only
      totalHoldingsSales: new BigDecimal(0) // Initialized to 0, will be updated by Trade events only
    } 
  } else {
    holding = {
      ...holding,
      balance: holding.balance.plus(balance),
      lastTradeMarketCap: holding.balance.plus(balance).multipliedBy(price),
      // DO NOT update totalHoldingsCost/Sales here - only in Trade event handler
    }
  }
  
  context.CurrentHoldings.set(holding);

  const holdingsSnapshot = {
    id: `${hash}-${logIndex}`,
    monster_id: srcAddress,
    price: monster.price,
    trader: trader,
    balance: holding.balance,
    marketCap: holding.balance.multipliedBy(monster.price),
    timestamp: blockTimestamp,
  }

  context.HoldingsSnapshot.set(holdingsSnapshot);
  
}

/**
 * Updates financial metrics (totalHoldingsCost/Sales) when Trade events occur.
 * Uses actual ETH amounts from the trade execution for accurate PnL tracking.
 * @param tokenAmount - Positive for buys, negative for sells
 * @param ethAmount - Actual ETH amount from the trade event
 */
export const updateHoldingsTrade = async (
  context: handlerContext, 
  monster: Monster, 
  trader: string, 
  tokenAmount: BigDecimal, 
  ethAmount: BigDecimal, 
  price: BigDecimal, 
  hash: string, 
  logIndex: number, 
  srcAddress: string, 
  blockTimestamp: number
) => {
  const holdingId = `${monster.id}-${trader}`;
  let holding: CurrentHoldings | undefined = await context.CurrentHoldings.get(holdingId);
  
  if (!holding) {
      context.log.error("A transfer event has to happen before a trade event therefore a holding entity should exist")
      return;
  }
  
  const isBuy = tokenAmount.isGreaterThan(0);
  
  holding = {
    ...holding,
    lastTradePrice: price,
    lastTradeMarketCap: holding.balance.multipliedBy(price),
    // Use actual ETH amounts from the trade for accurate PnL tracking
    totalHoldingsCost: isBuy ? holding.totalHoldingsCost.plus(ethAmount) : holding.totalHoldingsCost,
    totalHoldingsSales: isBuy ? holding.totalHoldingsSales : holding.totalHoldingsSales.plus(ethAmount),
  }
  
  context.CurrentHoldings.set(holding);

  const holdingsSnapshot = {
    id: `${hash}-${logIndex}`,
    monster_id: srcAddress,
    price: monster.price,
    trader: trader,
    balance: holding.balance,
    marketCap: holding.balance.multipliedBy(monster.price),
    timestamp: blockTimestamp,
  }

  context.HoldingsSnapshot.set(holdingsSnapshot);
  
}