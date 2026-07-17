// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {TrailBadgesV2} from "../src/TrailBadgesV2.sol";

/// @dev Handler for the V2 claim model (see BadgesHandler for the pattern:
///      fail_on_revert, bounded inputs, try/catch on expected-revert paths,
///      ghost state mirrored and compared by the invariants below).
contract BadgesV2Handler is Test {
    TrailBadgesV2 public badges;

    address[] public actors;
    uint256 internal signerKey;
    uint256 internal nextNonce = 1;

    uint256 public ghost_claimCount;
    uint256 public ghost_replayRejections;
    uint256 public ghost_transferRejections;
    mapping(uint256 tokenId => address) public ghost_ownerOf;

    constructor(TrailBadgesV2 badges_, uint256 signerKey_) {
        badges = badges_;
        signerKey = signerKey_;
        for (uint256 i = 0; i < 5; i++) {
            actors.push(makeAddr(string.concat("actor", vm.toString(i))));
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _sign(address to, string memory name_, uint256 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash =
            keccak256(abi.encode(badges.VOUCHER_TYPEHASH(), to, keccak256(bytes(name_)), nonce, deadline));
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("TrailBadgesV2")),
                keccak256(bytes("2")),
                block.chainid,
                address(badges)
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }

    /// @dev Redeem a fresh voucher as a random actor.
    function claim(uint256 actorSeed, string calldata name_) external {
        address to = actors[bound(actorSeed, 0, actors.length - 1)];
        uint256 nonce = nextNonce++;
        uint256 deadline = block.timestamp + 300;
        bytes memory sig = _sign(to, name_, nonce, deadline);

        vm.prank(to);
        uint256 tokenId = badges.claim(to, name_, nonce, deadline, sig);
        ghost_claimCount++;
        ghost_ownerOf[tokenId] = to;
    }

    /// @dev Replay an already-used nonce with a fresh, otherwise-valid
    ///      signature; must always revert.
    function claimReplay(uint256 actorSeed) external {
        if (nextNonce == 1) return; // nothing used yet
        address to = actors[bound(actorSeed, 0, actors.length - 1)];
        uint256 usedNonce = bound(actorSeed, 1, nextNonce - 1);
        uint256 deadline = block.timestamp + 300;
        bytes memory sig = _sign(to, "replay", usedNonce, deadline);

        vm.prank(to);
        try badges.claim(to, "replay", usedNonce, deadline, sig) {
            revert("nonce replay must never succeed");
        } catch {
            ghost_replayRejections++;
        }
    }

    /// @dev Attempt a wallet-to-wallet transfer of an existing badge; the
    ///      soulbound lock must always reject it.
    function transferAttempt(uint256 tokenSeed, uint256 actorSeed) external {
        uint256 total = badges.nextTokenId() - 1;
        if (total == 0) return;
        uint256 tokenId = bound(tokenSeed, 1, total);
        address from = badges.ownerOf(tokenId);
        address to = actors[bound(actorSeed, 0, actors.length - 1)];
        if (to == from) return; // ERC-721 self-transfer is still from!=0,to!=0 but keep actors distinct

        vm.prank(from);
        try badges.transferFrom(from, to, tokenId) {
            revert("soulbound transfer must never succeed");
        } catch {
            ghost_transferRejections++;
        }
    }
}

contract TrailBadgesV2InvariantTest is StdInvariant, Test {
    TrailBadgesV2 internal badges;
    BadgesV2Handler internal handler;

    function setUp() public {
        (address signer, uint256 signerKey) = makeAddrAndKey("voucher-signer");
        badges = new TrailBadgesV2(signer);
        handler = new BadgesV2Handler(badges, signerKey);
        targetContract(address(handler));
    }

    /// @notice Ids are dense: every claim advances nextTokenId by exactly one.
    function invariant_SequentialIds() public view {
        assertEq(badges.nextTokenId(), handler.ghost_claimCount() + 1);
    }

    /// @notice Every claimed badge still sits with its claimer — no transfer
    ///         path exists that moves a soulbound badge.
    function invariant_OwnershipNeverMoves() public view {
        for (uint256 id = 1; id < badges.nextTokenId(); id++) {
            assertEq(badges.ownerOf(id), handler.ghost_ownerOf(id));
        }
    }

    /// @notice Every existing badge reports locked() == true.
    function invariant_AllBadgesLocked() public view {
        for (uint256 id = 1; id < badges.nextTokenId(); id++) {
            assertTrue(badges.locked(id));
        }
    }

    /// @notice Actor balances sum to the total number of claims — badges
    ///         neither vanish nor duplicate.
    function invariant_BalancesSumToClaims() public view {
        uint256 sum;
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            sum += badges.balanceOf(handler.actors(i));
        }
        assertEq(sum, handler.ghost_claimCount());
    }
}
