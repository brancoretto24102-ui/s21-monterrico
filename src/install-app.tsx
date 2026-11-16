import {useEffect,useState} from 'react';
import {Download,Smartphone} from 'lucide-react';
type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
let availablePrompt:InstallPrompt|null=null;
const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;
export function registerMobileApp(){
 if(import.meta.env.PROD&&'serviceWorker' in navigator)window.addEventListener('load',()=>{
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`,{scope:import.meta.env.BASE_URL,updateViaCache:'none'}).catch(()=>{});
 });
}
export function InstallApp(){
 const[prompt,setPrompt]=useState<InstallPrompt|null>(availablePrompt),[installed,setInstalled]=useState(standalone),[help,setHelp]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{
  const ready=(event:Event)=>{event.preventDefault();availablePrompt=event as InstallPrompt;setPrompt(availablePrompt);};
  const done=()=>{availablePrompt=null;setInstalled(true);setPrompt(null);setHelp(false);};
  window.addEventListener('beforeinstallprompt',ready);window.addEventListener('appinstalled',done);
  return()=>{window.removeEventListener('beforeinstallprompt',ready);window.removeEventListener('appinstalled',done);};
 },[]);
 if(installed)return null;
 const install=async()=>{
  if(!prompt){setHelp(!help);return;}
  setBusy(true);
  try{await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome==='accepted')setInstalled(true);}
  catch{setHelp(true);}
  finally{availablePrompt=null;setPrompt(null);setBusy(false);}
 };
 return <div className="install-app"><button type="button" className="button install-button" aria-label="Instalar S-21 Monterrico en el móvil" title="Instalar en el móvil" onClick={install} disabled={busy} aria-expanded={help}><Smartphone size={17}/><span>{busy?'Preparando…':'Instalar en el móvil'}</span><Download size={15}/></button>{help&&<div className="install-help" role="status"><strong>Instala S-21 Monterrico</strong><p>Android: abre el menú del navegador y elige «Instalar aplicación» o «Añadir a pantalla de inicio».</p><p>iPhone: abre Compartir en Safari y elige «Añadir a pantalla de inicio».</p><p>Si aparece «No se puede instalar», actualiza la página y vuelve a intentarlo desde Chrome actualizado.</p><small>Necesitas internet para trabajar con los informes.</small></div>}</div>;
}
