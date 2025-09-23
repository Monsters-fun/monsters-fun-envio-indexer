import { L2NativeToken } from "generated";
import { schedulePaymentConfirmation } from "../helpers/paymentIntent";
import { PAYMENT_ETH_DESTINATION_ADDRESS, IS_ETH_PAYMENT_FORWARDING_ENABLED } from "../config";

if (PAYMENT_ETH_DESTINATION_ADDRESS && IS_ETH_PAYMENT_FORWARDING_ENABLED) {
  // Register with topic filter to only fetch logs where `to` matches
  L2NativeToken.Transfer.handler(async ({ event, context }) => {
    try {
      const { hash } = event.transaction;
      const { value } = event.params;
      
      context.log.info("Scheduling payment confirmation for native token tx", { hash });
      
      if (value > 0n && value < 1000000000000000000n) {
        await schedulePaymentConfirmation(hash);
      }
    } catch (error) {
      context.log.error(`Failed to process native token transfer:`, error as Error);
    }
  }, { wildcard: true, eventFilters: { to: PAYMENT_ETH_DESTINATION_ADDRESS } });
} else {
  // eslint-disable-next-line no-console
  console.warn("ETH payment forwarding disabled or address not set; L2 native Transfer handler not registered");
}
