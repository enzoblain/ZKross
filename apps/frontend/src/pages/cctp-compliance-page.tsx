import {lazy,Suspense} from 'react'
const TestnetDeploymentPanel=lazy(()=>import('../components/testnet-deployment-panel').then(m=>({default:m.TestnetDeploymentPanel})))
const StellarDeploymentPanel=lazy(()=>import('../components/stellar-deployment-panel').then(m=>({default:m.StellarDeploymentPanel})))
const roles = [
  ['User', 'Owns spending secrets. Can grant a specific auditor an explicit disclosure scope.'],
  ['Relayer', 'Submits explicitly authorized transactions. Must not hold user spending keys.'],
  ['ASP operator', 'Maintains policy association sets; receives no automatic decryption authority.'],
  ['Authorized auditor', 'Receives user-granted, scoped disclosure. Revocation cannot erase information already received.'],
  ['Protocol administrator', 'Manages protocol configuration without a universal user decryption key.'],
]
export function CctpCompliancePage() {
  return <div className="mx-auto max-w-3xl space-y-6"><h1 className="text-4xl font-medium">Compliance and disclosure</h1><p role="status" className="rounded-2xl border border-warning p-4 text-sm">Design specification only. Role enforcement, disclosure grants, policy changes and audit access are not implemented in this application.</p><p className="text-sm text-muted">The preserved legacy pools enforce an administrator Global View Key. That model conflicts with the requested user-authorized disclosure design and is blocked from the CCTP execution path. Hiding an administrator button cannot change the cryptographic authority of an existing circuit.</p><Suspense fallback={<p>Loading deployment tools…</p>}><TestnetDeploymentPanel/><StellarDeploymentPanel/></Suspense><dl className="space-y-4">{roles.map(([role, description]) => <div key={role} className="rounded-2xl border border-border p-5"><dt className="font-medium">{role}</dt><dd className="mt-2 text-sm text-muted">{description}</dd></div>)}</dl><p className="text-sm text-muted">A future grant must bind the user, auditor public key, selected records, fields, purpose and expiry. Cryptographic disclosure must be distinguished from database access. No administrator or auditor can access other users’ local records through this page.</p></div>
}
