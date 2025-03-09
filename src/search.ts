import { Graph } from "@graphprotocol/grc-20";

type Result = {
	id: string;
	name: string | null;
};

export async function fuzzySearch(searchTerm: string): Promise<Result[]> {
	const response = await fetch(`https://api-testnet.grc-20.thegraph.com/search?q=${searchTerm}`);
	const { results } = await response.json();
	return results;
}