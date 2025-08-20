import "./handlers";

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

import { createOrUpdateHoldingsTransfer, updateHoldingsTrade } from "./helpers/holdings";

import { createMonster, updateMonster } from "./helpers/monster";

import { createGlobalStats, updateGlobalStats, globalStatsId } from "./helpers/globalStats";

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

  // Convert token amount from wei to ETH for consistency with cost/sales tracking
  const tokenAmount = new BigDecimal(value.toString()).dividedBy(WEI_TO_ETHER);

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
      points: new BigDecimal(0)
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
    amount: tokenAmount,
    ethAmount: new BigDecimal(0),
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
    amount: tokenAmount,
    ethAmount: new BigDecimal(0),
    blockTimestamp: BigInt(timestamp),
    blockNumber: BigInt(number),
  }

  context.Trade.set(tradeIn);

  // update the current holding for the from address 
  await createOrUpdateHoldingsTransfer(context, monster, from, new BigDecimal(0).minus(tokenAmount), monster.price, hash, logIndex, srcAddress, timestamp);

  // update the current holding for the to address
  await createOrUpdateHoldingsTransfer(context, monster, to, tokenAmount, monster.price, hash, logIndex, srcAddress, timestamp);

})

CreatureBoringToken.Trade.handler(async ({ event, context }) => {   
  const { trader, isBuy,  amount, ethAmount, protocolFee } = event.params 
  const { hash } = event.transaction
  const { srcAddress, logIndex } = event
  const { timestamp } = event.block  

  // Convert amounts from wei to ETH
  const amountInEth = new BigDecimal(amount.toString()).dividedBy(WEI_TO_ETHER);
  const ethAmountInEth = new BigDecimal(ethAmount.toString()).dividedBy(WEI_TO_ETHER);
  const protocolFeeInEth = new BigDecimal(protocolFee.toString()).dividedBy(WEI_TO_ETHER);

  let globalStats: GlobalStats | undefined = await context.GlobalStats.get(globalStatsId);
  if (globalStats) {
    await updateGlobalStats(context, globalStats, {protocolFees: globalStats.protocolFees.plus(protocolFeeInEth)});  
  } else {
    await createGlobalStats(context, {protocolFees: protocolFeeInEth});
  }  

  let monster: Monster | undefined = await context.Monster.get(srcAddress);

  if (!monster) {    
    context.log.error("Trade event emitted for a non existent monster")
    return;
  }

  const supply = isBuy ? monster.supply.plus(amountInEth) : monster.supply.minus(amountInEth);
  const depositsTotal = isBuy ? monster.depositsTotal.plus(ethAmountInEth) : monster.depositsTotal; 
  const withdrawalsTotal = isBuy ? monster.withdrawalsTotal : monster.withdrawalsTotal.plus(ethAmountInEth);
  const experiencePointsChange = ethAmountInEth.multipliedBy(new BigDecimal(MONSTER_XP_MULTIPLIER))
  const experiencePoints = isBuy ? monster.experiencePoints.plus(experiencePointsChange) : monster.experiencePoints.minus(experiencePointsChange)

  monster = {
    ...monster,
    supply: supply,      
    totalVolumeTraded: monster.totalVolumeTraded.plus(ethAmountInEth),
    depositsTotal: depositsTotal,
    withdrawalsTotal: withdrawalsTotal,
    experiencePoints: experiencePoints, 
  }

  context.Monster.set(monster);
    
  // Search for the corresponding Transfer event
  let trade: Trade | undefined = undefined;
  
  // Search backwards from the current logIndex to find the Transfer event
  for (let searchLogIndex = logIndex - 1; searchLogIndex >= 0; searchLogIndex--) {
    const tradeId = hash + "-" + searchLogIndex + "-" + trader;
    trade = await context.Trade.get(tradeId);
    
    if (trade) {
      break; // Found it!
    }
  }
  
  if (!trade) {
    context.log.warn("Could not find corresponding Transfer event for Trade", {
      trader,
      hash,
      logIndex,
      tradeType: isBuy ? "BUY" : "SELL",
      block: event.block.number,
      contractAddress: srcAddress
    });
  } else {
    // Update the Transfer entry with Trade information
    trade = {
      ...trade,
      tradeType: isBuy ? "BUY" : "SELL",
      logIndexTrade: logIndex,
      ethAmount: ethAmountInEth,      
    };
    
    context.Trade.set(trade);
  }

  let traderEntity: Trader | undefined = await context.Trader.get(trader);
  if (!traderEntity) {
    traderEntity = {
      id: trader,
      numberOfTrades: 1,      
      points: new BigDecimal(Math.floor(ethAmountInEth.multipliedBy(new BigDecimal(TRADE_POINTS_MULTIPLIER)).toNumber())), 
    }
  } else {
    traderEntity = {
      ...traderEntity,
      numberOfTrades: traderEntity.numberOfTrades + 1,
      points: new BigDecimal(Math.floor(traderEntity.points.plus(ethAmountInEth.multipliedBy(new BigDecimal(TRADE_POINTS_MULTIPLIER))).toNumber())),
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
  await updateHoldingsTrade(context, monster, trader, isBuy ? amountInEth : amountInEth.negated(), ethAmountInEth, monster.price, hash, logIndex, srcAddress, timestamp);
  
});

CreatureBoringToken.WhitelistPurchase.handler(async ({ event, context }) => {
  const { buyer, amount, ethAmount } = event.params;
  const { hash } = event.transaction;
  const { logIndex, srcAddress } = event;
  const { timestamp } = event.block;

  // Convert amounts from wei to ETH
  const ethAmountInEth = new BigDecimal(ethAmount.toString()).dividedBy(WEI_TO_ETHER);
  const tokenAmountInEth = new BigDecimal(amount.toString()).dividedBy(WEI_TO_ETHER);

  // Create WhitelistPurchaseSnapshot
  const whitelistPurchaseSnapshot: WhitelistPurchaseSnapshot = {
    id: hash + "-" + logIndex,
    monster_id: srcAddress,
    trader: buyer,
    timestamp: timestamp,
    ethAmountPurchased: ethAmountInEth,
    tokenAmount: tokenAmountInEth,
  };

  context.WhitelistPurchaseSnapshot.set(whitelistPurchaseSnapshot);
});

// PriceUpdate(uint256 newPrice, uint256 tokenSupply, uint256 curveMultiplierValue)
CreatureBoringToken.PriceUpdate.handler(async ({event, context}) => {
  const { newPrice, tokenSupply, curveMultiplierValue } = event.params
  const { hash } = event.transaction
  const { timestamp } = event.block
  const { srcAddress, logIndex } = event

  const monster = await context.Monster.get(srcAddress);

  if (monster) {
    const priceInEther = new BigDecimal(newPrice.toString()).dividedBy(WEI_TO_ETHER);
    const supplyInEther = new BigDecimal(tokenSupply.toString()).dividedBy(WEI_TO_ETHER);
    const marketCapInEther = priceInEther.multipliedBy(supplyInEther);
    const curveMultiplierInEther = new BigDecimal(curveMultiplierValue.toString()).dividedBy(WEI_TO_ETHER);
    
    updateMonster(context, monster, {
      price: priceInEther, 
      marketCap: marketCapInEther,
      supply: supplyInEther,
      curveMultiplier: curveMultiplierInEther
    }) 
    
    context.PriceSnapShot.set({
      id: hash + "-" + logIndex,
      monster: srcAddress,
      timestamp: BigInt(timestamp),
      price: priceInEther,
      tokenSupply: supplyInEther,
      curveMultiplier: curveMultiplierInEther,
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

    // Convert transferred value from wei to ETH
    const transferredValueInEth = new BigDecimal(transferredValue.toString()).dividedBy(WEI_TO_ETHER);

    const isWin = winner == srcAddress;

    if (isWin) {
      allCurrentHoldings.forEach(async (currentHoldings) => {        
        let trader = await context.Trader.get(currentHoldings.trader);
        if (!trader) {
          context.log.error("Trader has holdings but is not in the database")
          return;
        }
        const additionalPoints = new BigDecimal(WIN_POINTS_MULTIPLIER).multipliedBy(currentHoldings.balance);
        trader = {
          ...trader,
          points: new BigDecimal(Math.floor(trader.points.plus(additionalPoints).toNumber())),
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
      transferredValue: transferredValueInEth,
    })
  }
})