import type {createService} from './service.ts';
import type {Row} from './domain.ts';
import {validateNewPassword} from './password-policy.ts';

export const TEMP_PASSWORD='1234567890';
type Service=ReturnType<typeof createService>;
export type CredentialRun=<T>(fn:(service:Service)=>Promise<T>)=>Promise<T>;
export type AuthAdmin={create:(email:string,password:string)=>Promise<string>;update:(id:string,password:string)=>Promise<void>};
const fail=(message:string,status=400,code='CREDENTIAL_ERROR')=>Object.assign(new Error(message),{status,code});
export function createCredentialService(run:CredentialRun,auth:AuthAdmin,clock=()=>new Date().toISOString()){
 async function status(){return run(async s=>{const a=await s.actor(true);return {id:a.id,name:a.name,email:a.email,must_change_password:!!a.must_change_password,credential_state:a.credential_state||'ready',can_change_password:a.credential_state==='ready'||a.credential_state==='error'&&a.credential_operation==='change'};});}
 async function audit(s:Service,actor:Row,target:string,action:string,after:Row){
  await s.statement('INSERT INTO audit(id,at,actor,action,entity,entity_id,after_json,reason) VALUES(?,?,?,?,?,?,?,?)',[crypto.randomUUID(),clock(),actor.id,action,'users',target,JSON.stringify(after),'Administración de acceso S-21; sin registrar contraseñas.']).run();
 }
 async function markFailure(id:string,operationId:string){
  // A failed external Auth operation must leave the account gated.
  try{await run(async s=>{await s.actor(true);await s.statement("UPDATE users SET credential_state='error',must_change_password=1,version=version+1 WHERE id=? AND credential_operation_id=?",[id,operationId]).run();});}catch{/* Keep the previous gated state if the caller's session expired. */}
 }
 async function manage(action:'provision'|'reset',id:string,version?:number,automatic=false){
  if(!['provision','reset'].includes(action))throw fail('Operación de acceso inválida.');
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
   if(action==='provision'&&authId&&!u.credential_operation){
    if(u.subject===authId&&u.credential_state==='ready')return {done:true,mustChange:!!u.must_change_password};
    await s.statement("UPDATE users SET subject=?,credential_state='ready',must_change_password=0,version=version+1 WHERE id=? AND version=?",[authId,u.id,u.version]).run();
    await audit(s,a,u.id,'Vincular cuenta existente',{linked:true,must_change_password:false});return {done:true,mustChange:false};
   }
   const operationId=crypto.randomUUID(),since=clock();
   await s.statement('UPDATE users SET must_change_password=1,credential_state=?,credential_operation=?,credential_operation_id=?,password_not_before=?,version=version+1 WHERE id=? AND version=?',[action==='reset'?'resetting':'provisioning',action,operationId,since,u.id,u.version]).run();
   await audit(s,a,u.id,action==='reset'?'Iniciar restablecimiento de contraseña':'Iniciar creación de acceso',{must_change_password:true,operation:action});
   return {done:false,authId,email:u.email,operationId};
  });
  if(op.done)return {must_change_password:op.mustChange,existing_account:true};
  let authId=op.authId as string|undefined;
  try{
   if(authId)await auth.update(authId,TEMP_PASSWORD);else authId=await auth.create(op.email!,TEMP_PASSWORD);
   await run(async s=>{
    const a=await s.actor();if(!a.permissions.includes('users.write'))throw fail('Tu permiso de administración cambió.',403);
    const result=await s.statement("UPDATE users SET subject=?,credential_state='ready',credential_operation=NULL,credential_operation_id=NULL,version=version+1 WHERE id=? AND credential_operation_id=?",[authId,id,op.operationId]).run();
    if(!result.meta.changes)throw fail('Otra operación modificó el acceso. Actualiza y vuelve a intentarlo.',409);
    await audit(s,a,id,action==='reset'?'Restablecer contraseña inicial':'Crear acceso con contraseña inicial',{must_change_password:true});
   });
  }catch(error){await markFailure(id,op.operationId!);throw fail('El usuario está guardado, pero no se pudo completar su acceso. Vuelve a intentar desde Usuarios.',502,'ACCOUNT_PROVISIONING_FAILED');}
  return {must_change_password:true,existing_account:false};
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
  }catch(error){await markFailure(op.id,op.operationId);throw fail('No se pudo guardar la contraseña. Inténtalo de nuevo o contacta al administrador.',502);}
  // Require a fresh password sign-in: other sessions opened with the default cannot inherit access.
  return {requires_relogin:true};
 }
 return {status,manage,change};
}
