// Configuration: the repo's .env (throwaway testnet keys) and deployments.json.
// Testnet only: refuses anything but Stellar testnet and Sepolia.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
/** The repo checkout (services may run from a WSL-native mirror). */
export const REPO = process.env.ZKROSS_REPO ?? path.join(here, "../../../..");

export function loadEnv(): Record<string, string> {
  const file = path.join(REPO, ".env");
  const env: Record<string, string> = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  }
  return { ...env, ...(process.env as Record<string, string>) };
}

export const env = loadEnv();
export const deployments = JSON.parse(fs.readFileSync(path.join(REPO, "deployments.json"), "utf8"));

export const STELLAR_PASSPHRASE = "Test SDF Network ; September 2015";
export const STELLAR_RPC = deployments.stellarTestnet.rpcUrl as string;
export const STELLAR_CHAIN_ID = BigInt(deployments.stellarTestnet.chainId);
export const SEPOLIA_CHAIN_ID = 11155111n;
// Must serve eth_getLogs from the pool's deploy block: publicnode prunes old logs.
export const SEPOLIA_RPC = env.SEPOLIA_RPC_URL ?? "https://sepolia.gateway.tenderly.co";

if (deployments.stellarTestnet.networkPassphrase !== STELLAR_PASSPHRASE) throw new Error("not Stellar testnet");
if (BigInt(deployments.sepolia.chainId) !== SEPOLIA_CHAIN_ID) throw new Error("not Sepolia");

export function need(name: string): string {
  const v = env[name];
  if (!v) throw new Error(`missing ${name} in .env (run scripts/testnet/create-accounts.sh)`);
  return v;
}

export const links = {
  stellarTx: (h: string) => `https://stellar.expert/explorer/testnet/tx/${h}`,
  sepoliaTx: (h: string) => `https://sepolia.etherscan.io/tx/${h}`,
};
