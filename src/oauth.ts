import {createClient} from '@supabase/supabase-js';
import {createOAuthStorage,loginProviders,OAUTH_STORAGE_KEY,OAUTH_FLOW_KEY,parseOAuthReturn,providerOptions,type LoginProvider} from '../lib/oauth';
import {supabase,supabaseUrl,publishableKey,baseUrl} from './api';

const storage=createOAuthStorage(()=>window.sessionStorage);
const oauth=createClient(supabaseUrl,publishableKey,{auth:{flowType:'pkce',storageKey:OAUTH_STORAGE_KEY,storage,persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
export async function getLoginProviders(signal?:AbortSignal){
 const response=await fetch(`${supabaseUrl}/auth/v1/settings`,{headers:{apikey:publishableKey},cache:'no-store',signal});
 if(!response.ok)throw new Error('No se pudo verificar la disponibilidad de Google y Microsoft.');
 return loginProviders(await response.json());
}
export async function startProviderLogin(provider:LoginProvider){
 const providers=await getLoginProviders();
 if(!providers[provider])throw new Error(`${provider==='google'?'Google':'Microsoft'} todavía no está habilitado. Contacta al administrador.`);
 const request=providerOptions(provider,window.location.origin,baseUrl);
 const {data,error}=await oauth.auth.signInWithOAuth({...request,options:{...request.options,skipBrowserRedirect:true}});
 if(error||!data.url||!data.flowId)throw new Error('No se pudo iniciar el ingreso con el proveedor. Inténtalo nuevamente.');
 // Correlate the return in this tab, without widening the exact redirect allowlist.
 storage.setItem(OAUTH_FLOW_KEY,data.flowId);window.location.assign(data.url);
}
let callback:Promise<string|undefined>|undefined;
export function completeProviderLogin(){
 return callback??=finish();
 async function finish(){
  const result=parseOAuthReturn(window.location.href);if(!result)return;
  // Remove authorization codes and provider errors before any other navigation.
  window.history.replaceState(null,'',result.cleanPath);
  if(result.error){storage.removeItem(OAUTH_FLOW_KEY);return result.error==='access_denied'?'El ingreso con Google o Microsoft fue cancelado. Puedes volver a intentarlo.':'El proveedor no pudo completar el ingreso. Inténtalo nuevamente.';}
  if(!result.code)return 'El enlace de ingreso no está completo. Vuelve a elegir Google o Microsoft.';
  try{
   const flowId=result.flowId||storage.getItem(OAUTH_FLOW_KEY);
   if(!flowId)return 'El enlace de ingreso venció o se abrió en otra pestaña. Inicia el ingreso nuevamente desde esta pestaña.';
   const {data,error}=await oauth.auth.exchangeCodeForSession(result.code,{flowId});
   if(error||!data.session)return 'El enlace de ingreso venció o se abrió en otra pestaña. Inicia el ingreso nuevamente desde esta pestaña.';
   const {error:sessionError}=await supabase.auth.setSession({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
   if(sessionError)return 'No se pudo completar la sesión. Vuelve a iniciar el ingreso.';
  }catch{return 'No se pudo completar el ingreso. Revisa tu conexión y vuelve a intentarlo.';}
  finally{storage.clearSession();storage.removeItem(OAUTH_FLOW_KEY);}
 }
}
