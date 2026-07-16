// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {OnchainTrailBadges} from "../src/OnchainTrailBadges.sol";

/// @dev Handler the invariant fuzzer drives instead of the raw contract. Every
///      external function must succeed for any fuzzed input (fail_on_revert),
///      so inputs are bounded and expected-revert paths use try/catch. Ghost
///      variables mirror what the contract SHOULD contain; the invariants in
///      OnchainTrailBadgesInvariantTest compare contract state against them.
contract BadgesHandler is Test {
    OnchainTrailBadges public badges;

    address[] public actors;
    address public currentOwner;

    uint256 public ghost_mintCount;
    uint256 public ghost_transferCount;
    uint256 public ghost_ownershipRotations;
    uint256 public ghost_unauthorizedMintRejections;
    mapping(uint256 tokenId => address) public ghost_ownerOf;
    mapping(uint256 tokenId => string) public ghost_nameOf;

    constructor(OnchainTrailBadges badges_, address owner_) {
        badges = badges_;
        currentOwner = owner_;
        for (uint256 i = 0; i < 5; i++) {
            actors.push(makeAddr(string.concat("actor", vm.toString(i))));
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    /// @dev Mint as the current collection owner to a random actor.
    function mint(uint256 actorSeed, string calldata name_) external {
        address to = actors[bound(actorSeed, 0, actors.length - 1)];
        vm.prank(currentOwner);
        uint256 tokenId = badges.mint(to, name_);
        ghost_mintCount++;
        ghost_ownerOf[tokenId] = to;
        ghost_nameOf[tokenId] = name_;
    }

    /// @dev Attempt a mint from a non-owner; it must always revert.
    function mintUnauthorized(uint256 actorSeed, string calldata name_) external {
        address caller = actors[bound(actorSeed, 0, actors.length - 1)];
        if (caller == currentOwner) return;
        vm.prank(caller);
        try badges.mint(caller, name_) returns (uint256) {
            revert("invariant violated: non-owner mint succeeded");
        } catch {
            ghost_unauthorizedMintRejections++;
        }
    }

    /// @dev Move a random existing badge between actors.
    function transferBadge(uint256 tokenSeed, uint256 toSeed) external {
        if (ghost_mintCount == 0) return;
        uint256 tokenId = bound(tokenSeed, 1, ghost_mintCount);
        address from = ghost_ownerOf[tokenId];
        address to = actors[bound(toSeed, 0, actors.length - 1)];
        vm.prank(from);
        badges.transferFrom(from, to, tokenId);
        ghost_ownerOf[tokenId] = to;
        ghost_transferCount++;
    }

    /// @dev Hand the collection to a random actor, like the real
    ///      burner->main-wallet transferOwnership done on mainnet.
    function rotateOwnership(uint256 actorSeed) external {
        address newOwner = actors[bound(actorSeed, 0, actors.length - 1)];
        vm.prank(currentOwner);
        badges.transferOwnership(newOwner);
        currentOwner = newOwner;
        ghost_ownershipRotations++;
    }
}

contract OnchainTrailBadgesInvariantTest is StdInvariant, Test {
    OnchainTrailBadges internal badges;
    BadgesHandler internal handler;

    address internal deployer = makeAddr("deployer");

    function setUp() public {
        vm.prank(deployer);
        badges = new OnchainTrailBadges();
        handler = new BadgesHandler(badges, deployer);
        targetContract(address(handler));
    }

    /// @notice Token ids are sequential from 1 with no gaps or reuse.
    function invariant_NextTokenIdTracksMints() public view {
        assertEq(badges.nextTokenId(), handler.ghost_mintCount() + 1);
    }

    /// @notice Every minted badge has the owner and name the handler recorded;
    ///         unauthorized mints and transfers never corrupt either mapping.
    function invariant_MintedTokensMatchGhostState() public view {
        uint256 minted = handler.ghost_mintCount();
        for (uint256 tokenId = 1; tokenId <= minted; tokenId++) {
            assertEq(badges.ownerOf(tokenId), handler.ghost_ownerOf(tokenId));
            assertEq(badges.badgeName(tokenId), handler.ghost_nameOf(tokenId));
        }
    }

    /// @notice tokenURI is a well-formed on-chain data URI for every minted
    ///         badge, whatever name string the fuzzer chose.
    function invariant_TokenURIAlwaysOnchainDataUri() public view {
        uint256 minted = handler.ghost_mintCount();
        for (uint256 tokenId = 1; tokenId <= minted; tokenId++) {
            bytes memory uri = bytes(badges.tokenURI(tokenId));
            bytes memory prefix = "data:application/json;base64,";
            assertGe(uri.length, prefix.length);
            for (uint256 i = 0; i < prefix.length; i++) {
                assertEq(uri[i], prefix[i]);
            }
        }
    }

    /// @notice Badges are conserved: actor balances always sum to the mint count.
    function invariant_BalancesSumToMintCount() public view {
        uint256 sum = 0;
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            sum += badges.balanceOf(handler.actors(i));
        }
        assertEq(sum, handler.ghost_mintCount());
    }

    /// @notice Ownable state only moves through the handler's rotations.
    function invariant_CollectionOwnerIsTracked() public view {
        assertEq(badges.owner(), handler.currentOwner());
    }
}
