import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {valueAt} from '../lib/domain.ts';
type Row=Record<string,any>;
const pg=new PGlite();
for(const file of fs.readdirSync('supabase/migrations').filter(file=>file.endsWith('.sql')).sort()){
 await pg.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
}
const rows=async(sql:string,args:any[]=[])=>(await pg.query(sql,args)).rows as Row[];
const one=async(sql:string,args:any[]=[])=>((await rows(sql,args))[0]);
async function publisher(id:string,status='ACTIVO',since='2098-01'){
 await pg.query("INSERT INTO s21.publishers(id,code,names,surnames,full_name,alias,gender,status,historical_since) VALUES($1,$1,'Prueba','Sintética',$1,$1,'MASCULINO',$2,$3)",[id,status,since]);
}
function months(start:string,count:number){
 const [year,month]=start.split('-').map(Number);
 return Array.from({length:count},(_,index)=>new Date(Date.UTC(year,month-1+index,1)).toISOString().slice(0,7));
}
async function reports(id:string,list:string[],override:Row={}){
 for(const month of list)await pg.query("INSERT INTO s21.reports(id,publisher_id,month,type_id,participation,state,quality,updated_by,updated_at) VALUES($1,$2,$3,'PUB',$4,$5,$6,'fixture','2099-11-16T00:00:00Z')",[
  id+':'+month,id,month,'participation' in override?override.participation:'NO',override.state||'submitted',override.quality??'[]'
 ]);
}
async function history(id:string,value:string,start:string,end:string|null=null,origin='manual'){
 await pg.query("INSERT INTO s21.histories(id,publisher_id,kind,value,start_month,end_month,origin,created_by) VALUES($1,$2,'status',$3,$4,$5,$6,'fixture')",[id+':'+start,id,value,start,end,origin]);
}
const apply=async(id:string,date='2099-11-16')=>Number((await one('SELECT s21.apply_automatic_inactivity($1::date,$2::text) AS changed',[date,id])).changed);
const person=async(id:string)=>(await one('SELECT * FROM s21.publishers WHERE id=$1',[id]));
const histories=async(id:string)=>rows("SELECT * FROM s21.histories WHERE publisher_id=$1 AND kind='status' ORDER BY start_month",[id]);
const auditCount=async(id:string)=>Number((await one('SELECT count(*) AS n FROM s21.audit WHERE entity_id=$1',[id])).n);
const six=months('2099-05',6);

await publisher('six');
await reports('six',six.slice(1));
assert.equal(await apply('six'),0,'Five consecutive months are insufficient');
assert.equal((await person('six')).status,'ACTIVO');
await reports('six',six.slice(0,1));
const preservedReports=await rows('SELECT * FROM s21.reports WHERE publisher_id=$1 ORDER BY month',['six']);
assert.equal(await apply('six'),1);
let p=await person('six'),hs=await histories('six');
assert.equal(p.status,'INACTIVO');assert.equal(p.version,2);
assert.equal(valueAt(p,'status','2099-09',hs),'ACTIVO');
assert.equal(valueAt(p,'status','2099-10',hs),'INACTIVO');
assert.equal(hs.find(h=>h.origin==='automatic')?.start_month,'2099-10');
assert.equal(hs.find(h=>h.origin==='automatic_baseline')?.unverified,1);
assert.equal(p.birth_date,null);assert.equal(p.baptism_date,null);
assert.deepEqual(await rows('SELECT * FROM s21.reports WHERE publisher_id=$1 ORDER BY month',['six']),preservedReports);
const log=await one("SELECT * FROM s21.audit WHERE entity_id=$1 AND action='Inactivar automáticamente'",['six']);
assert.equal(log.actor,'Sistema');assert(log.reason.includes('2099-05 a 2099-10'));
assert.equal(JSON.parse(log.before_json).publisher.status,'ACTIVO');
assert.equal(JSON.parse(log.after_json).publisher.status,'INACTIVO');
const version=p.version,count=await auditCount('six');
assert.equal(await apply('six'),0,'Daily re-evaluation is idempotent');
assert.equal((await person('six')).version,version);assert.equal(await auditCount('six'),count);

await publisher('long');
await history('long','ACTIVO','2098-01');
await reports('long',months('2099-03',8));
assert.equal(await apply('long'),1);
hs=await histories('long');
assert.equal(hs.find(h=>h.origin==='automatic')?.start_month,'2099-08','The sixth month is used, not the last month of a longer streak');
assert.equal(hs.find(h=>h.start_month==='2098-01')?.end_month,'2099-07');

for(const [id,override] of [
 ['draft',{state:'draft'}],['conflict',{quality:'["duplicado_conflictivo"]'}],
 ['missing-participation',{participation:null}],['malformed-quality',{quality:'not-json'}],['participated',{participation:'SI'}]
] as [string,Row][]){
 await publisher(id);await reports(id,six.filter(month=>month!=='2099-08'));await reports(id,['2099-08'],override);
 assert.equal(await apply(id),0,id+' cannot establish six confirmed months');
 assert.equal((await person(id)).status,'ACTIVO');
}
await publisher('gap');
await reports('gap',['2099-04',...months('2099-06',5)]);
assert.equal(await apply('gap'),0,'Six records with a missing calendar month are not consecutive');
await publisher('open-month');await reports('open-month',six);
assert.equal(await apply('open-month','2099-10-16'),0,'The current month is excluded');
assert.equal(await apply('open-month','2099-11-01'),1,'The completed sixth month becomes eligible at the next month boundary');
await publisher('year-boundary');await reports('year-boundary',months('2099-08',6));
assert.equal(await apply('year-boundary','2100-02-01'),1);
assert.equal((await histories('year-boundary')).find(h=>h.origin==='automatic')?.start_month,'2100-01');

for(const status of ['INACTIVO','EXPULSADO','FALLECIDO','TRASLADADO','CAMBIADO']){
 const id='protected-'+status;await publisher(id,status);await reports(id,six);
 assert.equal(await apply(id),0);assert.equal((await person(id)).status,status);
 assert.equal((await person(id)).version,1);assert.equal(await auditCount(id),0);
}
await publisher('new-publisher','ACTIVO','2099-09');await reports('new-publisher',six);
assert.equal(await apply('new-publisher'),0,'Months before the confirmed start cannot qualify');
await publisher('reactivated');await history('reactivated','INACTIVO','2098-01','2099-08');
await history('reactivated','ACTIVO','2099-09');await reports('reactivated',six);
assert.equal(await apply('reactivated'),0,'A recent activation starts a new sequence');
await publisher('future-status');await history('future-status','ACTIVO','2098-01','2099-12');
await history('future-status','TRASLADADO','2100-01');await reports('future-status',six);
assert.equal(await apply('future-status'),1);
p=await person('future-status');hs=await histories('future-status');
assert.equal(valueAt(p,'status','2099-09',hs),'ACTIVO');
assert.equal(valueAt(p,'status','2099-10',hs),'INACTIVO');
assert.equal(valueAt(p,'status','2100-01',hs),'TRASLADADO');
assert.equal(hs.find(h=>h.origin==='automatic')?.end_month,'2099-12');

await publisher('rollback');await reports('rollback',six);
await assert.rejects(()=>pg.transaction(async tx=>{
 const result=await tx.query<{changed:number}>("SELECT s21.apply_automatic_inactivity('2099-11-16','rollback') AS changed");
 assert.equal(result.rows[0].changed,1);throw new Error('Synthetic rollback');
}),/Synthetic rollback/);
assert.equal((await person('rollback')).status,'ACTIVO');assert.equal(await auditCount('rollback'),0);
assert.equal((await histories('rollback')).length,0);

const realMonths=(await rows("SELECT to_char(date_trunc('month',now() AT TIME ZONE 'America/Lima')-n*interval '1 month','YYYY-MM') AS month FROM generate_series(6,1,-1) n")).map(row=>String(row.month));
const today=String((await one("SELECT (now() AT TIME ZONE 'America/Lima')::date::text AS date")).date);
await pg.query("INSERT INTO s21.imports(id,filename,created_at,created_by,summary) VALUES('loading-fixture','synthetic','synthetic','fixture','{\"state\":\"loading\"}')");
await publisher('import-deferred','ACTIVO',realMonths[0]);await reports('import-deferred',realMonths);
assert.equal(await apply('import-deferred',today),0,'Partial imports defer the rule');
assert.equal((await person('import-deferred')).status,'ACTIVO');
await pg.query("UPDATE s21.imports SET summary='{\"state\":\"completed\"}' WHERE id='loading-fixture'");
assert.equal((await person('import-deferred')).status,'INACTIVO','Completing the import evaluates all publishers');
assert.equal((await histories('import-deferred')).find(h=>h.origin==='automatic')?.start_month,realMonths.at(-1));

await publisher('report-trigger','ACTIVO',realMonths[0]);
await reports('report-trigger',realMonths.slice(0,5));
await reports('report-trigger',realMonths.slice(5),{state:'draft'});
assert.equal((await person('report-trigger')).status,'ACTIVO');
await pg.query("UPDATE s21.reports SET state='submitted' WHERE publisher_id='report-trigger' AND month=$1",[realMonths.at(-1)]);
assert.equal((await person('report-trigger')).status,'INACTIVO','Submitting the sixth closed-month report evaluates the rule immediately');
const triggeredCount=await auditCount('report-trigger');
await pg.query("UPDATE s21.reports SET quality='[]' WHERE publisher_id='report-trigger' AND month=$1",[realMonths.at(-1)]);
assert.equal(await auditCount('report-trigger'),triggeredCount);

const functions=await rows("SELECT p.proname,p.prosecdef,p.proconfig,EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='s21' AND p.proname LIKE '%inactivity%'");
assert.equal(functions.length,5);
assert(functions.every(fn=>!fn.prosecdef&&!fn.public_execute),'Private invoker functions expose no public execution privileges');
await pg.exec('CREATE ROLE synthetic_visitor NOLOGIN; SET ROLE synthetic_visitor;');
await assert.rejects(()=>pg.query('SELECT s21.apply_automatic_inactivity()'),(error:any)=>error.code==='42501');
await pg.exec('RESET ROLE;');
await pg.close();
console.log('PASS: six closed NO months, interruptions, pending data, calendar boundaries, histories, audit, idempotency, imports, report triggers, atomicity and private permissions.');

