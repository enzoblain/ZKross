# Privacy, notes and disclosure

CCTP transfers are public burn/mint settlements. Wallet addresses, amounts, timestamps, fee payers, hooks and chain activity can correlate users. Batching can reduce simple timing alignment but does not guarantee anonymity. The simulator is not a privacy mechanism.

The preserved legacy contracts enforce a universal administrator Global View Key. They do not implement user-granted scoped disclosure. The active Compliance page is an explicit role/design specification, not an authenticated administrator dashboard. No server RBAC, ASP policy enforcement, disclosure requests, audit trail or grant revocation is claimed.

Target roles: user owns spending secrets; relayer submits narrowly authorized transactions; ASP operator manages association sets; auditor receives user-authorized scoped records; administrator manages configuration without universal decryption. A grant must bind auditor key, selected records/fields, purpose, expiry and user consent. Revocation can prevent future access; it cannot erase previously decrypted records. Replacing legacy GVK enforcement requires new reviewed circuits, verification keys, contracts and a migration plan.

Legacy zkross:v1 localStorage contains plaintext blindings/claim secrets. It is preserved to avoid losing recovery data, and its execution entry point is disabled. Do not treat wallet signatures as guaranteed secret entropy. Do not use this build with valuable funds. Historical backups can disclose more than transaction metadata.

The new note-vault.ts primitive uses Web Crypto AES-256-GCM with authenticated protocol context, fresh 96-bit nonce, 128-bit salt and PBKDF2-SHA256 (600,000 iterations). A strong independent passphrase of at least 12 characters is required; length alone is not entropy. Wrong passwords, ciphertext tampering and unsupported KDF parameters fail. It is an experimental backup primitive, not an integrated encrypted wallet. No auto-migration or plaintext deletion occurs. XSS or a compromised device can read unlocked data; passphrase loss can make recovery impossible. Production needs reviewed wallet lifecycle integration, locking on disconnect/account/network changes, schema-bound recovery, atomic spend reservation and encrypted note delivery.

The CCTP demo store refuses testnet notes; simulation records have no real spending secrets. No analytics integration or public activity service was added. Same-origin scripts can access demo data. Do not put real secrets into simulated fields.
