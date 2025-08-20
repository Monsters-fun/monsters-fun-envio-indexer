import { TestHelpers } from '../generated';
import { assert } from 'chai';
import { mockAddresses, defaultAddress } from '../generated/src/TestHelpers_MockAddresses.gen';
import { BigDecimal } from 'generated';
import { ZERO_ADDRESS } from '../src/constants';

const WEI_PER_TOKEN = BigInt(1000000000000000000); // 1e18

const { CreatureBoringFactory, CreatureBoringToken, MockDb } = TestHelpers;

describe('Holdings Cost Basis Calculations', () => {
  let dbContainer: { mockDb: ReturnType<typeof MockDb.createMockDb> };

  beforeEach(async () => {
    dbContainer = { mockDb: MockDb.createMockDb() };
    
    // Initialize monster
    const erc20InitializedParams = {
      tokenAddress: defaultAddress,
      name: "Test Monster",
      symbol: "TM",      
    };

    const erc20InitializedEvent = CreatureBoringFactory.TokenCreated.createMockEvent(erc20InitializedParams);
    dbContainer.mockDb = await CreatureBoringFactory.TokenCreated.processEvent({
      event: erc20InitializedEvent,
      mockDb: dbContainer.mockDb,
    });
  });

  describe('Buy Operations', () => {
    it('should correctly add cost basis on first buy', async () => {
      const trader = mockAddresses[0];
      const tokenAmount = BigInt(1000) * WEI_PER_TOKEN; // 1000 tokens (in wei units)
      const ethAmount = BigInt(1000000000000000000); // 1 ETH

      // Transfer event first (minting tokens to trader)
      const transferEvent = CreatureBoringToken.Transfer.createMockEvent({
        from: ZERO_ADDRESS, // Zero address for minting
        to: trader,
        value: tokenAmount,        
        mockEventData: { logIndex: 1 }
      });

      let mockDb = await CreatureBoringToken.Transfer.processEvent({ 
        event: transferEvent, 
        mockDb: dbContainer.mockDb 
      });

      // Trade event
      const tradeEvent = CreatureBoringToken.Trade.createMockEvent({
        trader: trader,
        isBuy: true,
        amount: tokenAmount,
        ethAmount: ethAmount,
        protocolFee: BigInt(0),
        mockEventData: { logIndex: 2 }
      });

      mockDb = await CreatureBoringToken.Trade.processEvent({ 
        event: tradeEvent, 
        mockDb: mockDb 
      });

      const holding = await mockDb.entities.CurrentHoldings.get(`${defaultAddress}-${trader}`);
      
      assert.isNotNull(holding);
      assert.equal(holding?.balance.toString(), "1000"); // 1000 tokens
      assert.equal(holding?.totalHoldingsCost.toString(), "1"); // 1 ETH
      assert.equal(holding?.totalHoldingsSales.toString(), '0');
    });

    it('should accumulate cost basis on multiple buys', async () => {
      const trader = mockAddresses[0];
      
      // First buy: 1000 tokens for 1 ETH
      const buy1Tokens = BigInt(1000) * WEI_PER_TOKEN; // 1000 tokens
      const buy1Eth = BigInt(1000000000000000000); // 1 ETH

      let transferEvent = CreatureBoringToken.Transfer.createMockEvent({
        from: ZERO_ADDRESS,
        to: trader,
        value: buy1Tokens,        
        mockEventData: { logIndex: 1 }
      });

      let mockDb = await CreatureBoringToken.Transfer.processEvent({ 
        event: transferEvent, 
        mockDb: dbContainer.mockDb 
      });

      let tradeEvent = CreatureBoringToken.Trade.createMockEvent({
        trader: trader,
        isBuy: true,
        amount: buy1Tokens,
        ethAmount: buy1Eth,
        protocolFee: BigInt(0),
        mockEventData: { logIndex: 2 }
      });

      mockDb = await CreatureBoringToken.Trade.processEvent({ 
        event: tradeEvent, 
        mockDb: mockDb 
      });

      // Second buy: 500 tokens for 2 ETH
      const buy2Tokens = BigInt(500) * WEI_PER_TOKEN; // 500 tokens
      const buy2Eth = BigInt(2000000000000000000); // 2 ETH

      transferEvent = CreatureBoringToken.Transfer.createMockEvent({
        from: ZERO_ADDRESS,
        to: trader,
        value: buy2Tokens,        
        mockEventData: { logIndex: 3 }
      });

      mockDb = await CreatureBoringToken.Transfer.processEvent({ 
        event: transferEvent, 
        mockDb: mockDb 
      });

      tradeEvent = CreatureBoringToken.Trade.createMockEvent({
        trader: trader,
        isBuy: true,
        amount: buy2Tokens,
        ethAmount: buy2Eth,
        protocolFee: BigInt(0),
        mockEventData: { logIndex: 4 }
      });

      mockDb = await CreatureBoringToken.Trade.processEvent({ 
        event: tradeEvent, 
        mockDb: mockDb 
      });

      const holding = await mockDb.entities.CurrentHoldings.get(`${defaultAddress}-${trader}`);
      
      assert.isNotNull(holding);
      assert.equal(holding?.balance.toString(), "1500"); // 1000 + 500 tokens
      assert.equal(holding?.totalHoldingsCost.toString(), "3"); // 3 ETH total
      assert.equal(holding?.totalHoldingsSales.toString(), '0');
    });
  });

  describe('Sell Operations', () => {
    it('should proportionally reduce cost basis on partial sell', async () => {
      const trader = mockAddresses[0];
      
      // Buy: 1000 tokens for 2 ETH
      const buyTokens = BigInt(1000) * BigInt(1000000000000000000);
      const buyEth = BigInt(2000000000000000000); // 2 ETH

      let transferEvent = CreatureBoringToken.Transfer.createMockEvent({
        from: ZERO_ADDRESS,
        to: trader,
        value: buyTokens,        
        mockEventData: { logIndex: 1 }
      });

      let mockDb = await CreatureBoringToken.Transfer.processEvent({ 
        event: transferEvent, 
        mockDb: dbContainer.mockDb 
      });

      let tradeEvent = CreatureBoringToken.Trade.createMockEvent({
        trader: trader,
        isBuy: true,
        amount: buyTokens,
        ethAmount: buyEth,
        protocolFee: BigInt(0),
        mockEventData: { logIndex: 2 }
      });

      mockDb = await CreatureBoringToken.Trade.processEvent({ 
        event: tradeEvent, 
        mockDb: mockDb 
      });

      // Sell: 300 tokens (30% of position) for 1 ETH
      const sellTokens = BigInt(300) * BigInt(1000000000000000000);
      const sellEth = BigInt(1000000000000000000); // 1 ETH

      // First: Transfer event (updates balance)
      transferEvent = CreatureBoringToken.Transfer.createMockEvent({
        from: trader,
        to: ZERO_ADDRESS,
        value: sellTokens,        
        mockEventData: { logIndex: 3 }
      });

      mockDb = await CreatureBoringToken.Transfer.processEvent({ 
        event: transferEvent, 
        mockDb: mockDb 
      });

      // Then: Trade event (updates cost/sales)
      tradeEvent = CreatureBoringToken.Trade.createMockEvent({
        trader: trader,
        isBuy: false,
        amount: sellTokens, // Positive value for amount sold
        ethAmount: sellEth,
        protocolFee: BigInt(0),
        mockEventData: { logIndex: 4 }
      });

      mockDb = await CreatureBoringToken.Trade.processEvent({ 
        event: tradeEvent, 
        mockDb: mockDb 
      });

      const holding = await mockDb.entities.CurrentHoldings.get(`${defaultAddress}-${trader}`);
      
      assert.isNotNull(holding);
      assert.equal(holding?.balance.toString(), "700"); // 700 tokens remaining
      assert.equal(holding?.totalHoldingsSales.toString(), "1"); // 1 ETH in sales
      
      // Cost basis should be reduced by 30% (proportion sold)
      // Original cost: 2 ETH, 30% sold = 0.6 ETH removed, 1.4 ETH remaining
      assert.equal(holding?.totalHoldingsCost.toString(), "1.4"); // 1.4 ETH
    });

    it('should clear cost basis when selling to dust amounts', async () => {
      const trader = mockAddresses[0];
      
      // Buy: 1000 tokens for 2 ETH
      const buyTokens = BigInt(1000) * BigInt(1000000000000000000);
      const buyEth = BigInt(2000000000000000000); // 2 ETH

      let transferEvent = CreatureBoringToken.Transfer.createMockEvent({
        from: ZERO_ADDRESS,
        to: trader,
        value: buyTokens,        
        mockEventData: { logIndex: 1 }
      });

      let mockDb = await CreatureBoringToken.Transfer.processEvent({ 
        event: transferEvent, 
        mockDb: dbContainer.mockDb 
      });

      let tradeEvent = CreatureBoringToken.Trade.createMockEvent({
        trader: trader,
        isBuy: true,
        amount: buyTokens,
        ethAmount: buyEth,
        protocolFee: BigInt(0),
        mockEventData: { logIndex: 2 }
      });

      mockDb = await CreatureBoringToken.Trade.processEvent({ 
        event: tradeEvent, 
        mockDb: mockDb 
      });

      // Sell almost everything, leaving only dust (0.5 tokens < 1 token threshold)
      const sellTokens = BigInt(999.5 * 1e6) / BigInt(1e6); // 999.5 tokens, leaving 0.5
      const sellEth = BigInt(1500000000000000000); // 1.5 ETH

      transferEvent = CreatureBoringToken.Transfer.createMockEvent({
        from: trader,
        to: defaultAddress,
        value: sellTokens,        
        mockEventData: { logIndex: 3 }
      });

      mockDb = await CreatureBoringToken.Transfer.processEvent({ 
        event: transferEvent, 
        mockDb: mockDb 
      });

      tradeEvent = CreatureBoringToken.Trade.createMockEvent({
        trader: trader,
        isBuy: false,
        amount: -sellTokens, // Negative for sells
        ethAmount: sellEth,
        protocolFee: BigInt(0),
        mockEventData: { logIndex: 4 }
      });

      mockDb = await CreatureBoringToken.Trade.processEvent({ 
        event: tradeEvent, 
        mockDb: mockDb 
      });

      const holding = await mockDb.entities.CurrentHoldings.get(`${defaultAddress}-${trader}`);
      
      assert.isNotNull(holding);
      // Balance should be dust amount (< 1 token)
      assert.isTrue(new BigDecimal(holding?.balance.toString() || '0').isLessThan(new BigDecimal('1')));
      // Cost basis should be cleared due to dust threshold
      assert.equal(holding?.totalHoldingsCost.toString(), '0');
      assert.equal(holding?.totalHoldingsSales.toString(), sellEth.toString());
    });

    it('should handle near-complete position closure (very small dust)', async () => {
      const trader = mockAddresses[0];
      
      // Buy: 1000 tokens for 2 ETH
      const buyTokens = BigInt(1000) * BigInt(1000000000000000000);
      const buyEth = BigInt(2000000000000000000); // 2 ETH

      let transferEvent = CreatureBoringToken.Transfer.createMockEvent({
        from: ZERO_ADDRESS,
        to: trader,
        value: buyTokens,        
        mockEventData: { logIndex: 1 }
      });

      let mockDb = await CreatureBoringToken.Transfer.processEvent({ 
        event: transferEvent, 
        mockDb: dbContainer.mockDb 
      });

      let tradeEvent = CreatureBoringToken.Trade.createMockEvent({
        trader: trader,
        isBuy: true,
        amount: buyTokens,
        ethAmount: buyEth,
        protocolFee: BigInt(0),
        mockEventData: { logIndex: 2 }
      });

      mockDb = await CreatureBoringToken.Trade.processEvent({ 
        event: tradeEvent, 
        mockDb: mockDb 
      });

      // Sell almost everything, leaving tiny dust (0.0005 tokens < 0.001 threshold)
      const sellTokens = BigInt(999.9995 * 1e6) / BigInt(1e6); // Leave 0.0005 tokens
      const sellEth = BigInt(1500000000000000000); // 1.5 ETH

      transferEvent = CreatureBoringToken.Transfer.createMockEvent({
        from: trader,
        to: defaultAddress,
        value: sellTokens,        
        mockEventData: { logIndex: 3 }
      });

      mockDb = await CreatureBoringToken.Transfer.processEvent({ 
        event: transferEvent, 
        mockDb: mockDb 
      });

      tradeEvent = CreatureBoringToken.Trade.createMockEvent({
        trader: trader,
        isBuy: false,
        amount: -sellTokens, // Negative for sells
        ethAmount: sellEth,
        protocolFee: BigInt(0),
        mockEventData: { logIndex: 4 }
      });

      mockDb = await CreatureBoringToken.Trade.processEvent({ 
        event: tradeEvent, 
        mockDb: mockDb 
      });

      const holding = await mockDb.entities.CurrentHoldings.get(`${defaultAddress}-${trader}`);
      
      assert.isNotNull(holding);
      // Balance should be tiny dust amount (< 0.001)
      assert.isTrue(new BigDecimal(holding?.balance.toString() || '0').isLessThan(new BigDecimal('0.001')));
      // Cost basis should be cleared due to dust threshold
      assert.equal(holding?.totalHoldingsCost.toString(), '0');
      // Sales should be tracked normally
      assert.equal(holding?.totalHoldingsSales.toString(), "1.5");
    });

    it('should handle complete position closure (balance = 0)', async () => {
      const trader = mockAddresses[0];
      
      // Buy: 1000 tokens for 2 ETH
      const buyTokens = BigInt(1000) * BigInt(1000000000000000000);
      const buyEth = BigInt(2000000000000000000); // 2 ETH

      let transferEvent = CreatureBoringToken.Transfer.createMockEvent({
        from: ZERO_ADDRESS,
        to: trader,
        value: buyTokens,        
        mockEventData: { logIndex: 1 }
      });

      let mockDb = await CreatureBoringToken.Transfer.processEvent({ 
        event: transferEvent, 
        mockDb: dbContainer.mockDb 
      });

      let tradeEvent = CreatureBoringToken.Trade.createMockEvent({
        trader: trader,
        isBuy: true,
        amount: buyTokens,
        ethAmount: buyEth,
        protocolFee: BigInt(0),
        mockEventData: { logIndex: 2 }
      });

      mockDb = await CreatureBoringToken.Trade.processEvent({ 
        event: tradeEvent, 
        mockDb: mockDb 
      });

      // Sell everything
      const sellTokens = buyTokens;
      const sellEth = BigInt(2500000000000000000); // 2.5 ETH (profitable)

      transferEvent = CreatureBoringToken.Transfer.createMockEvent({
        from: trader,
        to: defaultAddress,
        value: sellTokens,        
        mockEventData: { logIndex: 3 }
      });

      mockDb = await CreatureBoringToken.Transfer.processEvent({ 
        event: transferEvent, 
        mockDb: mockDb 
      });

      tradeEvent = CreatureBoringToken.Trade.createMockEvent({
        trader: trader,
        isBuy: false,
        amount: -sellTokens, // Negative for sells
        ethAmount: sellEth,
        protocolFee: BigInt(0),
        mockEventData: { logIndex: 4 }
      });

      mockDb = await CreatureBoringToken.Trade.processEvent({ 
        event: tradeEvent, 
        mockDb: mockDb 
      });

      const holding = await mockDb.entities.CurrentHoldings.get(`${defaultAddress}-${trader}`);
      
      assert.isNotNull(holding);
      assert.equal(holding?.balance.toString(), '0'); // No tokens remaining
      assert.equal(holding?.totalHoldingsCost.toString(), '0'); // Cost basis should be 0
      assert.equal(holding?.totalHoldingsSales.toString(), '0'); // Sales should also reset on complete closure
    });
  });

  describe('Complex Trading Scenarios', () => {
    it('should handle buy-sell-buy cycles correctly', async () => {
      const trader = mockAddresses[0];
      let mockDb = dbContainer.mockDb;
      let logIndex = 1;

      // First buy: 1000 tokens for 1 ETH
      let transferEvent = CreatureBoringToken.Transfer.createMockEvent({
        from: ZERO_ADDRESS,
        to: trader,
        value: BigInt(1000) * BigInt(1000000000000000000),        
        mockEventData: { logIndex: logIndex++ }
      });

      mockDb = await CreatureBoringToken.Transfer.processEvent({ event: transferEvent, mockDb });

      let tradeEvent = CreatureBoringToken.Trade.createMockEvent({
        trader: trader,
        isBuy: true,
        amount: BigInt(1000) * BigInt(1000000000000000000),
        ethAmount: BigInt(1000000000000000000), // 1 ETH
        protocolFee: BigInt(0),
        mockEventData: { logIndex: logIndex++ }
      });

      mockDb = await CreatureBoringToken.Trade.processEvent({ event: tradeEvent, mockDb });

      // Sell everything: 1000 tokens for 1.5 ETH
      transferEvent = CreatureBoringToken.Transfer.createMockEvent({
        from: trader,
        to: defaultAddress,
        value: BigInt(1000) * BigInt(1000000000000000000),        
        mockEventData: { logIndex: logIndex++ }
      });

      mockDb = await CreatureBoringToken.Transfer.processEvent({ event: transferEvent, mockDb });

      tradeEvent = CreatureBoringToken.Trade.createMockEvent({
        trader: trader,
        isBuy: false,
        amount: BigInt(-1000), 
        ethAmount: BigInt(1500000000000000000), // 1.5 ETH
        protocolFee: BigInt(0),
        mockEventData: { logIndex: logIndex++ }
      });

      mockDb = await CreatureBoringToken.Trade.processEvent({ event: tradeEvent, mockDb });

      // Check position after complete sale
      let holding = await mockDb.entities.CurrentHoldings.get(`${defaultAddress}-${trader}`);
      assert.equal(holding?.balance.toString(), '0');
      assert.equal(holding?.totalHoldingsCost.toString(), '0');
      assert.equal(holding?.totalHoldingsSales.toString(), '0');

      // Second buy: 500 tokens for 2 ETH (new position)
      transferEvent = CreatureBoringToken.Transfer.createMockEvent({
        from: ZERO_ADDRESS,
        to: trader,
        value: BigInt(500) * BigInt(1000000000000000000),        
        mockEventData: { logIndex: logIndex++ }
      });

      mockDb = await CreatureBoringToken.Transfer.processEvent({ event: transferEvent, mockDb });

      tradeEvent = CreatureBoringToken.Trade.createMockEvent({
        trader: trader,
        isBuy: true,
        amount: BigInt(500) * BigInt(1000000000000000000),
        ethAmount: BigInt(2000000000000000000), // 2 ETH
        protocolFee: BigInt(0),
        mockEventData: { logIndex: logIndex++ }
      });

      mockDb = await CreatureBoringToken.Trade.processEvent({ event: tradeEvent, mockDb });

      // Check new position
      holding = await mockDb.entities.CurrentHoldings.get(`${defaultAddress}-${trader}`);
      assert.equal(holding?.balance.toString(), '500');
      assert.equal(holding?.totalHoldingsCost.toString(), '2'); // Only new cost, not old
      assert.equal(holding?.totalHoldingsSales.toString(), '0'); // Sales reset after complete closure, not incremented by new buy
    });
  });
});