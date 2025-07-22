import { handlerContext, Monster, BigDecimal } from "generated";

export const createMonster = async (
    context: handlerContext,
    id: string,
    overrides?: Partial<Monster>
  ) => {  
    const monster: Monster = {
      id: id,
      name: "",
      symbol: "",
      supply: new BigDecimal(0),
      price: new BigDecimal(0),
      marketCap: new BigDecimal(0),
      totalVolumeTraded: new BigDecimal(0),
      depositsTotal: new BigDecimal(0),
      withdrawalsTotal: new BigDecimal(0),
      experiencePoints: new BigDecimal(0),
      totalWinsCount: 0,
      totalLossesCount: 0,
      winLoseRatio: 0,
      isInBattle: false,
      activeOpponent: undefined,
      contractOwner: "",
      paused: false,
      curveMultiplier: new BigDecimal(0),
      ...overrides, 
    }  
    context.Monster.set(monster);
  }

export const updateMonster = async (
    context: handlerContext,
    monster: Monster,
    overrides?: Partial<Monster>
  ) => {         
    context.Monster.set({
        ...monster,
        ...overrides, 
      });
  } 

export const requireMonster = async (context: handlerContext, id: string, msg: string) => {
    let monster: Monster | undefined = await context.Monster.get(id);
    if (!monster) {
        context.log.error(msg)    
    }   
}