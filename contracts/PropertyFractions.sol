// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/*
  This contract is meant to be used as an implementation for EIP-1167 clones.
  Because clones don't run constructors, we expose an `initialize(...)` function
  (guarded by Initializable) that sets name/symbol and mints the total supply
  into the manager's address (escrow).
*/

// why do we need ERC20Upgradeable?
// because we want to use the upgradeable version of ERC20

// why do we need Initializable?
// because we want to use the upgradeable version of ERC20

// why don't constructor in upgradable?
// because constructor is run only once, but we want to run it every time the contract is deployed

contract PropertyFractions is Initializable, ERC20Upgradeable {
    uint256 public propertyId;
    address public manager;

    function initialize(
        string memory _name,
        string memory _symbol,
        uint256 _totalSupply,
        uint256 _propertyId,
        address _manager
    ) public initializer {
        __ERC20_init(_name, _symbol);
        propertyId = _propertyId;
        manager = _manager;
        _mint(_manager, _totalSupply);
    }

    function decimals() public pure override returns (uint8) {
        return 0;
    }
}
