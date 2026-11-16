/** Call only after Auth has verified this exact JWT and its session_id. */
export function sessionAuthentication(claims:unknown):'password'|'oauth'{
 const amr=(claims as {amr?:unknown})?.amr;
 return Array.isArray(amr)&&amr.some(value=>value&&typeof value==='object'&&value.method==='oauth')?'oauth':'password';
}
export function accessFailure(error:unknown,changingPassword=false){
 const value=error as {code?:string,message?:string};
 if(value?.code==='weak_password'||/Password should be at least/i.test(value?.message||'')){
  const minimum=value.message?.match(/at least (\d+) characters/i)?.[1];
  return {code:'AUTH_PASSWORD_POLICY',message:changingPassword?`El servicio de acceso exige ${minimum?`al menos ${minimum} caracteres y `:''}mayúscula, minúscula, número y símbolo. Ajusta tu contraseña y repítela.`:`El usuario está guardado, pero la contraseña inicial no cumple la política del servicio de acceso${minimum?` (mínimo ${minimum} caracteres)`:''}. Usa «Preparar Google / Microsoft» para crear su acceso sin contraseña inicial.`};
 }
 return {code:changingPassword?'PASSWORD_UPDATE_FAILED':'ACCOUNT_PROVISIONING_FAILED',message:changingPassword?'No se pudo guardar la contraseña. Inténtalo de nuevo o contacta al administrador.':'El usuario está guardado, pero no se pudo completar su acceso. Vuelve a intentar desde Usuarios.'};
}
