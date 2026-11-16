import {useState} from 'react';
import {Check,CircleAlert,Eye,EyeOff,LoaderCircle,LockKeyhole,LogOut} from 'lucide-react';
import {passwordChecks,SPECIAL_CHARACTER_EXAMPLES,validateNewPassword} from '../lib/password-policy';
import {apiRequest,supabase,baseUrl} from './api';

export function ChangePassword({email,onChanged}:{email:string,onChanged:(password:string)=>Promise<void>}){
 const[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[touched,setTouched]=useState(false);
 const checks=passwordChecks(password),match=!!confirmation&&password===confirmation,valid=!validateNewPassword(password,confirmation),missing=checks.filter(c=>!c.valid).length+(match?0:1);
 const edit=(value:string,repeat=false)=>{(repeat?setConfirmation:setPassword)(value);setTouched(true);setError('');};
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();setTouched(true);const problem=validateNewPassword(password,confirmation);if(problem){setError(problem);return;}
  setBusy(true);setError('');try{await apiRequest('password-change',{password,confirmation});const next=password;setPassword('');setConfirmation('');await onChanged(next);}catch(e:any){setError(e.message);}finally{setBusy(false);}
 };
 return <main className="password-page"><form className="password-card" onSubmit={submit}>
  <img src={`${baseUrl}favicon.svg`} alt="S-21 Monterrico" width="54"/>
  <span className="eyebrow">PRIMER INGRESO O RESTABLECIMIENTO</span><h1>Crea tu nueva contraseña</h1><p>Debes cambiar la contraseña inicial antes de acceder a los datos de S-21.</p><small className="password-email">{email}</small>
  <label className="field"><span>Nueva contraseña</span><div className="auth-input"><LockKeyhole size={17}/><input type={show?'text':'password'} autoComplete="new-password" minLength={6} maxLength={128} required value={password} aria-describedby="password-requirements password-special" onChange={e=>edit(e.target.value)}/><button type="button" aria-label={show?'Ocultar contraseñas':'Mostrar contraseñas'} onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
  <label className="field"><span>Repite la nueva contraseña</span><div className="auth-input"><LockKeyhole size={17}/><input type={show?'text':'password'} autoComplete="new-password" minLength={6} maxLength={128} required value={confirmation} aria-describedby="password-match" aria-invalid={touched&&!!confirmation&&!match} onChange={e=>edit(e.target.value,true)}/></div></label>
  <ul id="password-requirements" className="password-checks" aria-label="Condiciones de la contraseña">{checks.map(c=><li key={c.id} className={c.valid?'valid':touched?'missing':''}>{c.valid?<Check size={15}/>:<CircleAlert size={15}/>}<span>{c.valid?'Cumple: ':touched?'Falta: ':''}{c.valid||touched?c.label.charAt(0).toLowerCase()+c.label.slice(1):c.label}</span></li>)}<li id="password-match" className={match?'valid':touched?'missing':''}>{match?<Check size={15}/>:<CircleAlert size={15}/>}<span>{match?'Cumple: las dos contraseñas coinciden':touched?!confirmation?'Falta: repetir la nueva contraseña':'Las dos contraseñas no coinciden':'Repite la contraseña para confirmarla'}</span></li></ul>
  <p id="password-special" className="password-special">Un carácter especial es un símbolo, por ejemplo: <strong>{SPECIAL_CHARACTER_EXAMPLES}</strong>. Los espacios no cuentan.</p>
  {touched&&<p className={`password-feedback ${valid?'valid':'missing'}`} role="status" aria-live="polite">{valid?'La contraseña cumple todos los requisitos. Ya puedes guardarla.':`Falta${missing===1?'':'n'} ${missing} requisito${missing===1?'':'s'}. Revisa los puntos marcados.`}</p>}
  {error&&<p className="auth-error" role="alert">{error}</p>}<button className="button primary auth-submit" disabled={!valid||busy}>{busy?<LoaderCircle className="spin" size={17}/>:<LockKeyhole size={17}/>} Guardar nueva contraseña</button><button className="button password-exit" type="button" disabled={busy} onClick={()=>supabase.auth.signOut({scope:'local'})}><LogOut size={15}/> Salir</button>
 </form></main>;
}
