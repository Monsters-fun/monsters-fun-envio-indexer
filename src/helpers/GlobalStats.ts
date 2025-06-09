import { handlerContext, GlobalStats, BigDecimal } from "generated";

export const globalStatsId = "global";

export const defaultGlobalStats: GlobalStats = {
  id: globalStatsId,
  protocolFees: new BigDecimal(0),
}

export const createGlobalStats = async (
    context: handlerContext,    
    overrides?: Partial<GlobalStats>
  ) => {  
    const globalStats: GlobalStats = {      
      ...defaultGlobalStats,
      ...overrides, 
    }  
    context.GlobalStats.set(globalStats);
  }

export const updateGlobalStats = async (
    context: handlerContext,
    globalStats: GlobalStats,
    overrides?: Partial<GlobalStats>
  ) => {         
    context.GlobalStats.set({
        ...globalStats,
        ...overrides, 
      });
  } 

export const createOrUpdateGlobalStats = async (context: handlerContext, overrides?: Partial<GlobalStats>) => {
  let globalStats: GlobalStats | undefined = await context.GlobalStats.get(globalStatsId);
  if (globalStats) {
    await updateGlobalStats(context, globalStats, overrides);
  } else {
    await createGlobalStats(context, overrides);
  }
}