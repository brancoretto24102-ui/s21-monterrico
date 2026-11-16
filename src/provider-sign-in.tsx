import {useEffect,useState} from 'react';
import {LoaderCircle} from 'lucide-react';
import type {LoginProvider} from '../lib/oauth';
import {getLoginProviders,startProviderLogin} from './oauth';

export function useLoginProviders(){
 const [providers,setProviders]=useState({google:false,azure:false}),[checking,setChecking]=useState(true),[unavailable,setUnavailable]=useState(false);
 useEffect(()=>{const controller=new AbortController();getLoginProviders(controller.signal).then(result=>{setProviders(result);setUnavailable(false);}).catch(()=>{if(!controller.signal.aborted)setUnavailable(true);}).finally(()=>{if(!controller.signal.aborted)setChecking(false);});return()=>controller.abort();},[]);
 return {providers,checking,unavailable};
}
export function ProviderSignIn({disabled,onError}:{disabled:boolean,onError:(message:string)=>void}){
 const {providers,checking,unavailable}=useLoginProviders(),[working,setWorking]=useState<LoginProvider|null>(null);
 const start=async(provider:LoginProvider)=>{setWorking(provider);onError('');try{await startProviderLogin(provider);}catch(error:any){onError(error.message);}finally{setWorking(null);}};
 return <div className="provider-sign-in">
  {(['google','azure'] as const).map(provider=><div className="provider-option" key={provider}><button className="button provider-button" type="button" disabled={disabled||checking||!!working||!providers[provider]} onClick={()=>start(provider)} aria-describedby={`provider-${provider}-status`}>
   {working===provider?<LoaderCircle size={18} className="spin"/>:provider==='google'?<span className="provider-mark google-mark" aria-hidden="true">G</span>:<span className="provider-mark microsoft-mark" aria-hidden="true"><i/><i/><i/><i/></span>}
   Continuar con {provider==='google'?'Google':'Microsoft'}
  </button><small id={`provider-${provider}-status`}>{checking?'Comprobando disponibilidad…':unavailable?'No se pudo comprobar su disponibilidad':providers[provider]?provider==='azure'?'Outlook, Hotmail y Microsoft 365':'Gmail y Google Workspace':'Pendiente de habilitar por el administrador'}</small></div>)}
  <p className="provider-help">Utiliza el mismo correo que el administrador autorizó para S-21. La contraseña se administra en Google o Microsoft.</p><div className="auth-divider"><span>o ingresa con contraseña del aplicativo</span></div>
 </div>;
}
export function ProviderAvailability(){
 const {providers,checking,unavailable}=useLoginProviders();
 return <div className="notice provider-availability"><div><strong>Ingreso con Google y Microsoft</strong><p>{checking?'Comprobando proveedores…':unavailable?'No se pudo consultar su disponibilidad. Actualiza la página para reintentar.':`Google: ${providers.google?'habilitado':'pendiente de configurar'}. Microsoft: ${providers.azure?'habilitado':'pendiente de configurar'}.`}</p><p>«Preparar Google / Microsoft» crea o vincula la cuenta sin contraseña inicial. El ingreso estará disponible cuando se habilite el proveedor correspondiente.</p></div></div>;
}
