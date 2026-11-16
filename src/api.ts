import {createClient} from '@supabase/supabase-js';
export const supabaseUrl='https://lexohsdrmgunjacocxtx.supabase.co';
export const publishableKey='sb_publishable_rUSsiOnfc8sF6Dy7fQ4Brw_IlPBpBg4';
export const supabase=createClient(supabaseUrl,publishableKey,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}});
export async function apiRequest(path:string,body?:unknown){
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)throw new Error('Inicia sesión para continuar.');
 const r=await fetch(`${supabaseUrl}/functions/v1/s21-api/${path.replace(/^\/api\//,'')}`,{method:body===undefined?'GET':'POST',headers:{apikey:publishableKey,Authorization:`Bearer ${session.access_token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 const result=await r.json();
 if(!r.ok){
  if(r.status===423&&result.code==='PASSWORD_CHANGE_REQUIRED')window.dispatchEvent(new Event('s21-password-required'));
  if(r.status===401)window.dispatchEvent(new Event('s21-session-expired'));
  throw Object.assign(new Error(result.error||result.message||'No se pudo completar la operación.'),{status:r.status,code:result.code});
 }
 return result;
}
export const baseUrl=import.meta.env.BASE_URL;

