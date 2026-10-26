## Wallet-signed deployment preparation — 2026-10-26

Status: deployment UI is available; no new testnet deployment or CCTP end-to-end success is claimed. The user chose their connected wallets and their own signatures. No private key or seed is read by these tools.

Open the running frontend in a browser with MetaMask and Freighter. In **Compliance**, connect MetaMask on Sepolia, then choose **Deploy or resume on Sepolia** (four contract creations). Connect Freighter on Stellar Testnet, then choose **Deploy or resume on Stellar Testnet** (four WASM uploads and four contract creations, subject to wallet prompts). ETH and XLM here are testnet funds. These operator setup transactions do not transfer USDC.

The deployment journals persist before signature/broadcast, retain transaction hashes, validate the requested creation data and retain uncertain submissions for reconciliation. A lost EVM submission requires importing its original hash rather than deploying again. Stellar resumes the same saved envelope; expired or failed envelopes stop for reconciliation. Export both public deployment manifests after confirmation. The addresses still need verification and shared configuration before a public frontend can use the new pools.

The Stellar artifacts use the existing SPP `pool` and `policy_tx_2_2` verifier without GVK, official testnet USDC, open policy flags 0 and tree depth 20. EVM runtime validation pins the private pool, verifier, adapter and Poseidon library code to this build (constructor values are separately checked). WASM artifacts are hash-checked before upload and deployed Stellar code is checked against the same hashes.

Validation completed locally: real browser-WASM proofs deposit 100 token units into the actual Solidity private pool, withdraw 40, leave 60, and fail on nullifier replay. This uses isolated Anvil, actual generated verifier bytecode and a local mock token, **not real Sepolia or CCTP**. A separate real proof/WASM conservation test passes. New per-note disclosure encryption uses a derived note-specific view key; it is not a complete auditor grant product.

Remaining: verified testnet deployments with wallet signatures; complete durable live CCTP execution, destination mint/deposit integration, private wallet spend/balance integration, successful public testnet end-to-end tests, and public hosting/shared configuration. Bridge execution remains deliberately disabled until those requirements pass. Do not treat deployment preparation as a finished public bridge or anonymity guarantee.

Rebuild deployment artifacts with `forge build` in `contracts/ethereum`, then `python3 scripts/build/export-private-artifacts.py`. Build Stellar with `ZKROSS_BUILD=/absolute/build STELLAR=/path/to/stellar bash scripts/build/private-stellar.sh` (Stellar CLI >=25.2, compatible Rust/wasm target). Build browser proofs with the documented `private-browser.sh`. Generated files under `public/zk` remain ignored and must be included in deployment packaging.

# Latest status — continued testnet implementation

The full publicly usable private testnet bridge is STILL INCOMPLETE. No real transfer or deployment was broadcast. Current local validation: 90 frontend tests pass with staged real WASM artifacts and no skips; 169 Ethereum tests pass; 2 new native-prover tests pass. Prior Stellar results remain 107 non-GVK pool and 136 legacy GVK pool tests.

New in this continuation:

- Added experimental PrivateUsdcPool on Ethereum, based on SPP's non-GVK two-input/two-output transaction shape. Seven public inputs, immutable token/verifier, public deposit/withdrawal accounting, nullifier/replay checks, external-data binding and reentrancy guard. There is no administrator decryption key. Open policy only: ASP enforcement and scoped auditing are not connected.
- Generated PolicyTx22Verifier from the existing pinned SPP verification key with snarkjs 0.7.6. Added real positive proof verification on the EVM and rejection after mutation of each public input. Custody-flow tests still use a strict mock verifier; this is not an on-chain deposit test or an independent audit.
- Added a Sepolia-only deployment script for the verifier, adapter and pool. It has NOT been broadcast. It takes signing from Foundry's external wallet/keystore configuration and does not read a private key itself. Historical deployments.json was not replaced.
- Added build_private_transact to the Rust library, CLI and WASM exports. It reuses SPP commitment/Merkle encodings while removing GVK witness inputs. Two native tests pass.
- Compiled the real policy_tx_2_2 R1CS in an isolated source copy using the pinned Circom/circomlib versions and existing SPP keys. Generated and locally verified a real proof; retained only public proof bytes/signals in the Ethereum fixture.
- Built the browser prover with Rust 1.97.1 and wasm-bindgen 0.2.128. Resolved the Mac build failure by selecting LLVM's WebAssembly-compatible archiver instead of Apple's ar, which had emitted an empty SQLite C archive. No fake SQLite stubs or unresolved-symbol bypasses were used.
- Staged the real WASM, proving key, witness graph and R1CS in apps/frontend/public/zk (gitignored generated artifacts). Added a reproducible scripts/build/private-browser.sh path. A clean checkout must build/stage them; they are not automatically committed.
- Added a real WASM proof generation/verification test and invalid-value-conservation rejection. The old skipped Poseidon WASM test now executes; its fixture roots required cumulative inserts, matching the existing Solidity test. Production hash code was not changed to force a test pass.
- Replaced modulo-biased secret generation with nonzero rejection sampling.
- Connected encrypted vault creation, lock, encrypted export and encrypted restore to Private Wallet. Recovery records include both the spending secret and note blinding; imported records do not count as verified on-chain balance. Existing legacy plaintext records are preserved, not silently migrated. Locking cancels pending vault writes and password derivation; the vault locks on page exit/backgrounding and explicit wallet connection/disconnection. Ethereum account/network changes invalidate its connection and lock the vault. Cross-device spend coordination is not implemented.
- Verified read-only that Sepolia chain ID is 11155111 and code exists at its documented CCTP messenger address; Stellar RPC reports the Test SDF passphrase/protocol 29, and its forwarder and historical pool contract instances are present. These are presence/network checks, not a full code, asset, key or privacy-policy audit. See outputs/testnet-readiness.json in the chat deliverables.

Remaining implementation and verification:

1. Deploy and inspect matched non-GVK USDC pools/verifiers, including a new compatible Stellar deployment; the historical Stellar instance is not evidence that this replacement is deployed.
2. Complete wallet-authorized CCTP approval/burn, fees, canonical message binding, Stellar receive and reverse-chain execution in the active UI.
3. Implement mint-to-private-deposit custody/proof integration, durable recovery, idempotent credit, encrypted note persistence and actual commitment inclusion checks. The encrypted vault UI is operational, but no live deposit writes a note into it yet.
4. Implement relayer/batcher, durable chain history, private transfers/withdrawals in the UI, ASP policy enforcement, scoped user-authorized disclosure and authenticated compliance services.
5. Perform funded forward/reverse end-to-end testnet tests and publish actual hashes before opening execution to arbitrary users.

CCTP settlement is public. Neither the completed local proof tests nor a non-GVK pool establishes end-to-end anonymity. Amount/timing correlation and fee-payer links remain observable and require explicit analysis. The current source-to-destination simulator remains labeled as simulation.

Reproducible preparation (no broadcast):

```sh
cd /Users/enzoblain/Cours/Hackathon/ZKross
# Use the project's Rust 1.97.1 compiler and a matching wasm-bindgen 0.2.128.
# Set ZKROSS_BUILD to an absolute writable scratch directory; set WASM_BINDGEN
# to its executable if it is not on PATH. On this Mac use the Rustup toolchain,
# not Homebrew rustc without a wasm target. The script chooses LLVM C tools on macOS.
bash scripts/build/private-browser.sh
npm run test:frontend
npm run build:frontend
npm run lint --workspace=apps/frontend
forge test --root contracts/ethereum
```

Deployment entry point: contracts/ethereum/script/DeployPrivatePool.s.sol. Do not confuse a Foundry dry-run output with a deployed contract. There is still no executable end-to-end private CCTP bridge runbook, and no claim that merely deploying this contract completes the platform.

---

# ZKross implementation report — 25 October 2026

## Outcome

A buildable, tested CCTP migration frontend and protocol/security foundations were delivered. **The requested real cross-chain private MVP is not complete.** No real USDC burn, mint, privacy-pool deposit, or on-chain deployment was executed in this session. All active transfers remain explicitly simulated; testnet execution is blocked.

## Repository recovery and preservation

Repository: /Users/enzoblain/Cours/Hackathon/ZKross. Active branch verified as dev-front, starting commit 56d984a (CODEX1). The last commit added cctp-config, cctp-flow, cctp-store and progress tests, but App imported a missing Private Balance page and still routed to the old bridge. There were no staged/tracked modifications at initial inspection. Seven untracked contracts/stellar directories were already present and were preserved. No branch switch, reset, discard, commit, push or merge was performed.

Already present: React/Vite frontend with wallet adapters; SPP circuits/prover; Solidity ShieldedPool, Poseidon2, verifiers/Merkle trees; Soroban pool-gvk and ASP contracts; root-poster/refund-attester services; historical deployment scripts, fixture vectors and tests. The generic relayer service was empty. README was effectively empty, architecture documentation and environment example were empty. deployments.json records historical Stellar pool IDs and no Sepolia pool.

The legacy plan requires prefunded pool liquidity and an administrator universal Global View Key. Those conflict with the current request and were not treated as approved target architecture.

## Changes

- Routed Bridge, Private Wallet, Activity, Compliance and Privacy to explicit CCTP migration screens; preserved old screen source. Repaired missing Private Wallet import.
- Added React Bits SpotlightCard with retained license and a React-compliant ref update; preserved the existing shell/theme and design tokens. Interpreted “react bytes” as React Bits.
- Removed silent fallback from configured testnet to simulation. Persisted the user's execution mode across navigation. Testnet readiness remains false even if environment strings are filled in.
- Disabled the legacy runTransfer entry point to prevent the old liquidity/disclosure design from being invoked as CCTP.
- Added same-chain/input validation, concurrent simulation guard, idempotent note creation and spent-transfer rejection. Plaintext demo storage refuses real notes; simulated balances exclude testnet notes.
- Added official testnet CCTP constants, safe Stellar forwarder hook encoding, exact 7-to-6 decimal conversion and one-request cancellable sandbox attestation retrieval with timeout and header/nonce validation.
- Added an experimental Web Crypto encrypted backup primitive: AES-256-GCM, fresh random salt/nonce, authenticated protocol context, bounded PBKDF2-SHA256 parameters and recovery/tamper tests. It is not integrated into real note persistence.
- Repaired root npm test and the Stellar test script's required verification-key environment parameter.
- Added README, public environment example, architecture, privacy/disclosure model, setup/deployment gate, test plan and this checklist/report. Legacy PLAN/SPEC/CLAUDE files are retained as historical architecture.

## Workstream checklist

| Feature | Status | Evidence / remaining work |
| --- | --- | --- |
| A: CCTP V2 integration | Partially implemented | Official wire helpers and mocked attestation tests. Wallet approval/burn, Soroban receive, reverse burn and chain confirmation are not implemented in the active flow. |
| B: Stellar privacy pool | Existing legacy implementation tested; target blocked | 136 tests pass. Existing GVK/bridge design does not satisfy target disclosure; recorded deployment/USDC compatibility not independently checked on chain. |
| C: CCTP → pool adapter | Not implemented / blocking | No deployed, tested mint-to-deposit integration, eligibility binding, durable journal or retry accounting. Invariants documented. |
| D: Ethereum privacy pool | Existing legacy implementation tested; target partial | 152 tests pass; real fixture verification included. No Sepolia pool in deployment manifest, no target CCTP pool/disclosure migration. |
| E: Batcher and relayer | Not implemented for CCTP | Legacy root/refund services preserved. Simulation batch labels are not a real anonymity set or durable queue. |
| F: Common note specification | Legacy spec/vectors present; target partial | Existing Poseidon2/field/decimal tests pass. Target chain/pool-bound note protocol and user-scoped disclosure proof system not implemented. |
| G: Secure notes | Partially implemented | Encrypted backup primitive tested; real note storage refused by demo store. Legacy plaintext data preserved. Integrated encryption, recovery UI, disconnect lock and atomic cross-device spending remain missing. |
| H: Compliance / authorized auditing | Design only / blocked | Target roles and disclosure model documented. No functional RBAC, ASP policy dashboard, scoped grants, audit service or revocation system. Legacy universal GVK is incompatible. |
| I: Frontend | Implemented and tested for simulation; live incomplete | Bridge → balance → activity browser flow verified. Existing wallet adapters available; no new real wallet signing test performed. |
| J: Mode separation | Implemented and tested | Explicit mode retained; configuration does not imply readiness; no real-operation fallback, fabricated hash or mocked network confirmation. |

## Validation

- Frontend: **80 passed, 1 skipped**. The pre-existing WASM integration test is skipped; it is not proof that browser proving works.
- Ethereum: **152 passed, 0 failed**, including legacy proof/vector/replay/accounting suites. Foundry emitted existing mutability suggestions. These results do not validate CCTP integration.
- Stellar pool-gvk: **136 passed, 0 failed** after supplying the repository's policy_tx_2_2_gvk_T_vk.json fixture. Initial attempt failed because VERIFIER_VK_JSON was absent; the npm script now supplies it. Rust reported an upstream future-compatibility warning.
- Production frontend build passed. Lint passed with 0 errors and 3 existing warnings in generated SPP declarations.
- Browser: simulated 1 USDC Ethereum → Stellar; seven simulation-only events; Stellar demo balance 1.00 USDC; matching Activity; Testnet selection retained and execution disabled with blockers. No wallet signature or actual asset movement occurred.
- Recovered dependency install: npm ci --ignore-scripts, reported zero audit vulnerabilities at installation.

## On-chain and simulation inventory

New deployments: none. On-chain verification this session: none. Existing deployments.json identifiers remain historical configuration, not independently established evidence of a compatible CCTP pool. Circle contract addresses were checked against current official documentation, not against bytecode/WASM on chain.

Simulation: lifecycle events, placeholder commitments, batch participants, burn/mint, destination notes and balances. No secrets in these records confer spending authority. The simulator does not implement ZK privacy or authorized disclosure.

Not verified: real network wallet connections/signatures, fees, attestation API against an actual burn, live pool asset/verifier configuration, destination custody/deposit conservation, browser WASM proving and the reverse on-chain route.

## Launch commands

```sh
cd /Users/enzoblain/Cours/Hackathon/ZKross
npm ci --ignore-scripts
cp .env.example apps/frontend/.env.local
npm run dev --workspace=apps/frontend -- --host 127.0.0.1
```

Open the localhost URL printed by Vite. An existing .env.local must be reviewed/preserved instead of overwritten. Simulation runs without wallets. Set VITE_PROTOCOL_MODE=testnet only to inspect the explicit blocked state; previously selected mode overrides the environment default until changed in the UI.

Validation:

```sh
npm test
npm run build:frontend
npm run lint --workspace=apps/frontend
npm run test:ethereum
npm run test:stellar
```

## First real cross-chain test

There is no working command to execute the requested complete real route today. Follow docs/testnet-setup.md only after its implementation/deployment gates pass: verified target pools and new disclosure design, destination adapter, durable relayer, encrypted note lifecycle, correct USDC/trustline/fees, and full message-intent binding. Then approve/burn a tiny testnet amount, record actual source hashes, fetch canonical complete attestation, simulate/sign Stellar mint_and_forward, confirm actual net USDC, deposit through the supported pool method, confirm commitment inclusion, save encrypted note and reconcile accounting. A mint-success/deposit-failure must recover the deposit without reburning. Reverse live execution remains to be implemented.

## Remaining implementation order

1. Decide and review a target note/disclosure proof design without universal administrator access; rebuild compatible circuits/verifiers and pool contracts. Preserve legacy data and define any migration explicitly.
2. Implement verified, recoverable CCTP settlement with exact intent binding, fee handling, forwarder/trustline validation and durable submission recovery.
3. Implement the destination adapter and prove token conservation/idempotency, then deploy matched testnet pools and check chain configuration.
4. Integrate encrypted note storage/recovery and wallet lifecycle; implement real private transfers/withdrawals and scoped auditor grants.
5. Add least-privilege relayer/batching, authenticated ASP/admin services and policy proof enforcement.
6. Enable live UI only after integration tests; run funded forward/reverse testnet scenarios and publish actual hashes and proof evidence.

The outstanding work is implementation and cryptographic integration, not merely missing environment variables. No claim of complete end-to-end anonymity or production readiness is justified.

## Continuation: settlement binding and non-GVK pool

The subsequent implementation adds cctp-intent.ts: an unsigned standard-finality Sepolia burn request and strict canonical message-to-intent validation. Validation covers both versions, domains, source/destination messengers, assigned nonce, caller restriction, finality, source USDC, mint recipient, source wallet, amount, fee cap/executed fee and exact forwarding hook. Gross amount = net amount + executed fee. This helper is not yet wired into wallet signing or a live relayer. Expiration is returned for a destination-chain check; local parsing cannot authenticate Circle signatures or prove a mint occurred.

cctp-recovery.ts adds tested settlement transitions with explicit pending-submission states, hash binding, nonce consistency, fee accounting and confirmed deposit conservation. Serialized state can resume at every boundary. An interrupted pending burn/deposit cannot start a fresh burn/deposit automatically. This is a state-machine foundation, not a durable database, event monitor, transaction reconciler or deployed relayer.

Updated frontend validation: 80 passed, 1 WASM test skipped; production build passed. Existing Ethereum and GVK Stellar results remain 152 and 136 respectively.

Correction to the earlier broad cryptographic blocker: SPP already includes a non-GVK pool, non-GVK policy transaction circuits, and selective disclosure circuits. A new test run of the non-GVK Stellar pool passed **107 tests** with the matching policy_tx_2_2_vk.json fixture. Reproduce with npm run test:stellar:private. This provides a candidate reuse path without inventing a new transaction circuit. It does not establish reviewed selective-disclosure context binding, a matching Ethereum non-GVK pool, deployed USDC integration or end-to-end privacy. The legacy GVK pool still must be replaced in the active architecture, but rebuilding every circuit from scratch is not established as necessary.

No new chain deployment, funded transfer, live signing, encrypted-wallet integration or real pool deposit was performed. Testnet remains blocked.
