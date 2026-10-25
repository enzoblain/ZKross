# NØCT Frontend

Premium, responsive interface for the NØCT Stellar ↔ Ethereum bridge.

## Stack

- React and TypeScript
- Vite
- Tailwind CSS v4
- shadcn/ui-style primitives backed by Radix UI
- Motion with a restrained Aceternity UI spotlight treatment
- Geist and Geist Mono

## Local development

From the repository root:

```bash
npm install
npm run dev
```

Build the frontend with:

```bash
npm run build:frontend
```

## Integration status

The UI currently uses `src/lib/mock-bridge.ts`. Wallet connections, quotes,
transfer progress, liquidity figures and admin controls are simulations. They do
not sign or broadcast transactions, move assets, generate proofs, or provide
privacy guarantees.

Keep privacy copy aligned with the audited behavior of the circuits as real
adapters are introduced.
