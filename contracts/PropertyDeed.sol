// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// why are we using ERC721URIStorage?
// because we want to store the metadata of the token

contract PropertyDeed is ERC721URIStorage, Ownable {
    uint256 public tokenId;

    constructor() ERC721("PropertyDeed", "Deed") Ownable(msg.sender) {}

    function mintTo(
        address to,
        string calldata uri
    ) external onlyOwner returns (uint256) {
        tokenId++;
        uint256 id = tokenId;
        _mint(to, id);
        _setTokenURI(id, uri);
        return id;
    }
}
