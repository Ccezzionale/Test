/* Isolated installable static preview. Scope /Test/match-center-beta/ only.
 * No push, notifications, sync, Supabase calls or interception of official pages.
 */
const CACHE_NAME = 'eroi-match-center-beta-g12-20261123-v1';
const SHELL = ['./index.html','./manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await cache.addAll(SHELL);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const cacheNames=await caches.keys();
    await Promise.all(cacheNames.filter(name=>name.startsWith('eroi-match-center-beta-')&&name!==CACHE_NAME).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  const scope=new URL(self.registration.scope);
  if(!url.pathname.startsWith(scope.pathname))return;
  if(request.mode==='navigate') {
    event.respondWith((async()=>{
      try{
        const response=await fetch(new Request(request,{cache:'no-store'}));
        if(response.ok) {
          const cache=await caches.open(CACHE_NAME);
          event.waitUntil(cache.put('./index.html',response.clone()).catch(()=>{}));
        }
        return response;
      } catch {
        const cache=await caches.open(CACHE_NAME);
        return await cache.match('./index.html') || Response.error();
      }
    })());
  }
});
