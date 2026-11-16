import fs from 'node:fs';
import path from 'node:path';
const forbidden=/\.(xlsx?|csv|pdf|zip|sqlite|db)$/i;
const secret=/(?:sb_secret_[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|postgres(?:ql)?:\/\/[^\s]+:[^\s]+@)/;
let count=0;
for(const root of ['src','lib','public','dist']){
 if(!fs.existsSync(root))continue;
 function visit(dir){for(const name of fs.readdirSync(dir)){const p=path.join(dir,name);if(fs.statSync(p).isDirectory()){visit(p);continue;}if(forbidden.test(p))throw new Error(`Archivo privado en publicación: ${p}`);if(/\.(json|js|ts|tsx|html|css)$/.test(p)&&secret.test(fs.readFileSync(p,'utf8')))throw new Error(`Posible secreto en publicación: ${p}`);count++;}}
 visit(root);
}
console.log(`Publicación revisada: ${count} archivos; sin insumos privados ni credenciales de servidor.`);
