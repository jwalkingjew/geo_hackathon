import { Ipfs, type Op } from "@graphprotocol/grc-20";
import { wallet } from "./wallet";

type PublishOptions = {
	spaceId: string;
	editName: string;
	author: string;
	ops: Op[];
};

export async function publish(options: PublishOptions) {
	const cid = await Ipfs.publishEdit({
		name: options.editName,
		author: options.author,
		ops: options.ops,
	});

	// This returns the correct contract address and calldata depending on the space id
	// Make sure you use the correct space id in the URL below and the correct network.
	const result = await fetch(`https://api-testnet.grc-20.thegraph.com/space/${options.spaceId}/edit/calldata`, {
		method: "POST",
		body: JSON.stringify({
			cid: cid,
			// Optionally specify TESTNET or MAINNET. Defaults to MAINNET
			network: "TESTNET",
		}),
	});

	const { to, data } = await result.json();

	return await wallet.sendTransaction({
		to: to,
		value: 0n,
		data: data,
	});
}
