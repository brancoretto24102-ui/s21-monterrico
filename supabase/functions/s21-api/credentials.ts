import type {createService} from './service.ts';
import type {Row} from './domain.ts';
import {validateNewPassword} from './password-policy.ts';
import {accessFailure} from './session-auth.ts';

export const TEMP_PASSWORD='1234567890';
type Service=ReturnType<typeof createService>;
export type CredentialRun=<T>(fn:(service:Service)=>Promise<T>)=>Promise<T>;
export type AuthAdmin={create:(email:string,password?:string)=>Promise<string>;update:(id:string,password:string)=>Promise<void>};
const fail=(message:string,status=400,code='CREDENTIAL_ERROR')=>Object.assign(new Error(message),{status,code});
export function createCredentialService(run:CredentialRun,auth:AuthAdmin,clock=()=>new Date().toISOString()){
 async function status(){return run(async s=>{const a=await s.actor(true),external=a.authentication_method==='oauth';return {id:a.id,name:a.name,email:a.email,authentication_method:a.authentication_method,must_change_password:!external&&!!a.must_change_password,credential_state:external?'ready':a.credential_state||'ready',can_change_password:!external&&(a.credential_state==='ready'||a.credential_state==='error'&&a.credential_operation==='change')};});}
 async function audit(s:Service,actor:Row,target:string,action:string,after:Row,before?:Row){
  await s.statement('INSERT INTO audit(id,at,actor,action,entity,entity_id,before_json,after_json,reason) VALUES(?,?,?,?,?,?,?,?,?)',[crypto.randomUUID(),clock(),actor.id,action,'users',target,before?JSON.stringify(before):null,JSON.stringify(after),'Administración de acceso S-21; sin registrar contraseñas.']).run();
 }
 async function remove(id:string,version?:number){return run(async s=>{
  const a=await s.actor();if(!a.permissions.includes('users.write'))throw fail('Tu perfil no permite eliminar cuentas.',403);
  const u=await s.one('SELECT * FROM users WHERE id=?',[id]);if(!u)throw fail('Usuario no encontrado.',404);
  if(u.id===a.id)throw fail('Otro administrador debe eliminar tu cuenta.');
  if(!Number.isInteger(version)||u.version!==version)throw fail('El usuario cambió. Actualiza antes de continuar.',409);
  if(u.active&&u.profile_id==='admin'){
   const administrators=await s.one("SELECT COUNT(*) AS total FROM users WHERE active=1 AND profile_id='admin'");
   if(Number(administrators?.total)<=1)throw fail('Debe quedar al menos un administrador habilitado.');
  }
  const groups=await s.rows('SELECT id,name,leader_id,assistant_id,version FROM groups WHERE leader_id=? OR assistant_id=?',[id,id]);
  for(const group of groups)await s.statement('UPDATE groups SET leader_id=?,assistant_id=?,version=version+1 WHERE id=? AND version=?',[group.leader_id===id?null:group.leader_id,group.assistant_id===id?null:group.assistant_id,group.id,group.version]).run();
  const result=await s.statement('DELETE FROM users WHERE id=? AND version=?',[id,u.version]).run();
  if(result.meta.changes!==1)throw fail('El usuario cambió. Actualiza antes de continuar.',409);
  await audit(s,a,id,'Eliminar cuenta de S-21',{deleted:true,auth_account_preserved:true,reports_preserved:true},{user:u,group_assignments:groups});
  // Auth is shared with S-13. Removing the S-21 authorization revokes every S-21 session.
  return {deleted:true,auth_account_preserved:true};
 });}
 async function markFailure(id:string,operationId:string,problem?:{code:string,message:string}){
  // A failed external Auth operation must leave the account gated.
  try{await run(async s=>{const a=await s.actor(true);const updated=await s.statement("UPDATE users SET credential_state='error',must_change_password=1,version=version+1 WHERE id=? AND credential_operation_id=?",[id,operationId]).run();if(updated.meta.changes&&problem)await audit(s,a,id,'Error al preparar acceso',{code:problem.code,message:problem.message});});}catch{/* Keep the previous gated state if the caller's session expired. */}
 }
 async function manage(action:'provision'|'provision-provider'|'reset',id:string,version?:number,automatic=false){
  if(!['provision','provision-provider','reset'].includes(action))throw fail('Operación de acceso inválida.');
  const provider=action==='provision-provider';
  const op=await run(async s=>{
   const a=await s.actor();if(!a.permissions.includes('users.write'))throw fail('Tu perfil no permite administrar contraseñas.',403);
   const u=await s.one('SELECT * FROM users WHERE id=?',[id]);if(!u)throw fail('Usuario no encontrado.',404);
   if(!u.active)throw fail('Habilita al usuario antes de crear o restablecer su acceso.');
   if(!automatic&&(!Number.isInteger(version)||u.version!==version))throw fail('El usuario cambió. Actualiza antes de continuar.',409);
   if(action==='reset'&&u.id===a.id)throw fail('Otro administrador debe restablecer tu contraseña.');
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email))throw fail('Revisa el correo del usuario.');
   const authUser=await s.one('SELECT id FROM auth.users WHERE lower(email)=lower(?)',[u.email]);
   const authId=u.subject||authUser?.id;
   if(u.subject&&authUser?.id!==u.subject)throw fail('El correo no coincide con la cuenta vinculada.',409);
   // Existing shared accounts keep their personal password when first authorized in S-21.
   if(provider&&authId){
    // Never remove a password-change requirement from an existing password account.
    const mustChange=!!u.must_change_password&&(!!u.subject||!!u.credential_operation);
    await s.statement("UPDATE users SET subject=?,credential_state='ready',must_change_password=?,credential_operation=NULL,credential_operation_id=NULL,version=version+1 WHERE id=? AND version=?",[authId,mustChange?1:0,u.id,u.version]).run();
    await audit(s,a,u.id,'Preparar ingreso con Google o Microsoft',{linked:true,password_preserved:true,must_change_password:mustChange});return {done:true,mustChange,provider:true};
   }
   if(action==='provision'&&authId&&!u.credential_operation){
    if(u.subject===authId&&u.credential_state==='ready')return {done:true,mustChange:!!u.must_change_password};
    await s.statement("UPDATE users SET subject=?,credential_state='ready',must_change_password=0,version=version+1 WHERE id=? AND version=?",[authId,u.id,u.version]).run();
    await audit(s,a,u.id,'Vincular cuenta existente',{linked:true,must_change_password:false});return {done:true,mustChange:false};
   }
   const operationId=crypto.randomUUID(),since=clock();
   await s.statement('UPDATE users SET must_change_password=1,credential_state=?,credential_operation=?,credential_operation_id=?,password_not_before=?,version=version+1 WHERE id=? AND version=?',[action==='reset'?'resetting':'provisioning',action==='reset'?'reset':'provision',operationId,since,u.id,u.version]).run();
   await audit(s,a,u.id,action==='reset'?'Iniciar restablecimiento de contraseña':'Iniciar creación de acceso',{must_change_password:true,operation:action});
   return {done:false,authId,email:u.email,operationId};
  });
  if(op.done)return {must_change_password:op.mustChange,existing_account:true,provider_access:provider};
  let authId=op.authId as string|undefined;
  try{
   if(provider)authId=await auth.create(op.email!);else if(authId)await auth.update(authId,TEMP_PASSWORD);else authId=await auth.create(op.email!,TEMP_PASSWORD);
   await run(async s=>{
    const a=await s.actor();if(!a.permissions.includes('users.write'))throw fail('Tu permiso de administración cambió.',403);
    const result=await s.statement("UPDATE users SET subject=?,credential_state='ready',must_change_password=?,credential_operation=NULL,credential_operation_id=NULL,version=version+1 WHERE id=? AND credential_operation_id=? AND email=?",[authId,provider?0:1,id,op.operationId,op.email]).run();
    if(!result.meta.changes)throw fail('Otra operación modificó el acceso. Actualiza y vuelve a intentarlo.',409);
    await audit(s,a,id,provider?'Crear acceso con Google o Microsoft':action==='reset'?'Restablecer contraseña inicial':'Crear acceso con contraseña inicial',{must_change_password:!provider,provider_access:provider});
   });
  }catch(error){const problem=accessFailure(error);await markFailure(id,op.operationId!,problem);throw fail(problem.message,502,problem.code);}
  return {must_change_password:!provider,existing_account:false,provider_access:provider};
 }
 async function change(password:unknown,confirmation:unknown){
  const error=validateNewPassword(password,confirmation);if(error)throw fail(error);
  const op=await run(async s=>{
   const a=await s.actor(true);if(!a.must_change_password)throw fail('Tu contraseña ya fue actualizada. Vuelve a iniciar sesión.',409);
   if(!a.subject)throw fail('El administrador debe completar la creación de tu acceso.',409);
   if(!['ready','error'].includes(a.credential_state)||a.credential_state==='error'&&a.credential_operation!=='change')throw fail('El acceso todavía está en preparación. Contacta al administrador.',409);
   const operationId=crypto.randomUUID();
   await s.statement("UPDATE users SET credential_state='changing',credential_operation='change',credential_operation_id=?,version=version+1 WHERE id=? AND version=?",[operationId,a.id,a.version]).run();
   return {id:a.id,authId:a.subject,operationId};
  });
  try{
   await auth.update(op.authId,password as string);
   await run(async s=>{
    const a=await s.actor(true),since=clock();
    const r=await s.statement("UPDATE users SET must_change_password=0,credential_state='ready',password_not_before=?,credential_operation=NULL,credential_operation_id=NULL,version=version+1 WHERE id=? AND credential_operation_id=?",[since,op.id,op.operationId]).run();
    if(!r.meta.changes)throw fail('El acceso fue restablecido mientras cambiabas la contraseña. Inicia sesión de nuevo.',409);
    await audit(s,a,op.id,'Completar cambio obligatorio de contraseña',{must_change_password:false,previous_sessions_blocked:true});
   });
  }catch(error){const problem=accessFailure(error,true);await markFailure(op.id,op.operationId,problem);throw fail(problem.message,502,problem.code);}
  // Require a fresh password sign-in: other sessions opened with the default cannot inherit access.
  return {requires_relogin:true};
 }
 return {status,manage,change,remove};
}
