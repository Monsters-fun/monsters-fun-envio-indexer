import {
  CreatureBoringFactory,
  CreatureBoringToken,
  Monster,
  Trade,
  Trader,    
  MarketCapSnapshot,
  TotalVolumeTradedSnapshot,  
  CurrentHoldings,
  WhitelistPurchaseSnapshot,
  GlobalStats,
  BigDecimal,
} from "generated";

import { createOrUpdateHoldingsTransfer, updateHoldingsTrade } from "./helpers/Holdings";

import { createMonster, updateMonster, requireMonster } from "./helpers/monster";

import { createGlobalStats, updateGlobalStats, globalStatsId } from "./helpers/GlobalStats";

import { WIN_POINTS_MULTIPLIER, TRADE_POINTS_MULTIPLIER, MONSTER_XP_MULTIPLIER } from "./constants";

const WEI_TO_ETHER = new BigDecimal("1e18");

CreatureBoringToken.OwnershipTransferred.handler(async ({ event, context }) => {
  const { newOwner } = event.params;
  const { srcAddress } = event
  
  const monster = await context.Monster.get(srcAddress);
  
  if (!monster) {
    await createMonster(context, srcAddress, {contractOwner: newOwner}) 
  } else {
    await updateMonster(context, monster, {contractOwner: newOwner})    
  }
  
})

CreatureBoringFactory.TokenCreated.contractRegister(({event, context}) => {
  context.addCreatureBoringToken(event.params.tokenAddress)
}, {preRegisterDynamicContracts: true});

CreatureBoringFactory.TokenCreated.handler(async ({event, context}) =>{
  const { tokenAddress, name, symbol } = event.params;  
  
  const monster = await context.Monster.get(tokenAddress);

  if (monster) {
    await updateMonster(context, monster, {name, symbol})
  } else {
    context.log.warn("Since Ownership Transferred is emitted before ERC20Initialized, this case should be impossible")
    await createMonster(context, tokenAddress, {name, symbol})
  }
})


CreatureBoringToken.Paused.handler(async ({ event, context }) => {  
  const { srcAddress } = event
  
  let monster: Monster | undefined = await context.Monster.get(srcAddress);

  if (monster) {
    await updateMonster(context, monster, {paused: true})
  } else {
    context.log.error("Paused event emitted for a non existent monster")
  }  
})

CreatureBoringToken.Unpaused.handler(async ({ event, context }) => {  
  const { srcAddress } = event

  let monster: Monster | undefined = await context.Monster.get(srcAddress);

  if (monster) {
    await updateMonster(context, monster, {paused: false})
  } else {
    context.log.error("Unpaused event emitted for a non existent monster")
  }  
})

CreatureBoringToken.Transfer.handler(async ({ event, context }) => {
  const { from, to, value } = event.params;  
  const { hash } = event.transaction
  const { logIndex, srcAddress } = event
  const { timestamp, number } = event.block

  let monster: Monster | undefined = await context.Monster.get(srcAddress);

  if (!monster) {    
    context.log.error("Transfer event emitted for a non existent monster")
    return;
  }  

  let traderEntity: Trader | undefined = await context.Trader.get(to);

  if (!traderEntity) {
    traderEntity = {
      id: to,
      numberOfTrades: 0,      
      points: 0n
    }
    context.Trader.set(traderEntity);
  } 

  const tradeOut: Trade = {
    id: hash + "-" + logIndex + "-" + from,
    txHash: hash,
    logIndexTransfer: logIndex,
    logIndexTrade: -1,
    monster: srcAddress,
    trader: from,
    tradeType: "TRANSFER_OUT" ,
    amount: value,
    ethAmount: 0n,
    blockTimestamp: BigInt(timestamp),
    blockNumber: BigInt(number),
  }

  context.Trade.set(tradeOut);  

  const tradeIn: Trade = {
    id: hash + "-" + logIndex + "-" + to,
    txHash: hash,
    logIndexTransfer: logIndex,
    logIndexTrade: -1,
    monster: srcAddress,
    trader: to,
    tradeType: "TRANSFER_IN" ,
    amount: value,
    ethAmount: 0n,
    blockTimestamp: BigInt(timestamp),
    blockNumber: BigInt(number),
  }

  context.Trade.set(tradeIn);

  // update the current holding for the from address 
  await createOrUpdateHoldingsTransfer(context, monster, from, 0n - value, monster.price, hash, logIndex, srcAddress, timestamp);

  // update the current holding for the to address
  await createOrUpdateHoldingsTransfer(context, monster, to, value, monster.price, hash, logIndex, srcAddress, timestamp);

})

CreatureBoringToken.Trade.handler(async ({ event, context }) => {   
  const { trader, isBuy,  amount, ethAmount, protocolFee } = event.params 
  const { hash } = event.transaction
  const { srcAddress, logIndex } = event
  const { timestamp } = event.block  

  let globalStats: GlobalStats | undefined = await context.GlobalStats.get(globalStatsId);
  if (globalStats) {
    await updateGlobalStats(context, globalStats, {protocolFees: globalStats.protocolFees + protocolFee});  
  } else {
    await createGlobalStats(context, {protocolFees: protocolFee});
  }  

  let monster: Monster | undefined = await context.Monster.get(srcAddress);

  if (!monster) {    
    context.log.error("Trade event emitted for a non existent monster")
    return;
  }

  // Convert to ether for experience points calculation only
  const ethAmountInEther = new BigDecimal(ethAmount.toString()).dividedBy(WEI_TO_ETHER);
  
  const supply = isBuy ? monster.supply + amount : monster.supply - amount;
  const depositsTotal = isBuy ? monster.depositsTotal + ethAmount : monster.depositsTotal; 
  const withdrawalsTotal = isBuy ? monster.withdrawalsTotal : monster.withdrawalsTotal + ethAmount;
  const experiencePointsChange = ethAmountInEther.multipliedBy(MONSTER_XP_MULTIPLIER)
  const experiencePoints = isBuy ? monster.experiencePoints.plus(experiencePointsChange) : monster.experiencePoints.minus(experiencePointsChange)

  monster = {
    ...monster,
    supply: supply,      
    totalVolumeTraded: monster.totalVolumeTraded + ethAmount,
    depositsTotal: depositsTotal,
    withdrawalsTotal: withdrawalsTotal,
    experiencePoints: experiencePoints, 
  }

  context.Monster.set(monster);
    
  const tradeId = hash + "-" + (logIndex - 1) + "-" + trader; // we subtract 1 from the logIndex as that is the logIndex of the transfer event due to the trade
  let trade: Trade | undefined = await context.Trade.get(tradeId);

  if (!trade) {
    // this is a whitelist trade
    const tradeId = hash + "-" + (logIndex - 2) + "-" + trader; // we subtract 2 from the logIndex as that is the logIndex of the transfer event due to the trade during a whitelist trade event
    let whitelistedTrade : Trade | undefined = await context.Trade.get(tradeId);

    if (!whitelistedTrade) {
      console.log(trader)
      console.log(hash)    
      context.log.warn("This case shouldn't be possible")    
    } else {
      whitelistedTrade = {
        ...whitelistedTrade,
        tradeType: isBuy ? "BUY" : "SELL", // I believe this will only ever be a buy
        logIndexTrade: logIndex,
        ethAmount: ethAmount,      
      }
      context.Trade.set(whitelistedTrade);
      const whitelistPurchaseSnapshot: WhitelistPurchaseSnapshot = {
        id: hash + "-" + logIndex,
        monster_id: srcAddress,
        trader: trader,
        timestamp: timestamp,
        ethAmountPurchased: ethAmount,
      }
      context.WhitelistPurchaseSnapshot.set(whitelistPurchaseSnapshot);      
    }
  } else {
    trade = {
      ...trade,
      tradeType: isBuy ? "BUY" : "SELL",
      logIndexTrade: logIndex,
      ethAmount: ethAmount,      
    }
  
    context.Trade.set(trade);    
  }


  let traderEntity: Trader | undefined = await context.Trader.get(trader);
  if (!traderEntity) {
    traderEntity = {
      id: trader,
      numberOfTrades: 1,      
      points: ethAmount * BigInt(TRADE_POINTS_MULTIPLIER), 
    }
  } else {
    traderEntity = {
      ...traderEntity,
      numberOfTrades: traderEntity.numberOfTrades + 1,
      points: traderEntity.points + (ethAmount * BigInt(TRADE_POINTS_MULTIPLIER)),
    }
  }

  context.Trader.set(traderEntity);

  const marketCapSnapshot: MarketCapSnapshot = {
    id: hash + "-" + logIndex,
    monster: srcAddress,
    timestamp: BigInt(timestamp),
    supply: monster.supply,
    price: monster.price,
    marketCap: monster.marketCap,
  }

  context.MarketCapSnapshot.set(marketCapSnapshot);

  const totalVolumeTradedSnapshot: TotalVolumeTradedSnapshot = {
    id: hash + "-" + logIndex,
    monster: srcAddress,
    timestamp: BigInt(timestamp),
    totalVolumeTraded: monster.totalVolumeTraded,
  }

  context.TotalVolumeTradedSnapshot.set(totalVolumeTradedSnapshot);    

  // update the current holding for the trader
  await updateHoldingsTrade(context, monster, trader, isBuy ? amount : -amount, monster.price, hash, logIndex, srcAddress, timestamp);
  
});

// PriceUpdate(uint256 newPrice, uint256 tokenSupply, uint256 curveMultiplierValue)
CreatureBoringToken.PriceUpdate.handler(async ({event, context}) => {
  const { newPrice, tokenSupply } = event.params
  const { hash } = event.transaction
  const { timestamp } = event.block
  const { srcAddress, logIndex } = event

  const monster = await context.Monster.get(srcAddress);

  if (monster) {
    const priceInEther = new BigDecimal(newPrice.toString()).dividedBy(WEI_TO_ETHER);
    const supplyInEther = new BigDecimal(tokenSupply.toString()).dividedBy(WEI_TO_ETHER);
    const marketCapInEther = priceInEther.multipliedBy(supplyInEther);
    
    updateMonster(context, monster, {
      price: priceInEther, 
      marketCap: marketCapInEther
    }) 
    
    context.PriceSnapShot.set({
      id: hash + "-" + logIndex,
      monster: srcAddress,
      timestamp: BigInt(timestamp),
      price: priceInEther,
    })
  } else {
    context.log.warn(`Trying to update price on non existent monster: ${srcAddress}`)  
  }
})

CreatureBoringToken.BattleStarted.handler(async ({ event, context }) => {
  const { opponent } = event.params;
  const { srcAddress } = event  

  let monster = await context.Monster.get(srcAddress);

  if (!monster) {
    context.log.error("Battle started on a non existent monster") 
  } else {  
    monster = {
      ...monster,
      isInBattle: true,
      activeOpponent: opponent,
    }    
    context.Monster.set(monster);
  }

})

CreatureBoringToken.BattleEnded.handlerWithLoader({
  loader: async ({ event, context }) => { 
    const { winner } = event.params;
    const { srcAddress } = event
    const isWin = winner == srcAddress;

    let allCurrentHoldings: CurrentHoldings[] = [];

    if (isWin) {
      allCurrentHoldings = await context.CurrentHoldings.getWhere.monster_id.eq(
        event.srcAddress,
      );
    }

    return { allCurrentHoldings };
  },
  handler: async ({ event, context, loaderReturn }) => {
    const { winner, loser, transferredValue } = event.params;
    const { srcAddress, logIndex } = event
    const { hash } = event.transaction
    const { timestamp } = event.block
    const  { allCurrentHoldings } = loaderReturn;

    const isWin = winner == srcAddress;

    if (isWin) {
      allCurrentHoldings.forEach(async (currentHoldings) => {        
        let trader = await context.Trader.get(currentHoldings.trader);
        if (!trader) {
          context.log.error("Trader has holdings but is not in the database")
          return;
        }
        const additionalPoints = new BigDecimal(WIN_POINTS_MULTIPLIER).multipliedBy(new BigDecimal(currentHoldings.balance.toString()));
        trader = {
          ...trader,
          points: trader.points + BigInt(additionalPoints.integerValue().toString()),
        }
        
        context.Trader.set(trader);
      })
    }

    let monster = await context.Monster.get(srcAddress);
    if (!monster) {
      context.log.error("Battle ended on a non existent monster") 
    } else {
      const newTotalWinsCount = monster.totalWinsCount + (isWin ? 1 : 0);
      const newTotalLossesCount = monster.totalLossesCount + (!isWin ? 1 : 0);
      const newWinLoseRatio = newTotalWinsCount / (newTotalWinsCount + newTotalLossesCount);

      monster = {
        ...monster,
        totalWinsCount: newTotalWinsCount,
        totalLossesCount: newTotalLossesCount,
        winLoseRatio: newWinLoseRatio,
        isInBattle: false,
        activeOpponent: undefined,
      }    
      context.Monster.set(monster);
    }

    context.BattleOutcome.set({
      id: hash + "-" + logIndex,
      monster: srcAddress,
      win: isWin,
      timestamp: BigInt(timestamp),
      opponent: isWin ? loser : winner,
      transferredValue: transferredValue,
    })
  }
})