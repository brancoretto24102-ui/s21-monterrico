import postgres from 'npm:postgres@3.4.8';
import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
import {createDatabase} from './database.ts';
import {createService,type Identity} from './service.ts';
import {createCredentialService,type CredentialRun} from './credentials.ts';

const sql=postgres(Deno.env.get('SUPABASE_DB_URL')!,{prepare:false,max:2,idle_timeout:20,connect_timeout:10});
const url=Deno.env.get('SUPABASE_URL')!;
const apikey=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default||Deno.env.get('SUPABASE_ANON_KEY')!;
const allowed=new Set(['https://brancoretto24102-ui.github.io','http://localhost:5173','http://127.0.0.1:5173','http://127.0.0.1:4173']);
let adminClient:ReturnType<typeof createClient>|undefined;
function adminAuth(){
 if(!adminClient){const key=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!key)throw Object.assign(new Error('La administración de accesos todavía no está configurada.'),{status:503});adminClient=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});}
 return adminClient.auth.admin;
}

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin');
 const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
 if(origin&&allowed.has(origin))headers['Access-Control-Allow-Origin']=origin;
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!allowed.has(origin))return reply({error:'Origen no autorizado.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 try{
  if(!['GET','POST'].includes(req.method))return reply({error:'Método no permitido.'},405);
  const authorization=req.headers.get('authorization')||'';
  if(!/^Bearer\s+\S+$/.test(authorization))return reply({error:'Inicia sesión para continuar.'},401);
  // Always revalidate with Auth. Neither client claims nor user_metadata grant access.
  const auth=await fetch(`${url}/auth/v1/user`,{headers:{apikey,Authorization:authorization}});
  if(!auth.ok)return reply({error:'La sesión venció. Inicia sesión nuevamente.'},401);
  const user=await auth.json();
  if(!user.id||!user.email||!user.email_confirmed_at||user.is_anonymous)return reply({error:'Se necesita una cuenta de correo verificada.'},403);
  // Auth has verified the JWT. Bind its session to the same verified user and its creation time.
  let sessionId:string;
  try{const payload=authorization.split(' ')[1].split('.')[1].replace(/-/g,'+').replace(/_/g,'/');sessionId=JSON.parse(atob(payload)).session_id;}catch{return reply({error:'La sesión no es válida.'},401);}
  if(typeof sessionId!=='string'||!/^[0-9a-f-]{36}$/i.test(sessionId))return reply({error:'Inicia sesión nuevamente.'},401);
  const sessions=await sql`SELECT created_at FROM auth.sessions WHERE id=${sessionId}::uuid AND user_id=${user.id}::uuid`;
  if(!sessions[0]?.created_at)return reply({error:'La sesión venció. Inicia sesión nuevamente.'},401);
  const identity:Identity={userId:user.id,email:user.email,displayName:user.email,sessionCreatedAt:new Date(sessions[0].created_at).toISOString()};
  const path=new URL(req.url).pathname.split('/').filter(Boolean).at(-1);
  if(!['state','mutate','import','template','auth-status','credentials','password-change'].includes(path||''))return reply({error:'Recurso no encontrado.'},404);
  if((['state','template','auth-status'].includes(path!)&&req.method!=='GET')||(['mutate','import','credentials','password-change'].includes(path!)&&req.method!=='POST'))return reply({error:'Método no permitido.'},405);
  const text=req.method==='POST'?await req.text():'';
  if(text.length>(['credentials','password-change'].includes(path!)?8000:2_000_000))return reply({error:'El lote supera el tamaño permitido.'},413);
  const body=text?JSON.parse(text):{};
  const credentialRun:CredentialRun=async fn=>await sql.begin(async tx=>{
   await tx`SELECT pg_advisory_xact_lock(hashtextextended('s21:mutation',0))`;
   const db=createDatabase(async(q,args)=>{const r=await tx.unsafe(q,args);return {rows:Array.from(r),count:r.count};});
   return await fn(createService(db,identity));
  });
  const credentials=createCredentialService(credentialRun,{
   create:async(email,password)=>{const {data,error}=await adminAuth().createUser({email,password,email_confirm:true});if(error||!data.user?.id)throw new Error('Auth no pudo crear la cuenta.');return data.user.id;},
   update:async(id,password)=>{const {error}=await adminAuth().updateUserById(id,{password});if(error)throw new Error('Auth no pudo actualizar la contraseña.');}
  });
  if(path==='auth-status')return reply(await credentials.status());
  if(path==='password-change')return reply(await credentials.change(body.password,body.confirmation));
  if(path==='credentials')return reply(body.action==='delete'?await credentials.remove(body.id,body.version):await credentials.manage(body.action,body.id,body.version));
  const result=await sql.begin(async tx=>{
   // Serialize writes before reading versions, periods, profiles and historical scope.
   // No request-local identity is stored on the shared connection pool.
   if(req.method==='POST')await tx`SELECT pg_advisory_xact_lock(hashtextextended('s21:mutation',0))`;
   const db=createDatabase(async(q,args)=>{const r=await tx.unsafe(q,args);return {rows:Array.from(r),count:r.count};});
   const service=createService(db,identity);
   const a=await service.actor();
   if(path==='state')return await service.state(a);
   if(path==='mutate')return await service.mutation(a,body);
   if(path==='import')return await service.importChunk(a,body);
   if(!a.permissions.includes('pdf.single'))throw Object.assign(new Error('Tu perfil no permite exportar S-21.'),{status:403});
   const assets=await service.rows("SELECT id,encode(content,'base64') AS base64 FROM assets");
   const result=Object.fromEntries(assets.map(a=>[a.id,a.base64]));
   if(!result.template||!result.regular||!result.bold)throw Object.assign(new Error('La plantilla S-21 no está disponible.'),{status:503});
   return result;
  });
  if(path==='mutate'&&body.action==='save'&&body.entity==='user'){
   const target=await credentialRun(async s=>{const a=await s.actor();if(!a.permissions.includes('users.write'))throw Object.assign(new Error('Tu perfil no permite administrar usuarios.'),{status:403});return await s.one('SELECT id,active FROM users WHERE id=?',[(result as {id:string}).id]);});
   if(target?.active)await credentials.manage('provision',target.id,undefined,true);
  }
  return reply(result);
 }catch(e:any){
  const status=e.status||(['23505','23P01','40001','40P01'].includes(e.code)?409:e.code==='23503'?400:500);
  const message=e.status?e.message:e.code==='23505'?'Ya existe un registro con ese código o mes.':e.code==='23P01'?'Las vigencias mensuales se superponen.':status===409?'Otro usuario modificó los datos. Actualiza antes de continuar.':e.code==='23503'?'Revisa las referencias del registro.':'No se pudo completar la operación. Inténtalo nuevamente.';
  console.error('s21-api',e.code||status); // Never log report bodies, tokens or private connection strings.
  return reply({error:message,code:e.status?e.code:undefined},status);
 }
});

