import { createWalletClient, http } from "viem";
import { TESTNET } from "./testnet";
import { config } from "./config";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(config.pk as `0x${string}`);

export const wallet = createWalletClient({
	account: account,
	chain: TESTNET,
	transport: http(config.rpc, { batch: true }),
});
