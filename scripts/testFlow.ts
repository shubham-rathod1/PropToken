
import { network } from 'hardhat';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const addressesPath = path.join(
  __dirname,
  '../ignition/deployments/chain-31337/deployed_addresses.json'
);
const addresses = JSON.parse(fs.readFileSync(addressesPath, 'utf-8'));

async function main() {
  const { ethers } = await network.connect({
    network: 'localhost',
    chainType: 'l1',
  });
  const [owner, investor] = await ethers.getSigners();

  const deedAddress = addresses['PropTokenModule#PropertyDeed'];
  console.log('Deed Address:', deedAddress);
  const managerAddress = addresses['PropTokenModule#TokenizationManager'];
  console.log('Manager Address:', managerAddress);

  const deed = await ethers.getContractAt('PropertyDeed', deedAddress);
  const manager = await ethers.getContractAt(
    'TokenizationManager',
    managerAddress
  );

  console.log('Deed:', deed.target);
  console.log('Manager:', manager.target);

  // 1. Tokenize property
  const tx1 = await manager
    .connect(owner)
    .tokenizeProperty(
      'ipfs://some-metadata',
      'Property #1 Fractions',
      'PF1',
      1000
    );
  const receipt1 = await tx1.wait();
  console.log('Tokenize tx hash:', receipt1?.hash);

  const propertyId = await manager.propertyCount();
  console.log('New propertyId:', propertyId.toString());

  // 2. Start distribution
  const pricePerFraction = ethers.parseEther('0.01');
  const tx2 = await manager
    .connect(owner)
    .startDistribution(propertyId, pricePerFraction);
  await tx2.wait();
  console.log('Distribution started at price:', pricePerFraction.toString());

  // 3. Investor buys fractions
  const numFractions = 10;
  const cost = pricePerFraction * BigInt(numFractions);
  const tx3 = await manager
    .connect(investor)
    .buyFractions(propertyId, numFractions, { value: cost });
  await tx3.wait();
  console.log(`Investor bought ${numFractions} fractions`);

  // 4. Check balances
  const property = await manager.properties(propertyId);
  const fractionsAddr = property.fractions;
  const fractions = await ethers.getContractAt(
    'PropertyFractions',
    fractionsAddr
  );

  const balInvestor = await fractions.balanceOf(investor.address);
  console.log('Investor fraction balance:', balInvestor.toString());

  const propInfo = await manager.properties(propertyId);
  const proceeds = propInfo.proceeds as bigint;
  console.log(
    'Proceeds stored for owner:',
    ethers.formatEther(proceeds),
    'ETH'
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
