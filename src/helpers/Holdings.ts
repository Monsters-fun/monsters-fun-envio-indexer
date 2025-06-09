import { handlerContext, CurrentHoldings, Monster, BigDecimal } from "generated";
import { ZERO_ADDRESS } from "../constants";

export const createOrUpdateHoldingsTransfer = async (context: handlerContext, monster: Monster, trader: string, balance: BigDecimal, price: BigDecimal, hash: string, logIndex: number, srcAddress: string, blockTimestamp: number) => {

  let holding: CurrentHoldings | undefined = await context.CurrentHoldings.get(monster.id + "-" + trader);
  
  if (!holding) {
    if (balance.isLessThan(0) && trader != ZERO_ADDRESS) {
      context.log.error("A sell or transfer_out on a trader that doesn't have any holdings")
      return;
    }    
    holding = {
      id: monster.id + "-" + trader,
      monster_id: monster.id,
      trader: trader,
      balance: balance,
      lastTradePrice: price,
      lastTradeMarketCap: balance.multipliedBy(price),      
      totalHoldingsCost: balance.multipliedBy(price),
      totalHoldingsSales: new BigDecimal(0)
    } 
  } else {

    let isIncrease = balance.isGreaterThan(0);

    holding = {
      ...holding,
      balance: holding.balance.plus(balance),
      lastTradeMarketCap: holding.balance.plus(balance).multipliedBy(price),
      totalHoldingsCost: isIncrease ? holding.totalHoldingsCost.plus(balance.multipliedBy(price)) : holding.totalHoldingsCost,
      totalHoldingsSales: !isIncrease ? holding.totalHoldingsSales.minus(balance.multipliedBy(price)) : holding.totalHoldingsSales, 
    }
  }
  
  context.CurrentHoldings.set(holding);

  const holdingsSnapshot = {
    id: hash + "-" + logIndex,
    monster_id: srcAddress,
    price: monster.price,    
    trader: trader,
    balance: holding.balance,
    marketCap: holding.balance.multipliedBy(monster.price),
    timestamp: blockTimestamp,
  }

  context.HoldingsSnapshot.set(holdingsSnapshot);
  
}

export const updateHoldingsTrade = async (context: handlerContext, monster: Monster, trader: string, balance: BigDecimal, price: BigDecimal, hash: string, logIndex: number, srcAddress: string, blockTimestamp: number) => {  
  let holding: CurrentHoldings | undefined = await context.CurrentHoldings.get(monster.id + "-" + trader);
  
  if (!holding) {
      context.log.error("A transfer event has to happen before a trade event therefore a holding entity should exist")
      return;
  } else {
    let isIncrease = balance.isGreaterThan(0);
    holding = {
      ...holding,      
      lastTradePrice: price,
      lastTradeMarketCap: holding.balance.multipliedBy(price),
      totalHoldingsCost: isIncrease ? holding.totalHoldingsCost.plus(balance.multipliedBy(price)) : holding.totalHoldingsCost,
      totalHoldingsSales: !isIncrease ? holding.totalHoldingsSales.minus(balance.multipliedBy(price)) : holding.totalHoldingsSales, 
    }
  }
  
  context.CurrentHoldings.set(holding);

  const holdingsSnapshot = {
    id: hash + "-" + logIndex,
    monster_id: srcAddress,
    price: monster.price,    
    trader: trader,
    balance: holding.balance,
    marketCap: holding.balance.multipliedBy(monster.price),
    timestamp: blockTimestamp,
  }

  context.HoldingsSnapshot.set(holdingsSnapshot);
  
}