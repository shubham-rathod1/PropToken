import { expect } from 'chai';
import { network } from 'hardhat';

const { ethers } = await network.connect();

describe('TokenizationManager', function () {
  let deed: any, fractionsImpl: any, manager: any;
  let owner: any, investor1: any, investor2: any;

  beforeEach(async () => {
    [owner, investor1, investor2] = await ethers.getSigners();

    deed = await ethers.deployContract('PropertyDeed');
    fractionsImpl = await ethers.deployContract('PropertyFractions');

    manager = await ethers.deployContract('TokenizationManager', [
      deed.target,
      fractionsImpl.target,
    ]);

    // Manager must control deed minting / it will act like an escrow here.
    await deed.transferOwnership(manager.target);
  });

  it('tokenizes a property', async () => {
    await manager
      .connect(owner)
      .tokenizeProperty('ipfs://prop1', 'PropFractions', 'PF', 1000);
    const propId = await manager.propertyCount();
    const prop = await manager.properties(propId);
    expect(prop.originalOwner).to.equal(owner.address);
    expect(prop.remainingFractions).to.equal(1000n);
  });

  it('starts distribution', async () => {
    await manager
      .connect(owner)
      .tokenizeProperty('ipfs://prop1', 'PropF', 'PF', 1000);
    const propId = await manager.propertyCount();

    await manager
      .connect(owner)
      .startDistribution(propId, ethers.parseEther('0.01'));
    const prop = await manager.properties(propId);
    expect(prop.pricePerFraction).to.equal(ethers.parseEther('0.01'));
    expect(prop.distributionState).to.equal(1);
  });

  it('investor can buy fractions', async () => {
    await manager
      .connect(owner)
      .tokenizeProperty('ipfs://prop1', 'PropF', 'PF', 1000);
    const propId = await manager.propertyCount();
    await manager
      .connect(owner)
      .startDistribution(propId, ethers.parseEther('0.01'));

    const cost = ethers.parseEther('0.1');
    await manager.connect(investor1).buyFractions(propId, 10, { value: cost });

    const prop = await manager.properties(propId);
    expect(prop.remainingFractions).to.equal(990);
    expect(prop.proceeds).to.equal(cost);

    const fractionsAddr = prop.fractions;
    const fractions = await ethers.getContractAt(
      'PropertyFractions',
      fractionsAddr
    );
    expect(await fractions.balanceOf(investor1.address)).to.equal(10);
  });

  it('refunds excess ETH', async () => {
    await manager
      .connect(owner)
      .tokenizeProperty('ipfs://prop1', 'PropF', 'PF', 1000);
    const propId = await manager.propertyCount();
    const price = ethers.parseEther('0.01');
    await manager.connect(owner).startDistribution(propId, price);

    const overpay = ethers.parseEther('0.02');
    const balBefore = await ethers.provider.getBalance(investor1.address);

    const tx = await manager
      .connect(investor1)
      .buyFractions(propId, 1, { value: overpay });
    const receipt = await tx.wait();
    const gasUsed = receipt.gasUsed * receipt.gasPrice;

    const balAfter = await ethers.provider.getBalance(investor1.address);
    const diff = balBefore - balAfter;
    // Should be ≈ price + gas, meaning refund worked
    expect(diff < ethers.parseEther('0.011')).to.be.true;
  });

  it('withdraws proceeds', async () => {
    await manager
      .connect(owner)
      .tokenizeProperty('ipfs://prop1', 'PropF', 'PF', 1000);
    const propId = await manager.propertyCount();
    const price = ethers.parseEther('0.01');
    await manager.connect(owner).startDistribution(propId, price);

    const cost = ethers.parseEther('0.1');
    await manager.connect(investor1).buyFractions(propId, 10, { value: cost });

    const balBefore = await ethers.provider.getBalance(owner.address);
    const tx = await manager.connect(owner).withdrawProceeds(propId);
    const receipt = await tx.wait();
    const gas = receipt.gasUsed * receipt.gasPrice;
    const balAfter = await ethers.provider.getBalance(owner.address);

    expect(BigInt(balAfter) + BigInt(gas) - BigInt(balBefore)).to.equal(
      BigInt(cost)
    );
  });

  // ---------- Failure cases ----------

  it('fails if non-owner starts distribution', async () => {
    await manager
      .connect(owner)
      .tokenizeProperty('ipfs://prop1', 'PropF', 'PF', 1000);
    const propId = await manager.propertyCount();

    await expect(
      manager
        .connect(investor1)
        .startDistribution(propId, ethers.parseEther('0.01'))
    ).to.be.revertedWith('not owner');
  });

  it('fails if buying more than remaining fractions', async () => {
    await manager
      .connect(owner)
      .tokenizeProperty('ipfs://prop1', 'PropF', 'PF', 5);
    const propId = await manager.propertyCount();
    await manager
      .connect(owner)
      .startDistribution(propId, ethers.parseEther('0.01'));

    await expect(
      manager
        .connect(investor1)
        .buyFractions(propId, 10, { value: ethers.parseEther('0.1') })
    ).to.be.revertedWith('insufficient remaining fractions');
  });

  // ---------- Global pause ----------

  it('can pause and unpause globally', async () => {
    await manager.connect(owner).pause();
    await expect(
      manager
        .connect(owner)
        .tokenizeProperty('ipfs://prop1', 'PropF', 'PF', 1000)
    ).to.be.revertedWithCustomError(manager, 'EnforcedPause');
    await manager.connect(owner).unpause();
    await manager
      .connect(owner)
      .tokenizeProperty('ipfs://prop1', 'PropF', 'PF', 1000);
  });

  // ---------- Lifecycle edge cases ----------
  it('owner can pause and resume distribution', async () => {
    await manager
      .connect(owner)
      .tokenizeProperty('ipfs://prop', 'F', 'PF', 1000);
    const propId = await manager.propertyCount();
    await manager
      .connect(owner)
      .startDistribution(propId, ethers.parseEther('0.01'));

    await manager.connect(owner).pauseDistribution(propId);
    let prop = await manager.properties(propId);
    expect(prop.distributionState).to.equal(2); // Paused

    await manager.connect(owner).resumeDistribution(propId);
    prop = await manager.properties(propId);
    expect(prop.distributionState).to.equal(1); // Active
  });

  it('non-owner cannot pause or resume distribution', async () => {
    await manager
      .connect(owner)
      .tokenizeProperty('ipfs://prop', 'F', 'PF', 1000);
    const propId = await manager.propertyCount();
    await manager
      .connect(owner)
      .startDistribution(propId, ethers.parseEther('0.01'));

    await expect(
      manager.connect(investor1).pauseDistribution(propId)
    ).to.be.revertedWith('not owner');
  });

  it('cannot resume if not paused', async () => {
    await manager
      .connect(owner)
      .tokenizeProperty('ipfs://prop', 'F', 'PF', 1000);
    const propId = await manager.propertyCount();
    await manager
      .connect(owner)
      .startDistribution(propId, ethers.parseEther('0.01'));

    await expect(
      manager.connect(owner).resumeDistribution(propId)
    ).to.be.revertedWith('Not paused');
  });

  it('owner can close distribution', async () => {
    await manager
      .connect(owner)
      .tokenizeProperty('ipfs://prop', 'F', 'PF', 1000);
    const propId = await manager.propertyCount();
    await manager
      .connect(owner)
      .startDistribution(propId, ethers.parseEther('0.01'));

    await manager.connect(owner).closeDistribution(propId);
    const prop = await manager.properties(propId);
    expect(prop.distributionState).to.equal(3);
  });

  it('cannot close twice', async () => {
    await manager
      .connect(owner)
      .tokenizeProperty('ipfs://prop', 'F', 'PF', 1000);
    const propId = await manager.propertyCount();
    await manager
      .connect(owner)
      .startDistribution(propId, ethers.parseEther('0.01'));
    await manager.connect(owner).closeDistribution(propId);

    await expect(
      manager.connect(owner).closeDistribution(propId)
    ).to.be.revertedWith('Already closed');
  });

  it('cannot buy after distribution is closed', async () => {
    await manager
      .connect(owner)
      .tokenizeProperty('ipfs://prop', 'F', 'PF', 1000);
    const propId = await manager.propertyCount();
    const price = ethers.parseEther('0.01');
    await manager.connect(owner).startDistribution(propId, price);
    await manager.connect(owner).closeDistribution(propId);

    await expect(
      manager.connect(investor1).buyFractions(propId, 1, { value: price })
    ).to.be.revertedWith('distribution not active');
  });

  // ---------- Withdraw edge cases ----------
  it('withdraw fails if no proceeds', async () => {
    await manager
      .connect(owner)
      .tokenizeProperty('ipfs://prop', 'F', 'PF', 1000);
    const propId = await manager.propertyCount();
    await expect(
      manager.connect(owner).withdrawProceeds(propId)
    ).to.be.revertedWith('no proceeds');
  });

  it('non-owner cannot withdraw proceeds', async () => {
    await manager
      .connect(owner)
      .tokenizeProperty('ipfs://prop', 'F', 'PF', 1000);
    const propId = await manager.propertyCount();
    await manager
      .connect(owner)
      .startDistribution(propId, ethers.parseEther('0.01'));
    await manager
      .connect(investor1)
      .buyFractions(propId, 1, { value: ethers.parseEther('0.01') });

    await expect(
      manager.connect(investor1).withdrawProceeds(propId)
    ).to.be.revertedWith('not owner');
  });

  it('two properties are independent', async () => {
    // Property A
    await manager
      .connect(owner)
      .tokenizeProperty('ipfs://propA', 'FA', 'PFA', 100);
    const propA = await manager.propertyCount();
    await manager
      .connect(owner)
      .startDistribution(propA, ethers.parseEther('0.01'));

    // Property B
    await manager
      .connect(owner)
      .tokenizeProperty('ipfs://propB', 'FB', 'PFB', 200);
    const propB = await manager.propertyCount();
    await manager
      .connect(owner)
      .startDistribution(propB, ethers.parseEther('0.02'));

    // Investor buys from A only
    await manager
      .connect(investor1)
      .buyFractions(propA, 5, { value: ethers.parseEther('0.05') });

    const propInfoA = await manager.properties(propA);
    const propInfoB = await manager.properties(propB);

    expect(propInfoA.remainingFractions).to.equal(95);
    expect(propInfoB.remainingFractions).to.equal(200);
  });
});
