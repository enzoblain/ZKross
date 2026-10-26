import {DatabaseSync} from 'node:sqlite'
import {randomBytes,createHash} from 'node:crypto'
import type {BatchMember,BatchGroup,QueueTicket} from '../../../packages/batch/src/index.ts'
const hash=(token:string)=>createHash('sha256').update(token).digest('hex')
type Row={id:string;token:string;member:string;deadline:number;status:string;group_id:string|null}
export class BatchQueue {
 db:DatabaseSync
 constructor(path:string,readonly waitMs=120000){this.db=new DatabaseSync(path);this.db.exec(`PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS groups(id TEXT PRIMARY KEY,data TEXT NOT NULL);CREATE TABLE IF NOT EXISTS tickets(id TEXT PRIMARY KEY,token TEXT NOT NULL,member TEXT NOT NULL,source TEXT NOT NULL,deadline INTEGER NOT NULL,status TEXT NOT NULL,group_id TEXT);CREATE UNIQUE INDEX IF NOT EXISTS active_source ON tickets(source) WHERE status IN ('waiting','solo_choice');`)}
 close(){this.db.close()}
 join(member:BatchMember,now:number){
  const token=randomBytes(32).toString('hex')
  this.db.prepare('INSERT INTO tickets VALUES(?,?,?,?,?,?,NULL)').run(member.id,hash(token),JSON.stringify(member),member.source.toLowerCase(),now+this.waitMs,'waiting')
  return this.get(member.id,token,now)
 }
 private row(id:string,token:string){const row=this.db.prepare('SELECT * FROM tickets WHERE id=? AND token=?').get(id,hash(token)) as Row|undefined;if(!row)throw new Error('Ticket not found or not authorized.');return row}
 private group(id:string){return JSON.parse((this.db.prepare('SELECT data FROM groups WHERE id=?').get(id) as {data:string}).data) as BatchGroup}
 private freeze(rows:Row[],now:number){
  const salt=('0x'+randomBytes(32).toString('hex')) as `0x${string}`
  const group:BatchGroup={id:salt,salt,members:rows.map(row=>JSON.parse(row.member)),deadline:Math.floor(now/1000)+900}
  this.db.prepare('INSERT INTO groups VALUES(?,?)').run(group.id,JSON.stringify(group))
  for(const row of rows)this.db.prepare("UPDATE tickets SET status='grouped',group_id=? WHERE id=?").run(group.id,row.id)
 }
 get(id:string,token:string,now:number):QueueTicket{
  this.db.exec('BEGIN IMMEDIATE')
  try{
   let row=this.row(id,token)
   this.db.prepare("UPDATE tickets SET status='solo_choice' WHERE status='waiting' AND deadline<=?").run(now)
   row=this.row(id,token)
   if(row.status==='waiting'){
    const pool=(JSON.parse(row.member) as BatchMember).pool
    const eligible=(this.db.prepare("SELECT * FROM tickets WHERE status='waiting' AND deadline>? ORDER BY deadline,id").all(now) as Row[]).filter(r=>(JSON.parse(r.member) as BatchMember).pool===pool).slice(0,8)
    if(eligible.length>=2)this.freeze(eligible,now)
   }
   row=this.row(id,token)
   const result:QueueTicket={id,token,deadline:row.deadline,status:row.status as QueueTicket['status']}
   if(row.group_id)result.group=this.group(row.group_id)
   this.db.exec('COMMIT');return result
  }catch(error){this.db.exec('ROLLBACK');throw error}
 }
 solo(id:string,token:string,now:number){const ticket=this.get(id,token,now);if(ticket.status!=='solo_choice'||ticket.deadline>now)throw new Error('Explicit solo choice is available only after timeout.');this.db.exec('BEGIN IMMEDIATE');try{const row=this.row(id,token);if(row.status!=='solo_choice')throw new Error('Ticket already grouped.');this.freeze([row],now);this.db.exec('COMMIT')}catch(error){this.db.exec('ROLLBACK');throw error}return this.get(id,token,now)}
 cancel(id:string,token:string,now:number){const t=this.get(id,token,now);if(!['waiting','solo_choice'].includes(t.status))throw new Error('Grouped tickets must use on-chain refund if funded.');this.db.prepare("UPDATE tickets SET status='cancelled' WHERE id=?").run(id);return this.get(id,token,now)}
 publish(id:string,token:string,patch:Pick<BatchGroup,'inbox'|'inboxHash'|'burnHash'>,now:number){const ticket=this.get(id,token,now);if(!ticket.group)throw new Error('Ticket has no fixed group.');const group=ticket.group;for(const key of ['inbox','inboxHash','burnHash'] as const){if(patch[key]){if(group[key]&&group[key]!==patch[key])throw new Error('Conflicting public group reference.');Object.assign(group,{[key]:patch[key]})}}this.db.prepare('UPDATE groups SET data=? WHERE id=?').run(JSON.stringify(group),group.id);return this.get(id,token,now)}
}
