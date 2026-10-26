#!/usr/bin/env python3
"""Export Forge's pinned private deployment artifacts after forge build."""
from pathlib import Path
import json
repo=Path(__file__).resolve().parents[2]
artifacts={}
for name in ['Poseidon2','PolicyTx22Verifier','SnarkjsVerifierAdapter','PrivateUsdcPool','CctpBatcher']:
    source=json.loads((repo/f'contracts/ethereum/out/{name}.sol/{name}.json').read_text())
    runtime=source['deployedBytecode'];runtime.pop('sourceMap',None)
    artifacts[name]={'abi':source['abi'],'bytecode':source['bytecode']['object'],'linkReferences':source['bytecode']['linkReferences'],'runtime':runtime}
(repo/'apps/frontend/src/lib/deployment-artifacts.json').write_text(json.dumps(artifacts,separators=(',',':'))+'\n')
