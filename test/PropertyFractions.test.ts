import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("PropertyFractions", function () {
  let fractions: any;
  let owner: any, user: any;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    const Fractions = await ethers.getContractFactory("PropertyFractions");
    fractions = await Fractions.deploy();
    await fractions.initialize("TestFractions", "TF", 1000, 1, owner.address);
  });

  it("initial supply assigned to manager/owner", async () => {
    const balance = await fractions.balanceOf(owner.address);
    expect(balance).to.equal(1000);
  });

  it("can transfer fractions", async () => {
    await fractions.connect(owner).transfer(user.address, 100);
    expect(await fractions.balanceOf(user.address)).to.equal(100);
  });
});
