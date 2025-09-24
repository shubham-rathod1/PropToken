import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

export default buildModule('PropTokenModule', (m: any) => {
  // 1. Deploy PropertyDeed
  const deed = m.contract('PropertyDeed');

  // 2. Deploy PropertyFractions implementation (logic contract for clones)
  const fractionsImpl = m.contract('PropertyFractions');

  // 3. Deploy TokenizationManager with constructor args
  const manager = m.contract('TokenizationManager', [deed, fractionsImpl]);

  // 4. After deploy, transfer ownership of deed contract to manager
  m.call(deed, 'transferOwnership', [manager]);

  return { deed, fractionsImpl, manager };
});
