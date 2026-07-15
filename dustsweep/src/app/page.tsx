"use client";

import { useEffect, useMemo, useState } from "react";
import { erc20Abi, formatUnits, maxUint256 } from "viem";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { base, baseSepolia } from "wagmi/chains";
import { EXPLORERS, SPENDERS, TOKENS, type SpenderEntry, type TokenEntry } from "@/lib/registry";

type Pair = { token: TokenEntry; spender: SpenderEntry };

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatAllowance(value: bigint, decimals: number) {
  // Anything above half of uint256 max is effectively an unlimited approval.
  if (value >= maxUint256 / 2n) return "Unlimited";
  const s = formatUnits(value, decimals);
  const n = Number(s);
  return n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 4 }) : s;
}

function ConnectPanel() {
  const { connectors, connect, isPending, error } = useConnect();
  return (
    <div className="flex flex-col items-center gap-3 py-16">
      <p className="text-neutral-400">Connect a wallet to scan its ERC-20 approvals on Base.</p>
      {connectors.map((c) => (
        <button
          key={c.uid}
          onClick={() => connect({ connector: c })}
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          Connect {c.name}
        </button>
      ))}
      {connectors.length === 0 && (
        <p className="text-sm text-neutral-500">No injected wallet detected — install MetaMask or another browser wallet.</p>
      )}
      {error && <p className="text-sm text-red-400">{error.message}</p>}
    </div>
  );
}

function RevokeButton({
  pair,
  chainId,
  mainnetArmed,
  onSettled,
}: {
  pair: Pair;
  chainId: number;
  mainnetArmed: boolean;
  onSettled: () => void;
}) {
  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  });

  useEffect(() => {
    if (isSuccess) onSettled();
  }, [isSuccess, onSettled]);

  const disabled = isPending || isConfirming || (chainId === base.id && !mainnetArmed);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() =>
          writeContract({
            abi: erc20Abi,
            address: pair.token.address,
            functionName: "approve",
            args: [pair.spender.address, 0n],
            // Force the target chain: wagmi will ask the wallet to switch
            // networks instead of silently sending on whatever chain the
            // wallet happens to be on.
            chainId: chainId as typeof base.id,
          })
        }
        disabled={disabled}
        className="rounded-md bg-red-600/90 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isPending ? "Sign in wallet…" : isConfirming ? "Confirming…" : isSuccess ? "Revoked ✓" : "Revoke"}
      </button>
      {txHash && (
        <a
          href={`${EXPLORERS[chainId]}/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-blue-400 underline"
        >
          view tx
        </a>
      )}
      {error && (
        <button onClick={() => reset()} className="max-w-56 truncate text-xs text-red-400" title={error.message}>
          {error.message.split("\n")[0]} (dismiss)
        </button>
      )}
    </div>
  );
}

function Scanner() {
  const { address, chainId: walletChainId } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [mainnetArmed, setMainnetArmed] = useState(false);

  const pairs: Pair[] = useMemo(() => {
    const tokens = TOKENS[chainId] ?? [];
    const spenders = SPENDERS[chainId] ?? [];
    return tokens.flatMap((token) => spenders.map((spender) => ({ token, spender })));
  }, [chainId]);

  const { data, isLoading, refetch, dataUpdatedAt } = useReadContracts({
    contracts: pairs.map((p) => ({
      abi: erc20Abi,
      address: p.token.address,
      functionName: "allowance" as const,
      args: [address!, p.spender.address] as const,
      chainId,
    })),
    query: { enabled: Boolean(address) && pairs.length > 0 },
  });

  const findings = useMemo(() => {
    if (!data) return [];
    return pairs
      .map((pair, i) => ({
        pair,
        allowance: data[i]?.status === "success" ? (data[i].result as bigint) : 0n,
      }))
      .filter((f) => f.allowance > 0n);
  }, [data, pairs]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-neutral-400">
          Checked {pairs.length} token/spender pairs on{" "}
          <span className="font-medium text-neutral-200">
            {chainId === base.id ? "Base" : chainId === baseSepolia.id ? "Base Sepolia" : `chain ${chainId}`}
          </span>
          {dataUpdatedAt > 0 && <> · last scan {new Date(dataUpdatedAt).toLocaleTimeString()}</>}
        </div>
        <button
          onClick={() => refetch()}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
        >
          Rescan
        </button>
      </div>

      {walletChainId !== undefined && walletChainId !== chainId && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-700/60 bg-red-900/20 px-4 py-3 text-sm text-red-200">
          <span>
            ⚠️ Your wallet is on <strong>chain {walletChainId}</strong>, but this app is scanning{" "}
            <strong>{chainId === base.id ? "Base" : "Base Sepolia"}</strong>. Transactions would go to the wrong
            network.
          </span>
          <button
            onClick={() => switchChain({ chainId: chainId as typeof base.id })}
            className="shrink-0 rounded-md bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-500"
          >
            Switch wallet
          </button>
        </div>
      )}

      {chainId === base.id && (
        <label className="flex items-center gap-2 rounded-lg border border-yellow-700/60 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-200">
          <input
            type="checkbox"
            checked={mainnetArmed}
            onChange={(e) => setMainnetArmed(e.target.checked)}
            className="h-4 w-4"
          />
          <span>
            This is <strong>Base mainnet</strong> — revoking costs real ETH. Check to enable the Revoke buttons.
          </span>
        </label>
      )}

      {isLoading ? (
        <p className="py-8 text-center text-neutral-400">Scanning allowances…</p>
      ) : findings.length === 0 ? (
        <p className="py-8 text-center text-neutral-400">
          No active approvals found among the curated tokens/spenders. Clean wallet ✨
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-left text-neutral-400">
              <tr>
                <th className="px-4 py-3 font-medium">Token</th>
                <th className="px-4 py-3 font-medium">Spender</th>
                <th className="px-4 py-3 font-medium">Allowance</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {findings.map(({ pair, allowance }) => (
                <tr key={`${pair.token.address}-${pair.spender.address}`} className="border-t border-neutral-800">
                  <td className="px-4 py-3">
                    <a
                      href={`${EXPLORERS[chainId]}/token/${pair.token.address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:underline"
                    >
                      {pair.token.symbol}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <div>{pair.spender.name}</div>
                    <div className="font-mono text-xs text-neutral-500">{short(pair.spender.address)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={allowance >= maxUint256 / 2n ? "font-medium text-red-400" : ""}>
                      {formatAllowance(allowance, pair.token.decimals)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RevokeButton pair={pair} chainId={chainId} mainnetArmed={mainnetArmed} onSettled={refetch} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-neutral-500">
        Note: this scans a curated matrix of {pairs.length} pairs via multicall. A production version would use an
        indexer / approvals API to discover every approval ever granted.
      </p>
    </div>
  );
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  // Wallet state only exists client-side (wagmi restores the session from
  // localStorage), so render it after mount to avoid SSR hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 bg-neutral-950 px-6 py-10 text-neutral-100">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🧹 DustSweep</h1>
          <p className="text-sm text-neutral-400">Scan &amp; revoke ERC-20 approvals on Base</p>
        </div>
        {mounted && isConnected && address && (
          <div className="flex items-center gap-3">
            <select
              value={chainId}
              onChange={(e) => switchChain({ chainId: Number(e.target.value) as typeof base.id })}
              className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
            >
              <option value={baseSepolia.id}>Base Sepolia</option>
              <option value={base.id}>Base</option>
            </select>
            <span className="font-mono text-sm text-neutral-300">{short(address)}</span>
            <button
              onClick={() => disconnect()}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
            >
              Disconnect
            </button>
          </div>
        )}
      </header>

      {!mounted ? (
        <p className="py-16 text-center text-neutral-500">Loading…</p>
      ) : isConnected ? (
        <Scanner />
      ) : (
        <ConnectPanel />
      )}
    </main>
  );
}
