import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

/**
 * End-to-End Lifecycle Test
 *
 * This test simulates a full real-world flow:
 * 1. Owner tokenizes a property (deed + fractions).
 * 2. Owner starts distribution with a fixed price.
 * 3. Two investors purchase fractions.
 * 4. Contract tracks balances, remaining fractions, and proceeds correctly.
 * 5. Owner withdraws proceeds (funds safely transferred).
 * 6. Owner closes the distribution.
 * 7. Further purchases are blocked once closed.
 *
 * This ensures the entire system works together across contracts
 * and validates fund safety + lifecycle management end-to-end.
 */

describe("TokenizationManager E2E Flow", function () {
  let deed: any, fractionsImpl: any, manager: any;
  let owner: any, investor1: any, investor2: any;

  beforeEach(async () => {
    [owner, investor1, investor2] = await ethers.getSigners();

    deed = await ethers.deployContract("PropertyDeed");
    fractionsImpl = await ethers.deployContract("PropertyFractions");

    manager = await ethers.deployContract("TokenizationManager", [
      deed.target,
      fractionsImpl.target,
    ]);

    await deed.transferOwnership(manager.target);
  });

  it("runs full lifecycle: tokenize → start → buy → withdraw → close", async () => {
    await manager.connect(owner).tokenizeProperty(
      "ipfs://prop-full",
      "FullFlowFractions",
      "FFF",
      1000
    );
    const propId = await manager.propertyCount();
    let prop = await manager.properties(propId);
    expect(prop.remainingFractions).to.equal(1000);

    // Start distribution
    const price = ethers.parseEther("0.01");
    await manager.connect(owner).startDistribution(propId, price);
    prop = await manager.properties(propId);
    expect(prop.distributionState).to.equal(1);

    // Investor1 buys 50 fractions
    const cost1 = price * 50n;
    await manager.connect(investor1).buyFractions(propId, 50, { value: cost1 });
    const fractions = await ethers.getContractAt("PropertyFractions", prop.fractions);
    expect(await fractions.balanceOf(investor1.address)).to.equal(50);

    // Investor2 buys 25 fractions
    const cost2 = price * 25n;
    await manager.connect(investor2).buyFractions(propId, 25, { value: cost2 });
    expect(await fractions.balanceOf(investor2.address)).to.equal(25);

    // Check remaining + proceeds
    prop = await manager.properties(propId);
    expect(prop.remainingFractions).to.equal(925);
    expect(prop.proceeds).to.equal(cost1 + cost2);

    // Owner withdraws proceeds
    const balBefore = await ethers.provider.getBalance(owner.address);
    const tx = await manager.connect(owner).withdrawProceeds(propId);
    const receipt = await tx.wait();
    const gas = receipt.gasUsed * receipt.gasPrice;
    const balAfter = await ethers.provider.getBalance(owner.address);
    expect(BigInt(balAfter) + BigInt(gas) - BigInt(balBefore)).to.equal(cost1 + cost2);

    // Close distribution
    await manager.connect(owner).closeDistribution(propId);
    prop = await manager.properties(propId);
    expect(prop.distributionState).to.equal(3);

    // Verify no more buys allowed
    await expect(
      manager.connect(investor1).buyFractions(propId, 1, { value: price })
    ).to.be.revertedWith("distribution not active");
  });
});
