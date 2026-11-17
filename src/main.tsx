import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowRight,Eye,EyeOff,LoaderCircle,LockKeyhole,Mail} from 'lucide-react';
import type {Session} from '@supabase/supabase-js';
import App from './app';
import {InstallApp,registerMobileApp} from './install-app';
import {baseUrl,supabase,apiRequest} from './api';
import {ChangePassword} from './change-password';
import {completeProviderLogin} from './oauth';
import {ProviderSignIn} from './provider-sign-in';
import {createSessionReceiver} from '../lib/session-view';
import {resolveLoginEmail} from '../lib/login';
import './style.css';

function Main(){
 const [session,setSession]=useState<Session|null>(null),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[gate,setGate]=useState('checking'),[gateError,setGateError]=useState(''),[check,setCheck]=useState(0);
 useEffect(()=>{
  let cancelled=false;
  const receive=createSessionReceiver<Session>(setSession,()=>{setGate('checking');setGateError('');});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{if(!cancelled)receive(s);});
  completeProviderLogin().then(async message=>{
   if(cancelled)return;if(message)setError(message);
   const {data}=await supabase.auth.getSession();if(!cancelled)receive(data.session);
  });
  return()=>{cancelled=true;subscription.unsubscribe();};
 },[]);
 useEffect(()=>{if(!session)return;let cancelled=false;setGate('checking');setGateError('');apiRequest('auth-status').then(result=>{if(!cancelled)setGate(result.must_change_password?(result.can_change_password?'change':'pending'):'ready');}).catch((e:any)=>{if(!cancelled){setGateError(e.message);setGate('error');}});return()=>{cancelled=true;};},[session?.user.id,check]);
 useEffect(()=>{const required=()=>{setGate('checking');setCheck(n=>n+1);};const expired=()=>{setError('Tu acceso fue actualizado o la sesión venció. Inicia sesión nuevamente.');supabase.auth.signOut({scope:'local'});};window.addEventListener('s21-password-required',required);window.addEventListener('s21-session-expired',expired);return()=>{window.removeEventListener('s21-password-required',required);window.removeEventListener('s21-session-expired',expired);};},[]);
 const finishChange=async(password:string)=>{const loginEmail=session?.user.email;await supabase.auth.signOut({scope:'local'});if(!loginEmail)return;const {error}=await supabase.auth.signInWithPassword({email:loginEmail,password});if(error)setError('La contraseña fue actualizada. Inicia sesión con tu nueva contraseña.');};
 if(session){
  if(gate==='ready')return <App key={session.user.id}/>;
  if(gate==='change')return <ChangePassword email={session.user.email||''} onChanged={finishChange}/>;
  return <main className="loading-page"><img src={`${baseUrl}favicon.svg`} width="60" alt="S-21"/><h2>{gate==='checking'?'Verificando tu acceso':gate==='pending'?'Acceso pendiente de completar':'No se pudo verificar el acceso'}</h2>{gate==='checking'?<LoaderCircle className="spin"/>:<><p>{gateError||'El administrador debe completar tu acceso desde Usuarios y perfiles → Crear acceso.'}</p><button className="button" onClick={()=>setCheck(n=>n+1)}>Reintentar</button><button className="button" onClick={()=>supabase.auth.signOut({scope:'local'})}>Cerrar sesión</button></>}</main>;
 }

 const login=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{const {error}=await supabase.auth.signInWithPassword({email:resolveLoginEmail(email),password});if(error)throw error;setPassword('');}catch{setError('No se pudo iniciar sesión. Revisa tu correo o usuario y contraseña.');}finally{setBusy(false);}};
 return <main className="auth-page"><section className="auth-story"><a className="auth-brand" href={baseUrl}><img src={`${baseUrl}favicon.svg`} alt=""/><span>S-21 <small>MONTERRICO</small></span></a><div className="auth-story-text"><span className="eyebrow">CADA INFORME, EN SU LUGAR</span><h1>Una congregación. <br/>Un espacio para <br/><em>seguir avanzando.</em></h1><p>Publicadores, grupos e informes mensuales.<br/>La información que necesitas, siempre a mano.</p><div className="auth-visual" aria-hidden="true"><div className="auth-mini"><span>Participación mensual</span><div className="auth-bars">{[38,54,45,65,73,61,82,94].map((n,i)=><i key={i} style={{height:n}}/>)}</div><small>Organización · Seguimiento · Colaboración</small></div></div></div><small className="auth-foot">Gestión de publicadores e informes S-21</small></section><section className="auth-form-side"><form className="auth-form" onSubmit={login}><div className="auth-lock"><LockKeyhole size={23}/></div><span className="eyebrow">BIENVENIDO A TU ESPACIO</span><h2>Inicia sesión</h2><p>Ingresa con tu cuenta autorizada de Monterrico.</p><ProviderSignIn disabled={busy} onError={setError}/><label className="field"><span>Correo electrónico o usuario</span><div className="auth-input"><Mail size={17}/><input type="text" inputMode="email" autoCapitalize="none" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Correo electrónico o invitado" required/></div></label><label className="field"><span>Contraseña</span><div className="auth-input"><LockKeyhole size={17}/><input type={show?'text':'password'} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Tu contraseña" required/><button type="button" onClick={()=>setShow(!show)} aria-label={show?'Ocultar contraseña':'Mostrar contraseña'}>{show?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>{error&&<p className="auth-error" role="alert">{error}</p>}<button className="button primary auth-submit" disabled={busy}>{busy?<LoaderCircle className="spin" size={18}/>:<>Ingresar <ArrowRight size={17}/></>}</button><div className="auth-help"><strong>¿Es tu primer ingreso?</strong><p>Con Google o Microsoft, elige tu cuenta autorizada. Si utilizas contraseña del aplicativo, conserva tu contraseña actual. La clave inicial 1234567890 solo funciona cuando la política del servicio la permite; si tu acceso quedó incompleto, el administrador puede prepararlo para Google o Microsoft.</p></div><div className="auth-private"><LockKeyhole size={13}/><span>Acceso privado a los datos de la congregación.</span></div><InstallApp/></form></section></main>;
}
registerMobileApp();
createRoot(document.getElementById('root')!).render(<Main/>);

