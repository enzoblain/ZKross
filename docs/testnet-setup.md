## Wallet-signed deployment preparation — 2026-10-26

Status: deployment UI is available; no new testnet deployment or CCTP end-to-end success is claimed. The user chose their connected wallets and their own signatures. No private key or seed is read by these tools.

Open the running frontend in a browser with MetaMask and Freighter. In **Compliance**, connect MetaMask on Sepolia, then choose **Deploy or resume on Sepolia** (four contract creations). Connect Freighter on Stellar Testnet, then choose **Deploy or resume on Stellar Testnet** (four WASM uploads and four contract creations, subject to wallet prompts). ETH and XLM here are testnet funds. These operator setup transactions do not transfer USDC.

The deployment journals persist before signature/broadcast, retain transaction hashes, validate the requested creation data and retain uncertain submissions for reconciliation. A lost EVM submission requires importing its original hash rather than deploying again. Stellar resumes the same saved envelope; expired or failed envelopes stop for reconciliation. Export both public deployment manifests after confirmation. The addresses still need verification and shared configuration before a public frontend can use the new pools.

The Stellar artifacts use the existing SPP `pool` and `policy_tx_2_2` verifier without GVK, official testnet USDC, open policy flags 0 and tree depth 20. EVM runtime validation pins the private pool, verifier, adapter and Poseidon library code to this build (constructor values are separately checked). WASM artifacts are hash-checked before upload and deployed Stellar code is checked against the same hashes.

Validation completed locally: real browser-WASM proofs deposit 100 token units into the actual Solidity private pool, withdraw 40, leave 60, and fail on nullifier replay. This uses isolated Anvil, actual generated verifier bytecode and a local mock token, **not real Sepolia or CCTP**. A separate real proof/WASM conservation test passes. New per-note disclosure encryption uses a derived note-specific view key; it is not a complete auditor grant product.

Remaining: verified testnet deployments with wallet signatures; complete durable live CCTP execution, destination mint/deposit integration, private wallet spend/balance integration, successful public testnet end-to-end tests, and public hosting/shared configuration. Bridge execution remains deliberately disabled until those requirements pass. Do not treat deployment preparation as a finished public bridge or anonymity guarantee.

Rebuild deployment artifacts with `forge build` in `contracts/ethereum`, then `python3 scripts/build/export-private-artifacts.py`. Build Stellar with `ZKROSS_BUILD=/absolute/build STELLAR=/path/to/stellar bash scripts/build/private-stellar.sh` (Stellar CLI >=25.2, compatible Rust/wasm target). Build browser proofs with the documented `private-browser.sh`. Generated files under `public/zk` remain ignored and must be included in deployment packaging.

# Testnet setup and deployment gate

Start with README commands and public environment example. Vite reads apps/frontend/.env.local. All VITE values are bundled into the browser. Never place seed phrases, private keys or vault passwords in them.

The official CCTP testnet deployments are recorded in cctp-wire.ts with source documentation. Documentation verification is not an on-chain code check. deployments.json contains a historical Stellar pool and no Sepolia pool; its entries were not redeployed or independently verified on-chain in this session.

## Deployment instructions (blocked prerequisites)

1. Implement and independently review a pool/disclosure design satisfying user authorization without a universal admin key. Generate new proving/verifying artifacts reproducibly; do not silently reuse GVK verifier keys.
2. Deploy matching USDC pools on both testnets. Confirm code/WASM, immutable asset, decimals, verifier and policy configuration from chain state. Record deployment hashes and ledgers/blocks.
3. Implement and test the mint-to-pool adapter and durable relayer journal. Prove idempotency, amount conservation and recovery after mint-before-deposit failure. Check every Soroban invocation by simulation before signature.
4. Integrate encrypted note persistence/recovery and wallet disconnect handling. Add authenticated compliance services only with explicit role enforcement.
5. Connect wallet-authorized CCTP approvals/burns and destination receives; validate route, asset, recipients, fees and message against the saved intent. Only then replace the unconditional testnet gate with verified readiness logic and release tests.

No command in this repository currently deploys the requested complete CCTP privacy architecture. Legacy deployment scripts deploy the old design. Setting environment fields is insufficient to enable live execution.

## First real transfer procedure after prerequisites

1. Fund only testnet wallets with small amounts of official USDC, Sepolia ETH and Stellar XLM. Verify Stellar trustline, correct asset contract, forwarder and destination deposit authorization.
2. Use a tiny amount exactly representable at six decimals. Query current fees; cap approval and maximum fee. Persist intent and check recipient/domain/hook encoding before wallet signature.
3. Sign Sepolia approval and depositForBurnWithHook using the official TokenMessengerV2. Both mintRecipient and destinationCaller must be Circle's Stellar forwarder. Never submit until destination recovery is demonstrated.
4. Save actual source hashes, await successful source confirmation, and query sandbox /v2/messages/0 with the burn hash. Persist canonical complete message and attestation; validate the full intent binding.
5. Simulate, sign and submit Stellar mint_and_forward. Verify official transmitter attestation and nonce use, successful chain status, recipient transfer and net minted amount.
6. Submit the separately authorized private deposit. Confirm actual token debit, pool event, commitment, Merkle inclusion and conserved amount. Persist the encrypted note before presenting a spendable balance.
7. If mint succeeds and deposit fails, record recovery-required and retry/recover the deposit only. Never repeat the burn. Replays must not credit a second note.
8. Verify independently with explorers and contract reads. Retain encrypted recovery backup. Reverse test repeats these checks using Stellar burn and Sepolia receiveMessage once implemented.

This is a release acceptance procedure, not an executable runbook for the current build. The application intentionally blocks it.
