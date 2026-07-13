// x402 client: pays for GET /report with testnet USDC on Base Sepolia.
// Usage: PRIVATE_KEY=0x... node pay.mjs [url]

import { x402Client, wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const url = process.argv[2] ?? "http://localhost:4021/report";
const signer = privateKeyToAccount(process.env.PRIVATE_KEY);
console.log("Paying from:", signer.address);

const client = new x402Client();
registerExactEvmScheme(client, { signer });
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

const res = await fetchWithPayment(url, { method: "GET" });
console.log("HTTP", res.status);

const paymentHeader = res.headers.get("payment-response") ?? res.headers.get("x-payment-response");
if (paymentHeader) {
  console.log("Payment response:", JSON.stringify(decodePaymentResponseHeader(paymentHeader), null, 2));
}

const body = await res.json();
console.log("Badges in report:", body.badgesMinted, "| names:", body.badges?.map((b) => b.name).join(", "));
