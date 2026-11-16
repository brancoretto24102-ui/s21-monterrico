import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const manifest=JSON.parse(fs.readFileSync('public/manifest.webmanifest','utf8'));
assert.equal(manifest.id,'/s21-monterrico/');assert.equal(manifest.scope,manifest.id);assert.equal(manifest.start_url,manifest.id);assert.equal(manifest.display,'standalone');
for(const n of [192,512]){const icon=manifest.icons.find(i=>i.sizes===`${n}x${n}`&&i.purpose==='any');assert(icon);const bytes=fs.readFileSync('public/'+icon.src);assert.equal(bytes.readUInt32BE(16),n);assert.equal(bytes.readUInt32BE(20),n);}
const listeners={},deleted=[];let requests=0;
const cache={addAll:async files=>assert(files.every(p=>!p.includes('supabase'))),match:async()=>undefined,put:async()=>{}};
const sandbox={URL,self:{location:{href:'https://example.test/s21-monterrico/sw.js'},addEventListener:(name,fn)=>listeners[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},caches:{open:async()=>cache,keys:async()=>['s21-monterrico-static-old','s13-cache','s21-monterrico-static-v1'],delete:async name=>deleted.push(name),match:async()=>({offline:true})},fetch:async()=>{requests++;return{ok:true,type:'basic',clone:()=>({})};}};
vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'),sandbox);
let done;listeners.install({waitUntil:p=>done=p});await done;listeners.activate({waitUntil:p=>done=p});await done;assert.deepEqual(deleted,['s21-monterrico-static-old']);
const request=(url,method='GET',authorization=false)=>({url,method,mode:'cors',headers:{has:()=>authorization}});
let response;const dispatch=r=>{response=undefined;listeners.fetch({request:r,respondWith:p=>response=p});};
for(const r of [request('https://private.supabase.co/functions/v1/s21-api/state'),request('https://example.test/s13-territorios/assets/index.js'),request('https://example.test/s21-monterrico/api/data'),request('https://example.test/s21-monterrico/assets/code.js','POST'),request('https://example.test/s21-monterrico/assets/code.js','GET',true)]){dispatch(r);assert.equal(response,undefined);}
dispatch(request('https://example.test/s21-monterrico/assets/code.js'));await response;assert.equal(requests,1);
console.log('PASS: manifiesto, iconos PNG, ámbito S-21 y caché de archivos públicos; API privada excluida.');
