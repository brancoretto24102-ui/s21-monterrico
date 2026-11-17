import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {can,GUEST_PERMISSIONS,PERMISSIONS} from '../lib/domain.ts';
import type {Row} from '../lib/domain.ts';
import {filterPublishers,filteredSelection} from '../lib/publisher-filters.ts';
import {GUEST_LOGIN_EMAIL,resolveLoginEmail} from '../lib/login.ts';
import {createDatabase} from '../supabase/functions/s21-api/database.ts';
import {createService} from '../supabase/functions/s21-api/service.ts';
import {createCredentialService} from '../supabase/functions/s21-api/credentials.ts';
process.on('uncaughtException',(error:any)=>{console.error('Invitado y filtros:',error.message,error.code||'');process.exit(1);});

assert.equal(resolveLoginEmail(' INVITADO '),GUEST_LOGIN_EMAIL);
assert.equal(resolveLoginEmail('Person@Example.Test '),'person@example.test');
const guestActor={permissions:[...GUEST_PERMISSIONS]};
for(const permission of ['dashboard','publishers.read','groups.read','comments.read','groups.all','pdf.single','pdf.bulk'])assert(can(guestActor,permission));
for(const permission of ['masters.read','publishers.write','groups.write','catalogs.write','assignments.write','reports.write','reports.submit','reports.correct','periods.write','users.write','import','audit','backup'])assert(!can(guestActor,permission));
assert(can({permissions:['masters.read']},'publishers.read'));
assert(can({permissions:['masters.read']},'groups.read'));

const people:Row[]=[
 {id:'a',alias:'Álvaro',full_name:'Álvaro Ejemplo',code:'A-1',group_id:'G1',preaching_type_id:'PUB',status:'ACTIVO'},
 {id:'b',alias:'Beatriz',full_name:'Beatriz Ejemplo',code:'B-2',group_id:'G2',preaching_type_id:'PR',status:'INACTIVO'},
 {id:'c',alias:'Carlos',full_name:'Carlos Ejemplo',code:'C-3',group_id:'G1',preaching_type_id:'PAC',status:'TRASLADADO'},
 {id:'d',alias:'Diana',full_name:'Diana Ejemplo',code:'D-4',group_id:'G2',preaching_type_id:'PA',status:'ACTIVO'}
];
const histories:Row[]=[
 {publisher_id:'a',kind:'group',value:'G2',start_month:'2041-01',end_month:'2041-06'},
 {publisher_id:'a',kind:'group',value:'G1',start_month:'2041-07',end_month:null},
 {publisher_id:'a',kind:'preaching',value:'PR',start_month:'2041-01',end_month:'2041-06'},
 {publisher_id:'a',kind:'preaching',value:'PUB',start_month:'2041-07',end_month:null},
 {publisher_id:'a',kind:'status',value:'INACTIVO',start_month:'2041-01',end_month:'2041-06'},
 {publisher_id:'a',kind:'status',value:'ACTIVO',start_month:'2041-07',end_month:null}
];
const before=JSON.stringify({people,histories});
const ids=(list:Row[])=>list.map(person=>person.id);
assert.deepEqual(ids(filterPublishers(people,histories,{group:'G2',type:'PR'})),['b']);
assert.deepEqual(ids(filterPublishers(people,histories,{group:'G1',type:'PUB',query:'ALVARO EJEMPLO',status:'ACTIVO'})),['a']);
assert.deepEqual(ids(filterPublishers(people,histories,{query:'B-2'})),['b']);
assert.deepEqual(ids(filterPublishers(people,histories,{group:'G2',type:'PR',status:'INACTIVO',query:'alvaro',month:'2041-06'})),['a']);
assert.deepEqual(ids(filterPublishers(people,histories,{group:'G1',type:'PUB',month:'2041-10'})),['a']);
assert.deepEqual(filterPublishers(people,histories,{type:'MIS'}),[]);
assert.deepEqual(filterPublishers(people,histories,{query:'sin-coincidencia'}),[]);
assert.deepEqual(filterPublishers(people,histories,{group:'G1',type:'PAC',operationalOnly:true}),[]);
assert.deepEqual(ids(filterPublishers(people,histories,{status:'operational'})),['a','b','d']);
assert.deepEqual(ids(filterPublishers(people,histories,{person:'d',group:'G2',type:'PA'})),['d']);
const visible=filterPublishers(people,histories,{group:'G2',type:'PR'});
assert.deepEqual(filteredSelection(['a','b','a','c','unknown'],visible),['b'],'PDF/ZIP uses only selected publishers visible under the current filters');
assert.deepEqual(filteredSelection(['a'],[]),[]);
assert.equal(JSON.stringify({people,histories}),before);

const pg=new PGlite();
for(const file of fs.readdirSync('supabase/migrations').filter(file=>file.endsWith('.sql')).sort())await pg.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
const query=(client:any)=>async(sql:string,args:any[])=>{const r=await client.query(sql,args);return {rows:r.rows,count:r.affectedRows??r.rows.length};};
const db=createDatabase(query(pg));
const owner={userId:'synthetic-admin-auth',email:'admin@example.test',displayName:'Administrador sintético'};
const admin=createService(db,owner);
await admin.defaults();
await pg.query("INSERT INTO s21.users(id,subject,email,name,profile_id,must_change_password,credential_state) VALUES('admin-user',$1,$2,'Administrador','admin',0,'ready')",[owner.userId,owner.email]);
const run=(body:Row)=>pg.transaction(async tx=>{const service=createService(createDatabase(query(tx)),owner);return service.mutation(await service.actor(),body);});
const makePerson=(id:string,group_id:string)=>({id,code:id,alias:id,names:'Prueba',surnames:'Sintética',full_name:id,gender:'MASCULINO',group_id,status:'ACTIVO',preaching_type_id:'PUB',effective_month:'2041-01'});
await run({action:'save',entity:'publisher',data:makePerson('fixture-one','G1')});
await run({action:'save',entity:'publisher',data:makePerson('fixture-two','G2')});
const legacy=PERMISSIONS.map(([key])=>key).filter(key=>!['publishers.read','groups.read'].includes(key));
const adminProfile=await admin.one("SELECT * FROM profiles WHERE id='admin'");
await run({action:'save',entity:'profile',data:{...adminProfile,permissions:JSON.stringify(legacy)}});
await pg.exec('CREATE SCHEMA auth; CREATE TABLE auth.users(id text PRIMARY KEY,email text NOT NULL); CREATE TABLE public.profiles(id text PRIMARY KEY,active boolean NOT NULL);');
await pg.query("INSERT INTO auth.users(id,email) VALUES('synthetic-guest-auth',$1)",[GUEST_LOGIN_EMAIL]);
await pg.exec("INSERT INTO public.profiles(id,active) VALUES('synthetic-guest-auth',true)");
await pg.query("INSERT INTO s21.users(id,email,name,profile_id,must_change_password,credential_state) VALUES('guest-user',$1,'Invitado','invitado',0,'ready')",[GUEST_LOGIN_EMAIL]);
let authWrites=0;
const credentials=createCredentialService(async fn=>pg.transaction(async tx=>fn(createService(createDatabase(query(tx)),owner))),{
 create:async()=>{authWrites++;throw new Error('Shared Auth must not be changed');},
 update:async()=>{authWrites++;throw new Error('Shared Auth must not be changed');}
});
const linked=await credentials.manage('provision','guest-user',1);
assert.equal(linked.existing_account,true);assert.equal(authWrites,0);
const guest=createService(db,{userId:'synthetic-guest-auth',email:GUEST_LOGIN_EMAIL,displayName:'Invitado'});
const actor=await guest.actor();
assert.deepEqual(new Set(actor.permissions),new Set(GUEST_PERMISSIONS));
await pg.query("INSERT INTO s21.issues(id,publisher_id,month,kind,message,details) VALUES('internal-issue','fixture-one','2041-01','internal','Synthetic review','{}')");
await pg.query("INSERT INTO s21.corrections(id,publisher_id,report_id,month,field,message,created_by,created_at) VALUES('internal-request','fixture-one','synthetic-report','2041-01','hours','Synthetic request','fixture','synthetic')");
const state=await guest.state(actor);
assert.equal(state.publishers.length,2);assert.equal(state.groups.length,6);
assert.deepEqual(state.issues,[]);assert.deepEqual(state.corrections,[]);
assert.deepEqual(state.audit,[]);assert.deepEqual(state.imports,[]);assert.deepEqual(state.profiles,[]);
const stored=JSON.stringify(await admin.rows('SELECT * FROM publishers ORDER BY id'));
const single:Row=await guest.mutation(actor,{action:'export',ids:['fixture-one'],years:[2041,2042],cutoff:'2041-10-31'});
assert(single.data.publishers.some((person:Row)=>person.id==='fixture-one'));
const bulk:Row=await guest.mutation(actor,{action:'export',ids:['fixture-one','fixture-two'],years:[2041,2042],cutoff:'2041-10-31'});
assert.equal(bulk.data.publishers.length,2);
const denied=[
 {action:'save',entity:'publisher',data:{...state.publishers[0],alias:'Forbidden'}},
 {action:'save',entity:'group',data:{...state.groups[0],name:'Forbidden'}},
 {action:'save',entity:'type',data:{id:'PUB',name:'Forbidden'}},
 {action:'save',entity:'user',data:{id:'other',email:'other@example.test'}},
 {action:'save',entity:'profile',data:{id:'invitado',permissions:'["users.write"]'}},
 {action:'assignment',data:{publisher_id:'fixture-one',kind:'status',value:'INACTIVO',start_month:'2041-01'}},
 {action:'report',data:{publisher_id:'fixture-one',month:'2026-01',participation:'SI',submit:true}},
 {action:'period',month:'2041-01',state:'closed',reason:'Forbidden'},
 {action:'backup'}
];
for(const body of denied)await assert.rejects(()=>guest.mutation(actor,body),(error:any)=>error.status===403);
await assert.rejects(()=>guest.importChunk(actor,{action:'start',filename:'synthetic',summary:{}}),(error:any)=>error.status===403);
assert.equal(JSON.stringify(await admin.rows('SELECT * FROM publishers ORDER BY id')),stored);
const access=await admin.one("SELECT * FROM users WHERE id='guest-user'");
await credentials.remove('guest-user',access!.version);
assert.equal(authWrites,0);
assert(await admin.one("SELECT id FROM auth.users WHERE id='synthetic-guest-auth'"));
assert.equal((await admin.one("SELECT active FROM public.profiles WHERE id='synthetic-guest-auth'"))?.active,true);
await pg.close();
console.log('PASS: guest read-only permissions, PDF/ZIP access, shared-account preservation, independent removal, combined filters, historical cutoff and visible selections.');
