# PropToken – Real Estate Tokenization System  

## Overview  
**PropToken** is a simplified MVP implementation of a real estate tokenization system. It demonstrates how a property deed (ERC-721) can be fractionalized into tradable ownership shares (ERC-20), and how a manager contract can orchestrate the entire lifecycle: minting, distribution, proceeds handling, and locking of the deed.  

The goal is to showcase **clean architecture**, **security best practices**, and **gas-efficient design decisions**, while keeping the flow easy to understand.  

---

## 🔧 Development Guide  

### 1. Install Dependencies & Build 
```bash
npm install
npx hardhat compile
```

### 2. Start Local Hardhat Node  
```bash
npx hardhat node
```

### 3. Deploy Contracts with Ignition 
```bash
npx hardhat ignition deploy ./ignition/modules/PropTokenModule.ts --network localhost
```

### 4. Run test flow
```bash
npx hardhat run scripts/testFlow.ts --network localhost
```

### Deployment address are stored under
./ignition/deployments/chain-31337/deployed_addresses.json

## ⚙️ Architecture & Design Decisions  

### Contracts  
1. **PropertyDeed.sol**  
   - An ERC-721 NFT representing the *legal deed* of a property.  
   - Only the `TokenizationManager` can mint new deeds.  
   - Acts as an **escrow lock**: once tokenized, the deed stays locked in the manager contract, ensuring it cannot be transferred independently of its fractions.  

2. **PropertyFractions.sol**  
   - An ERC-20 token representing *fractional ownership* of a single property.  
   - Deployed as a **clone (minimal proxy)** from a base implementation for gas efficiency.  
   - Total supply is fixed at deployment (e.g., 1,000 or 1,000,000 tokens).  
   - All initial fractions are minted to the `TokenizationManager`, which handles sales.  

3. **TokenizationManager.sol**  
   - The **core orchestration contract**.  
   - Responsibilities:  
     - Tokenizes property: mints deed NFT + deploys fractions ERC-20 clone.  
     - Locks deed inside manager.  
     - Handles lifecycle of fractional sales: `startDistribution → buyFractions → withdrawProceeds → closeDistribution`.  
     - Provides **pause/resume controls** (per property and globally).  
   - Maintains mapping of `propertyId → Property struct`, storing state, proceeds, fractions address, etc.  

---

### Key Design Choices  

- **Escrow of Deed:**  
  Once fractionalized, the deed NFT is permanently locked in the manager to guarantee that fractions are the sole representation of ownership. This avoids ambiguity in ownership transfers.  

- **Clones for Fractions:**  
  Instead of deploying full ERC-20 contracts repeatedly, the system uses OpenZeppelin’s `Clones` library to deploy minimal proxies → significantly reduces gas cost per property.  

- **Lifecycle State Machine:**  
  Each property has a `DistributionState`:  
  - `NotStarted → Active → Paused → Closed`.  
  This ensures clear rules on when purchases are allowed and avoids double-spending or stale sales.  

- **Access Control:**  
  - `Ownable`: only contract owner can pause/unpause the system.  
  - `onlyPropertyOwner`: ensures only the original property owner can start/pause/resume/close distribution and withdraw proceeds.  

- **Security Hardening:**  
  - `ReentrancyGuard` on state-changing ETH transfers (`buyFractions`, `withdrawProceeds`).  
  - `SafeERC20` for fraction transfers.  
  - Refund logic (`msg.value > cost`) is handled via `.call` to prevent stuck ETH.  
  - Zero-address checks for constructor inputs.  

- **Gas Optimizations:**  
  - Used `immutable` for `deed` and `fractionsImp` references.  
  - Reduced storage slots (`pricePerFraction` and `remainingFractions` packed into `uint128`).  
  - `unchecked` blocks for safe arithmetic where overflow is impossible.  
  - Clones reduce bytecode duplication across properties.  

---

## 🔄 Contract Interaction Flow  

1. **Tokenize Property**  
   - Owner calls `tokenizeProperty(uri, name, symbol, totalSupply)`.  
   - Manager mints new deed NFT (locked in contract).  
   - Manager deploys a new fractions ERC-20 clone and mints supply to itself.  
   - A new `propertyId` is registered in state.  

2. **Start Distribution**  
   - Property owner sets `pricePerFraction` via `startDistribution(propertyId, price)`.  
   - Property enters `Active` state.  

3. **Buy Fractions**  
   - Investors call `buyFractions(propertyId, amount)` with ETH.  
   - Manager transfers fractions to buyer.  
   - Tracks remaining supply + accumulates ETH proceeds.  
   - Refunds any overpayment automatically.  

4. **Withdraw Proceeds**  
   - Property owner can call `withdrawProceeds(propertyId)`.  
   - Contract transfers accumulated ETH proceeds safely to them.  

5. **Lifecycle Controls**  
   - Owner can `pauseDistribution`, `resumeDistribution`, or `closeDistribution`.  
   - Global `pause/unpause` available to system admin.  

---

## 🛡️ Security Considerations  

- **Reentrancy:** All ETH transfers protected with `nonReentrant`.  
- **Access Control:** Strong separation between platform admin (`Ownable`) and property owner (`onlyPropertyOwner`).  
- **Proceeds Safety:** Funds are not auto-forwarded; they are **escrowed** in the contract until explicitly withdrawn.  
- **Distribution Lock:** No new fractions can be sold once distribution is paused/closed.  
- **Fail-safe Refunds:** Investors always get excess ETH back in the same call.  

---

## 🧪 Testing

### Run all tests:
```bash
npx hardhat test
```

### Run a single test file:
```bash
npx hardhat test test/TokenizationManager.test.ts
```

### Run end-to-end flow test:
```bash
npx hardhat test test/TokenizationManager.e2e.test.ts
```

### Test Suite Structure

- PropertyDeed.test.ts
  - Validates deed minting
  - Ensures only manager can mint
  - Ensures URIs are correctly set

- PropertyFractions.test.ts
  - Validates initialization (name, symbol, supply)
  - Ensures supply is assigned to manager
  - Basic transfers between accounts

- TokenizationManager.test.ts
  - Unit + edge cases
    - Tokenization, start distribution, buy fractions
    - Withdraw proceeds, refunds, reverts on misuse
    - Lifecycle transitions (pause/resume/close)
    - Multi-property independence
    - Global pause/unpause

- TokenizationManager.e2e.test.ts
  - Full flow integration test
    - Tokenize property → Start → Multiple investors buy → Withdraw → Close → Ensure no further buys
  - Proves system works correctly end-to-end across all contracts


## Future Extensions  

This MVP focuses on the core flow, but the system can be extended in multiple directions:  

### 1. Modular Plug-and-Play Architecture  
- Allow the `TokenizationManager` to plug in different `PropertyDeed` or `PropertyFractions` implementations.  
- Example: upgrade to **ERC-721A** for cheaper minting, or integrate **ERC-4626 vault shares** for more complex fund structures.  
- Would make the system more **extensible** without redeploying the manager.  

### 2. Owner Fee Structure  
- Introduce a configurable **platform fee** or **owner fee** on each withdrawal.  
- Example: 1–2% of proceeds routed to a **treasury address**.  
- Creates a **sustainable business model** for the platform.  

### 3. Fraction Buyback / Redemption  
- Add the ability for a property owner (or DAO) to **buy back fractions**.  
- If all fractions are returned and burned, the **deed NFT could be unlocked** and transferred back.  
- Mirrors real-world fund redemption but adds complexity.  

### 4. Secondary Market Integration  
- Integrate with existing **DEXs/AMMs** so fractions can be traded freely after the initial distribution.  
- This would unlock **liquidity** and enable **price discovery** for property shares.  

### 5. DAO Governance  
- Allow fraction holders to **vote on property management** (e.g., maintenance, sale decisions).  
- Turn the system into a **decentralized property fund**.  
