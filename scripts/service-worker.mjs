/** Generate a cache restricted to this app's scope and packaged static assets. */
export function serviceWorkerSource(assets, version) {
  return `const PREFIX='gta:'+new URL(self.registration.scope).pathname+':';
const CACHE=PREFIX+${JSON.stringify(version)};
const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()])));
self.addEventListener('message',event=>{if(event.data?.kind==='ACTIVATE')self.skipWaiting()});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request))||(event.request.mode==='navigate'?await cache.match('./index.html'):null)||fetch(event.request)))});
`;
}
