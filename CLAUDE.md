# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

**Development:**
- `pnpm dev` - Start development server with hot reload
- `pnpm codegen` - Generate TypeScript types from config.yaml and schema.graphql
- `pnpm build` - Compile TypeScript
- `pnpm test` - Run tests with mocha
- `pnpm start` - Start the compiled indexer

**Prerequisites:** Node.js v18+, pnpm v8+, Docker Desktop

## Architecture Overview

This is an **Envio multichain indexer** that tracks monsters.fun trading events and NFT staking across two blockchain networks:

### Networks & Contracts
- **Abstract Testnet (11124)**: CreatureBoringFactory + CreatureBoringToken contracts for monster trading
- **Abstract Mainnet (2741)**: MonsterCapsule NFT contract for staking system

### Core Data Flow
1. **Monster Creation**: Factory creates new monster tokens, each with trading mechanics
2. **Trading Events**: Buy/sell trades update monster prices, supply, experience points
3. **Battle System**: Monsters can battle each other, affecting win/loss ratios and trader points
4. **NFT Staking**: MonsterCapsule NFTs can be staked for points with quantity-based bonuses
5. **Points System**: Multiple point sources (trading, battles, staking) with different multipliers

### Key Entity Relationships
- **Monster** ↔ **Trade** (1:many) - Each monster has multiple trades
- **Trader** ↔ **CurrentHoldings** (1:many) - Trader positions across monsters
- **Trader** ↔ **UserStats** (1:1) - Staking points and statistics
- **CapsuleHolder** ↔ **Capsule** (1:many) - NFT ownership with staking status

### Handler Architecture
- `src/EventHandlers.ts` - Main event handler registration
- `src/handlers/` - Specialized handlers for different contract types
- `src/helpers/` - Utility functions for entity management

### Generated Code Structure
- `generated/` - Auto-generated from Envio framework (ReScript + TypeScript)
- Handler logic is written in TypeScript but integrates with ReScript indexer core
- GraphQL schema drives entity type generation

### Points & Staking Mechanics
- **Trading Points**: `ethAmount * TRADE_POINTS_MULTIPLIER`
- **Battle Win Points**: `WIN_POINTS_MULTIPLIER * balance` for holders
- **Staking Points**: Base rate ~0.2/second per NFT with quantity bonuses
- **Quantity Tiers**: 5-9 NFTs (1.2x), 10+ NFTs (1.5x) multipliers

### Data Snapshots
Multiple snapshot entities capture historical data for 24-hour calculations:
- MarketCapSnapshot, TotalVolumeTradedSnapshot, PriceSnapShot
- WhitelistPurchaseSnapshot, HoldingsSnapshot
- Enable time-based analytics without complex historical queries

## Development Notes

- Use `pnpm codegen` after modifying `config.yaml` or `schema.graphql`
- Monster addresses are used as entity IDs in most cases
- All monetary values stored as BigDecimal in ETH units (converted from wei)
- Event handlers use transaction hash + logIndex for unique IDs
- Pre-register dynamic contracts using `contractRegister` pattern
- Multichain mode enabled - events processed unordered across chains