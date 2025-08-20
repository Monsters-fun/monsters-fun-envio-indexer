-- Script to reset totalHoldingsCost for testing PnL calculations
-- Usage: Replace the monster_id and trader addresses with actual values

-- Reset cost basis for a specific holding
UPDATE "CurrentHoldings" 
SET "totalHoldingsCost" = '0' 
WHERE "monster_id" = '0xcEA5E800823bd617b8E9CF7ee7F16371CF14bBae' 
AND "trader" = 'REPLACE_WITH_YOUR_WALLET_ADDRESS';

-- Or reset all holdings for a specific monster (use with caution)
-- UPDATE "CurrentHoldings" 
-- SET "totalHoldingsCost" = '0' 
-- WHERE "monster_id" = '0xcEA5E800823bd617b8E9CF7ee7F16371CF14bBae';

-- Or reset holdings with dust balances (< 1 token) - this mimics the fixed logic
-- UPDATE "CurrentHoldings" 
-- SET "totalHoldingsCost" = '0' 
-- WHERE CAST("balance" AS DECIMAL) < 1;

-- Check the results
SELECT 
    "trader",
    "balance",
    "totalHoldingsCost",
    "totalHoldingsSales",
    "monster_id"
FROM "CurrentHoldings" 
WHERE "monster_id" = '0xcEA5E800823bd617b8E9CF7ee7F16371CF14bBae'
ORDER BY "trader";