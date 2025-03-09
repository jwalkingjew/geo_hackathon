import type { Chain } from "viem";
import { config } from "./config";

export const TESTNET: Chain = {
	id: 19411, // or 80451 for mainnet
	name: "Geo Genesis",
	nativeCurrency: {
		name: "Ethereum",
		symbol: "ETH",
		decimals: 18,
	},
	rpcUrls: {
		default: {
			http: [config.rpc],
		},
		public: {
			http: [config.rpc],
		},
	},
};
