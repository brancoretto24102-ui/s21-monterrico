import postgres from 'npm:postgres@3.4.8';
import {createDatabase} from './database.ts';
import {createService} from './service.ts';

const sql=postgres(Deno.env.get('SUPABASE_DB_URL')!,{prepare:false,max:2,idle_timeout:20,connect_timeout:10});
const url=Deno.env.get('SUPABASE_URL')!;
const apikey=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default||Deno.env.get('SUPABASE_ANON_KEY')!;
const allowed=new Set(['https://brancoretto24102-ui.github.io','http://localhost:5173','http://127.0.0.1:5173','http://127.0.0.1:4173']);

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
  const path=new URL(req.url).pathname.split('/').filter(Boolean).at(-1);
  if(!['state','mutate','import','template'].includes(path||''))return reply({error:'Recurso no encontrado.'},404);
  if((['state','template'].includes(path!)&&req.method!=='GET')||(['mutate','import'].includes(path!)&&req.method!=='POST'))return reply({error:'Método no permitido.'},405);
  const text=req.method==='POST'?await req.text():'';
  if(text.length>2_000_000)return reply({error:'El lote supera el tamaño permitido.'},413);
  const body=text?JSON.parse(text):{};
  const result=await sql.begin(async tx=>{
   // Serialize writes before reading versions, periods, profiles and historical scope.
   // No request-local identity is stored on the shared connection pool.
   if(req.method==='POST')await tx`SELECT pg_advisory_xact_lock(hashtextextended('s21:mutation',0))`;
   const db=createDatabase(async(q,args)=>{const r=await tx.unsafe(q,args);return {rows:Array.from(r),count:r.count};});
   const service=createService(db,{userId:user.id,email:user.email,displayName:user.email});
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
  return reply(result);
 }catch(e:any){
  const status=e.status||(['23505','23P01','40001','40P01'].includes(e.code)?409:e.code==='23503'?400:500);
  const message=e.status?e.message:e.code==='23505'?'Ya existe un registro con ese código o mes.':e.code==='23P01'?'Las vigencias mensuales se superponen.':status===409?'Otro usuario modificó los datos. Actualiza antes de continuar.':e.code==='23503'?'Revisa las referencias del registro.':'No se pudo completar la operación. Inténtalo nuevamente.';
  console.error('s21-api',e.code||status); // Never log report bodies, tokens or private connection strings.
  return reply({error:message},status);
 }
});
