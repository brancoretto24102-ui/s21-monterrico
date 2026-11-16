export function passwordChecks(password:string){return [
 {id:'length',label:'Mínimo 6 caracteres',valid:Array.from(password).length>=6},
 {id:'upper',label:'Una letra mayúscula',valid:/\p{Lu}/u.test(password)},
 {id:'lower',label:'Una letra minúscula',valid:/\p{Ll}/u.test(password)},
 {id:'number',label:'Un número',valid:/[0-9]/.test(password)},
 {id:'special',label:'Un carácter especial',valid:/[^\p{L}\p{N}\s]/u.test(password)}
 ];}
export function validateNewPassword(password:unknown,confirmation:unknown){
 if(typeof password!=='string'||typeof confirmation!=='string')return 'Escribe y repite la nueva contraseña.';
 if(password.length>128)return 'La contraseña no puede superar 128 caracteres.';
 const missing=passwordChecks(password).filter(c=>!c.valid);
 if(missing.length)return 'La contraseña debe cumplir: '+missing.map(c=>c.label.toLowerCase()).join(', ')+'.';
 if(password!==confirmation)return 'Las dos contraseñas deben coincidir.';
 return '';
}
