// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import "./PropertyDeed.sol";
import "./PropertyFractions.sol";

contract TokenizationManager is Ownable, ReentrancyGuard, Pausable {
    using Clones for address;
    using SafeERC20 for IERC20;

    PropertyDeed public immutable deed;
    address public immutable fractionsImp;
    uint256 public propertyCount;

    enum DistributionState {
        NotStarted,
        Active,
        Paused,
        Closed
    }

    struct Property {
        address originalOwner;
        address fractions;
        uint128 pricePerFraction;
        uint128 remainingFractions;
        uint256 proceeds;
        uint256 tokenId;
        DistributionState distributionState;
    }

    mapping(uint256 => Property) public properties;

    event PropertyTokenized(
        uint256 indexed propertyId,
        address indexed owner,
        address fractionsContract,
        uint256 totalSupply
    );
    event DistributionStarted(
        uint256 indexed propertyId,
        uint256 pricePerFraction
    );
    event FractionsPurchased(
        uint256 indexed propertyId,
        address indexed buyer,
        uint256 amount,
        uint256 cost
    );
    event ProceedsWithdrawn(
        uint256 indexed propertyId,
        address indexed owner,
        uint256 amount
    );
    event DistributionPaused(uint256 indexed propertyId);
    event DistributionResumed(uint256 indexed propertyId);
    event DistributionClosed(uint256 indexed propertyId);

    constructor(address _deed, address _fractionsImp) Ownable(msg.sender) {
        require(
            _deed != address(0) && _fractionsImp != address(0),
            "zero address"
        );
        deed = PropertyDeed(_deed);
        fractionsImp = _fractionsImp;
    }

    // ---------- modifiers ----------
    modifier onlyPropertyOwner(uint256 propertyId) {
        require(
            msg.sender == properties[propertyId].originalOwner,
            "not owner"
        );
        _;
    }

    // ---------- admin pause ----------
    function pause() external onlyOwner {
        _pause();
    }
    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------- core flow ----------
    function tokenizeProperty(
        string calldata _uri,
        string calldata _name,
        string calldata _symbol,
        uint128 _totalSupply
    ) external whenNotPaused {
        require(_totalSupply > 0, "totalsupply > 0");
        uint256 tokenId = deed.mintTo(address(this), _uri);
        address clone = Clones.clone(fractionsImp);
        PropertyFractions(clone).initialize(
            _name,
            _symbol,
            _totalSupply,
            tokenId,
            address(this)
        );
        propertyCount++;
        properties[propertyCount] = Property({
            originalOwner: msg.sender,
            fractions: clone,
            pricePerFraction: 0,
            proceeds: 0,
            tokenId: tokenId,
            remainingFractions: _totalSupply,
            distributionState: DistributionState.NotStarted
        });
        emit PropertyTokenized(propertyCount, msg.sender, clone, _totalSupply);
    }

    function startDistribution(
        uint256 _propertyId,
        uint128 _pricePerFraction
    ) external whenNotPaused onlyPropertyOwner(_propertyId) {
        Property storage p = properties[_propertyId];
        require(
            p.distributionState == DistributionState.NotStarted,
            "distribution active"
        );
        require(_pricePerFraction > 0, "price > 0");
        p.pricePerFraction = _pricePerFraction;
        p.distributionState = DistributionState.Active;
        emit DistributionStarted(_propertyId, _pricePerFraction);
    }

    function buyFractions(
        uint256 _propertyId,
        uint128 _amount
    ) external payable nonReentrant whenNotPaused {
        require(_amount > 0, "amount > 0");
        Property storage p = properties[_propertyId];
        require(
            p.distributionState == DistributionState.Active,
            "distribution not active"
        );
        uint256 cost = _amount * p.pricePerFraction;
        require(msg.value >= cost, "insufficient funds");
        require(
            p.remainingFractions >= _amount,
            "insufficient remaining fractions"
        );

        IERC20 fractions = IERC20(p.fractions);
        // uint256 balance = fractions.balanceOf(address(this));
        // require(balance >= _amount, "insufficient balance");
        p.proceeds += cost;

        unchecked {
            p.remainingFractions -= _amount;
        }
        fractions.safeTransfer(msg.sender, _amount);
        // refund
        if (msg.value > cost) {
            (bool sent, ) = msg.sender.call{value: msg.value - cost}("");
            require(sent, "refund failed");
        }

        emit FractionsPurchased(_propertyId, msg.sender, _amount, cost);
    }

    function withdrawProceeds(
        uint256 _propertyId
    ) external whenNotPaused nonReentrant onlyPropertyOwner(_propertyId) {
        Property storage p = properties[_propertyId];
        uint256 proceeds = p.proceeds;
        require(proceeds > 0, "no proceeds");
        p.proceeds = 0;
        // use call just in case it is multisig
        (bool sent, ) = msg.sender.call{value: proceeds}("");
        require(sent, "withdraw failed");
        emit ProceedsWithdrawn(_propertyId, msg.sender, proceeds);
    }

    // ---------- distribution lifecycle controls (owner of property) ----------
    function pauseDistribution(
        uint256 propertyId
    ) external whenNotPaused onlyPropertyOwner(propertyId) {
        Property storage p = properties[propertyId];
        require(
            p.distributionState == DistributionState.Active,
            "Inactive"
        );

        p.distributionState = DistributionState.Paused;
        emit DistributionPaused(propertyId);
    }

    function resumeDistribution(
        uint256 propertyId
    ) external whenNotPaused onlyPropertyOwner(propertyId) {
        Property storage p = properties[propertyId];
        require(
            p.distributionState == DistributionState.Paused,
            "Not paused"
        );

        p.distributionState = DistributionState.Active;
        emit DistributionResumed(propertyId);
    }

    function closeDistribution(
        uint256 propertyId
    ) external whenNotPaused onlyPropertyOwner(propertyId) {
        Property storage p = properties[propertyId];
        require(
            p.distributionState != DistributionState.Closed,
            "Already closed"
        );

        p.distributionState = DistributionState.Closed;
        emit DistributionClosed(propertyId);
    }

    // ---------- views ----------
    function getPropertyState(
        uint256 propertyId
    ) external view returns (DistributionState) {
        return properties[propertyId].distributionState;
    }

    function getRemainingFractions(
        uint256 propertyId
    ) external view returns (uint256) {
        return properties[propertyId].remainingFractions;
    }
}
