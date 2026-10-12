import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';

const base = new URL(process.argv[2] || 'http://127.0.0.1:3000/');
if (!['127.0.0.1','localhost','[::1]'].includes(base.hostname)) throw new Error('Only local smoke tests are allowed');
const get = pathname => new Promise((resolve,reject) => {
  const url=new URL(pathname,base);
  if(url.origin!==base.origin) return reject(new Error('External requests are not allowed'));
  const transport=url.protocol==='https:'?https:http;
  const req=transport.get(url,r=>{
    const chunks=[];
    r.on('data',c=>chunks.push(c));
    r.on('end',()=>resolve({status:r.statusCode,headers:r.headers,bytes:Buffer.concat(chunks)}));
  });
  req.setTimeout(15000,()=>req.destroy(new Error('Timeout')));
  req.on('error',reject);
});

for(const route of ['/','/privacy','/legal']) {
  const r=await get(route), html=r.bytes.toString('utf8');
  if(r.status!==200 || html.length<500) throw new Error(`Page failed: ${route}`);
  const assets=[...new Set([...html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css|png|woff2))"/g)]
    .map(m=>m[1]).filter(x=>x.startsWith('/')))];
  for(const asset of assets) {
    if((await get(asset)).status!==200) throw new Error(`Asset failed: ${asset}`);
  }
  if(route==='/privacy' && !html.includes('/documents/privacy-policy-2026.pdf')) throw new Error('Missing policy link');
  console.log(JSON.stringify({route,status:r.status,assetsChecked:assets.length}));
}
const pdf=await get('/documents/privacy-policy-2026.pdf');
if(pdf.status!==200 || !pdf.headers['content-type']?.startsWith('application/pdf') ||
  crypto.createHash('sha256').update(pdf.bytes).digest('hex')!==
  '2a9ea19c41cfbfe29098118ac4ee81b86e99f01dc02bd32e14ffd35995e23271') throw new Error('PDF bytes or MIME mismatch');
console.log(JSON.stringify({ok:true,pdfUnchanged:true,pdfContentType:pdf.headers['content-type'],writesAttempted:0}));
