"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { erc20Abi, formatUnits, isAddress, maxUint256 } from "viem";
import {
  useAccount,
  useCapabilities,
  useChainId,
  useConfig,
  useConnect,
  useDisconnect,
  usePublicClient,
  useReadContracts,
  useSendCalls,
  useSwitchChain,
  useWaitForCallsStatus,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { readContracts } from "wagmi/actions";
import { base, baseSepolia } from "wagmi/chains";
import { BUILDER_CODE, DATA_SUFFIX } from "@/lib/attribution";
import { reverseCall, supportsBasenames } from "@/lib/basename";
import { buildRevokeCalls, pairKey } from "@/lib/batch";
import {
  PERMIT2_ADDRESS,
  isExpired,
  permit2Abi,
  toLockdownArgs,
  type Permit2Finding,
} from "@/lib/permit2";
import { useQuery } from "@tanstack/react-query";
import { scanBalances, withUsd } from "@/lib/balances";
import { bestQuote, SWAP_ROUTER_02, type Quote } from "@/lib/quote";
import { buildSweepCalls, DUST_THRESHOLD_USD, minOutFor, type SweepPlan } from "@/lib/sweep";
import {
  fetchUsdPrices,
  formatUsd,
  priceableSymbol,
  usdValue,
  type UsdPrice,
} from "@/lib/prices";
import { traceErc20Approval, tracePermit2Approval, type ApprovalOrigin } from "@/lib/provenance";
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

// Reverse-resolve a set of addresses to Basenames (Base mainnet only), one
// multicall to the L2 resolver. Returns a lowercased-address -> name map.
function useBasenames(chainId: number, addresses: `0x${string}`[]) {
  const uniq = useMemo(
    () => [...new Set(addresses.map((a) => a.toLowerCase() as `0x${string}`))],
    [addresses],
  );
  const enabled = supportsBasenames(chainId) && uniq.length > 0;
  const { data } = useReadContracts({
    contracts: uniq.map((a) => reverseCall(a)),
    query: { enabled, staleTime: 5 * 60_000 },
  });
  return useMemo(() => {
    const map = new Map<string, string>();
    if (!data) return map;
    uniq.forEach((a, i) => {
      const r = data[i];
      if (r?.status === "success" && r.result) map.set(a, r.result as string);
    });
    return map;
  }, [data, uniq]);
}

const EMPTY_PRICES: Map<string, UsdPrice> = new Map();

// USD estimates via Chainlink feeds (registered for Base mainnet only — the
// map just stays empty elsewhere). One query per (chain, symbol set); the lib
// dedupes wrapper aliases into single feed reads and drops stale rounds.
function useUsdPrices(chainId: number, tokens: TokenEntry[]) {
  const publicClient = usePublicClient({ chainId: chainId as typeof base.id });
  const symbols = useMemo(
    () => [...new Set(tokens.flatMap((t) => priceableSymbol(chainId, t) ?? []))].sort(),
    [chainId, tokens],
  );
  const { data } = useQuery({
    queryKey: ["usd-prices", chainId, symbols],
    enabled: Boolean(publicClient) && symbols.length > 0,
    staleTime: 60_000,
    queryFn: () => fetchUsdPrices(publicClient!, chainId, symbols),
  });
  return data ?? EMPTY_PRICES;
}

// "≈ $12.34" underneath an amount, when the token has a trustworthy feed.
// Unlimited approvals get no estimate — the exposure is the whole balance,
// not the sentinel value.
function UsdEstimate({
  chainId,
  token,
  amount,
  prices,
}: {
  chainId: number;
  token: TokenEntry;
  amount: bigint;
  prices: Map<string, UsdPrice>;
}) {
  if (amount >= maxUint256 / 2n) return null;
  const symbol = priceableSymbol(chainId, token);
  const price = symbol ? prices.get(symbol) : undefined;
  if (!price) return null;
  return (
    <div className="text-xs text-neutral-500">≈ {formatUsd(usdValue(amount, token.decimals, price))}</div>
  );
}

// Lazy "trace" cell: on click, scans backward through Approval logs (indexed
// by owner/spender) to find when this grant was created, then shows the date
// and a link to the originating transaction.
function TraceCell({ chainId, load }: { chainId: number; load: () => Promise<ApprovalOrigin | null> }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [origin, setOrigin] = useState<ApprovalOrigin | null>(null);

  if (state === "idle") {
    return (
      <button
        onClick={async () => {
          setState("loading");
          try {
            setOrigin(await load());
            setState("done");
          } catch {
            setState("error");
          }
        }}
        className="text-xs text-neutral-400 underline hover:text-neutral-200"
      >
        trace
      </button>
    );
  }
  if (state === "loading") return <span className="text-xs text-neutral-500">scanning logs…</span>;
  if (state === "error") return <span className="text-xs text-red-400">scan failed</span>;
  if (!origin) return <span className="text-xs text-neutral-500">not found in recent history</span>;
  return (
    <a
      href={`${EXPLORERS[chainId]}/tx/${origin.txHash}`}
      target="_blank"
      rel="noreferrer"
      className="text-xs text-blue-400 underline"
      title={`block ${origin.blockNumber}`}
    >
      granted {new Date(origin.timestamp * 1000).toLocaleDateString()}
    </a>
  );
}

// Shows a Basename when one resolves, with the short address underneath;
// falls back to just the short address.
function AddressLabel({ address, name }: { address: `0x${string}`; name?: string }) {
  if (name) {
    return (
      <span className="inline-flex flex-col">
        <span className="text-blue-300">{name}</span>
        <span className="font-mono text-xs text-neutral-500">{short(address)}</span>
      </span>
    );
  }
  return <span className="font-mono text-xs text-neutral-500">{short(address)}</span>;
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
            // ERC-8021 builder-code attribution (per-call; config-level is ignored).
            dataSuffix: DATA_SUFFIX,
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

function BatchRevokeButton({
  targets,
  chainId,
  mainnetArmed,
  onSettled,
}: {
  targets: Pair[];
  chainId: number;
  mainnetArmed: boolean;
  onSettled: () => void;
}) {
  const { sendCalls, data, isPending, error, reset } = useSendCalls();
  const { isLoading: isConfirming, isSuccess } = useWaitForCallsStatus({
    id: data?.id,
    query: { enabled: Boolean(data?.id) },
  });

  // Atomic batching (EIP-5792 wallet_sendCalls) is a wallet capability; plain
  // EOAs without it get a sequential eth_sendTransaction fallback instead.
  const { data: capabilities } = useCapabilities({ chainId: chainId as typeof base.id });
  const atomic = capabilities?.atomic?.status === "supported" || capabilities?.atomic?.status === "ready";

  useEffect(() => {
    if (isSuccess) onSettled();
  }, [isSuccess, onSettled]);

  const disabled =
    targets.length === 0 || isPending || isConfirming || (chainId === base.id && !mainnetArmed);

  return (
    <div className="flex items-center justify-end gap-3">
      <span className="text-xs text-neutral-500">
        {atomic ? "1 wallet confirmation (atomic batch)" : "one tx per approval (wallet lacks batching)"}
      </span>
      <button
        onClick={() =>
          sendCalls({
            calls: buildRevokeCalls(targets),
            chainId: chainId as typeof base.id,
            // Wallets without wallet_sendCalls get sequential transactions.
            experimental_fallback: true,
          })
        }
        disabled={disabled}
        className="rounded-md bg-red-600/90 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isPending
          ? "Sign in wallet…"
          : isConfirming
            ? "Confirming…"
            : isSuccess
              ? "Revoked ✓"
              : `Revoke selected (${targets.length})`}
      </button>
      {error && (
        <button onClick={() => reset()} className="max-w-56 truncate text-xs text-red-400" title={error.message}>
          {error.message.split("\n")[0]} (dismiss)
        </button>
      )}
    </div>
  );
}

function AddTokenForm({
  chainId,
  known,
  onAdd,
}: {
  chainId: number;
  known: TokenEntry[];
  onAdd: (t: TokenEntry) => void;
}) {
  const config = useConfig();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const trimmed = input.trim();
  const duplicate = known.some((t) => t.address.toLowerCase() === trimmed.toLowerCase());
  const valid = isAddress(trimmed) && !duplicate;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    const address = trimmed as `0x${string}`;
    setBusy(true);
    setFailed(false);
    try {
      const [symbol, decimals] = await readContracts(config, {
        allowFailure: false,
        contracts: [
          { abi: erc20Abi, address, functionName: "symbol", chainId },
          { abi: erc20Abi, address, functionName: "decimals", chainId },
        ],
      });
      onAdd({ symbol, address, decimals });
      setInput("");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setFailed(false);
        }}
        placeholder="Scan another token: paste its 0x… address"
        spellCheck={false}
        className="w-full max-w-md rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 font-mono text-xs"
      />
      <button
        type="submit"
        disabled={!valid || busy}
        className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-40"
      >
        {busy ? "Checking…" : "Add"}
      </button>
      {trimmed && !isAddress(trimmed) && <span className="text-xs text-red-400">not an address</span>}
      {duplicate && <span className="text-xs text-neutral-500">already scanned</span>}
      {failed && <span className="text-xs text-red-400">not an ERC-20 on this chain</span>}
    </form>
  );
}

function Permit2Section({
  chainId,
  tokens,
  mainnetArmed,
}: {
  chainId: number;
  tokens: TokenEntry[];
  mainnetArmed: boolean;
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: chainId as typeof base.id });
  const { writeContract, data: txHash, isPending, error, reset, variables } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  });

  const pairs: Pair[] = useMemo(() => {
    // Permit2 itself is the ERC-20 spender; here we scan who it sub-delegates to.
    const spenders = (SPENDERS[chainId] ?? []).filter((s) => s.address !== PERMIT2_ADDRESS);
    return tokens.flatMap((token) => spenders.map((spender) => ({ token, spender })));
  }, [chainId, tokens]);

  const { data, refetch } = useReadContracts({
    contracts: pairs.map((p) => ({
      abi: permit2Abi,
      address: PERMIT2_ADDRESS,
      functionName: "allowance" as const,
      args: [address!, p.token.address, p.spender.address] as const,
      chainId,
    })),
    query: { enabled: Boolean(address) && pairs.length > 0 },
  });

  useEffect(() => {
    if (isSuccess) refetch();
  }, [isSuccess, refetch]);

  const findings: Permit2Finding[] = useMemo(() => {
    if (!data) return [];
    return pairs
      .map((pair, i) => {
        const r = data[i];
        if (r?.status !== "success") return null;
        const [amount, expiration] = r.result as readonly [bigint, number, number];
        return { ...pair, amount, expiration: Number(expiration) };
      })
      .filter((f): f is Permit2Finding => f !== null && f.amount > 0n);
  }, [data, pairs]);

  const names = useBasenames(
    chainId,
    findings.map((f) => f.spender.address),
  );
  const prices = useUsdPrices(chainId, tokens);

  if (findings.length === 0) return null;

  const disabled = isPending || isConfirming || (chainId === base.id && !mainnetArmed);
  const lockingDown = variables?.functionName === "lockdown";

  return (
    <div className="flex flex-col gap-3">
      <h2 className="mt-4 text-lg font-semibold">Permit2 sub-allowances</h2>
      <p className="text-xs text-neutral-500">
        Permit2 keeps its own allowance book — revoking the ERC-20 approval alone does not clear these grants.
        Expired grants are inert but still listed until revoked.
      </p>
      <div className="overflow-x-auto rounded-xl border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-left text-neutral-400">
            <tr>
              <th className="px-4 py-3 font-medium">Token</th>
              <th className="px-4 py-3 font-medium">Spender</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Expiry</th>
              <th className="px-4 py-3 font-medium">Origin</th>
              <th className="px-4 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {findings.map((f) => (
              <tr key={pairKey(f)} className="border-t border-neutral-800">
                <td className="px-4 py-3 font-medium">{f.token.symbol}</td>
                <td className="px-4 py-3">
                  <div>{f.spender.name}</div>
                  <AddressLabel address={f.spender.address} name={names.get(f.spender.address.toLowerCase())} />
                </td>
                <td className="px-4 py-3">
                  {formatAllowance(f.amount, f.token.decimals)}
                  <UsdEstimate chainId={chainId} token={f.token} amount={f.amount} prices={prices} />
                </td>
                <td className="px-4 py-3">
                  {isExpired(f) ? (
                    <span className="text-neutral-500">expired</span>
                  ) : (
                    <span className="text-yellow-300">{new Date(f.expiration * 1000).toLocaleDateString()}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {publicClient && (
                    <TraceCell
                      chainId={chainId}
                      load={() =>
                        tracePermit2Approval(publicClient, address!, f.token.address, f.spender.address)
                      }
                    />
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() =>
                      writeContract({
                        abi: permit2Abi,
                        address: PERMIT2_ADDRESS,
                        functionName: "approve",
                        args: [f.token.address, f.spender.address, 0n, 0],
                        chainId: chainId as typeof base.id,
                        dataSuffix: DATA_SUFFIX,
                      })
                    }
                    disabled={disabled}
                    className="rounded-md bg-red-600/90 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-neutral-500">
          lockdown() zeroes all {findings.length} grants in one transaction
        </span>
        <button
          onClick={() =>
            writeContract({
              abi: permit2Abi,
              address: PERMIT2_ADDRESS,
              functionName: "lockdown",
              args: toLockdownArgs(findings),
              chainId: chainId as typeof base.id,
              dataSuffix: DATA_SUFFIX,
            })
          }
          disabled={disabled}
          className="rounded-md bg-red-600/90 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending && lockingDown ? "Sign in wallet…" : isConfirming && lockingDown ? "Confirming…" : "Lockdown all"}
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
    </div>
  );
}

function SweepButton({
  plans,
  chainId,
  owner,
  usdcAddress,
  mainnetArmed,
  onSettled,
}: {
  plans: SweepPlan[];
  chainId: number;
  owner: `0x${string}`;
  usdcAddress: `0x${string}`;
  mainnetArmed: boolean;
  onSettled: () => void;
}) {
  const { sendCalls, data, isPending, error, reset } = useSendCalls();
  const { isLoading: isConfirming, isSuccess } = useWaitForCallsStatus({
    id: data?.id,
    query: { enabled: Boolean(data?.id) },
  });

  useEffect(() => {
    if (isSuccess) onSettled();
  }, [isSuccess, onSettled]);

  const totalFloor = plans.reduce((acc, p) => acc + minOutFor(p.quotedOut), 0n);
  const disabled = plans.length === 0 || isPending || isConfirming || (chainId === base.id && !mainnetArmed);

  return (
    <div className="flex items-center justify-end gap-3">
      <span className="text-xs text-neutral-500">
        min. received after 1% slippage: {formatUnits(totalFloor, 6)} USDC
      </span>
      <button
        onClick={() =>
          sendCalls({
            calls: buildSweepCalls(chainId, owner, usdcAddress, plans),
            chainId: chainId as typeof base.id,
            experimental_fallback: true,
          })
        }
        disabled={disabled}
        className="rounded-md bg-emerald-600/90 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isPending
          ? "Sign in wallet…"
          : isConfirming
            ? "Confirming…"
            : isSuccess
              ? "Swept ✓"
              : `Sweep selected (${plans.length}) → USDC`}
      </button>
      {error && (
        <button onClick={() => reset()} className="max-w-56 truncate text-xs text-red-400" title={error.message}>
          {error.message.split("\n")[0]} (dismiss)
        </button>
      )}
    </div>
  );
}

function SweepSection({
  chainId,
  tokens,
  mainnetArmed,
}: {
  chainId: number;
  tokens: TokenEntry[];
  mainnetArmed: boolean;
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: chainId as typeof base.id });
  // Manual checkbox overrides on top of the default selection (dust rows
  // with a route are pre-checked). Stored as overrides so no effect has to
  // sync state when the scan lands.
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());

  const usdc = useMemo(
    () => TOKENS[chainId]?.find((t) => t.symbol === "USDC"),
    [chainId],
  );
  const candidates = useMemo(
    () => tokens.filter((t) => t.address.toLowerCase() !== usdc?.address.toLowerCase()),
    [tokens, usdc],
  );

  const enabled = Boolean(address && publicClient && usdc && SWAP_ROUTER_02[chainId]);
  const { data: findings, refetch } = useQuery({
    queryKey: ["balances", chainId, address, candidates.map((t) => t.address).sort()],
    enabled: enabled && candidates.length > 0,
    staleTime: 30_000,
    queryFn: () => scanBalances(publicClient!, address!, candidates),
  });

  const prices = useUsdPrices(chainId, candidates);
  const rows = useMemo(
    () => withUsd(chainId, findings ?? [], prices),
    [chainId, findings, prices],
  );

  const { data: quotes } = useQuery({
    queryKey: [
      "sweep-quotes",
      chainId,
      rows.map((r) => `${r.token.address}:${r.balance}`).sort(),
    ],
    enabled: enabled && rows.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      // Sequential on purpose: 4 simulations per token — parallel bursts trip
      // public RPC rate limits.
      const out = new Map<string, Quote>();
      for (const r of rows) {
        const q = await bestQuote(publicClient!, chainId, r.token.address, usdc!.address, r.balance);
        if (q) out.set(r.token.address, q);
      }
      return out;
    },
  });

  if (!enabled || rows.length === 0) return null;

  const isSelected = (addr: `0x${string}`, usd?: number) =>
    overrides.get(addr) ??
    Boolean(quotes?.has(addr) && usd !== undefined && usd < DUST_THRESHOLD_USD);

  const plans: SweepPlan[] = rows.flatMap((r) => {
    const q = quotes?.get(r.token.address);
    return q && isSelected(r.token.address, r.usd)
      ? [{ token: r.token, amountIn: r.balance, fee: q.fee, quotedOut: q.amountOut }]
      : [];
  });

  return (
    <div className="flex flex-col gap-3">
      <h2 className="mt-4 text-lg font-semibold">Sweep dust → USDC</h2>
      <p className="text-xs text-neutral-500">
        Token balances under {formatUsd(DUST_THRESHOLD_USD)} are pre-selected. Each sweep is an exact-amount
        approve + Uniswap V3 swap into USDC (best fee tier by quote), batched into one wallet confirmation.
      </p>
      <div className="overflow-x-auto rounded-xl border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-left text-neutral-400">
            <tr>
              <th className="px-4 py-3" />
              <th className="px-4 py-3 font-medium">Token</th>
              <th className="px-4 py-3 font-medium">Balance</th>
              <th className="px-4 py-3 font-medium">Quote</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const q = quotes?.get(r.token.address);
              return (
                <tr key={r.token.address} className="border-t border-neutral-800">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Sweep ${r.token.symbol}`}
                      checked={isSelected(r.token.address, r.usd)}
                      disabled={!q}
                      onChange={() =>
                        setOverrides((prev) =>
                          new Map(prev).set(r.token.address, !isSelected(r.token.address, r.usd)),
                        )
                      }
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">{r.token.symbol}</td>
                  <td className="px-4 py-3">
                    {formatAllowance(r.balance, r.token.decimals)}
                    {r.usd !== undefined && (
                      <div className="text-xs text-neutral-500">≈ {formatUsd(r.usd)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {q ? (
                      <>
                        {formatUnits(q.amountOut, 6)} USDC
                        <div className="text-xs text-neutral-500">via {q.fee / 10_000}% pool</div>
                      </>
                    ) : (
                      <span className="text-xs text-neutral-500">no V3 route</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <SweepButton
        plans={plans}
        chainId={chainId}
        owner={address!}
        usdcAddress={usdc!.address}
        mainnetArmed={mainnetArmed}
        onSettled={() => {
          setOverrides(new Map());
          refetch();
        }}
      />
    </div>
  );
}

function Scanner() {
  const { address, chainId: walletChainId } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: chainId as typeof base.id });
  const { switchChain } = useSwitchChain();
  const [mainnetArmed, setMainnetArmed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // User-added tokens, keyed by chain so a Sepolia address never leaks into a mainnet scan.
  const [customTokens, setCustomTokens] = useState<Record<number, TokenEntry[]>>({});

  const tokens: TokenEntry[] = useMemo(
    () => [...(TOKENS[chainId] ?? []), ...(customTokens[chainId] ?? [])],
    [chainId, customTokens],
  );

  const pairs: Pair[] = useMemo(() => {
    const spenders = SPENDERS[chainId] ?? [];
    return tokens.flatMap((token) => spenders.map((spender) => ({ token, spender })));
  }, [chainId, tokens]);

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
      .filter((f) => f.allowance > 0n)
      // Highest risk first: unlimited approvals top the list.
      .sort((a, b) => (b.allowance > a.allowance ? 1 : b.allowance < a.allowance ? -1 : 0));
  }, [data, pairs]);

  // Selection only makes sense over rows that still have an allowance; drop
  // stale keys after a rescan removes rows (e.g. right after a batch revoke).
  const selectedTargets = useMemo(
    () => findings.filter((f) => selected.has(pairKey(f.pair))).map((f) => f.pair),
    [findings, selected],
  );

  const names = useBasenames(chainId, [
    ...findings.map((f) => f.pair.spender.address),
    ...(address ? [address] : []),
  ]);
  const prices = useUsdPrices(chainId, tokens);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allSelected = findings.length > 0 && findings.every((f) => selected.has(pairKey(f.pair)));

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
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allSelected}
                    onChange={() =>
                      setSelected(allSelected ? new Set() : new Set(findings.map((f) => pairKey(f.pair))))
                    }
                    className="h-4 w-4"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Token</th>
                <th className="px-4 py-3 font-medium">Spender</th>
                <th className="px-4 py-3 font-medium">Allowance</th>
                <th className="px-4 py-3 font-medium">Origin</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {findings.map(({ pair, allowance }) => (
                <tr key={pairKey(pair)} className="border-t border-neutral-800">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${pair.token.symbol} / ${pair.spender.name}`}
                      checked={selected.has(pairKey(pair))}
                      onChange={() => toggle(pairKey(pair))}
                      className="h-4 w-4"
                    />
                  </td>
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
                    <AddressLabel address={pair.spender.address} name={names.get(pair.spender.address.toLowerCase())} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={allowance >= maxUint256 / 2n ? "font-medium text-red-400" : ""}>
                      {formatAllowance(allowance, pair.token.decimals)}
                    </span>
                    <UsdEstimate chainId={chainId} token={pair.token} amount={allowance} prices={prices} />
                  </td>
                  <td className="px-4 py-3">
                    {publicClient && (
                      <TraceCell
                        chainId={chainId}
                        load={() =>
                          traceErc20Approval(publicClient, pair.token.address, address!, pair.spender.address)
                        }
                      />
                    )}
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

      <AddTokenForm
        chainId={chainId}
        known={tokens}
        onAdd={(t) =>
          setCustomTokens((prev) => ({ ...prev, [chainId]: [...(prev[chainId] ?? []), t] }))
        }
      />

      <Permit2Section chainId={chainId} tokens={tokens} mainnetArmed={mainnetArmed} />

      <SweepSection chainId={chainId} tokens={tokens} mainnetArmed={mainnetArmed} />

      {findings.length > 1 && (
        <BatchRevokeButton
          targets={selectedTargets}
          chainId={chainId}
          mainnetArmed={mainnetArmed}
          onSettled={() => {
            setSelected(new Set());
            refetch();
          }}
        />
      )}

      <p className="text-xs text-neutral-500">
        Note: this scans a curated matrix of {pairs.length} pairs via multicall. A production version would use an
        indexer / approvals API to discover every approval ever granted. Transactions carry the ERC-8021 builder code{" "}
        <code>{BUILDER_CODE}</code>.
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
  // useSyncExternalStore (not useState+useEffect) is React's own recommended
  // idiom for this — no subscription needed, snapshot just differs server/client.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const ownerNames = useBasenames(chainId, address ? [address] : []);
  const ownerName = address ? ownerNames.get(address.toLowerCase()) : undefined;

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
            <span className="text-sm text-neutral-300">
              {ownerName ? (
                <span className="text-blue-300">{ownerName}</span>
              ) : (
                <span className="font-mono">{short(address)}</span>
              )}
            </span>
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
