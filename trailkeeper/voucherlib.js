// TrailBadgesV2 voucher helpers — pure, unit-testable, shared by the
// /voucher endpoint and the voucher.mjs CLI.
import { encodeAbiParameters, keccak256 } from "viem";

// Deployed TrailBadgesV2 contracts per chain (voucher-claimed, soulbound).
export const BADGES_V2_ADDRESS = {
  84532: "0x68827fb4338bB3dba6C4F9084c25d98295A9d512",
  // 8453 gets filled in by the mainnet deploy.
};

export const VOUCHER_TYPES = {
  BadgeVoucher: [
    { name: "to", type: "address" },
    { name: "name", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

export function voucherDomain(chainId, contract) {
  return { name: "TrailBadgesV2", version: "2", chainId, verifyingContract: contract };
}

// Deterministic nonce per (recipient, badge name). The contract only knows
// "each nonce redeems once"; deriving the nonce this way upgrades that into
// "each wallet claims each badge name once" without any contract change.
export function voucherNonce(to, name) {
  return BigInt(
    keccak256(encodeAbiParameters([{ type: "address" }, { type: "string" }], [to, name])),
  );
}

export function makeVoucher({ to, name, ttlSec = 3600, now = Date.now }) {
  return {
    to,
    name,
    nonce: voucherNonce(to, name),
    deadline: BigInt(Math.floor(now() / 1000) + ttlSec),
  };
}

// EIP-712 signature by the contract's voucherSigner. `account` is any viem
// account object exposing signTypedData (local key, hardware, remote).
export function signVoucher(account, chainId, contract, voucher) {
  return account.signTypedData({
    domain: voucherDomain(chainId, contract),
    types: VOUCHER_TYPES,
    primaryType: "BadgeVoucher",
    message: voucher,
  });
}

// bigints -> strings for JSON transport; claimants feed these straight into
// the claim(to, name, nonce, deadline, signature) call.
export function serializeVoucher(voucher) {
  return { ...voucher, nonce: voucher.nonce.toString(), deadline: voucher.deadline.toString() };
}

export const badgesV2Abi = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "name_", type: "string" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "BadgeClaimed",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "nonce", type: "uint256", indexed: false },
    ],
  },
];
