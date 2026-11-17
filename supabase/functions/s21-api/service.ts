import {type Row,DEFAULT_TYPES,PERMISSIONS,GUEST_PERMISSIONS,parseJSON,currentMonth,previousMonth,validateMonth,validateReport,valueAt,inScope,can} from './domain.ts';
import type {Prepared,Database} from './database.ts';
export type Identity={userId:string,email:string,displayName:string,sessionCreatedAt?:string,authenticationMethod?:'password'|'oauth'};
export function createService(db:Database,identity:Identity){
 const database=()=>db;
class ApiError extends Error {status:number;constructor(message:string,status=400){super(message);this.status=status;}}

async function rows(sql:string,args:any[]=[]):Promise<Row[]>{return (await database().prepare(sql).bind(...args).all()).results as Row[];}
async function one(sql:string,args:any[]=[]):Promise<Row|undefined>{return (await rows(sql,args))[0];}
const uid=()=>crypto.randomUUID(),now=()=>new Date().toISOString(),json=(x:any)=>JSON.stringify(x??null);
function statement(sql:string,args:any[]=[]){return database().prepare(sql).bind(...args.map(x=>x===undefined?null:x));}
function auditStatement(actor:Row,action:string,entity:string,id:string,before:any,after:any,reason='',conditional=false){return statement(`INSERT INTO audit(id,at,actor,action,entity,entity_id,before_json,after_json,reason) ${conditional?'SELECT ?,?,?,?,?,?,?,?,? WHERE changes()>0':'VALUES(?,?,?,?,?,?,?,?,?)'}`,[uid(),now(),actor.name||actor.email||actor.id,action,entity,id,before?json(before):null,after?json(after):null,reason]);}
async function defaults(){
 if(await one('SELECT value FROM settings WHERE key=?',['defaults_v1']))return;
 const ps=PERMISSIONS.map(x=>x[0]);const leaders=['dashboard','masters.read','reports.write','reports.submit','comments.read','pdf.single'];
 const profiles=[['admin','Administrador',ps],['gestor','Gestor de informes',ps.filter(p=>!['users.write','backup'].includes(p))],['encargado','Encargado de grupo',leaders],['auxiliar','Auxiliar de grupo',leaders],['consulta','Consulta',['dashboard','masters.read','comments.read']],['invitado','Invitado',GUEST_PERMISSIONS]];
 const qs=profiles.map(([id,name,permissions])=>statement('INSERT OR IGNORE INTO profiles(id,name,permissions) VALUES(?,?,?)',[id,name,json(permissions)]));
 for(const t of DEFAULT_TYPES)qs.push(statement('INSERT OR IGNORE INTO preaching_types(id,name,counts_hours,goal_kind,monthly_goal,annual_goal,monthly_reference,requires_campaign,versions,description) VALUES(?,?,?,?,?,?,?,?,?,?)',[t.id,t.name,t.counts_hours,t.goal_kind,t.monthly_goal,t.annual_goal,t.monthly_reference,t.requires_campaign,json([{since:'1900-01',...t}]),t.description]));
 for(let i=1;i<=6;i++)qs.push(statement('INSERT OR IGNORE INTO groups(id,code,name) VALUES(?,?,?)',[`G${i}`,`G${i}`,`Grupo ${i}`]));
 for(const [id,category,name] of [['ACTIVO','status','Activo'],['INACTIVO','status','Inactivo'],['EXPULSADO','status','Expulsado'],['FALLECIDO','status','Fallecido'],['TRASLADADO','status','Trasladado a otra congregación'],['HERMANO','role','Hermano(a)'],['SM','role','Siervo ministerial'],['ANCIANO','role','Anciano'],['OO','condition','Otras ovejas'],['UNGIDO','condition','Ungido']])qs.push(statement('INSERT OR IGNORE INTO catalogs(id,category,name) VALUES(?,?,?)',[id,category,name]));
 qs.push(statement('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)',['defaults_v1','1']));await database().batch(qs);
}
async function actor(allowPasswordChange=false):Promise<Row>{
 await defaults();
 const email=identity.email.toLowerCase();
 let u=await one('SELECT * FROM users WHERE subject=? OR (subject IS NULL AND email=?)',[identity.userId,email]);
 if(!u||!u.active)throw new ApiError('Tu cuenta todavía no tiene acceso a S-21. Contacta al administrador.',403);
 if(u.password_not_before&&(!identity.sessionCreatedAt||new Date(identity.sessionCreatedAt).getTime()<new Date(u.password_not_before).getTime()))throw new ApiError('Tu acceso fue actualizado. Inicia sesión nuevamente.',401);
 const external=identity.authenticationMethod==='oauth';
 if(!allowPasswordChange&&!external&&(u.must_change_password||u.credential_state&&u.credential_state!=='ready'))throw Object.assign(new ApiError('Debes crear tu nueva contraseña antes de ingresar.',423),{code:'PASSWORD_CHANGE_REQUIRED'});
 if(u.subject&&u.subject!==identity.userId)throw new ApiError('La cuenta está vinculada a otra identidad.',403);
 if(!u.subject){await statement('UPDATE users SET subject=? WHERE id=? AND subject IS NULL',[identity.userId,u.id]).run();u.subject=identity.userId;}
 const profile=await one('SELECT * FROM profiles WHERE id=?',[u.profile_id]);
 return {...u,authentication_method:external?'oauth':'password',permissions:parseJSON(profile?.permissions,[]),groups:parseJSON(u.groups_json,[]),profile_name:profile?.name||'Sin perfil'};
}
function requirePermission(a:Row,p:string){if(!can(a,p))throw new ApiError('Tu perfil no permite esta operación.',403);}
function requireScope(a:Row,g:string|null){if(!inScope(a,g))throw new ApiError('Este grupo está fuera de tu ámbito autorizado.',403);}
async function state(a:Row){
 const all=can(a,'groups.all'),g=a.groups as string[],marks=g.map(()=>'?').join(',')||'NULL';
 const pWhere=all?'':` WHERE group_id IN (${marks}) OR id IN (SELECT publisher_id FROM reports WHERE group_id IN (${marks}))`;
 const pubArgs=all?[]:[...g,...g];
 const [pubs,reps,hs,gs,types,cats,cs,periods,requests,profs,us,is,logs,imps]=await Promise.all([
  rows('SELECT * FROM publishers'+pWhere,pubArgs),
  rows('SELECT * FROM reports'+(all?'':` WHERE group_id IN (${marks})`),all?[]:g),
  rows('SELECT * FROM histories'+(all?'':` WHERE publisher_id IN (SELECT id FROM publishers${pWhere})`),pubArgs),
  rows('SELECT * FROM groups'+(all?'':` WHERE id IN (${marks})`),all?[]:g),rows('SELECT * FROM preaching_types'),rows('SELECT * FROM catalogs'),rows('SELECT * FROM campaigns'),rows('SELECT * FROM periods'),
  (can(a,'reports.write')||can(a,'reports.correct'))?rows('SELECT * FROM corrections'+(all?'':` WHERE publisher_id IN (SELECT id FROM publishers${pWhere})`),pubArgs):Promise.resolve([]),
  can(a,'users.write')?rows('SELECT * FROM profiles'):Promise.resolve([]),
  can(a,'users.write')?rows('SELECT * FROM users'):rows(`SELECT id,name FROM users WHERE active=1 AND id IN(SELECT leader_id FROM groups${all?'':` WHERE id IN (${marks})`} UNION SELECT assistant_id FROM groups${all?'':` WHERE id IN (${marks})`})`,all?[]:[...g,...g]),
  (can(a,'reports.write')||can(a,'reports.correct'))?rows('SELECT * FROM issues'+(all?'':` WHERE publisher_id IN (SELECT id FROM publishers${pWhere})`),pubArgs):Promise.resolve([]),
  can(a,'audit')?rows('SELECT * FROM audit ORDER BY at DESC LIMIT 500'):Promise.resolve([]),can(a,'import')?rows('SELECT * FROM imports ORDER BY created_at DESC'):Promise.resolve([])
 ]);
 if(can(a,'users.write')&&us.some(u=>u.credential_state==='error')){
  const failures=await rows("SELECT entity_id,after_json FROM audit WHERE entity='users' AND action=? ORDER BY at DESC LIMIT 500",['Error al preparar acceso']);
  for(const u of us)if(u.credential_state==='error'){const failure=failures.find(f=>f.entity_id===u.id);if(failure)u.access_error=parseJSON<Row>(failure.after_json,{}).message;}
 }
 if(!can(a,'comments.read')){
  const scrub=(value:any):any=>Array.isArray(value)?value.map(scrub):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,key==='comment'?'':scrub(v)])):value;
  for(const r of reps)r.comment='';for(const item of is)item.details=json(scrub(parseJSON(item.details,{})));for(const item of logs){item.before_json=json(scrub(parseJSON(item.before_json,null)));item.after_json=json(scrub(parseJSON(item.after_json,null)));}
 }
 for(const p of pubs)p.preaching_type_id=valueAt(p,'preaching',currentMonth(),hs);
 return {actor:a,publishers:pubs,reports:reps,histories:hs,groups:gs,types,catalogs:cats,campaigns:cs,periods,corrections:requests,profiles:profs,users:us,issues:is,audit:logs,imports:imps};
}
const specs:Record<string,{table:string,permission:string,fields:string[]}>= {
 publisher:{table:'publishers',permission:'publishers.write',fields:['code','names','surnames','full_name','alias','gender','birth_date','baptized','baptism_date','condition','role','status','group_id','preaching_type_id','notes','historical_since']},
 group:{table:'groups',permission:'groups.write',fields:['code','name','leader_id','assistant_id','notes','active','history']},
 type:{table:'preaching_types',permission:'catalogs.write',fields:['name','counts_hours','goal_kind','monthly_goal','annual_goal','monthly_reference','requires_campaign','versions','description','active']},
 catalog:{table:'catalogs',permission:'catalogs.write',fields:['category','name','config','active']},
 campaign:{table:'campaigns',permission:'assignments.write',fields:['name','start_month','end_month','type_id','active','notes']},
 user:{table:'users',permission:'users.write',fields:['email','name','profile_id','groups_json','active','publisher_id']},
 profile:{table:'profiles',permission:'users.write',fields:['name','permissions']}
};
async function transition(a:Row,p:Row,kind:string,value:string,start:string,end:string|null=null,campaign:string|null=null,notes=''){
 if(!validateMonth(start)||end&&(!validateMonth(end)||end<start))throw new ApiError('Revisa los meses de vigencia.');
 const existing=await rows('SELECT * FROM histories WHERE publisher_id=? AND kind=? AND start_month<=? AND COALESCE(end_month,?)>=?',[p.id,kind,end||'9999-12','9999-12',start]);
 const qs:Prepared[]=[];
 for(const h of existing){if(h.start_month===start){return [statement('UPDATE histories SET value=?,end_month=?,campaign_id=?,notes=?,version=version+1 WHERE id=? AND version=?',[value,end,campaign,notes,h.id,h.version]),auditStatement(a,'Corregir vigencia','histories',h.id,h,{...h,value,end_month:end,campaign_id:campaign},notes,true)];}if(h.start_month>start)throw new ApiError('Existe una vigencia que se superpone. Revisa el historial y cierra o corrige ese tramo.');qs.push(statement('UPDATE histories SET end_month=?,version=version+1 WHERE id=? AND version=?',[previousMonth(start),h.id,h.version]));}
 const h={id:uid(),publisher_id:p.id,kind,value,start_month:start,end_month:end,campaign_id:campaign,notes,origin:'manual',unverified:0,created_by:a.id};
 qs.push(statement('INSERT INTO histories(id,publisher_id,kind,value,start_month,end_month,campaign_id,notes,origin,unverified,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)',Object.values(h)));
 qs.push(auditStatement(a,'Asignar vigencia','histories',h.id,existing,h,notes));return qs;
}
async function saveEntity(a:Row,entity:string,input:Row){
 const s=specs[entity];if(!s)throw new ApiError('Entidad desconocida.');requirePermission(a,s.permission);
 const existing=input.id?await one(`SELECT * FROM ${s.table} WHERE id=?`,[input.id]):undefined;
 const id=existing?.id||input.id||uid(),values:Row={};for(const k of s.fields)if(input[k]!==undefined)values[k]=input[k];
 const qs:Prepared[]=[];
 if(entity==='publisher'){
  if(existing)requireScope(a,existing.group_id);if(values.group_id)requireScope(a,values.group_id);
  if(values.preaching_type_id&&values.preaching_type_id!==existing?.preaching_type_id){const type=await one('SELECT * FROM preaching_types WHERE id=?',[values.preaching_type_id]);if(!type)throw new ApiError('Selecciona un tipo de predicación válido.');if(type.requires_campaign)throw new ApiError('Asigna el auxiliar por campaña desde Vigencias, indicando campaña y meses de inicio y fin.');}
  if(!existing){for(const key of ['code','names','surnames','full_name','alias','gender'])if(!String(values[key]||'').trim())throw new ApiError('Completa código, nombres, apellidos, nombre completo, apodo y género.');values.historical_since=input.effective_month||currentMonth();}
  if(values.baptized===0)values.baptism_date=null;
  const start=input.effective_month||currentMonth();
  if(existing)for(const [field,kind] of [['group_id','group'],['status','status'],['role','role'],['preaching_type_id','preaching']])if(values[field]!==undefined&&values[field]!==existing[field])qs.push(...await transition(a,existing,kind,values[field],start,null,null,input.reason||'Cambio en maestro'));
 }
 if(entity==='group')for(const key of ['leader_id','assistant_id'])if(values[key]){const u=await one('SELECT * FROM users WHERE id=? AND active=1',[values[key]]);if(!u)throw new ApiError('Selecciona un responsable con usuario habilitado.');}
 if(entity==='campaign'&&(!validateMonth(values.start_month||existing?.start_month)||!validateMonth(values.end_month||existing?.end_month)||(values.end_month||existing?.end_month)<(values.start_month||existing?.start_month)))throw new ApiError('La campaña necesita un rango mensual válido.');
 if(entity==='user'){
  if(values.email)values.email=String(values.email).toLowerCase().trim();const groupList=parseJSON<string[]>(values.groups_json,[]);if(groupList.some((x:any)=>typeof x!=='string'))throw new ApiError('Grupos inválidos.');
  if(!existing){values.must_change_password=1;values.credential_state='pending';}
  if(existing?.subject&&values.email&&values.email!==existing.email)throw new ApiError('El correo de una cuenta vinculada no se puede sustituir. Crea otro usuario si corresponde.');
  if(existing?.id===a.id&&(values.active===0||values.profile_id&&values.profile_id!=='admin'))throw new ApiError('Conserva tu acceso de administrador mientras administras el sistema.');
 }
 if(entity==='profile'){const ps=parseJSON<string[]>(values.permissions,[]);if(ps.some(p=>!PERMISSIONS.some(([k])=>k===p)))throw new ApiError('Permiso desconocido.');if(id==='admin'&&PERMISSIONS.some(([k])=>!can({permissions:ps},k)))throw new ApiError('El perfil Administrador debe conservar todos los permisos.');}
 if(entity==='type')for(const key of ['monthly_goal','annual_goal','monthly_reference'])if(values[key]!=null&&(typeof values[key]!=='number'||!Number.isFinite(values[key])||values[key]<0))throw new ApiError('Las metas deben ser números no negativos.');
 if(entity==='type'&&!existing)values.versions=json([{since:input.effective_month||currentMonth(),...Object.fromEntries(['counts_hours','goal_kind','monthly_goal','annual_goal','monthly_reference','requires_campaign'].map(k=>[k,values[k]??null]))}]);
 if(entity==='type'&&existing){
  const since=input.effective_month;if(!validateMonth(since))throw new ApiError('Selecciona el mes inicial de esta versión de la meta.');
  const versions=parseJSON<Row[]>(existing.versions,[]).filter(v=>v.since!==since);versions.push({since,...Object.fromEntries(['counts_hours','goal_kind','monthly_goal','annual_goal','monthly_reference','requires_campaign'].map(k=>[k,values[k]??existing[k]]))});values.versions=json(versions);
 }
 if(existing){if(input.version!==existing.version)throw new ApiError('Otro usuario modificó este registro. Actualiza antes de guardar.',409);
  const keys=Object.keys(values);if(!keys.length)return {id};qs.push(statement(`UPDATE ${s.table} SET ${keys.map(k=>`${k}=?`).join(',')},version=version+1 WHERE id=? AND version=?`,[...keys.map(k=>values[k]),id,input.version]));qs.push(auditStatement(a,'Actualizar',s.table,id,existing,{...existing,...values},input.reason||'',true));
 }else{const keys=Object.keys(values);qs.push(statement(`INSERT INTO ${s.table}(id,${keys.join(',')}) VALUES(?,${keys.map(()=>'?').join(',')})`,[id,...keys.map(k=>values[k])]));qs.push(auditStatement(a,'Crear',s.table,id,null,values,input.reason||''));}
 const result=await database().batch(qs);const change=result[qs.length-2]?.meta.changes;if(existing&&!change)throw new ApiError('El registro cambió durante el guardado.',409);return{id};
}
async function saveReport(a:Row,b:Row){
 if(!validateMonth(b.month)||b.month>currentMonth())throw new ApiError('Selecciona un mes válido que no sea futuro.');
 const p=await one('SELECT * FROM publishers WHERE id=?',[b.publisher_id]);if(!p)throw new ApiError('Publicador no encontrado.',404);
 const hs=await rows('SELECT * FROM histories WHERE publisher_id=?',[p.id]);const old=await one('SELECT * FROM reports WHERE publisher_id=? AND month=?',[p.id,b.month]);
 const group=old?.group_id||valueAt(p,'group',b.month,hs);requireScope(a,group);
 const period=await one('SELECT * FROM periods WHERE month=?',[b.month]);if(period?.state==='closed')throw new ApiError('Este período está cerrado. Un perfil autorizado debe reabrirlo.',409);
 if(old&&old.version!==b.version)throw new ApiError('Otro usuario actualizó este informe. Recarga para revisar los cambios.',409);
 const correction=!!old&&(old.state!=='draft'||!can(a,'reports.write')||!!b.resolveQuality);if(!correction)requirePermission(a,'reports.write');if(b.resolveQuality)requirePermission(a,'reports.correct');if(correction){requirePermission(a,'reports.correct');if(!String(b.reason||'').trim())throw new ApiError('Indica el motivo de la corrección.');}
 if(b.submit&&!correction)requirePermission(a,'reports.submit');
 if(b.type_id&&old&&b.type_id!==old.type_id){requirePermission(a,'reports.correct');if(!String(b.reason||'').trim())throw new ApiError('Indica el motivo del cambio de tipo.');}
 const typeId=b.type_id&&can(a,'reports.correct')?b.type_id:old?.type_id||valueAt(p,'preaching',b.month,hs)||'PUB';const t=await one('SELECT * FROM preaching_types WHERE id=?',[typeId]);if(!t)throw new ApiError('Tipo de predicación desconocido.');const counts=old&&typeId===old.type_id?!!old.counts_hours:!!t.counts_hours;
 const value={participation:b.participation??null,hours:b.hours??null,courses:b.courses??null,comment:String(b.comment||'').slice(0,20000)};
 const errs=validateReport(value,counts,!!b.submit||!!correction);if(errs.length)throw new ApiError(errs.join(' '));
 if(old&&parseJSON<string[]>(old.quality,[]).includes('duplicado_conflictivo')&&!can(a,'reports.correct'))throw new ApiError('Este informe tiene un duplicado pendiente de revisión.');
 const id=old?.id||uid(),time=now(),quality=b.resolveQuality?'[]':old?.quality||'[]';
 const data={id,publisher_id:p.id,month:b.month,group_id:group,type_id:typeId,counts_hours:counts?1:0,...value,state:correction?'corrected':b.submit?'submitted':'draft',quality,source:old?.source||'web',updated_by:a.id,updated_at:time,submitted_at:correction||b.submit?time:null};
 const qs=old?[statement('UPDATE reports SET type_id=?,counts_hours=?,participation=?,hours=?,courses=?,comment=?,state=?,quality=?,updated_by=?,updated_at=?,submitted_at=?,version=version+1 WHERE id=? AND version=?',[typeId,counts?1:0,value.participation,value.hours,value.courses,value.comment,data.state,quality,a.id,time,data.submitted_at,id,b.version])]:[statement(`INSERT INTO reports(${Object.keys(data).join(',')}) VALUES(${Object.keys(data).map(()=>'?').join(',')})`,Object.values(data))];
 qs.push(auditStatement(a,correction?'Corregir informe':b.submit?'Enviar informe':'Guardar borrador','reports',id,old,data,b.reason||'',!!old));const result=await database().batch(qs);if(!result[0].meta.changes)throw new ApiError('Conflicto de versión. Recarga el informe.',409);return {id};
}
async function mutation(a:Row,b:Row){
 if(b.action==='save')return saveEntity(a,b.entity,b.data);
 if(b.action==='report')return saveReport(a,b.data);
 if(b.action==='assignment'){
  requirePermission(a,'assignments.write');const h=b.data,p=await one('SELECT * FROM publishers WHERE id=?',[h.publisher_id]);if(!p)throw new ApiError('Publicador no encontrado.');requireScope(a,p.group_id);
  if(!['group','role','status','preaching'].includes(h.kind))throw new ApiError('Vigencia desconocida.');
  if(h.kind==='group')requireScope(a,h.value);
  if(h.kind==='preaching'){const t=await one('SELECT * FROM preaching_types WHERE id=?',[h.value]);if(!t?.active)throw new ApiError('Selecciona un tipo vigente.');if(t.requires_campaign){const c=await one('SELECT * FROM campaigns WHERE id=? AND active=1',[h.campaign_id]);if(!c||c.type_id!==h.value||h.start_month<c.start_month||!h.end_month||h.end_month>c.end_month)throw new ApiError('La asignación debe estar dentro de una campaña habilitada.');}}
  const qs=await transition(a,p,h.kind,h.value,h.start_month,h.end_month||null,h.campaign_id||null,h.notes||'');const field={group:'group_id',role:'role',status:'status',preaching:'preaching_type_id'}[h.kind as string];if(h.start_month<=currentMonth()&&(!h.end_month||h.end_month>=currentMonth()))qs.push(statement(`UPDATE publishers SET ${field}=?,version=version+1 WHERE id=?`,[h.value,p.id]));const result=await database().batch(qs);if(!result[0].meta.changes)throw new ApiError('La vigencia cambió mientras guardabas. Actualiza antes de continuar.',409);return{};
 }
 if(b.action==='closeHistory'){
  requirePermission(a,'assignments.write');const h=await one('SELECT * FROM histories WHERE id=?',[b.id]);if(!h)throw new ApiError('Vigencia no encontrada.');const p=await one('SELECT * FROM publishers WHERE id=?',[h.publisher_id]);requireScope(a,p!.group_id);if(!validateMonth(b.end_month)||b.end_month<h.start_month)throw new ApiError('El último mes debe ser igual o posterior al inicial.');const qs=[statement('UPDATE histories SET end_month=?,version=version+1 WHERE id=? AND version=?',[b.end_month,h.id,b.version]),auditStatement(a,'Cerrar vigencia','histories',h.id,h,{...h,end_month:b.end_month},b.reason||'',true)];await database().batch(qs);return{};
 }
 if(b.action==='period'){
  requirePermission(a,'periods.write');requirePermission(a,'groups.all');if(!validateMonth(b.month)||!['open','closed'].includes(b.state)||!String(b.reason||'').trim())throw new ApiError('Indica período, estado y motivo.');const old=await one('SELECT * FROM periods WHERE month=?',[b.month]);if(old&&old.version!==b.version)throw new ApiError('El período fue modificado.',409);await database().batch([statement('INSERT INTO periods(month,state,notes) VALUES(?,?,?) ON CONFLICT(month) DO UPDATE SET state=excluded.state,notes=excluded.notes,version=periods.version+1',[b.month,b.state,b.reason]),auditStatement(a,b.state==='closed'?'Cerrar período':'Reabrir período','periods',b.month,old,b,b.reason)]);return{};
 }
 if(b.action==='correction'){
  requirePermission(a,'reports.write');const r=await one('SELECT * FROM reports WHERE id=?',[b.data.report_id]);if(!r)throw new ApiError('Informe no encontrado.');requireScope(a,r.group_id);if(!String(b.data.message||'').trim())throw new ApiError('Describe la corrección solicitada.');const d={id:uid(),publisher_id:r.publisher_id,report_id:r.id,month:r.month,field:b.data.field||'Informe',message:b.data.message,state:'pending',created_by:a.id,created_at:now()};await database().batch([statement(`INSERT INTO corrections(${Object.keys(d).join(',')}) VALUES(${Object.keys(d).map(()=>'?').join(',')})`,Object.values(d)),auditStatement(a,'Solicitar corrección','corrections',d.id,null,d)]);return{};
 }
 if(b.action==='resolve'){
  requirePermission(a,'reports.correct');const table=b.entity==='correction'?'corrections':'issues',old=await one(`SELECT * FROM ${table} WHERE id=?`,[b.id]);if(!old)throw new ApiError('Incidencia no encontrada.');if(old.publisher_id){const p=await one('SELECT * FROM publishers WHERE id=?',[old.publisher_id]);requireScope(a,p!.group_id);}if(!String(b.reason||'').trim())throw new ApiError('Indica la solución aplicada.');await database().batch([statement(`UPDATE ${table} SET state='resolved',resolved_by=?,resolved_at=?,version=version+1 WHERE id=? AND version=?`,[a.id,now(),old.id,b.version]),auditStatement(a,'Resolver revisión',table,old.id,old,{state:'resolved'},b.reason,true)]);return{};
 }
 if(b.action==='export'){
  requirePermission(a,b.ids.length>1?'pdf.bulk':'pdf.single');const data=await state(a);if(b.ids.some((id:string)=>!data.publishers.some(p=>p.id===id)))throw new ApiError('La selección contiene personas fuera de tu ámbito.',403);await auditStatement(a,'Exportar S-21','export',uid(),null,{ids:b.ids,years:b.years,cutoff:b.cutoff}).run();return{data};
 }
 if(b.action==='backup'){requirePermission(a,'backup');return{backup:await state(a),format:'s21-monterrico-v1',createdAt:now()};}
 throw new ApiError('Operación no reconocida.');
}

const importFields:Record<string,string[]>={groups:['id',...specs.group.fields],publishers:['id',...specs.publisher.fields],reports:['id','publisher_id','month','group_id','type_id','counts_hours','participation','hours','courses','comment','state','quality','source','updated_by','updated_at','submitted_at'],histories:['id','publisher_id','kind','value','start_month','end_month','campaign_id','notes','origin','unverified','created_by'],issues:['id','publisher_id','month','kind','message','details','state']};
async function importChunk(a:Row,b:Row){
 requirePermission(a,'import');requirePermission(a,'groups.all');if(b.action==='start'){const id=uid();await database().batch([statement('INSERT INTO imports(id,filename,created_at,created_by,summary) VALUES(?,?,?,?,?)',[id,b.filename,now(),a.id,json({...b.summary,state:'loading'})]),auditStatement(a,'Iniciar importación','imports',id,null,b.summary)]);return{id};}
 const job=await one('SELECT * FROM imports WHERE id=?',[b.job]);if(!job)throw new ApiError('Importación no encontrada.');
 if(b.action==='finish'){const summary={...parseJSON(job.summary,{}),state:'completed'};await database().batch([statement('UPDATE imports SET summary=? WHERE id=?',[json(summary),b.job]),auditStatement(a,'Finalizar importación','imports',b.job,null,summary)]);return{};}
 const fields=importFields[b.entity];if(!fields||!Array.isArray(b.rows)||b.rows.length>25)throw new ApiError('Lote de importación inválido.');
 const qs=[];for(const input of b.rows){const row={...input};if(b.entity==='publishers'){requireScope(a,row.group_id);if(!row.id||!row.code||!row.alias||!row.full_name)throw new ApiError('Publicador incompleto.');}
  if(b.entity==='reports'){if(!validateMonth(row.month)||!['draft','submitted','corrected'].includes(row.state))throw new ApiError('Informe inválido.');requireScope(a,row.group_id);row.updated_by=a.id;row.updated_at=now();}
  if(b.entity==='histories'){if(!validateMonth(row.start_month)||row.end_month&&(!validateMonth(row.end_month)||row.end_month<row.start_month))throw new ApiError('Vigencia inválida.');row.created_by=a.id;}
  if(b.entity==='issues')row.state='pending';
  const updating=fields.filter(k=>k!=='id');qs.push(statement(`INSERT INTO ${b.entity}(${fields.join(',')}) VALUES(${fields.map(()=>'?').join(',')}) ON CONFLICT(${b.entity==='reports'?'publisher_id,month':b.entity==='publishers'?'code':'id'}) DO UPDATE SET ${updating.map(k=>`${k}=excluded.${k}`).join(',')}${b.entity==='issues'?'':',version='+b.entity+'.version+1'}`,fields.map(k=>row[k]??null)));
 }
 qs.push(auditStatement(a,'Importar lote',b.entity,b.job,null,{count:b.rows.length,mode:'upsert'}));await database().batch(qs);return{count:b.rows.length};
}

return {actor,state,mutation,importChunk,defaults,one,rows,statement};
}

