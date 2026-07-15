// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {TrailAnchor} from "../src/TrailAnchor.sol";

contract TrailAnchorTest is Test {
    TrailAnchor anchor;

    function setUp() public {
        anchor = new TrailAnchor();
    }

    function test_constants() public view {
        assertEq(anchor.REPO(), "https://github.com/evmpirate/BASE");
        assertEq(anchor.APP(), "https://trailkeeper-three.vercel.app");
        assertEq(anchor.AGENT_ID_MAINNET(), 58971);
        assertEq(anchor.AGENT_ID_SEPOLIA(), 8073);
    }
}
