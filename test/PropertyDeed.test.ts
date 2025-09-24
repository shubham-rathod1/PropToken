import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("PropertyDeed", function () {
  let deed: any;
  let owner: any, user: any;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    deed = await ethers.deployContract("PropertyDeed");
  });

  it("owner can mint", async () => {
    const tx = await deed.connect(owner).mintTo(user.address, "ipfs://property1");
    await tx.wait();

    expect(await deed.ownerOf(1)).to.equal(user.address);
    expect(await deed.tokenURI(1)).to.equal("ipfs://property1");
  });

  it("non-owner cannot mint", async () => {
    await expect(
      deed.connect(user).mintTo(user.address, "ipfs://fail")
    ).to.be.revertedWithCustomError(deed, "OwnableUnauthorizedAccount");
  });
});
