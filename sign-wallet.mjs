// Signs the ERC-8004 AgentWalletSet consent as the agent's operational wallet.
// The signature proves the new wallet agrees to be linked to the agent.
// Usage: BURNER_KEY=0x... node sign-wallet.mjs <chainId> <agentId>
// Prints JSON: { newWallet, deadline, signature }

import { privateKeyToAccount } from "viem/accounts";

const REGISTRIES = {
  84532: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  8453: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
};
const OWNER = "0x6D4843155412832dC3Fa9C59e593cdAfdf52639D";

const chainId = Number(process.argv[2]);
const agentId = BigInt(process.argv[3]);
const account = privateKeyToAccount(process.env.BURNER_KEY);
const deadline = BigInt(Math.floor(Date.now() / 1000) + 240);

const signature = await account.signTypedData({
  domain: {
    name: "ERC8004IdentityRegistry",
    version: "1",
    chainId,
    verifyingContract: REGISTRIES[chainId],
  },
  types: {
    AgentWalletSet: [
      { name: "agentId", type: "uint256" },
      { name: "newWallet", type: "address" },
      { name: "owner", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
  },
  primaryType: "AgentWalletSet",
  message: { agentId, newWallet: account.address, owner: OWNER, deadline },
});

console.log(JSON.stringify({ newWallet: account.address, deadline: deadline.toString(), signature }));
