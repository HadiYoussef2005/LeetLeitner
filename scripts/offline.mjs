import { readFile, readdir, writeFile } from "node:fs/promises";
const { base } = JSON.parse(
  await readFile(new URL("../hosting.config.json", import.meta.url), "utf8"),
);
const directory = `dist${base.slice(0, -1)}`;
const assets = (await readdir(`${directory}/assets`)).map(
  (f) => `${base}assets/${f}`,
);
const prefix = `leetleitner:${base}:`;
const cache = prefix + Date.now();
await writeFile(
  `${directory}/sw.js`,
  `const CACHE=${JSON.stringify(cache)};
const PREFIX=${JSON.stringify(prefix)};
const BASE=${JSON.stringify(base)};
const ASSETS=${JSON.stringify([base, `${base}index.html`, `${base}icon.svg`, ...assets])};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(BASE))return;
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).catch(()=>caches.open(CACHE).then(c=>c.match(BASE+'index.html'))));
    return;
  }
  e.respondWith(caches.open(CACHE).then(c=>c.match(e.request,{ignoreVary:true})).then(cached=>cached||fetch(e.request)));
});`,
);
