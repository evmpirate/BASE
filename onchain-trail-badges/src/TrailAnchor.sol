// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title TrailAnchor
/// @notice Canonical on-chain pointer to the BASE builder-journey project. Deployed via
///         the deterministic CREATE2 factory (0x4e59b44847b379578588920cA78FbF26c0B4956C)
///         with salt keccak256("base-trail-anchor"), so the same bytecode lands at the
///         same address on any EVM chain.
contract TrailAnchor {
    string public constant REPO = "https://github.com/evmpirate/BASE";
    string public constant APP = "https://trailkeeper-three.vercel.app";
    uint256 public constant AGENT_ID_MAINNET = 58971;
    uint256 public constant AGENT_ID_SEPOLIA = 8073;
}
