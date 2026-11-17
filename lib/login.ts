/** The reserved guest identifier uses the existing Monterrico Auth account. No password is stored here. */
export const GUEST_LOGIN_EMAIL='invitado@monterrico.invalid';
export function resolveLoginEmail(value:string){
 const clean=value.trim().toLowerCase();
 return clean==='invitado'?GUEST_LOGIN_EMAIL:clean;
}
