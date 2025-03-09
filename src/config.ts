import dotenv from "dotenv";

dotenv.config();

const PK = process.env.PK;

if (!PK) {
	throw new Error("PK does not exist in environment");
}

const RPC = process.env.RPC;

if (!RPC) {
	throw new Error("RPC does not exist in environment");
}

export const config = {
	pk: PK,
	rpc: RPC,
};
