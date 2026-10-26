import { afterEach,expect,it,vi } from 'vitest'
import { randomField } from './prover'
afterEach(()=>vi.restoreAllMocks())
it('rejects out-of-range and zero draws rather than reducing modulo the field',()=>{
 let calls=0
 vi.spyOn(crypto,'getRandomValues').mockImplementation((array)=>{calls++;const bytes=array as Uint8Array;bytes.fill(calls===1?255:0);if(calls===3)bytes[31]=2;return array})
 expect(randomField()).toBe(`0x${'00'.repeat(31)}02`);expect(calls).toBe(3)
})
