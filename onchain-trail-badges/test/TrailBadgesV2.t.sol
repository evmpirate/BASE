// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TrailBadgesV2, IERC5192} from "../src/TrailBadgesV2.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract TrailBadgesV2Test is Test {
    TrailBadgesV2 internal badges;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal signerKey;
    address internal signer;

    function setUp() public {
        (signer, signerKey) = makeAddrAndKey("voucher-signer");
        vm.prank(owner);
        badges = new TrailBadgesV2(signer);
    }

    // ---- voucher plumbing -------------------------------------------------

    function _sign(uint256 key, address to, string memory name_, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash =
            keccak256(abi.encode(badges.VOUCHER_TYPEHASH(), to, keccak256(bytes(name_)), nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("TrailBadgesV2")),
                keccak256(bytes("2")),
                block.chainid,
                address(badges)
            )
        );
    }

    // ---- claim ------------------------------------------------------------

    function test_ClaimHappyPath() public {
        bytes memory sig = _sign(signerKey, alice, "Voucher Claim", 1, block.timestamp + 300);

        vm.prank(alice);
        uint256 tokenId = badges.claim(alice, "Voucher Claim", 1, block.timestamp + 300, sig);

        assertEq(tokenId, 1);
        assertEq(badges.ownerOf(1), alice);
        assertEq(badges.badgeName(1), "Voucher Claim");
        assertTrue(badges.nonceUsed(1));
        assertTrue(badges.locked(1));
    }

    function test_ClaimEmitsLockedAndClaimed() public {
        bytes memory sig = _sign(signerKey, alice, "X", 7, block.timestamp + 300);

        vm.expectEmit(true, true, false, true);
        emit TrailBadgesV2.BadgeClaimed(1, alice, "X", 7);
        vm.expectEmit(false, false, false, true);
        emit IERC5192.Locked(1);

        vm.prank(alice);
        badges.claim(alice, "X", 7, block.timestamp + 300, sig);
    }

    function test_AnyoneCanRelayButBadgeLandsAtVoucherTo() public {
        bytes memory sig = _sign(signerKey, alice, "Relayed", 2, block.timestamp + 300);

        // bob pays gas, alice earns the badge
        vm.prank(bob);
        badges.claim(alice, "Relayed", 2, block.timestamp + 300, sig);
        assertEq(badges.ownerOf(1), alice);
    }

    function test_RevertWhen_VoucherExpired() public {
        uint256 deadline = block.timestamp + 300;
        bytes memory sig = _sign(signerKey, alice, "X", 3, deadline);

        vm.warp(deadline + 1);
        vm.expectRevert(abi.encodeWithSelector(TrailBadgesV2.VoucherExpired.selector, deadline));
        badges.claim(alice, "X", 3, deadline, sig);
    }

    function test_RevertWhen_NonceReplayed() public {
        bytes memory sig = _sign(signerKey, alice, "X", 4, block.timestamp + 300);
        badges.claim(alice, "X", 4, block.timestamp + 300, sig);

        // Same voucher again — and also a DIFFERENT voucher reusing the nonce.
        vm.expectRevert(abi.encodeWithSelector(TrailBadgesV2.NonceAlreadyUsed.selector, 4));
        badges.claim(alice, "X", 4, block.timestamp + 300, sig);

        bytes memory sig2 = _sign(signerKey, bob, "Y", 4, block.timestamp + 300);
        vm.expectRevert(abi.encodeWithSelector(TrailBadgesV2.NonceAlreadyUsed.selector, 4));
        badges.claim(bob, "Y", 4, block.timestamp + 300, sig2);
    }

    function test_RevertWhen_SignatureFromWrongKey() public {
        (, uint256 mallory) = makeAddrAndKey("mallory");
        bytes memory sig = _sign(mallory, alice, "X", 5, block.timestamp + 300);

        vm.expectRevert(); // InvalidVoucherSigner(recovered) — recovered addr not known here
        badges.claim(alice, "X", 5, block.timestamp + 300, sig);
    }

    function test_RevertWhen_VoucherFieldTampered() public {
        bytes memory sig = _sign(signerKey, alice, "X", 6, block.timestamp + 300);
        // Redirecting the badge to bob invalidates the signature.
        vm.expectRevert();
        badges.claim(bob, "X", 6, block.timestamp + 300, sig);
    }

    function test_SignerRotationInvalidatesOutstandingVouchers() public {
        bytes memory sig = _sign(signerKey, alice, "X", 8, block.timestamp + 300);

        (address newSigner,) = makeAddrAndKey("new-signer");
        vm.prank(owner);
        badges.setVoucherSigner(newSigner);

        vm.expectRevert(abi.encodeWithSelector(TrailBadgesV2.InvalidVoucherSigner.selector, signer));
        badges.claim(alice, "X", 8, block.timestamp + 300, sig);
    }

    function test_RevertWhen_NonOwnerRotatesSigner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        badges.setVoucherSigner(alice);
    }

    // ---- soulbound --------------------------------------------------------

    function test_RevertWhen_Transferred() public {
        bytes memory sig = _sign(signerKey, alice, "X", 9, block.timestamp + 300);
        vm.prank(alice);
        badges.claim(alice, "X", 9, block.timestamp + 300, sig);

        vm.prank(alice);
        vm.expectRevert(TrailBadgesV2.TransferLocked.selector);
        badges.transferFrom(alice, bob, 1);

        // Even with an approval in place the transfer stays locked.
        vm.prank(alice);
        badges.approve(bob, 1);
        vm.prank(bob);
        vm.expectRevert(TrailBadgesV2.TransferLocked.selector);
        badges.transferFrom(alice, bob, 1);
    }

    function test_LockedRevertsForNonexistentToken() public {
        vm.expectRevert();
        badges.locked(42);
    }

    function test_SupportsInterfaces() public view {
        assertTrue(badges.supportsInterface(type(IERC5192).interfaceId));
        assertTrue(badges.supportsInterface(type(IERC721).interfaceId));
    }

    // ---- metadata ---------------------------------------------------------

    function test_TokenURIIsOnchainDataUri() public {
        bytes memory sig = _sign(signerKey, alice, "Voucher Claim", 10, block.timestamp + 300);
        vm.prank(alice);
        badges.claim(alice, "Voucher Claim", 10, block.timestamp + 300, sig);

        string memory uri = badges.tokenURI(1);
        assertTrue(bytes(uri).length > 0);
        assertEq(_slice(uri, 0, 29), "data:application/json;base64,");
    }

    function _slice(string memory s, uint256 start, uint256 len) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory out = new bytes(len);
        for (uint256 i = 0; i < len; i++) {
            out[i] = b[start + i];
        }
        return string(out);
    }

    // ---- fuzz -------------------------------------------------------------

    function testFuzz_ClaimRoundTrip(address to, string memory name_, uint256 nonce, uint64 ttl) public {
        vm.assume(to != address(0) && to.code.length == 0);
        ttl = uint64(bound(ttl, 1, 365 days));
        uint256 deadline = block.timestamp + ttl;

        bytes memory sig = _sign(signerKey, to, name_, nonce, deadline);
        uint256 tokenId = badges.claim(to, name_, nonce, deadline, sig);

        assertEq(badges.ownerOf(tokenId), to);
        assertEq(badges.badgeName(tokenId), name_);
        assertTrue(badges.nonceUsed(nonce));
    }

    function testFuzz_SequentialIds(uint8 n) public {
        n = uint8(bound(n, 1, 16));
        for (uint256 i = 1; i <= n; i++) {
            bytes memory sig = _sign(signerKey, alice, "X", i, block.timestamp + 300);
            uint256 tokenId = badges.claim(alice, "X", i, block.timestamp + 300, sig);
            assertEq(tokenId, i);
        }
        assertEq(badges.nextTokenId(), uint256(n) + 1);
    }
}
