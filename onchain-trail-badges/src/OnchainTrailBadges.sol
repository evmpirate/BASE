// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title OnchainTrail Badges
/// @notice Achievement badges for milestones on a Base builder journey.
///         Metadata and SVG art are generated fully on-chain — no external
///         hosting required.
contract OnchainTrailBadges is ERC721, Ownable {
    using Strings for uint256;

    /// @notice The id that will be assigned to the next minted badge.
    uint256 public nextTokenId = 1;

    /// @notice Human-readable achievement name for each badge, set at mint.
    mapping(uint256 tokenId => string) public badgeName;

    event BadgeMinted(uint256 indexed tokenId, address indexed to, string name);

    constructor() ERC721("OnchainTrail Badges", "TRAIL") Ownable(msg.sender) {}

    /// @notice Mint a new badge. Only the collection owner can mint.
    /// @param to Recipient of the badge.
    /// @param name_ Achievement name, e.g. "First Deploy".
    function mint(address to, string calldata name_) external onlyOwner returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        badgeName[tokenId] = name_;
        _safeMint(to, tokenId);
        emit BadgeMinted(tokenId, to, name_);
    }

    /// @notice Returns a data: URI with JSON metadata and embedded SVG image.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory name_ = badgeName[tokenId];

        string memory json = string.concat(
            '{"name":"OnchainTrail Badge #',
            tokenId.toString(),
            ": ",
            name_,
            '","description":"Achievement badge for a milestone on the Base builder journey.",',
            '"attributes":[{"trait_type":"Achievement","value":"',
            name_,
            '"}],"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(_svg(tokenId, name_))),
            '"}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    /// @dev Simple badge art: dark rounded card, blue ring, achievement text.
    function _svg(uint256 tokenId, string memory name_) internal pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
            '<rect width="400" height="400" rx="24" fill="#0a0b1e"/>',
            '<circle cx="200" cy="160" r="80" fill="none" stroke="#0052ff" stroke-width="8"/>',
            '<text x="200" y="172" text-anchor="middle" font-family="monospace" font-size="36" fill="#0052ff">#',
            tokenId.toString(),
            "</text>",
            '<text x="200" y="290" text-anchor="middle" font-family="monospace" font-size="24" fill="#ffffff">',
            name_,
            "</text>",
            '<text x="200" y="330" text-anchor="middle" font-family="monospace" font-size="14" fill="#5b5e71">OnchainTrail Badges</text>',
            "</svg>"
        );
    }
}
