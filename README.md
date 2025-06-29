# Monsters.fun Envio indexer

*Please refer to the [documentation website](https://docs.envio.dev) for a thorough guide on all [Envio](https://envio.dev) indexer features*

## Run

```bash
pnpm dev
```

## Generate files from `config.yaml` or `schema.graphql`

```bash
pnpm codegen
```

## Pre-requisites

- [Node.js (use v18 or newer)](https://nodejs.org/en/download/current)
- [pnpm (use v8 or newer)](https://pnpm.io/installation)
- [Docker desktop](https://www.docker.com/products/docker-desktop/)

## Deployment

[Envio's hosted service](https://envio.dev/explorer) is tightly integrated with github. 
To deploy this indexer:
- Login to [envio.dev/app/login](envio.dev/app/login)
- Add your github organisation
- Connect your repo (likely a fork of this repo) 
- Configure the indexer settings
- Select your plan and follow stripe payment instructions
- Push to deploy based on your specified branch

For a more detailed guide on how to deploy an indexer, please refer to the [documentation website](https://docs.envio.dev/docs/HyperIndex/hosted-service-deployment).

## Example queries

Visit http://localhost:8080 to see the GraphQL Playground, local password is `testing`.

### Get Trade

```graphql
query MyQuery {
  Trade {
    tradeType
    amount
    ethAmount
    id
    token
    trader
  }
}
```

### Monster information

```graphql
query MyQuery {
  Monster {
    id
    name
    symbol
    marketCap
    price
    supply
    experiencePoints
    isInBattle
    activeOpponent
  }
}
```

### Traders holdings

```graphql
query MyQuery {
  Trader {
    id
    numberOfTrades
    holdings {
      balance      
      monster
    }
  }
}
```

### Traders points

```graphql
query MyQuery {
  Trader {    
    points
  }
}
```

### Traders trades

```graphql
query MyQuery {
  Trader {
    id    
    trades {
      tradeType
      amount
      token
    }
  }
}
```

### 24 hour market cap change queries

#### Current market cap
```graphql
query MyQuery {
  Monster(where: {id: {_eq: "0xEcE0d869b88fb1Daf726609990C8244d2b9A400D"}}) {
    id
    marketCap
  }
}

```

#### 24 hours ago market cap
```graphql
query MyQuery {
  MarketCapSnapshot(where: {monster: {_eq: "0xEcE0d869b88fb1Daf726609990C8244d2b9A400D"}, _and: {timestamp: {_lte: "$timestampOf24HoursAgo"}}}, limit: 1, order_by: {timestamp: desc}) {
    marketCap    
  }
}

```

### 24 hour total volume traded queries

#### Current total volume traded
```graphql
query MyQuery {
  Monster(where: {id: {_eq: "0xEcE0d869b88fb1Daf726609990C8244d2b9A400D"}}) {
    id
    totalVolumeTraded
  }
}
```

#### 24 hours ago total volume traded
```graphql
query MyQuery {
  TotalVolumeTradedSnapshot(where: {monster: {_eq: "0xEcE0d869b88fb1Daf726609990C8244d2b9A400D"}, _and: {timestamp: {_lte: "$timestampOf24HoursAgo"}}}, limit: 1, order_by: {timestamp: desc}) {
    totalVolumeTraded    
  }
}
```

### Monster win / lose ratio

#### Current win / lose ratio
```graphql
query MyQuery {
  Monster(where: {id: {_eq: "0xEcE0d869b88fb1Daf726609990C8244d2b9A400D"}}) {
    id
    winLoseRatio
  }
}
```

### Traders current holdings

- Current market cap: For each monster get the current price & multiply by traders current holdings balance

```graphql
query MyQuery {
  Monster {
    id
    price
  }
}
```

```graphql
query MyQuery {
  Trader {
    id
    holdings {
      monster {
        id
      }
      balance
    }
  }
}
```

- 24 Hours ago market cap: For each monster sum the marketCap

```graphql
query MyQuery {
  Monster {
    id
  }
}
```

```graphql
query MyQuery {
  Trader(where: {id: {_eq: "0x8c0686723804A0B7201151852C94Bd17DD043C21"}}) {
    id
    holdingsSnapshots(where: {timestamp: {_lte: 1741371238}, _and: {monster_id: {_eq: "0xEcE0d869b88fb1Daf726609990C8244d2b9A400D"}}}, limit: 1, order_by: {timestamp: desc}) {
      marketCap
      monster {
        id
      }
    }
  }
}

```

#### Traders lifetime pnl per monster calc

Where absolute profit = total holdings sales value - (total holdings cost value - current holdings value)
Where absolute profit = totalHoldingsSales - (totalHoldingsCost - marketCap) 
A negative value indicating a loss

```graphql
query MyQuery {
  Trader {
    id
    holdings {
      totalHoldingsCost
      totalHoldingsSales
      marketCap
    }
  }
}
```

#### Traders whitelist purchase amount in eth in the last 24 hours

Take the sum of the ethAmountPurchased for all the whitelistPurchaseSnapshots where the timestamp is greater than the current timestamp minus 24 hours

> Note: In the rare case the user has done > 1000 whitelist purchases in the last 24 hour period, this query will need to be paginated ie set offset and limit and fetch data in 1000 data points per request. Since this is a very odd occurrence, you could inaccurately assume that if a user has done > 1000 whitelist purchases in the last 24 hours that they have exceeded the 0.1 eth limit.


```graphql
query MyQuery {
  WhitelistPurchaseSnapshot(where: {trader: {_eq: "0x8c0686723804A0B7201151852C94Bd17DD043C21"}, _and: {monster_id: {_eq: "0x8Bd6e4fa6D9cc89656dC20A3F092C03BD9543FB7"}, _and: {timestamp: {_gt: $nowLess24Hours}}}}) {
    ethAmountPurchased
    trader
    monster_id
  }
}
```

#### Price snapshots for pricing graphs

The below query may need to be modified slightly (paginated, gt timestamp etc)

```graphql
query MyQuery {
  PriceSnapShot(where: {monster: {_eq: "0xEcE0d869b88fb1Daf726609990C8244d2b9A400D"}}, order_by: {timestamp: desc}) {
    timestamp
    price    
  }
}
```

## NFT Staking Queries

The indexer also supports NFT staking functionality on chain Abstract Mainnet (2741). Below are the most useful queries for building leaderboards and user profiles.

### Complete leaderboard

Get all users ordered by total points (recommended for up to 3000 users)

```graphql
query Leaderboard {
  UserStats(
    order_by: {totalPoints: desc}
    where: {totalPoints: {_gt: "0"}}
  ) {
    userAddress
    totalPoints
    historicalPoints
    currentActivePoints
    activeStakesCount
    quantityTier
    pointsPerSecond
    lastUpdatedAt
  }
}
```

### User profile with stakes

Get detailed information for a specific user including their staking history

```graphql
query UserProfile($userAddress: String!) {
  UserStats(where: {userAddress: {_eq: $userAddress}}) {
    userAddress
    totalPoints
    historicalPoints
    currentActivePoints
    activeStakesCount
    totalStakesCount
    quantityTier
    pointsPerSecond
    lastUpdatedAt
  }
  
  Stake(where: {owner: {_eq: $userAddress}}) {
    tokenId
    stakedAt
    unstakedAt
    isActive
    earnedPoints
  }
}
```

### Staking overview

Get top users and recent staking activity for dashboard views

```graphql
query StakingOverview {
  # Top 10 users by points
  topUsers: UserStats(
    order_by: {totalPoints: desc}
    limit: 10
    where: {totalPoints: {_gt: "0"}}
  ) {
    userAddress
    totalPoints
    activeStakesCount
    quantityTier
  }
  
  # Recent staking activity
  recentStakes: Stake(
    order_by: {stakedAt: desc}
    limit: 20
    where: {isActive: {_eq: true}}
  ) {
    tokenId
    owner
    stakedAt
  }
}
```

### Points calculation

- **Base rate**: ~1 point every 5 seconds per NFT (0.2 points/second per NFT)
- **Quantity bonuses**: 
  - 5-9 NFTs: 1.2x multiplier (tier 1)
  - 10+ NFTs: 1.5x multiplier (tier 2)
- **Points per second**: Total earning rate for all active NFTs combined, stored as milli-points (divide by 1000 for actual rate)
- **Emergency withdrawals**: Earn 0 points (penalty for early exit)

### Real-time points calculation

To get a user's current points including live accrual from active stakes:

```javascript
// From the UserProfile query above
const user = data.UserStats[0];
const currentTimestamp = Math.floor(Date.now() / 1000); // Current Unix timestamp

// Calculate time since last update
const timeSinceUpdate = currentTimestamp - Number(user.lastUpdatedAt);

// Calculate bonus points from active stakes
const bonusPoints = (timeSinceUpdate * Number(user.pointsPerSecond)) / 1000;

// Real-time total points
const realTimePoints = Number(user.totalPoints) + bonusPoints;

console.log(`User has ${realTimePoints.toFixed(0)} points right now`);
```

**Note**: The indexer updates `UserStats` on every stake/unstake event, so the live calculation is only needed for displaying real-time accrual between events.

## MonsterCapsule NFT Tracking

The indexer tracks MonsterCapsule NFT ownership, transfers, and staking status on Abstract Mainnet (2741). This enables efficient querying of NFT holders, their collections, and staking states without complex wallet scanning.

### Core entities

- **Capsule**: Individual NFT with metadata (type, owner, staking status)
- **CapsuleHolder**: Aggregated holder data with capsule counts and statistics

### Get user's complete NFT collection

Get all NFTs owned by a specific user with counts and staking breakdown

```graphql
query GetUserCapsules($userAddress: String!) {
  CapsuleHolder(where: { id: { _eq: $userAddress } }) {
    id
    totalCapsules
    stakedCapsules
    capsules {
      id
      tokenId
      capsuleType
      ownerAddress
      isStaked
    }
  }
}
```

**Variables:**
```json
{
  "userAddress": "0x1234567890abcdef1234567890abcdef12345678"
}
```

### Get only staked NFTs

Retrieve NFTs currently being staked by a user

```graphql
query GetUserStakedCapsules($userAddress: String!) {
  Capsule(where: { ownerAddress: { _eq: $userAddress }, isStaked: { _eq: true } }) {
    id
    tokenId
    capsuleType
    ownerAddress
    isStaked
  }
}
```

### Get only unstaked NFTs

Retrieve NFTs available for staking or trading

```graphql
query GetUserUnstakedCapsules($userAddress: String!) {
  Capsule(where: { ownerAddress: { _eq: $userAddress }, isStaked: { _eq: false } }) {
    id
    tokenId
    capsuleType
    ownerAddress
    isStaked
  }
}
```

### Get user's token IDs by staking status

Lightweight query to get both staked and unstaked token IDs for efficient processing

```graphql
query GetUserTokenIds($userAddress: String!) {
  stakedTokens: Capsule(where: { ownerAddress: { _eq: $userAddress }, isStaked: { _eq: true } }) {
    tokenId
  }
  unstakedTokens: Capsule(where: { ownerAddress: { _eq: $userAddress }, isStaked: { _eq: false } }) {
    tokenId
  }
}
```

**Usage:**
```javascript
const stakedIds = data.stakedTokens.map(t => t.tokenId);
const unstakedIds = data.unstakedTokens.map(t => t.tokenId);
```

### NFT collection overview

Get collection statistics and top holders for dashboard views

```graphql
query CapsuleOverview {
  # Top holders by total capsules
  topHolders: CapsuleHolder(
    order_by: {totalCapsules: desc}
    limit: 10
    where: {totalCapsules: {_gt: 0}}
  ) {
    id
    totalCapsules
    stakedCapsules
  }
  
  # Recently minted capsules
  recentMints: Capsule(
    order_by: {tokenId: desc}
    limit: 20
  ) {
    id
    tokenId
    capsuleType
    ownerAddress
    isStaked
  }
}
```

### Find NFT owner

Quickly find who owns a specific NFT

```graphql
query GetCapsuleOwner($tokenId: String!) {
  Capsule(where: { id: { _eq: $tokenId } }) {
    id
    tokenId
    capsuleType
    ownerAddress
    isStaked
    owner {
      id
      totalCapsules
      stakedCapsules
    }
  }
}
```

### Collection analytics by type

Analyze distribution and staking rates by capsule type

```graphql
query CapsuleTypeAnalytics {
  # Group by type for analytics
  Capsule {
    capsuleType
    isStaked
    ownerAddress
  }
}
```

### Holder leaderboard

Get users ranked by their NFT collection size

```graphql
query HolderLeaderboard {
  CapsuleHolder(
    order_by: [
      {totalCapsules: desc},
      {stakedCapsules: desc}
    ]
    where: {totalCapsules: {_gt: 0}}
    limit: 50
  ) {
    id
    totalCapsules
    stakedCapsules
  }
}
```

### Advanced holder insights

Get detailed holder information with calculated metrics

```graphql
query HolderInsights($userAddress: String!) {
  CapsuleHolder(where: { id: { _eq: $userAddress } }) {
    id
    totalCapsules
    stakedCapsules
    capsules {
      id
      tokenId
      capsuleType
      isStaked
    }
  }
}
```

### Real-time collection metrics

Calculate unstaked capsules and staking rate:

```javascript
// From the GetUserCapsules query above
const holder = data.CapsuleHolder[0]; // Array result from Hasura

if (holder) {
  const unstakedCapsules = holder.totalCapsules - holder.stakedCapsules;
  const stakingRate = (holder.stakedCapsules / holder.totalCapsules) * 100;
  
  console.log(`User owns ${holder.totalCapsules} capsules`);
  console.log(`${holder.stakedCapsules} staked, ${unstakedCapsules} available`);
  console.log(`Staking rate: ${stakingRate.toFixed(1)}%`);
  
  // Group by type
  const typeDistribution = holder.capsules.reduce((acc, capsule) => {
    acc[capsule.capsuleType] = (acc[capsule.capsuleType] || 0) + 1;
    return acc;
  }, {});
  
  console.log('Collection by type:', typeDistribution);
}
```
### Key features

- **Direct address access**: `ownerAddress` field enables fast queries without joins
- **Pre-calculated counts**: `totalCapsules` and `stakedCapsules` for instant statistics
- **Type metadata**: Capsule rarity and traits automatically indexed
- **Staking integration**: Seamless tracking of staked vs available NFTs
- **Efficient indexing**: Optimized for wallet scanning and collection analysis
