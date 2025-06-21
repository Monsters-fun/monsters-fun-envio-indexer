import { processTransfer } from "../helpers/monsterCapsule/transfer";
import { getOrCreateCapsuleHolder } from "../helpers/entities";
import { MonsterCapsule } from "generated";
import { ZERO_ADDRESS } from "../constants";

MonsterCapsule.Transfer.handlerWithLoader({
  loader: async ({ event, context }) => {
    const { from, to, tokenId } = event.params;
    
    return {
      capsule: await context.Capsule.get(tokenId.toString()),
      fromHolder: from !== ZERO_ADDRESS 
        ? await getOrCreateCapsuleHolder(context, from)
        : undefined,
      toHolder: to !== ZERO_ADDRESS
        ? await getOrCreateCapsuleHolder(context, to)
        : undefined,
    };
  },
  handler: async ({ event, context, loaderReturn }) => {
    const { from, to, tokenId } = event.params;
    const { capsule, fromHolder, toHolder } = loaderReturn;

    await processTransfer(
      context,
      from.toLowerCase(),
      to.toLowerCase(),
      tokenId,
      capsule,
      fromHolder,
      toHolder
    );
  },
});
