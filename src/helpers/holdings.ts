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
  // Skip tracking holdings for ZERO_ADDRESS (mint/burn operations)
  if (trader === ZERO_ADDRESS) {
    return;
  }
  
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
    const newBalance = holding.balance.plus(balance);
    
    holding = {
      ...holding,
      balance: newBalance,
      lastTradeMarketCap: newBalance.multipliedBy(price),
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
  
  // Debug logging can be enabled here if needed
  
  if (!holding) {
      context.log.error("A transfer event has to happen before a trade event therefore a holding entity should exist")
      return;
  }
  
  const isBuy = tokenAmount.isGreaterThan(0);
  
  let newTotalHoldingsCost = holding.totalHoldingsCost;
  let newTotalHoldingsSales = holding.totalHoldingsSales;
  
  if (isBuy) {
    // On buy: add to cost basis
    newTotalHoldingsCost = holding.totalHoldingsCost.plus(ethAmount);
    // Don't reset sales on buy - keep historical tracking
  } else {
    // On sell: handle different scenarios
    const soldTokens = tokenAmount.abs(); // tokenAmount is negative for sells
    const remainingTokens = holding.balance; // This is the balance AFTER the sell (updated by Transfer event first)
    const totalTokensBeforeSell = remainingTokens.plus(soldTokens);
    
    // Add to sales tracking
    newTotalHoldingsSales = holding.totalHoldingsSales.plus(ethAmount);
    
    if (totalTokensBeforeSell.isGreaterThan(0)) {
      // Case 1: Complete sell (balance = 0)
      if (remainingTokens.isEqualTo(0)) {
        // Clear all cost basis and reset sales for clean slate
        newTotalHoldingsCost = new BigDecimal(0);
        newTotalHoldingsSales = new BigDecimal(0);
      } 
      // Case 2: Near-complete sell (dust remaining - very small balance)
      else if (remainingTokens.isLessThan(new BigDecimal("0.001"))) {
        // For very small remaining balances, clear cost basis to avoid PnL distortion
        newTotalHoldingsCost = new BigDecimal(0);
      }
      // Case 3: Partial sell (significant balance remaining)
      else {
        // Reduce cost basis proportionally
        const proportionSold = soldTokens.dividedBy(totalTokensBeforeSell);
        const costToRemove = holding.totalHoldingsCost.multipliedBy(proportionSold);
        newTotalHoldingsCost = holding.totalHoldingsCost.minus(costToRemove);
        
        // Debug logging for proportional cost reduction (can be enabled if needed)
        
        // Ensure cost basis never goes negative due to precision errors
        if (newTotalHoldingsCost.isLessThan(0)) {
          newTotalHoldingsCost = new BigDecimal(0);
        }
      }
    }
  }
  
  holding = {
    ...holding,
    lastTradePrice: price,
    lastTradeMarketCap: holding.balance.multipliedBy(price),
    // Use actual ETH amounts from the trade for accurate PnL tracking
    totalHoldingsCost: newTotalHoldingsCost,
    totalHoldingsSales: newTotalHoldingsSales,
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