import { L2NativeToken } from "generated";
import { schedulePaymentConfirmation } from "../helpers/paymentIntent";
import { PAYMENT_ETH_DESTINATION_ADDRESS, IS_ETH_PAYMENT_FORWARDING_ENABLED, PAYMENT_CONFIRMATION_MIN_BLOCK } from "../config";

if (PAYMENT_ETH_DESTINATION_ADDRESS && IS_ETH_PAYMENT_FORWARDING_ENABLED) {
  // Register with topic filter to only fetch logs where `to` matches
  L2NativeToken.Transfer.handler(async ({ event, context }) => {
    try {
      const { hash } = event.transaction;
      const { value } = event.params;
      
      context.log.info("Scheduling payment confirmation for native token tx", { hash });
      
      if (value > 0n && value < 1000000000000000000n) {
        const rawBlockNumber = event.block.number;
        const blockNumber = typeof rawBlockNumber === "bigint" ? rawBlockNumber : BigInt(rawBlockNumber);

        if (blockNumber < PAYMENT_CONFIRMATION_MIN_BLOCK) {
          context.log.info("Skipping payment confirmation scheduling below min block", {
            hash,
            blockNumber: blockNumber.toString(),
            minBlock: PAYMENT_CONFIRMATION_MIN_BLOCK.toString(),
          });
        } else {
          await schedulePaymentConfirmation(hash);
        }
      }
    } catch (error) {
      context.log.error(`Failed to process native token transfer:`, error as Error);
    }
  }, { wildcard: true, eventFilters: { to: PAYMENT_ETH_DESTINATION_ADDRESS } });
} else {
  // eslint-disable-next-line no-console
  console.warn("ETH payment forwarding disabled or address not set; L2 native Transfer handler not registered");
}
