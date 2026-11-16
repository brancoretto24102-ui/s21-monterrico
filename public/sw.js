const CACHE='s21-monterrico-static-v1';
const base=new URL('./',self.location.href);
const offline=new URL('offline.html',base).href;
const publicFiles=['offline.html','favicon.svg','manifest.webmanifest','icons/app-192.png','icons/app-512.png','icons/maskable-512.png','icons/apple-touch-icon.png'].map(p=>new URL(p,base).href);
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(publicFiles)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('s21-monterrico-static-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==base.origin||!url.pathname.startsWith(base.pathname)||request.headers.has('authorization'))return;
 // Private API requests live on a different origin and never enter this cache.
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).catch(()=>caches.match(offline)));
  return;
 }
 if(!publicFiles.includes(url.href)&&!url.pathname.startsWith(base.pathname+'assets/'))return;
 event.respondWith(caches.open(CACHE).then(async cache=>{
  const existing=await cache.match(request);if(existing)return existing;
  const response=await fetch(request);
  if(response.ok&&response.type==='basic')await cache.put(request,response.clone());
  return response;
 }));
});
