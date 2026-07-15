import { base, baseSepolia } from "wagmi/chains";

export type TokenEntry = {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
};

export type SpenderEntry = {
  name: string;
  address: `0x${string}`;
};

// Curated lists, verified on-chain (symbol/decimals for tokens, bytecode
// presence for spenders) on 2026-07-14. A production version would use an
// indexer (e.g. Alchemy/Etherscan approval APIs) instead of brute-force
// allowance() calls against a hardcoded matrix.

export const TOKENS: Record<number, TokenEntry[]> = {
  [base.id]: [
    { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    { symbol: "USDbC", address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", decimals: 6 },
    { symbol: "DAI", address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 },
    { symbol: "cbETH", address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", decimals: 18 },
    { symbol: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8 },
    { symbol: "AERO", address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", decimals: 18 },
    { symbol: "DEGEN", address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", decimals: 18 },
  ],
  [baseSepolia.id]: [
    { symbol: "USDC", address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", decimals: 6 },
    { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  ],
};

export const SPENDERS: Record<number, SpenderEntry[]> = {
  [base.id]: [
    { name: "Permit2 (Uniswap)", address: "0x000000000022D473030F116dDEE9F6B43aC78BA3" },
    { name: "Uniswap Universal Router", address: "0x6fF5693b99212Da76ad316178A184AB56D299b43" },
    { name: "Uniswap SwapRouter02", address: "0x2626664c2603336E57B271c5C0b26F421741e481" },
    { name: "1inch Aggregation Router v5", address: "0x1111111254EEB25477B68fb85Ed929f73A960582" },
    { name: "1inch Aggregation Router v6", address: "0x111111125421cA6dc452d289314280a0f8842A65" },
    { name: "0x Exchange Proxy", address: "0xDef1C0ded9bec7F1a1670819833240f027b25EfF" },
    { name: "KyberSwap Meta Router v2", address: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5" },
    { name: "Aerodrome Router", address: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" },
  ],
  [baseSepolia.id]: [
    { name: "Permit2 (Uniswap)", address: "0x000000000022D473030F116dDEE9F6B43aC78BA3" },
    { name: "OnchainTrailBadges (demo spender)", address: "0x7Db9fC55B64C1d17199069A7f3db73C16C0F20Ab" },
  ],
};

export const EXPLORERS: Record<number, string> = {
  [base.id]: "https://basescan.org",
  [baseSepolia.id]: "https://sepolia.basescan.org",
};
