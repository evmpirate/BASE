import test from "node:test";
import assert from "node:assert/strict";
import { verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  makeVoucher,
  serializeVoucher,
  signVoucher,
  voucherDomain,
  voucherNonce,
  VOUCHER_TYPES,
} from "./voucherlib.js";

// Well-known anvil dev key #0 — test-only, never funded anywhere real.
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TO = "0x6D4843155412832dC3Fa9C59e593cdAfdf52639D";
const CONTRACT = "0x68827fb4338bB3dba6C4F9084c25d98295A9d512";

test("voucherNonce is deterministic per (to, name) and collision-free across inputs", () => {
  assert.equal(voucherNonce(TO, "Voucher Claim"), voucherNonce(TO, "Voucher Claim"));
  assert.notEqual(voucherNonce(TO, "Voucher Claim"), voucherNonce(TO, "Other Badge"));
  assert.notEqual(voucherNonce(TO, "Voucher Claim"), voucherNonce(CONTRACT, "Voucher Claim"));
});

test("makeVoucher stamps the injected clock plus TTL", () => {
  const voucher = makeVoucher({ to: TO, name: "X", ttlSec: 600, now: () => 1_800_000_000_000 });
  assert.equal(voucher.deadline, 1_800_000_600n);
  assert.equal(voucher.nonce, voucherNonce(TO, "X"));
});

test("signVoucher produces a signature the EIP-712 domain verifies", async () => {
  const account = privateKeyToAccount(TEST_KEY);
  const voucher = makeVoucher({ to: TO, name: "Voucher Claim", now: () => 1_800_000_000_000 });
  const signature = await signVoucher(account, 84532, CONTRACT, voucher);

  assert.equal(
    await verifyTypedData({
      address: account.address,
      domain: voucherDomain(84532, CONTRACT),
      types: VOUCHER_TYPES,
      primaryType: "BadgeVoucher",
      message: voucher,
      signature,
    }),
    true,
  );

  // A tampered recipient must not verify.
  assert.equal(
    await verifyTypedData({
      address: account.address,
      domain: voucherDomain(84532, CONTRACT),
      types: VOUCHER_TYPES,
      primaryType: "BadgeVoucher",
      message: { ...voucher, to: CONTRACT },
      signature,
    }),
    false,
  );
});

test("serializeVoucher survives JSON round-trip losslessly", () => {
  const voucher = makeVoucher({ to: TO, name: "X", now: () => 1_800_000_000_000 });
  const wire = JSON.parse(JSON.stringify(serializeVoucher(voucher)));
  assert.equal(BigInt(wire.nonce), voucher.nonce);
  assert.equal(BigInt(wire.deadline), voucher.deadline);
  assert.equal(wire.to, voucher.to);
  assert.equal(wire.name, voucher.name);
});
