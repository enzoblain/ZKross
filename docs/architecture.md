# CCTP migration architecture

## Active application

App → CCTP Bridge page → cctp-flow → cctp-store (simulation only).
Private Wallet and Activity read the same simulation records. Testnet remains testnet when selected and fails closed; even complete environment strings cannot satisfy the readiness check. Legacy Bridge/Activity/Compliance source is retained but no longer routed. The legacy runTransfer entry point refuses execution.

The UI can simulate burn, attestation, mint and destination note creation. These events are local demonstrations, not proofs, anonymity sets, relayer batches or settlement confirmations. Both network directions use the same simulator.

## Target real flow (not implemented end to end)

Wallet authorization → Sepolia USDC approval → CCTP V2 burn with Stellar forwarding hook → finalized source receipt → canonical Iris message/attestation → Soroban mint_and_forward → confirmed recipient USDC → explicitly authorized pool deposit → verified commitment insertion → encrypted note persistence → private balance.

Minting and pool deposit are distinct transitions. Circle's forwarder atomically mints and forwards tokens; it does not invoke a pool deposit or create a private note. Sending tokens directly to a pool without its supported deposit method can strand value. No burn is allowed until a tested, recoverable custody/deposit path exists. Reverse burn/mint is supported by Circle but not implemented here.

## Wire helpers

cctp-wire.ts pins documented testnet domain pairs 0/27 and official messaging addresses. The forwarder uses a 24-byte zero magic, u32 zero version, u32 big-endian recipient byte length, and strkey UTF-8 bytes. Both mintRecipient and destinationCaller name the forwarder payload. Stellar seven-decimal amounts must be exactly representable in six-decimal CCTP units; remainder is rejected, never rounded.

fetchAttestations makes one bounded sandbox request, supports cancellation, surfaces network/HTTP failures, returns pending for missing/incomplete attestations, validates version/domain header and nonzero unique nonces. It does not verify Circle signatures, token, mint recipient, amount or hook authorization. A future adapter must bind the complete canonical message to the recorded burn intent and invoke the official transmitter for signature/replay enforcement before any credit. No API result is itself a mint confirmation.

## Preserved legacy components

SPP Circom/Groth16 circuits, Solidity ShieldedPool, Soroban pool-gvk, root poster and refund attester implement the old liquidity model. Global View Key ciphertexts deliberately disclose notes to a configured authority. These components cannot satisfy scoped user-authorized disclosure through a frontend change. Existing fixtures demonstrate legacy crypto compatibility only.

## Required adapter invariants

Persist burn intent before signing; persist submitted transaction hash before awaiting confirmation. Reconcile an ambiguous submission by hash/account nonce before retrying a burn. Journal canonical CCTP source-domain/nonce and destination mint hash. Only confirmed, message-bound USDC can become deposit-eligible. Enforce one credit per canonical mint, pool, commitment; confirm deposit event and Merkle inclusion before saving a spendable note. A failed deposit after mint is recovery-required, never a failed-and-reburn operation. Account separately for gross burn, fees, net mint and private deposit; private credits must equal confirmed net deposits.

No durable adapter, relayer journal, batcher or target disclosure circuit is implemented yet.

## References (documentation checked 2026-10-25)

- https://developers.circle.com/cctp/references/stellar
- https://developers.circle.com/cctp/references/stellar-contracts
- https://developers.circle.com/cctp/references/contract-addresses
- https://developers.circle.com/cctp/references/technical-guide
- https://developers.circle.com/api-reference/cctp/all/get-messages-v2
