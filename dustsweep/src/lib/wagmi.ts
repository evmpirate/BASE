import { http, createConfig } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { injected, mock } from "wagmi/connectors";

// E2E mode: swap the injected wallet for wagmi's mock connector pre-connected
// to a known account, and point Base at the local anvil fork. Lets Playwright
// drive the full connect -> scan -> revoke flow headlessly, no wallet/funds.
// Enabled by NEXT_PUBLIC_E2E=1 (server + build) OR a ?e2e=1 URL param — the
// latter is read from the browser at runtime, so it can't be missed by env
// inlining in the dev server.
function detectE2E() {
  if (process.env.NEXT_PUBLIC_E2E === "1") return true;
  if (typeof window !== "undefined") {
    return new URLSearchParams(window.location.search).has("e2e");
  }
  return false;
}
const E2E = detectE2E();
const E2E_ACCOUNT = (process.env.NEXT_PUBLIC_E2E_ACCOUNT ??
  "0xfa2d07e06a6eb3488698fe13981a17c33f93c829") as `0x${string}`;
const FORK_RPC = process.env.NEXT_PUBLIC_FORK_RPC ?? "http://127.0.0.1:8545";
const BASE_RPC = E2E ? FORK_RPC : "https://mainnet.base.org";

export const config = createConfig({
  chains: [baseSepolia, base],
  connectors: E2E ? [mock({ accounts: [E2E_ACCOUNT] })] : [injected()],
  transports: {
    [base.id]: http(BASE_RPC),
    [baseSepolia.id]: http("https://sepolia.base.org"),
  },
});
