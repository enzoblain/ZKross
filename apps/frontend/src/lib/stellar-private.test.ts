import {expect,it} from 'vitest'
import {existsSync,readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {contract} from '@stellar/stellar-sdk'
import {configScVal,stellarUsdc} from './stellar-private'
const wasm=fileURLToPath(new URL('../../public/zk/stellar/batch_inbox.wasm',import.meta.url))
it.skipIf(!existsSync(wasm))('encodes the inbox constructor as the actual compiled Soroban Config struct',()=>{
 const spec=contract.Spec.fromWasm(readFileSync(wasm))
 const config=configScVal(stellarUsdc,'0x'+'01'.repeat(32) as `0x${string}`,[{amount:'100',commitment0:'0x'+'02'.repeat(32) as `0x${string}`,commitment1:'0x'+'03'.repeat(32) as `0x${string}`}])
 const decoded=spec.funcResToNative('get_config',config)
 expect(decoded.token).toBe(stellarUsdc);expect(decoded.pool).toBe(stellarUsdc);expect(decoded.entries[0].amount).toBe(100n)
 expect(decoded.entries[0].commitment0).toBe(BigInt('0x'+'02'.repeat(32)))
})
