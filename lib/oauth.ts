export type LoginProvider='google'|'azure';
export const OAUTH_STORAGE_KEY='s21-monterrico-oauth';
export const OAUTH_FLOW_KEY=OAUTH_STORAGE_KEY+'-active-code-verifier';
type BrowserStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;

/** Keep sessions in memory. Only short-lived PKCE verifiers survive the provider redirect. */
export function createOAuthStorage(persistent:()=>BrowserStorage,clock=()=>Date.now()){
 const memory=new Map<string,string>();
 const verifier=(key:string)=>key.startsWith(OAUTH_STORAGE_KEY+'-')&&key.endsWith('-code-verifier');
 return {
  getItem(key:string){
   if(!verifier(key))return memory.get(key)??null;
   try{const raw=persistent().getItem(key);if(!raw)return null;const entry=JSON.parse(raw);if(typeof entry.value!=='string'||typeof entry.until!=='number'||entry.until<clock()){persistent().removeItem(key);return null;}return entry.value;}catch{return null;}
  },
  setItem(key:string,value:string){
   if(!verifier(key)){memory.set(key,value);return;}
   try{persistent().setItem(key,JSON.stringify({value,until:clock()+10*60*1000}));}catch{throw new Error('Permite el almacenamiento de esta pestaña para continuar con Google o Microsoft.');}
  },
  removeItem(key:string){memory.delete(key);if(verifier(key))try{persistent().removeItem(key);}catch{/* No persistent session is stored here. */}},
  clearSession(){memory.clear();}
 };
}
export function providerOptions(provider:LoginProvider,origin:string,base:string){
 const redirect=new URL(base,origin);if(redirect.origin!==new URL(origin).origin)throw new Error('Destino de ingreso inválido.');
 redirect.search='';redirect.hash='';
 return {provider,options:{redirectTo:redirect.href,scopes:provider==='azure'?'email':'openid email profile',queryParams:{prompt:'select_account'}}};
}
export function parseOAuthReturn(href:string){
 const url=new URL(href),params=url.searchParams,fragment=new URLSearchParams(url.hash.slice(1));
 if(!['code','error','error_description','error_code'].some(key=>params.has(key)||fragment.has(key))&&!fragment.has('access_token')&&!fragment.has('refresh_token'))return null;
 const result={code:params.get('code'),flowId:params.get('sb_flow_id'),error:params.get('error')||params.get('error_code')||fragment.get('error')||fragment.get('error_code')||(fragment.has('access_token')||fragment.has('refresh_token')?'invalid_callback':null),cleanPath:''};
 for(const key of ['code','sb_flow_id','error','error_description','error_code'])params.delete(key);
 result.cleanPath=url.pathname+(url.search||'');return result;
}
export function loginProviders(settings:unknown){
 const external=(settings as {external?:Record<string,unknown>})?.external;
 return {google:external?.google===true,azure:external?.azure===true};
}
