// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {OnchainTrailBadges} from "../src/OnchainTrailBadges.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract OnchainTrailBadgesTest is Test {
    OnchainTrailBadges internal badges;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");

    function setUp() public {
        vm.prank(owner);
        badges = new OnchainTrailBadges();
    }

    function test_MetadataBasics() public view {
        assertEq(badges.name(), "OnchainTrail Badges");
        assertEq(badges.symbol(), "TRAIL");
        assertEq(badges.owner(), owner);
    }

    function test_OwnerCanMint() public {
        vm.prank(owner);
        uint256 tokenId = badges.mint(alice, "First Deploy");

        assertEq(tokenId, 1);
        assertEq(badges.ownerOf(1), alice);
        assertEq(badges.badgeName(1), "First Deploy");
        assertEq(badges.nextTokenId(), 2);
    }

    function test_NonOwnerCannotMint() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        badges.mint(alice, "Sneaky Badge");
    }

    function test_TokenURI() public {
        vm.prank(owner);
        badges.mint(alice, "First Deploy");

        string memory uri = badges.tokenURI(1);

        // Must be an on-chain data URI.
        assertTrue(_startsWith(uri, "data:application/json;base64,"));

        // Decode the base64 payload and check its contents.
        string memory json = string(_base64Decode(_stripPrefix(uri, 29)));
        assertTrue(vm.contains(json, '"name":"OnchainTrail Badge #1: First Deploy"'));
        assertTrue(vm.contains(json, '"image":"data:image/svg+xml;base64,'));
        assertTrue(vm.contains(json, '{"trait_type":"Achievement","value":"First Deploy"}'));
    }

    function test_TokenURIRevertsForNonexistentToken() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 99));
        badges.tokenURI(99);
    }

    function _startsWith(string memory str, string memory prefix) internal pure returns (bool) {
        bytes memory s = bytes(str);
        bytes memory p = bytes(prefix);
        if (s.length < p.length) return false;
        for (uint256 i = 0; i < p.length; i++) {
            if (s[i] != p[i]) return false;
        }
        return true;
    }

    function _base64Decode(string memory input) internal pure returns (bytes memory) {
        bytes memory data = bytes(input);
        bytes memory table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        uint8[128] memory rev;
        for (uint8 i = 0; i < 64; i++) {
            rev[uint8(table[i])] = i;
        }
        uint256 len = data.length;
        uint256 padding = 0;
        if (len > 0 && data[len - 1] == "=") padding++;
        if (len > 1 && data[len - 2] == "=") padding++;
        bytes memory out = new bytes((len / 4) * 3 - padding);
        uint256 o = 0;
        for (uint256 i = 0; i < len; i += 4) {
            uint256 chunk = (uint256(rev[uint8(data[i])]) << 18) | (uint256(rev[uint8(data[i + 1])]) << 12)
                | (uint256(rev[uint8(data[i + 2])]) << 6) | uint256(rev[uint8(data[i + 3])]);
            if (o < out.length) out[o++] = bytes1(uint8(chunk >> 16));
            if (o < out.length) out[o++] = bytes1(uint8(chunk >> 8));
            if (o < out.length) out[o++] = bytes1(uint8(chunk));
        }
        return out;
    }

    function _stripPrefix(string memory str, uint256 n) internal pure returns (string memory) {
        bytes memory s = bytes(str);
        bytes memory out = new bytes(s.length - n);
        for (uint256 i = n; i < s.length; i++) {
            out[i - n] = s[i];
        }
        return string(out);
    }
}
