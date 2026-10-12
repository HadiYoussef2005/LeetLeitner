import { readdir, writeFile } from "node:fs/promises";
const assets = (await readdir("dist/assets")).map((f) => "/assets/" + f);
const cache = "leetleitner-" + Date.now();
await writeFile(
  "dist/sw.js",
  `const CACHE=${JSON.stringify(cache)};const ASSETS=${JSON.stringify(["/", "/index.html", "/icon.svg", ...assets])};self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('leetleitner-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match('/index.html')));return}e.respondWith(caches.match(e.request,{ignoreVary:true}).then(cached=>cached||fetch(e.request)));});`,
);
