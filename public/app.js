/* Vehicle Health Check — technician app, manager views and store setup */
(function(){
const X = window.VHC, { esc, cap1, uid, SECTIONS, OPTIONAL, PT, POS, TIRES, PRIO, T, WHY, itemsFor, itemName, fmtDate, mmss, glyph,
  DEFAULT_STORE, tireStatus, padStatus, tireFmt, activeSections, secName, flagged, histFor, script, badgeSVG, initials, logoBox } = X;
const $ = id => document.getElementById(id);
const main = $('main');
let tt; function toast(m, ms=2800){ const el=$('toast'); el.textContent=m; el.hidden=false; clearTimeout(tt); tt=setTimeout(()=>el.hidden=true, ms); }

/* ================= API ================= */
let API_OK = true;
async function api(path, opts={}){
  const r = await fetch('/api/'+path, { ...opts, headers:{ ...(opts.body && !(opts.body instanceof Blob) && !(opts.body instanceof ArrayBuffer) ? {'content-type':'application/json'} : {}), ...(opts.headers||{}) } });
  const ct = r.headers.get('content-type')||'';
  if(!ct.includes('application/json')){ API_OK=false; throw new Error('Server not reachable ('+r.status+')'); }
  const d = await r.json(); if(!r.ok) throw new Error(d.error||('HTTP '+r.status)); API_OK=true; return d;
}
const mediaUrl = (owner, id, part=0) => `/api/media/${owner}/${id}/${part}`;
async function uploadBlob(owner, id, blob, type){
  const CH = 3*1024*1024, n = Math.max(1, Math.ceil(blob.size/CH));
  for(let i=0;i<n;i++){
    const part = blob.slice(i*CH, (i+1)*CH);
    let ok=false, err;
    for(let t=0;t<4 && !ok;t++){
      try{ const r=await fetch(mediaUrl(owner,id,i), {method:'POST', body:part, headers:{'content-type':type||blob.type||'application/octet-stream'}}); if(!r.ok) throw new Error('HTTP '+r.status); ok=true; }
      catch(e){ err=e; await new Promise(r=>setTimeout(r, 1500*(t+1))); }
    }
    if(!ok) throw err;
  }
  return n;
}
async function fetchMedia(owner, meta){
  const parts = await Promise.all(Array.from({length:meta.parts||1}, (_,i)=>fetch(mediaUrl(owner, meta.id, i)).then(r=>{ if(!r.ok) throw new Error('missing'); return r.blob(); })));
  return URL.createObjectURL(new Blob(parts, {type:meta.type}));
}

/* ================= stores ================= */
let STORES = [], STORE = null;
const storeLogoUrl = s => s?.logoKey ? mediaUrl('store', s.logoKey) : null;
const techPhotoUrl = t => t?.photoKey ? mediaUrl('store', t.photoKey) : null;
const storeView = s => ({...s, logoUrl: storeLogoUrl(s)});
async function loadStores(){
  try{
    const d = await api('stores'); STORES = d.stores||[];
    if(!STORES.length){ const s = {...structuredClone(DEFAULT_STORE), id:'main'}; await api('stores/main', {method:'PUT', body:JSON.stringify(s)}); STORES=[s]; }
  }catch(e){ API_OK=false; STORES=[{...structuredClone(DEFAULT_STORE)}]; }
  // Brand the original store as Brimell Toyota if it still has the placeholder name
  for(const s of STORES){ if(s.name==='My Dealership'){ s.name='Brimell Toyota'; try{ await api('stores/'+s.id, {method:'PUT', body:JSON.stringify(s)}); }catch(e){} } }
  let want=null; try{ want=localStorage.getItem('vhc-store'); }catch(e){}
  STORE = STORES.find(s=>s.id===want) || STORES[0];
  paintHeader();
}
function setStore(id){ STORE = STORES.find(s=>s.id===id)||STORES[0]; try{ localStorage.setItem('vhc-store', STORE.id); }catch(e){} paintHeader(); }
function paintHeader(){
  const h=$('hdrLogo'), src=storeLogoUrl(STORE);
  h.className = src?'logo img':'logo none'; h.innerHTML = src?`<img src="${esc(src)}" alt="${esc(STORE?.name||'')}">`:'';
  $('hdrTitle').textContent = STORE?.name||'Vehicle Health Check'; $('hdrShop').textContent = 'Vehicle Health Check';
  $('hdrBadge').innerHTML = badgeSVG(); $('hdrBadge').hidden = !!src;
  document.title = (STORE?.name ? STORE.name+' · ' : '') + 'Vehicle Health Check';
}

/* ================= drafts on the phone (IndexedDB) ================= */
const IDB = (()=>{ let p; const open=()=> p ||= new Promise((res,rej)=>{ const r=indexedDB.open('vhc',1); r.onupgradeneeded=()=>{ r.result.createObjectStore('kv'); r.result.createObjectStore('blobs'); }; r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
  const tx=async(store,mode,fn)=>{ const db=await open(); return new Promise((res,rej)=>{ const t=db.transaction(store,mode); const s=t.objectStore(store); const out=fn(s); t.oncomplete=()=>res(out && out.result!==undefined ? out.result : out); t.onerror=()=>rej(t.error); }); };
  return { get:(st,k)=>tx(st,'readonly',s=>s.get(k)), set:(st,k,v)=>tx(st,'readwrite',s=>s.put(v,k)), del:(st,k)=>tx(st,'readwrite',s=>s.delete(k)), clear:(st)=>tx(st,'readwrite',s=>s.clear()) }; })();

/* ================= inspection state ================= */
function blankItems(pt){ const o={}; ['hood','under','extint'].forEach(s=>{ o[s]={}; itemsFor(s,pt).forEach(k=>o[s][k]='good'); }); return o; }
function newInsp(){
  const st=STORE||DEFAULT_STORE;
  let last=null; try{ last=localStorage.getItem('vhc-tech'); }catch(e){} const tech=(st.techs||[]).find(t=>t.id===last)||(st.techs||[])[0];
  return { id: uid(14), storeId: st.id, createdAt: null, startedAt:null, finishedAt:null, techId:tech?.id||'', techName:tech?.name||'',
    units: st.units||'32', th: structuredClone(st.th||DEFAULT_STORE.th), mods: structuredClone(st.mods||DEFAULT_STORE.mods), lang: st.lang||'en',
    veh:{vin:'', year:'', make:'', model:'', pt:'gas', odo:'', ro:'', customer:'', contact:''},
    tires:{lf:'',rf:'',lr:'',rr:''}, brakes:{front:'',rear:''}, items:blankItems('gas'), note:'', recalls:[], prio:{},
    media:{clips:{}, marks:{}} };
}
const S = { insp:null, step:0, hist:null, urls:{}, queue:[], uploading:false, vinInfo:null };
const ctxOf = () => ({ insp:S.insp, store:storeView(STORE), hist:S.hist });
let saveTimer;
function saveDraft(){ clearTimeout(saveTimer); saveTimer=setTimeout(()=>{ IDB.set('kv','draft', JSON.parse(JSON.stringify(S.insp))).catch(()=>{}); }, 300); }
async function loadDraft(){
  try{ const d = await IDB.get('kv','draft'); if(d && d.id && !d.done){ S.insp=d; await restoreUrls(); return true; } }catch(e){}
  return false;
}
async function restoreUrls(){
  const all = allMedia();
  for(const m of all){ try{ const b=await IDB.get('blobs', m.id); if(b) S.urls[m.id]=URL.createObjectURL(b); if(b && !m.uploaded) enqueue(m); }catch(e){} }
}
function allMedia(){ const M=S.insp.media; return [...Object.values(M.clips), ...Object.values(M.marks).flat()]; }
async function startNew(){
  Object.values(S.urls).forEach(u=>URL.revokeObjectURL(u)); S.urls={}; S.queue=[]; S.hist=null; S.vinInfo=null;
  try{ await IDB.clear('blobs'); }catch(e){}
  S.insp = newInsp(); S.step=0; saveDraft();
}

/* ================= upload queue (background) ================= */
function enqueue(meta){ if(!S.queue.find(m=>m.id===meta.id)) S.queue.push(meta); runQueue(); }
async function runQueue(){
  if(S.uploading) return; S.uploading=true;
  while(S.queue.length){
    const m=S.queue[0];
    try{ const b=await IDB.get('blobs', m.id); if(b){ m.parts = await uploadBlob(S.insp.id, m.id, b, m.type); } m.uploaded=true; S.queue.shift(); saveDraft(); }
    catch(e){ paintUpload('Upload paused — will retry when the signal is back'); await new Promise(r=>setTimeout(r,5000)); }
    paintUpload();
  }
  S.uploading=false; paintUpload();
}
function paintUpload(msg){ const el=$('upStat'); if(!el) return; const all=allMedia(), done=all.filter(m=>m.uploaded).length; el.textContent = msg || (all.length ? (done===all.length ? `✓ ${all.length} clip${all.length===1?'':'s'} & photos uploaded` : `Uploading ${done} of ${all.length}…`) : ''); }
async function waitForUploads(onProgress){
  const all=allMedia(); all.filter(m=>!m.uploaded).forEach(enqueue);
  while(allMedia().some(m=>!m.uploaded)){ onProgress && onProgress(allMedia().filter(m=>m.uploaded).length, allMedia().length); await new Promise(r=>setTimeout(r,600)); }
}

/* ================= media capture: clips ================= */
async function analyzeClip(url){
  return new Promise(res=>{
    const v=document.createElement('video'); v.muted=true; v.playsInline=true; v.preload='auto'; v.src=url;
    let done=false; const fin=r=>{ if(!done){ done=true; res(r); } };
    setTimeout(()=>fin({dur:isFinite(v.duration)?v.duration:0}), 6000);
    v.onloadedmetadata=()=>{ const d=isFinite(v.duration)?v.duration:0; try{ v.currentTime=Math.max(0.1, d/2); }catch(e){ fin({dur:d}); } };
    v.onseeked=()=>{
      try{ const c=document.createElement('canvas'); c.width=160; c.height=90; const x=c.getContext('2d',{willReadFrequently:true}); x.drawImage(v,0,0,160,90);
        const p=x.getImageData(0,0,160,90).data, g=new Float32Array(160*90); let sum=0;
        for(let i=0;i<g.length;i++){ g[i]=p[i*4]*.299+p[i*4+1]*.587+p[i*4+2]*.114; sum+=g[i]; }
        let lap=0, n=0; for(let y=1;y<89;y++) for(let xx=1;xx<159;xx++){ const i=y*160+xx; const l=4*g[i]-g[i-1]-g[i+1]-g[i-160]-g[i+160]; lap+=l*l; n++; }
        fin({dur:isFinite(v.duration)?v.duration:0, bright:sum/g.length, sharp:lap/n});
      }catch(e){ fin({dur:isFinite(v.duration)?v.duration:0}); }
    };
    v.onerror=()=>fin({dur:0});
  });
}
async function saveClip(sec, blob){
  const old=S.insp.media.clips[sec]; if(old){ try{ await IDB.del('blobs', old.id); }catch(e){} if(S.urls[old.id]) URL.revokeObjectURL(S.urls[old.id]); S.queue=S.queue.filter(q=>q.id!==old.id); }
  const id=uid(12), url=URL.createObjectURL(blob);
  const a = await analyzeClip(url);
  const meta={id, sec, kind:'clip', type:blob.type||'video/mp4', dur:Math.round((a.dur||0)*10)/10, bright:a.bright, sharp:a.sharp, uploaded:false, parts:0};
  await IDB.set('blobs', id, blob); S.urls[id]=url; S.insp.media.clips[sec]=meta;
  if(sec==='intro' && !S.insp.startedAt){ S.insp.startedAt=new Date().toISOString(); toast('Tech timer started'); }
  saveDraft(); enqueue(meta); renderTech();
  if(a.bright!=null && a.bright<45) toast('That clip looks dark. Consider re-recording with more light.', 4000);
}
const CAM = { stream:null, rec:null, chunks:[], sec:null, t0:0, timer:null, mode:'clip' };
function pickMime(){ const c=['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']; for(const t of c){ try{ if(window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t; }catch(e){} } return ''; }
async function openRecorder(sec){
  CAM.sec=sec; CAM.mode='clip'; $('camTitle').textContent = SECTIONS.find(s=>s.id===sec).rec; $('camGuide').hidden=true; $('camShutter').hidden=false; $('camHint').hidden=false;
  $('camTime').textContent='0:00'; $('camTime').classList.remove('on'); $('camMsg').textContent=''; $('camShutter').classList.remove('rec');
  $('camModal').hidden=false;
  try{
    CAM.stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720} }, audio:true });
    $('camVideo').srcObject=CAM.stream; await $('camVideo').play().catch(()=>{});
  }catch(e){ $('camMsg').textContent='Camera blocked. Allow camera access, or use the phone’s camera app below.'; }
}
function closeCam(){ try{ CAM.rec && CAM.rec.state!=='inactive' && CAM.rec.stop(); }catch(e){} clearInterval(CAM.timer); if(CAM.stream){ CAM.stream.getTracks().forEach(t=>t.stop()); CAM.stream=null; } clearInterval(SCAN.loop); SCAN.on=false; $('camModal').hidden=true; }
function startRec(){
  if(!CAM.stream){ toast('Camera is not available. Use the phone’s camera app link below.'); return; }
  const mime=pickMime(); CAM.chunks=[];
  try{ CAM.rec = new MediaRecorder(CAM.stream, mime?{mimeType:mime, videoBitsPerSecond:2500000}:{videoBitsPerSecond:2500000}); }catch(e){ toast('Recording is not supported in this browser. Use the camera app link below.'); return; }
  CAM.rec.ondataavailable=e=>{ if(e.data && e.data.size) CAM.chunks.push(e.data); };
  CAM.rec.onstop=async()=>{ const type=(CAM.rec.mimeType||mime||'video/mp4').split(';')[0]; const blob=new Blob(CAM.chunks,{type}); const sec=CAM.sec; closeCam(); if(blob.size) await saveClip(sec, blob); };
  CAM.rec.start(500); CAM.t0=Date.now(); $('camShutter').classList.add('rec'); $('camTime').classList.add('on');
  CAM.timer=setInterval(()=>{ const s=(Date.now()-CAM.t0)/1000; $('camTime').textContent=mmss(s); if(s>=30) stopRec(); }, 250);
}
function stopRec(){ clearInterval(CAM.timer); try{ CAM.rec && CAM.rec.state!=='inactive' && CAM.rec.stop(); }catch(e){} }
$('camShutter').onclick=()=>{ if(CAM.mode!=='clip') return; if(CAM.rec && CAM.rec.state==='recording') stopRec(); else startRec(); };
$('camClose').onclick=closeCam;
$('camFallback').onchange=async e=>{ const f=e.target.files[0]; e.target.value=''; if(!f) return; const sec=CAM.sec; closeCam();
  if(CAM.mode==='vin'){ scanVinPhoto(f); return; }
  toast('Processing clip…'); const blob = f.size>25*1024*1024 ? await shrinkVideo(f) : f; await saveClip(sec, blob); };
async function shrinkVideo(file){
  // Re-encode large phone videos to 720p so uploads stay small (picture only; sound is dropped).
  try{
    const url=URL.createObjectURL(file), v=document.createElement('video'); v.src=url; v.muted=true; v.playsInline=true;
    await new Promise((r,j)=>{ v.onloadedmetadata=r; v.onerror=j; });
    const sc=Math.min(1, 1280/Math.max(v.videoWidth,v.videoHeight)), c=document.createElement('canvas'); c.width=Math.round(v.videoWidth*sc)&~1; c.height=Math.round(v.videoHeight*sc)&~1;
    const x=c.getContext('2d'), mime=pickMime(), rec=new MediaRecorder(c.captureStream(30), mime?{mimeType:mime, videoBitsPerSecond:2500000}:{}), ch=[];
    rec.ondataavailable=e=>e.data.size&&ch.push(e.data); const stopped=new Promise(r=>rec.onstop=r);
    rec.start(500); await v.play(); const end=Math.min(v.duration||30, 30);
    await new Promise(r=>{ const f=()=>{ x.drawImage(v,0,0,c.width,c.height); if(v.ended||v.currentTime>=end){ r(); } else requestAnimationFrame(f); }; f(); });
    v.pause(); rec.stop(); await stopped; URL.revokeObjectURL(url);
    return new Blob(ch,{type:(rec.mimeType||mime).split(';')[0]});
  }catch(e){ return file; }
}

/* ================= VIN scanning (live camera) ================= */
const VIN_RE=/[A-HJ-NPR-Z0-9]{17}/;
function vinCheck(v){ const tr={A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9}, w=[8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2]; let sum=0; for(let i=0;i<17;i++){ const c=v[i]; sum += (/\d/.test(c)?+c:tr[c]||0)*w[i]; } const cd=sum%11===10?'X':String(sum%11); return v[8]===cd; }
function pickVin(texts){ for(let t of texts){ if(!t) continue; t=t.toUpperCase().replace(/[^A-Z0-9]/g,''); if(t.length===18 && t[0]==='I') t=t.slice(1); const m=t.match(VIN_RE); if(m) return m[0]; } return null; }
let zxingP=null;
function loadZXing(){ if(window.ZXing) return Promise.resolve(); return zxingP ||= new Promise((res,rej)=>{ const sc=document.createElement('script'); sc.src='https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/umd/index.min.js'; sc.onload=res; sc.onerror=()=>{ zxingP=null; rej(new Error('load')); }; document.head.appendChild(sc); }); }
function zxDecodeCanvas(c){
  const Z=window.ZXing; if(!Z) return null; const hints=new Map(); hints.set(Z.DecodeHintType.TRY_HARDER,true);
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS,[Z.BarcodeFormat.CODE_39,Z.BarcodeFormat.CODE_128,Z.BarcodeFormat.DATA_MATRIX,Z.BarcodeFormat.QR_CODE]);
  const x=c.getContext('2d',{willReadFrequently:true}), d=x.getImageData(0,0,c.width,c.height).data, lum=new Uint8ClampedArray(c.width*c.height);
  for(let i=0;i<lum.length;i++) lum[i]=(d[i*4]*0.299+d[i*4+1]*0.587+d[i*4+2]*0.114)|0;
  try{ const r=new Z.MultiFormatReader().decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.RGBLuminanceSource(lum,c.width,c.height))), hints); return pickVin([r.getText()]); }catch(e){ return null; }
}
const SCAN={loop:null,on:false,det:null};
async function openVinScanner(){
  CAM.mode='vin'; $('camTitle').textContent='Scan VIN barcode'; $('camShutter').hidden=true; $('camHint').hidden=true; $('camGuide').hidden=false; $('camTime').textContent='VIN'; $('camTime').classList.remove('on');
  $('camMsg').textContent='Line up the barcode on the door jamb or windshield inside the box'; $('camModal').hidden=false;
  try{ CAM.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}, width:{ideal:1920}, height:{ideal:1080}}, audio:false}); $('camVideo').srcObject=CAM.stream; await $('camVideo').play().catch(()=>{}); }
  catch(e){ $('camMsg').textContent='Camera blocked. Use the camera app link below to take a photo instead.'; return; }
  SCAN.det=null;
  if('BarcodeDetector' in window){ try{ const sup=await BarcodeDetector.getSupportedFormats(); const f=['code_39','code_128','data_matrix','qr_code'].filter(x=>sup.includes(x)); if(f.length) SCAN.det=new BarcodeDetector({formats:f}); }catch(e){} }
  if(!SCAN.det){ try{ await loadZXing(); }catch(e){} }
  SCAN.on=true; const v=$('camVideo'), c=document.createElement('canvas'); let flip=false;
  SCAN.loop=setInterval(async()=>{
    if(!SCAN.on || !v.videoWidth) return; let vin=null;
    try{
      if(SCAN.det){ const r=await SCAN.det.detect(v); vin=pickVin(r.map(x=>x.rawValue)); }
      else { const w=v.videoWidth, h=v.videoHeight, cw=Math.round(w*0.84), chh=Math.round(h*0.36); c.width=Math.min(1400,cw); c.height=Math.round(chh*c.width/cw);
        const x=c.getContext('2d',{willReadFrequently:true}); x.drawImage(v, (w-cw)/2, h*0.32, cw, chh, 0,0,c.width,c.height); flip=!flip; vin=zxDecodeCanvas(c); }
    }catch(e){}
    if(vin && SCAN.on){ SCAN.on=false; closeCam(); if(navigator.vibrate) navigator.vibrate(60); applyVin(vin, true); }
  }, 300);
}
async function scanVinPhoto(file){
  const img=new Image(), url=URL.createObjectURL(file); await new Promise(r=>{ img.onload=r; img.onerror=r; img.src=url; });
  let vin=null;
  if('BarcodeDetector' in window){ try{ const d=new BarcodeDetector({formats:['code_39','code_128','data_matrix','qr_code']}); vin=pickVin((await d.detect(img)).map(x=>x.rawValue)); }catch(e){} }
  if(!vin){ try{ await loadZXing(); for(const rot of [0,90]){ const sc=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight)), w=Math.round(img.naturalWidth*sc), h=Math.round(img.naturalHeight*sc), c=document.createElement('canvas'); c.width=rot?h:w; c.height=rot?w:h; const x=c.getContext('2d'); if(rot){ x.translate(c.width,0); x.rotate(Math.PI/2); } x.drawImage(img,0,0,w,h); vin=zxDecodeCanvas(c); if(vin) break; } }catch(e){} }
  URL.revokeObjectURL(url);
  if(vin) applyVin(vin, true); else setVinStatus('No VIN barcode found in that photo. Try again closer, or type the VIN.', 'bad');
}
function setVinStatus(msg, cls=''){ const el=$('vinStatus'); if(el){ el.textContent=msg; el.className='vinstatus '+cls; } }
async function applyVin(vin, scanned){
  const V=S.insp.veh; V.vin=vin; saveDraft(); renderTech();
  setVinStatus((scanned?'✓ Scanned ':'')+vin+' · looking up vehicle and recalls…', vinCheck(vin)?'ok':'bad');
  loadHistory();
  try{
    const d=await api('vin/'+vin); S.vinInfo=d; const dec=d.decoded||{};
    if(dec.year) V.year=dec.year; if(dec.make) V.make=cap1(String(dec.make).toLowerCase()); if(dec.model) V.model=dec.model;
    if(dec.pt && dec.pt!==V.pt){ setPowertrain(dec.pt); }
    const keep = Object.fromEntries((S.insp.recalls||[]).map(r=>[r.id, r.include]));
    S.insp.recalls = (d.recalls||[]).map(r=>({...r, include: keep[r.id]||false}));
    saveDraft(); renderTech();
    const n=S.insp.recalls.length;
    setVinStatus(`✓ ${V.year} ${V.make} ${V.model}${vinCheck(vin)?'':' · check digit doesn’t match, compare with the sticker'} · ${n? n+' recall'+(n===1?'':'s')+' on record for this model — confirm in Recommendations':'no recalls on record for this model'}`, vinCheck(vin)?'ok':'bad');
  }catch(e){ setVinStatus(`${vin} saved. Vehicle lookup isn’t available right now (${e.message}). Enter year, make and model by hand.`, 'bad'); }
}
function setPowertrain(pt){ S.insp.veh.pt=pt; const nx=blankItems(pt); ['hood','under','extint'].forEach(s=>Object.keys(nx[s]).forEach(k=>{ if(S.insp.items[s]?.[k]) nx[s][k]=S.insp.items[s][k]; })); S.insp.items=nx; }
let histTimer;
async function loadHistory(){
  const vin=(S.insp.veh.vin||'').toUpperCase(); S.hist=null;
  if(vin.length>=11){ try{ const d=await api('history?vin='+encodeURIComponent(vin)+'&exclude='+S.insp.id); S.hist=d.history[0]||null; }catch(e){} }
  refreshTech();
}

/* ================= photo markup ================= */
const ED={sec:null, img:null, shapes:[], tool:'circle', drag:null};
function openEditorFromFile(sec, file){ const img=new Image(); img.onload=()=>openEditor(sec,img); img.onerror=()=>toast('That photo could not be opened.'); img.src=URL.createObjectURL(file); }
function openEditorFromVideo(sec, video){
  if(!video.videoWidth){ toast('Play the clip for a moment first, then pause on the problem.'); return; }
  video.pause(); const c=document.createElement('canvas'); c.width=video.videoWidth; c.height=video.videoHeight; c.getContext('2d').drawImage(video,0,0);
  const img=new Image(); img.onload=()=>openEditor(sec,img); img.src=c.toDataURL('image/jpeg',.92);
}
function openEditor(sec, img){
  ED.sec=sec; ED.img=img; ED.shapes=[]; ED.drag=null;
  const cv=$('edCanvas'), sc=Math.min(1, 1600/Math.max(img.naturalWidth,img.naturalHeight));
  cv.width=Math.round(img.naturalWidth*sc); cv.height=Math.round(img.naturalHeight*sc);
  $('edSec').textContent=secName(sec,'en'); $('edLabel').value=''; $('editor').hidden=false; drawEd();
}
function drawShape(ctx, s, W){
  const lw=Math.max(4, W*0.008);
  const path=()=>{ ctx.beginPath();
    if(s.type==='circle'){ const cx=(s.x1+s.x2)/2, cy=(s.y1+s.y2)/2, rx=Math.max(6,Math.abs(s.x2-s.x1)/2), ry=Math.max(6,Math.abs(s.y2-s.y1)/2); ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); }
    else { const a=Math.atan2(s.y2-s.y1,s.x2-s.x1), h=lw*4.2; ctx.moveTo(s.x1,s.y1); ctx.lineTo(s.x2,s.y2); ctx.moveTo(s.x2,s.y2); ctx.lineTo(s.x2-h*Math.cos(a-0.45), s.y2-h*Math.sin(a-0.45)); ctx.moveTo(s.x2,s.y2); ctx.lineTo(s.x2-h*Math.cos(a+0.45), s.y2-h*Math.sin(a+0.45)); } };
  ctx.lineCap='round'; ctx.lineJoin='round';
  path(); ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.lineWidth=lw+5; ctx.stroke();
  path(); ctx.strokeStyle='#EB0A1E'; ctx.lineWidth=lw; ctx.stroke();
}
function drawEd(){ const cv=$('edCanvas'), ctx=cv.getContext('2d'); if(!ED.img) return; ctx.drawImage(ED.img,0,0,cv.width,cv.height); ED.shapes.concat(ED.drag?[ED.drag]:[]).forEach(s=>drawShape(ctx,s,cv.width)); }
function cvPt(e){ const cv=$('edCanvas'), r=cv.getBoundingClientRect(); return {x:(e.clientX-r.left)*cv.width/r.width, y:(e.clientY-r.top)*cv.height/r.height}; }
$('edCanvas').addEventListener('pointerdown', e=>{ e.preventDefault(); $('edCanvas').setPointerCapture(e.pointerId); const p=cvPt(e); ED.drag={type:ED.tool, x1:p.x, y1:p.y, x2:p.x, y2:p.y}; });
$('edCanvas').addEventListener('pointermove', e=>{ if(!ED.drag) return; const p=cvPt(e); ED.drag.x2=p.x; ED.drag.y2=p.y; drawEd(); });
$('edCanvas').addEventListener('pointerup', ()=>{ if(!ED.drag) return; const d=ED.drag; ED.drag=null; if(Math.hypot(d.x2-d.x1,d.y2-d.y1)>8) ED.shapes.push(d); drawEd(); });
document.querySelectorAll('.tool').forEach(b=>b.addEventListener('click',()=>{ ED.tool=b.dataset.tool; document.querySelectorAll('.tool').forEach(x=>x.classList.toggle('on',x===b)); }));
$('edUndo').onclick=()=>{ ED.shapes.pop(); drawEd(); };
$('edCancel').onclick=()=>{ $('editor').hidden=true; };
$('edSave').onclick=()=>{
  const cv=$('edCanvas'), sec=ED.sec, label=$('edLabel').value.trim();
  cv.toBlob(async blob=>{ if(!blob){ toast('Could not save the photo.'); return; }
    const id=uid(12), meta={id, sec, kind:'mark', type:'image/jpeg', label, uploaded:false, parts:0};
    await IDB.set('blobs', id, blob); S.urls[id]=URL.createObjectURL(blob);
    (S.insp.media.marks[sec] ||= []).push(meta); saveDraft(); enqueue(meta);
    $('editor').hidden=true; renderTech(); toast('Photo added to '+secName(sec,'en'));
  }, 'image/jpeg', .88);
};

/* ================= technician screens ================= */
const pillHTML = (st, label) => `<span class="pill ${st}">${glyph(st)||''} ${label||T.en.st[st]}</span>`;
function clipBlock(sec){
  const c=S.insp.media.clips[sec.id];
  if(c){ const q=[]; if(c.bright!=null && c.bright<45) q.push('looks dark'); if(c.sharp!=null && c.sharp<12) q.push('may be blurry'); if(c.dur && c.dur<3) q.push('very short'); if(c.dur>30) q.push('over 30 sec');
    return `<div><div class="lbl">Clip</div><div class="clipdone"><video class="thumb" id="thumb-${sec.id}" src="${S.urls[c.id]||''}" muted playsinline controls></video>
    <div class="clipmeta"><span class="pill ${q.length?'monitor':'good'}">${q.length?'! '+q.join(', '):'✓ Recorded'} · ${Math.round(c.dur||0)} sec</span><span class="hint" style="margin:0">${c.uploaded?'Uploaded':'Waiting to upload'}</span><button class="btn small" data-record="${sec.id}">Re-record</button></div></div></div>`; }
  return `<div><button class="rec" data-record="${sec.id}"><span class="dot"></span>${sec.rec}</button><p class="hint">Opens the camera here. Keep it to ${sec.id==='outro'?'5–10':'10–15'} seconds.</p></div>`;
}
function marksBlock(sec){
  const list=S.insp.media.marks[sec]||[], c=S.insp.media.clips[sec];
  return `<div><div class="lbl">Circled photos</div><div class="marks">${list.map((m,i)=>`<div class="mk"><img src="${S.urls[m.id]||''}" alt="${esc(m.label)}"><button data-delmark="${sec}:${i}" aria-label="Remove photo">✕</button>${m.label?`<span>${esc(m.label)}</span>`:''}</div>`).join('')}
    ${c?`<button class="btn small" data-frame="${sec}">◯ Circle a frame from the clip</button>`:''}
    <label class="btn small">◯ Take photo &amp; circle<input type="file" accept="image/*" capture="environment" data-photo="${sec}" hidden></label></div>
    <p class="hint">${c?'Pause the clip on the problem, then tap “Circle a frame”.':'Snap the problem, then circle it.'} Photos play right after this section’s clip.</p></div>`;
}
function techField(){
  const techs=STORE?.techs||[], I=S.insp;
  return `<div class="field wide"><label for="v-tech">Technician</label><select id="v-tech" data-techsel>${techs.map(t=>`<option value="${esc(t.id)}" ${I.techId===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}<option value="" ${!I.techId?'selected':''}>${techs.length?'Someone else…':'Type a name below'}</option></select>
    ${!I.techId?`<input data-v2="techName" value="${esc(I.techName)}" placeholder="Technician name" style="margin-top:6px">`:''}</div>`;
}
function renderTech(){
  if(!S.insp) return;
  const ctx=ctxOf(), secs=activeSections(ctx); if(S.step>=secs.length) S.step=secs.length-1;
  const sec=secs[S.step], I=S.insp;
  let body='';
  if(sec.id==='intro'){
    const f=(k,l,cls='',ph='')=>`<div class="field ${cls}"><label for="v-${k}">${l}</label><input id="v-${k}" data-v="${k}" value="${esc(I.veh[k])}" placeholder="${ph}"></div>`;
    body += clipBlock(sec) + `<div><div class="lbl">Vehicle</div><div class="fields">
      <div class="field wide"><label for="v-vin">VIN</label><div class="vinrow"><input id="v-vin" data-v="vin" value="${esc(I.veh.vin)}" autocapitalize="characters" maxlength="17" style="font-family:var(--mono)"><button class="scanbtn" id="scanVin">▦ Scan</button></div><div class="vinstatus" id="vinStatus">Scan fills in the year, make, model and looks up recalls.</div></div>
      ${f('year','Year')}${f('make','Make')}${f('model','Model')}
      <div class="field"><label for="v-pt">Powertrain</label><select id="v-pt" data-pt>${Object.entries(PT).map(([k,l])=>`<option value="${k}" ${I.veh.pt===k?'selected':''}>${l}</option>`).join('')}</select></div>
      ${f('odo','Odometer','','e.g. 38,412 mi')}${f('ro','Repair order')}${techField()}
      ${f('customer','Customer name','wide','First and last name — personalizes the video')}${f('contact','Customer phone or email','wide')}
      <div class="field wide"><label for="v-lang">Video language</label><select id="v-lang" data-lang><option value="en" ${I.lang==='en'?'selected':''}>English</option><option value="es" ${I.lang==='es'?'selected':''}>Español</option></select></div></div></div>
      <div id="histBox"></div>`;
  } else if(sec.id==='tires'){
    const u = I.units==='mm'?'mm':'/32"';
    body += clipBlock(sec) + `<div><div class="lbl">Tread depth</div><div class="meas">${TIRES.map(p=>`<div class="mbox"><div class="top2"><b>${POS[p].s.en}</b><span data-pill="tire:${p}"></span></div><div class="inrow"><input type="number" inputmode="decimal" step="0.5" min="0" data-t="${p}" value="${esc(I.tires[p])}" aria-label="${POS[p].en} tread"><span class="unit">${u}</span></div><span class="was" data-was="tire:${p}"></span></div>`).join('')}</div></div>` + marksBlock('tires');
  } else if(sec.id==='brakes'){
    body += clipBlock(sec) + `<div><div class="lbl">Pad thickness</div><div class="meas">${['front','rear'].map(k=>`<div class="mbox"><div class="top2"><b>${k==='front'?'Front':'Rear'}</b><span data-pill="pad:${k}"></span></div><div class="inrow"><input type="number" inputmode="decimal" step="0.5" min="0" data-b="${k}" value="${esc(I.brakes[k])}" aria-label="${k} pads"><span class="unit">mm</span></div><span class="was" data-was="pad:${k}"></span></div>`).join('')}</div></div>` + marksBlock('brakes');
  } else if(['hood','under','extint'].includes(sec.id)){
    body += clipBlock(sec) + `<div><div class="lbl">Checklist · ${PT[I.veh.pt]}</div><div class="items">${itemsFor(sec.id,I.veh.pt).map(k=>{ const v=I.items[sec.id][k];
      return `<div class="item"><span>${itemName(k)}</span><div class="segs">${['good','monitor','replace','na'].map(o=>`<button class="seg ${o} ${v===o?'on':''}" data-item="${sec.id}.${k}" data-o="${o}">${o==='na'?'N/A':T.en.st[o]}</button>`).join('')}</div></div>`; }).join('')}</div></div>` + marksBlock(sec.id);
  } else if(sec.id==='recs'){
    body += `<div><div class="lbl">Flagged items · set priority</div><div class="flags" id="flags"></div></div>
      <div><div class="lbl">Recalls on record for this model</div><div class="flags" id="recallList"></div>
      <p class="hint">From the government recall database (NHTSA). It can’t tell whether this car’s recall was already done, so check your Toyota system and tick only the open ones.</p></div>`
      + clipBlock(sec) + `<div class="field"><label for="note">Note for the customer (optional)</label><textarea id="note" data-note placeholder="e.g. Slight oil seepage at the valve cover. Not urgent.">${esc(I.note)}</textarea></div>`;
  } else if(sec.id==='outro'){
    const so=STORE?.outro;
    body += clipBlock(sec) + `<div class="histnote">${S.insp.media.clips.outro ? 'Your thank-you plays at the end of the video, with its own sound, before the closing card.' : so ? 'No clip recorded, so the store’s thank-you video will play at the end. Record one here to make it personal.' : 'Look at the camera, smile, and thank the customer by name, for example: “Jordan, thanks for trusting us with your RAV4. See you next visit.” Skip it if you’re short on time.'}</div>`;
  }
  body += `<div class="vo"><div class="lbl">Voiceover · generated</div><div id="voPrev"></div></div>`;
  const last = S.step===secs.length-1;
  main.innerHTML = `<div class="narrow">
    <div class="storebar"><span>Store</span><select id="storeSel">${STORES.map(s=>`<option value="${esc(s.id)}" ${s.id===STORE?.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select><span style="flex:1"></span><button class="btn small" id="newBtn">Start new inspection</button></div>
    ${API_OK?'':`<div class="banner">Can’t reach the server, so nothing is being saved online yet. Your work is saved on this phone. See the setup guide if this site was just uploaded.</div>`}
    <div class="card"><div class="nav">${secs.map((s,i)=>`<button class="navchip ${i===S.step?'on':''}" data-go="${i}"><i class="${I.media.clips[s.id]?'rec':''}"></i>${s.short}</button>`).join('')}</div>
    <div class="stephead"><div><div class="eyebrow">${S.step+1} of ${secs.length}</div><h2>${sec.en}</h2><p class="prompt">${sec.prompt}</p></div><div class="clock">Tech time<b id="clock">0:00</b><small id="clockHint"></small></div></div>
    <div class="body">${body}</div>
    <div class="foot"><button class="btn" data-go="${S.step-1}" ${S.step===0?'disabled':''}>← Back</button>${last?`<button class="btn primary" id="genBtn">Create inspection video</button>`:`<button class="btn dark" data-go="${S.step+1}">Next →</button>`}</div></div>
    <div class="counter" id="counter"></div><div class="uploadstat" id="upStat"></div></div>`;
  renderFlags(); renderRecalls(); refreshTech(); tickClock(); paintUpload();
}
function renderFlags(){
  const box=$('flags'); if(!box) return; const fl=flagged(ctxOf(),'en');
  box.innerHTML = fl.length ? fl.map(f=>`<div class="flag"><div class="row"><span><b>${esc(f.label)}</b></span>${pillHTML(f.st)}</div><div class="why">Why it matters: ${esc(f.why)}</div>
    <div class="segs">${PRIO.map(p=>`<button class="seg ${p} ${f.prio===p?'on':''}" data-prio="${esc(f.key)}" data-p="${p}">${T.en.prio[p]}</button>`).join('')}</div></div>`).join('')
    : `<div class="flag"><div class="row"><span>Nothing flagged</span>${pillHTML('good')}</div></div>`;
}
function renderRecalls(){
  const box=$('recallList'); if(!box) return; const rs=S.insp.recalls||[];
  box.innerHTML = rs.length ? rs.map(r=>`<label class="recallrow" for="rc-${esc(r.id)}"><input type="checkbox" id="rc-${esc(r.id)}" data-recall="${esc(r.id)}" ${r.include?'checked':''}><span><b>${esc(r.code)} · ${esc(cap1((r.component||'').toLowerCase()))}</b><small>${esc((r.summary||'').slice(0,220))}${(r.summary||'').length>220?'…':''}</small><br><small>Tick if this recall is still open on this car.</small></span></label>`).join('')
    : `<div class="hint">${S.insp.veh.vin.length===17?'No recalls on record for this model, or the lookup hasn’t run yet. Scan or enter the VIN on the intro step.':'Scan or enter the VIN on the intro step to look up recalls.'}</div>`;
}
function refreshTech(){
  if(!S.insp) return; const ctx=ctxOf();
  document.querySelectorAll('[data-pill]').forEach(el=>{ const [kind,k]=el.dataset.pill.split(':'); el.innerHTML = pillHTML(kind==='tire'?tireStatus(S.insp.tires[k],ctx):padStatus(S.insp.brakes[k],ctx)); });
  document.querySelectorAll('[data-was]').forEach(el=>{ const [kind,k]=el.dataset.was.split(':'); const h=histFor(ctx,kind,k); el.textContent = h ? `Last visit: ${h}` : ''; });
  const hb=$('histBox'); if(hb) hb.innerHTML = S.hist ? `<div class="histnote">Previous inspection found: <b>${fmtDate(S.hist.createdAt)}</b>${S.hist.veh?.odo?' at '+esc(S.hist.veh.odo):''}${S.hist.techName?' by '+esc(S.hist.techName):''}. Last-visit readings show next to each measurement, and the customer sees a side-by-side comparison.</div>` : '';
  const secs=activeSections(ctx), sec=secs[S.step];
  if($('voPrev')) $('voPrev').textContent = script(sec.id, ctx, S.insp.lang||'en');
  const n=secs.filter(s=>S.insp.media.clips[s.id]).length, pm=Object.values(S.insp.media.marks).reduce((a,l)=>a+l.length,0);
  if($('counter')) $('counter').textContent = `${n} of ${secs.length} clips · ${pm} circled photo${pm===1?'':'s'} · ${flagged(ctx).length} items flagged`;
}
function techSeconds(I=S.insp){ if(!I?.startedAt) return 0; return ((I.finishedAt?Date.parse(I.finishedAt):Date.now())-Date.parse(I.startedAt))/1000; }
function tickClock(){ const c=$('clock'); if(c) c.textContent=mmss(techSeconds()); const h=$('clockHint'); if(h) h.textContent=S.insp?.startedAt?'':'starts at vehicle clip'; }
setInterval(tickClock, 1000);

/* tech events */
let armed=false;
main.addEventListener('click', e=>{
  const t=e.target; if(!S.insp || route().name!=='tech') return;
  const go=t.closest('[data-go]'); if(go && !go.disabled){ S.step=+go.dataset.go; renderTech(); scrollTo({top:0}); return; }
  const rec=t.closest('[data-record]'); if(rec){ openRecorder(rec.dataset.record); return; }
  if(t.id==='scanVin'){ openVinScanner(); return; }
  const seg=t.closest('[data-item]'); if(seg){ const [sec,k]=seg.dataset.item.split('.'); S.insp.items[sec][k]=seg.dataset.o; saveDraft(); renderTech(); return; }
  const pr=t.closest('[data-prio]'); if(pr){ S.insp.prio[pr.dataset.prio]=pr.dataset.p; saveDraft(); renderFlags(); refreshTech(); return; }
  const dm=t.closest('[data-delmark]'); if(dm){ const [sec,i]=dm.dataset.delmark.split(':'); const m=S.insp.media.marks[sec].splice(+i,1)[0]; if(m){ IDB.del('blobs',m.id).catch(()=>{}); S.queue=S.queue.filter(q=>q.id!==m.id); } saveDraft(); renderTech(); return; }
  const fr=t.closest('[data-frame]'); if(fr){ const v=$('thumb-'+fr.dataset.frame); if(v) openEditorFromVideo(fr.dataset.frame, v); return; }
  if(t.id==='genBtn'){ generate(); return; }
  if(t.id==='newBtn'){
    if(!armed){ armed=true; t.textContent='Tap again to clear'; t.classList.add('warn'); setTimeout(()=>{ armed=false; const b=$('newBtn'); if(b){ b.textContent='Start new inspection'; b.classList.remove('warn'); } },3000); return; }
    armed=false; startNew().then(()=>{ renderTech(); toast('New inspection started. The timer starts when you record the vehicle.'); }); return;
  }
});
main.addEventListener('input', e=>{
  const t=e.target, I=S.insp; if(!I || route().name!=='tech') return;
  if(t.dataset.v!==undefined){ I.veh[t.dataset.v]=t.value; if(t.dataset.v==='vin'){ const v=t.value.toUpperCase().replace(/[^A-Z0-9]/g,''); clearTimeout(histTimer); if(v.length===17) histTimer=setTimeout(()=>applyVin(v,false),600); } }
  else if(t.dataset.v2==='techName'){ I.techName=t.value; }
  else if(t.dataset.t){ I.tires[t.dataset.t]=t.value; }
  else if(t.dataset.b){ I.brakes[t.dataset.b]=t.value; }
  else if(t.dataset.note!==undefined){ I.note=t.value; }
  else return;
  saveDraft(); refreshTech();
});
main.addEventListener('change', e=>{
  const t=e.target, I=S.insp; if(!I) return;
  if(t.id==='storeSel'){ setStore(t.value); if(!I.startedAt && !allMedia().length){ startNew().then(renderTech); } else toast('Store changes apply to your next inspection.'); return; }
  if(t.dataset.pt!==undefined){ setPowertrain(t.value); saveDraft(); renderTech(); return; }
  if(t.dataset.lang!==undefined){ I.lang=t.value; saveDraft(); refreshTech(); return; }
  if(t.dataset.techsel!==undefined){ const tech=(STORE?.techs||[]).find(x=>x.id===t.value); I.techId=tech?tech.id:''; I.techName=tech?tech.name:''; try{ localStorage.setItem('vhc-tech', I.techId); }catch(x){} saveDraft(); renderTech(); return; }
  if(t.dataset.recall){ const r=I.recalls.find(x=>x.id===t.dataset.recall); if(r){ r.include=t.checked; saveDraft(); renderFlags(); refreshTech(); } return; }
  if(t.dataset.photo && t.files && t.files[0]){ openEditorFromFile(t.dataset.photo, t.files[0]); t.value=''; return; }
});

/* ================= quality check + create video ================= */
function qualityCheck(){
  const I=S.insp, ctx=ctxOf(), issues=[];
  const add=(level, code, sec, text, fix)=>issues.push({level, code, sec, text, fix});
  activeSections(ctx).forEach((s,i)=>{
    const c=I.media.clips[s.id];
    if(s.id==='recs' || s.id==='outro') return;
    if(!c){ add('warn','noclip',s.id,`No clip for ${s.en}`,'Record a short clip so the customer can see it.'); return; }
    if(c.dur && c.dur<3) add('warn','short',s.id,`${s.en} clip is very short (${Math.round(c.dur)} sec)`,'Aim for 10–15 seconds.');
    if(c.dur>30) add('info','long',s.id,`${s.en} clip is long (${Math.round(c.dur)} sec)`,'Shorter clips keep customers watching.');
    if(c.bright!=null && c.bright<45) add('warn','dark',s.id,`${s.en} clip looks dark`,'Use a flashlight or move into better light.');
    if(c.sharp!=null && c.sharp<12) add('info','blurry',s.id,`${s.en} clip may be blurry`,'Hold steady and tap to focus.');
  });
  if(I.mods.tires) TIRES.forEach(p=>{ if(I.tires[p]==='') add('warn','meas','tires',`Tread depth missing for ${POS[p].s.en}`,'Enter all four readings.'); });
  if(I.mods.brakes) ['front','rear'].forEach(k=>{ if(I.brakes[k]==='') add('warn','meas','brakes',`${k==='front'?'Front':'Rear'} pad thickness missing`,'Enter the pad measurement.'); });
  flagged(ctx).filter(f=>f.kind==='item' && f.st==='replace' && !(I.media.marks[f.sec]||[]).length).forEach(f=>add('info','nophoto',f.sec,`No circled photo for ${f.base}`,'A circled photo makes the customer far more likely to approve.'));
  if(!I.veh.vin) add('warn','vin','intro','VIN missing','Scan the VIN so history and recalls work.');
  if(!X.firstName(I.veh.customer)) add('info','name','intro','Customer name missing','Adding it personalizes the video (“Hi Jordan…”).');
  if(!I.techName) add('info','tech','intro','Technician not selected','Pick the technician so coaching and the leaderboard count it.');
  const warn=issues.filter(i=>i.level==='warn').length, info=issues.length-warn;
  return { issues, score: Math.max(0, 100 - warn*15 - info*5) };
}
function sheet(title, html, buttons){ $('sheetTitle').textContent=title; $('sheetBody').innerHTML=html; $('sheetFoot').innerHTML=''; buttons.forEach(b=>{ const el=document.createElement('button'); el.className='btn '+(b.cls||''); el.textContent=b.label; el.onclick=b.onClick; $('sheetFoot').appendChild(el); }); $('sheet').hidden=false; }
const closeSheet=()=>{ $('sheet').hidden=true; };
function generate(){
  const q=qualityCheck(), secs=activeSections(ctxOf());
  if(!q.issues.length) return createVideo(q);
  sheet('Quality check', `<div style="display:flex;align-items:baseline;gap:10px"><span class="qscore">${q.score}</span><span>quality score. Fixing these before sending makes a better video.</span></div>
    <div class="qlist">${q.issues.map(i=>`<div class="qi ${i.level}"><span class="ic">${i.level==='warn'?'!':'i'}</span><div>${esc(i.text)}<small>${esc(i.fix)}</small></div><button class="btn small" data-fix="${i.sec}">Fix</button></div>`).join('')}</div>`,
    [{label:'Go back and fix', onClick:closeSheet}, {label:'Create video anyway', cls:'primary', onClick:()=>{ closeSheet(); createVideo(q); }}]);
  $('sheetBody').querySelectorAll('[data-fix]').forEach(b=>b.onclick=()=>{ const i=secs.findIndex(s=>s.id===b.dataset.fix); closeSheet(); if(i>=0){ S.step=i; renderTech(); scrollTo({top:0}); } });
}
async function createVideo(q){
  const I=S.insp; if(!I.finishedAt) I.finishedAt=new Date().toISOString();
  sheet('Creating video', `<p id="genMsg">Uploading clips and photos…</p><div class="exprog" style="height:6px;background:var(--line);border-radius:3px;overflow:hidden"><i id="genBar" style="display:block;height:100%;width:0;background:var(--accent)"></i></div><p class="hint">Keep this screen open. If the signal drops, it picks up again by itself.</p>`, []);
  try{
    await waitForUploads((d,n)=>{ $('genMsg').textContent=`Uploading clips and photos… ${d} of ${n}`; $('genBar').style.width=(n?d/n*100:100)+'%'; });
    $('genMsg').textContent='Saving the inspection…'; $('genBar').style.width='100%';
    const ctx=ctxOf(), fl=flagged(ctx,'en');
    const strip = m => ({id:m.id, sec:m.sec, kind:m.kind, type:m.type, dur:m.dur, parts:m.parts||1, label:m.label||''});
    const h=S.hist;
    const rec = { ...JSON.parse(JSON.stringify(I)), createdAt:I.finishedAt, techSeconds:Math.round(techSeconds()), storeName:STORE?.name||'',
      media:{ clips:Object.fromEntries(Object.entries(I.media.clips).map(([k,m])=>[k,strip(m)])), marks:Object.fromEntries(Object.entries(I.media.marks).map(([k,l])=>[k,l.map(strip)])) },
      clipQuality:Object.fromEntries(Object.entries(I.media.clips).map(([k,m])=>[k,{bright:m.bright, sharp:m.sharp, dur:m.dur}])),
      flags: fl.map(f=>({key:f.key, sec:f.sec, st:f.st, prio:f.prio, label:f.base, kind:f.kind})),
      quality: q,
      histSnapshot: h ? { id:h.id, createdAt:h.createdAt, units:h.units, tires:h.tires, brakes:h.brakes, odo:h.veh?.odo||'', marks:Object.fromEntries(Object.entries(h.media?.marks||{}).map(([k,l])=>[k,l.map(m=>({...m, owner:h.id}))])) } : null,
      approval:null, done:true };
    await api('insp/'+I.id, {method:'PUT', body:JSON.stringify(rec)});
    closeSheet();
    try{ await IDB.del('kv','draft'); await IDB.clear('blobs'); }catch(e){}
    const id=I.id; S.insp=null; location.hash='#/ready/'+id;
  }catch(e){
    sheet('Couldn’t save yet', `<p>${esc(e.message)}</p><p class="hint">Your inspection is safe on this phone. Check the signal and try again.</p>`, [{label:'Close', onClick:closeSheet},{label:'Try again', cls:'primary', onClick:()=>{ closeSheet(); createVideo(q); }}]);
  }
}

/* ================= ready screen (after creating) ================= */
let readyTimer;
async function renderReady(id){
  clearInterval(readyTimer);
  main.innerHTML = `<div class="narrow"><p class="empty">Loading…</p></div>`;
  let d; try{ d=await api('insp/'+id); }catch(e){ main.innerHTML=`<div class="narrow"><div class="banner">${esc(e.message)}</div></div>`; return; }
  const rec=d.inspection, store=STORES.find(s=>s.id===rec.storeId)||STORE, link=`${location.origin}/v/${rec.id}`;
  main.innerHTML = `<div class="narrow" style="max-width:820px">
    <div class="banner neutral"><span><b>✓ Inspection video created</b> · ${esc(rec.veh.year)} ${esc(rec.veh.make)} ${esc(rec.veh.model)} for ${esc(rec.veh.customer||'customer')}</span><a class="btn small dark" href="#/" id="nextBtn">Start next inspection</a></div>
    <div id="readyPlayer"></div>
    <div class="ctrl"><label class="btn small"><input type="checkbox" id="rVoice" checked> Voiceover</label><span class="sp"></span><span class="hint">Quality score ${rec.quality?.score??'—'} · tech time ${mmss(rec.techSeconds||0)}</span></div>
    <div class="card panel" style="margin-top:14px"><h3>Customer link</h3>
      <div class="linkbox"><input readonly value="${esc(link)}" id="linkIn"><button class="btn small" id="copyLink">Copy link</button><a class="btn small" href="${esc(link)}" target="_blank" rel="noopener">Open customer page</a></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn small" disabled>Send by text</button><button class="btn small" disabled>Send by email</button><span class="soon-tag">Coming soon</span></div>
      <p>For now, copy the link and send it from your usual texting or email tool.</p></div>
    <div class="card panel" style="margin-top:14px"><h3>Watched</h3><div id="watchStat"></div></div>
  </div>`;
  const player = X.createPlayer($('readyPlayer'));
  $('rVoice').onchange=e=>player.setVoice(e.target.checked);
  $('copyLink').onclick=async()=>{ try{ await navigator.clipboard.writeText(link); toast('Link copied'); }catch(e){ $('linkIn').select(); toast('Press copy to copy the selected link'); } };
  const media = await loadRecordMedia(rec);
  if(!media.clips.outro && store?.outro){ try{ media.storeOutro={url:await fetchMedia('store', store.outro), dur:store.outro.dur}; }catch(e){} }
  player.load({ insp:rec, store:storeView(store), hist:rec.histSnapshot, media, techPhotoUrl: techPhotoUrl((store?.techs||[]).find(t=>t.id===rec.techId)), lang:rec.lang||'en' });
  const paint = v => { $('watchStat') && ($('watchStat').innerHTML = watchStatusHTML(rec, v)); };
  paint(d.views);
  readyTimer=setInterval(async()=>{ if(route().name!=='ready'){ clearInterval(readyTimer); return; } try{ const x=await api('insp/'+id); rec.approval=x.inspection.approval; paint(x.views); }catch(e){} }, 20000);
}
async function loadRecordMedia(rec){
  const out={clips:{}, marks:{}};
  await Promise.all(Object.entries(rec.media?.clips||{}).map(async([sec,m])=>{ try{ out.clips[sec]={url:await fetchMedia(rec.id,m), dur:m.dur}; }catch(e){} }));
  await Promise.all(Object.entries(rec.media?.marks||{}).map(async([sec,l])=>{ out.marks[sec]=[]; for(const m of l){ try{ out.marks[sec].push({url:await fetchMedia(rec.id,m), label:m.label}); }catch(e){} } }));
  return out;
}
function watchState(rec, v){
  v=v||rec.views||{}; const ageH=(Date.now()-Date.parse(rec.createdAt||Date.now()))/36e5;
  if(!v.opens) return {key: ageH>=2?'late':'unopened', label: ageH>=2?`Not opened · ${Math.floor(ageH)}h — follow up`:'Not opened yet', cls: ageH>=2?'replace':'plain'};
  if(v.completed || v.maxPct>=95) return {key:'done', label:'Watched to the end', cls:'good'};
  return {key:'partial', label:`Opened · watched ${Math.round(v.maxPct||0)}%`, cls:'monitor'};
}
function watchStatusHTML(rec, v){
  const w=watchState(rec, v), ap=rec.approval, nf=(rec.flags||[]).length;
  return `<div style="display:flex;gap:8px;flex-wrap:wrap">${pillHTML(w.cls, w.label)}${ap?pillHTML('good',`Approved ${ap.keys.length} of ${nf}`):''}</div>
    <p>${v?.opens?`First opened ${new Date(v.firstOpenedAt).toLocaleString()}, ${v.opens} view${v.opens===1?'':'s'}.`:'You’ll see here when the customer opens the link and how much they watch. This updates every 20 seconds.'}</p>`;
}

/* ================= manager data ================= */
let DATA={rows:[], at:0};
async function loadData(force){
  if(!force && Date.now()-DATA.at<30000) return DATA.rows;
  const d=await api('insp?days=120'); DATA={rows:d.inspections||[], at:Date.now()}; return DATA.rows;
}
const MF = { store:'all', days:30 };
function filterRows(rows, days=MF.days, offsetDays=0){
  const end=Date.now()-offsetDays*864e5, start=end-days*864e5;
  return rows.filter(r=>{ const t=Date.parse(r.createdAt); return t>=start && t<end && (MF.store==='all'||r.storeId===MF.store); });
}
function stats(rows){
  const n=rows.length, opened=rows.filter(r=>r.views?.opens).length, done=rows.filter(r=>r.views?.completed||r.views?.maxPct>=95).length;
  const rec=rows.reduce((a,r)=>a+(r.flags||[]).length,0), ap=rows.reduce((a,r)=>a+(r.approval?.keys?.length||0),0);
  const t=n?rows.reduce((a,r)=>a+(r.techSeconds||0),0)/n:0, q=n?rows.reduce((a,r)=>a+(r.quality?.score??100),0)/n:0;
  return { n, opened, done, openRate:n?opened/n:0, doneRate:n?done/n:0, rec, ap, apRate:rec?ap/rec:0, avgT:t, avgQ:q };
}
const pct = x => Math.round(x*100)+'%';
function filtersHTML(withDays=true){
  return `<div class="dfilters"><select id="fStore"><option value="all">All stores</option>${STORES.map(s=>`<option value="${esc(s.id)}" ${MF.store===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select>
    ${withDays?`<select id="fDays">${[7,30,90].map(d=>`<option value="${d}" ${MF.days===d?'selected':''}>Last ${d} days</option>`).join('')}</select>`:''}<span style="flex:1"></span><button class="btn small" id="fRefresh">Refresh</button></div>`;
}
function bindFilters(rerender){
  $('fStore') && ($('fStore').onchange=e=>{ MF.store=e.target.value; rerender(); });
  $('fDays') && ($('fDays').onchange=e=>{ MF.days=+e.target.value; rerender(); });
  $('fRefresh') && ($('fRefresh').onclick=()=>{ DATA.at=0; rerender(); });
}
async function withData(fn){
  main.innerHTML=`<p class="empty">Loading…</p>`;
  try{ const rows=await loadData(); fn(rows); }
  catch(e){ main.innerHTML=`<div class="banner">Can’t load inspections: ${esc(e.message)}. If the site was just uploaded, see the setup guide.</div>`; }
}
function techAgg(rows){
  const by={}; rows.forEach(r=>{ const k=r.techName||'Unassigned'; (by[k] ||= []).push(r); });
  const storeAvgT = rows.length ? rows.reduce((a,r)=>a+(r.techSeconds||0),0)/rows.length : 0;
  return Object.entries(by).map(([name,rs])=>{ const s=stats(rs); const score=Math.round(0.4*s.avgQ + 30*s.openRate + 30*s.apRate);
    const codes={}; rs.forEach(r=>(r.quality?.issues||[]).forEach(i=>codes[i.code]=(codes[i.code]||0)+1));
    const techId=rs.find(r=>r.techId)?.techId; const store=STORES.find(x=>x.id===rs[0].storeId); const tech=(store?.techs||[]).find(t=>t.id===techId);
    return { name, rows:rs, s, score, codes, photo:techPhotoUrl(tech), storeAvgT }; }).sort((a,b)=>b.score-a.score);
}
function coachTips(a, all){
  const tips=[], s=a.s, n=a.rows.length, c=a.codes;
  const top=(code,msg)=>{ if((c[code]||0)>=Math.max(1,Math.ceil(n*0.25))) tips.push(msg.replace('{n}', c[code])); };
  top('dark','{n} clips were too dark. Use a flashlight or pull the car into better light.');
  top('noclip','Skipped clips {n} times. Every section needs a clip, even a quick sweep.');
  top('short','{n} clips were under 3 seconds. Aim for 10–15 seconds so customers can see the issue.');
  top('nophoto','Replace items were missing a circled photo {n} time(s). Circled photos raise approvals.');
  top('meas','Measurements were missing {n} times. Enter all tread and pad readings.');
  top('name','Customer name was missing {n} times. Names make the video personal.');
  if(a.storeAvgT && s.avgT > a.storeAvgT*1.25 && n>=3) tips.push(`Average time ${mmss(s.avgT)} vs store ${mmss(a.storeAvgT)}. Record one clip per section and enter numbers right after.`);
  if(n>=3 && s.openRate<0.5) tips.push(`Only ${pct(s.openRate)} of customers opened the video. Check that the customer name and phone are entered so the advisor can send it quickly.`);
  if(tips.length===0) tips.push(n>=3 ? 'Strong, consistent videos. Keep it up.' : 'Not enough inspections yet for coaching notes.');
  return tips.slice(0,3);
}

/* ---------- dashboard ---------- */
function renderManager(){ withData(rows=>{
  const cur=filterRows(rows), s=stats(cur);
  main.innerHTML = `${filtersHTML()}${!rows.length?`<div class="banner neutral">No inspections yet. Once technicians create videos, results show up here.</div>`:''}
  <div class="kpis">${[['Inspections',s.n,`last ${MF.days} days`],['Videos opened',s.n?pct(s.openRate):'—',`${s.opened} of ${s.n}`],['Watched to the end',s.n?pct(s.doneRate):'—',`${s.done} of ${s.n}`],['Items approved',s.rec?pct(s.apRate):'—',`${s.ap} of ${s.rec}`],['Avg tech time',s.n?mmss(s.avgT):'—','vehicle clip to video'],['Avg quality',s.n?Math.round(s.avgQ):'—','out of 100']].map(([l,v,sub])=>`<div class="card kpi"><span>${l}</span><b>${v}</b><small>${sub}</small></div>`).join('')}</div>
  <div class="dgrid"><div class="card dcard"><h3>Inspections</h3><p class="sub">${MF.days>30?'Per week':'Per day'}</p><div id="volChart"></div></div>
  <div class="card dcard"><h3>Most flagged items</h3><p class="sub">Share of inspections with Monitor or Replace</p><div class="hbars" id="topFlags"></div></div></div>
  <div class="card dcard"><h3>Recent inspections</h3><p class="sub">Not opened after 2 hours means it’s time to follow up</p><div class="tblwrap">${cur.length?`<table><thead><tr><th>Date</th><th>Vehicle</th><th>Customer</th><th>Technician</th><th class="n">Flags</th><th class="n">Quality</th><th>Watched</th><th>Approved</th></tr></thead><tbody>${cur.slice(0,40).map(r=>{ const w=watchState(r); return `<tr><td>${new Date(r.createdAt).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</td><td><a href="#/ready/${esc(r.id)}">${esc(r.veh.year)} ${esc(r.veh.model)}</a></td><td>${esc(r.veh.customer||'')}</td><td>${esc(r.techName||'')}</td><td class="n">${(r.flags||[]).length}</td><td class="n">${r.quality?.score??'—'}</td><td>${pillHTML(w.cls,w.label)}</td><td>${r.approval?pillHTML('good',`${r.approval.keys.length} of ${(r.flags||[]).length}`):'—'}</td></tr>`; }).join('')}</tbody></table>`:`<p class="empty">No inspections in this period.</p>`}</div></div>`;
  bindFilters(renderManager); volChart(cur); topFlags(cur);
}); }
function volChart(rows){
  const box=$('volChart'); if(!box) return; const weekly=MF.days>30, bucket=(weekly?7:1)*864e5, nb=Math.ceil(MF.days/(weekly?7:1));
  const end=new Date(); end.setHours(23,59,59,999); const start=end.getTime()-nb*bucket;
  const b=Array.from({length:nb},(_,i)=>({t:start+i*bucket, c:0})); rows.forEach(r=>{ const i=Math.floor((Date.parse(r.createdAt)-start)/bucket); if(i>=0&&i<nb) b[i].c++; });
  const W=Math.max(280, box.clientWidth||600), H=180, pl=28, pr=6, pt=10, pb=24, max=Math.max(4,...b.map(x=>x.c)), step=Math.ceil(max/4), top=step*4, bw=(W-pl-pr)/nb, gap=Math.min(4,bw*0.25), every=Math.ceil(nb/6);
  let g=''; for(let i=0;i<=4;i++){ const y=pt+(H-pt-pb)*(1-i/4); g+=`<line class="grid" x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}"/><text x="${pl-6}" y="${y+4}" text-anchor="end">${i*step}</text>`; }
  let bars='', labs=''; b.forEach((x,i)=>{ const h=(H-pt-pb)*x.c/top, xx=pl+i*bw+gap/2, w=Math.max(1,bw-gap), d=new Date(x.t);
    if(x.c) bars+=`<rect x="${xx}" y="${H-pb-h}" width="${w}" height="${h}" rx="${Math.min(4,w/2)}" fill="var(--bar)"><title>${weekly?'Week of ':''}${d.toLocaleDateString([], {month:'short',day:'numeric'})}: ${x.c}</title></rect>`;
    if(i%every===0) labs+=`<text x="${xx+w/2}" y="${H-6}" text-anchor="middle">${d.toLocaleDateString([], {month:'short',day:'numeric'})}</text>`; });
  box.innerHTML=`<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Inspections over time">${g}<line x1="${pl}" x2="${W-pr}" y1="${H-pb}" y2="${H-pb}" stroke="var(--muted)"/>${bars}${labs}</svg>`;
}
function topFlags(rows, el='topFlags', limit=8){
  const c={}; rows.forEach(r=> new Set((r.flags||[]).filter(f=>f.st!=='recall').map(f=>f.label)).forEach(l=>c[l]=(c[l]||0)+1));
  const top=Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,limit), n=rows.length||1, max=top.length?top[0][1]:1;
  const box=$(el); if(box) box.innerHTML = top.length ? top.map(([l,v])=>`<div class="hb" title="${esc(l)}: ${v} of ${rows.length}"><span>${esc(l)}</span><div class="tr"><i style="width:${v/max*100}%"></i></div><b>${Math.round(v/n*100)}%</b></div>`).join('') : `<div class="empty">No flagged items in this period.</div>`;
  return top;
}

/* ---------- coaching ---------- */
function renderCoaching(){ withData(rows=>{
  const cur=filterRows(rows), list=techAgg(cur);
  main.innerHTML = `${filtersHTML()}<div class="card dcard" style="margin-bottom:14px"><h3>Leaderboard</h3><p class="sub">Score = 40% video quality + 30% customers opening + 30% items approved</p><div class="tblwrap">${list.length?`<table><thead><tr><th>#</th><th>Technician</th><th class="n">Score</th><th class="n">Inspections</th><th class="n">Avg time</th><th class="n">Quality</th><th class="n">Opened</th><th class="n">Approved</th></tr></thead><tbody>${list.map((a,i)=>`<tr><td>${i+1}</td><td>${esc(a.name)}</td><td class="n"><b>${a.score}</b></td><td class="n">${a.s.n}</td><td class="n">${mmss(a.s.avgT)}</td><td class="n">${Math.round(a.s.avgQ)}</td><td class="n">${pct(a.s.openRate)}</td><td class="n">${a.s.rec?pct(a.s.apRate):'—'}</td></tr>`).join('')}</tbody></table>`:`<p class="empty">No inspections in this period.</p>`}</div></div>
  <div class="coach">${list.map((a,i)=>`<div class="card coachcard"><div class="who">${a.photo?`<img src="${esc(a.photo)}" alt="">`:`<div class="av">${esc(initials(a.name))}</div>`}<div><b>${esc(a.name)}</b><div class="hint" style="margin:0">${a.s.n} inspection${a.s.n===1?'':'s'}</div></div><span class="rank">#${i+1}</span></div>
    <div class="metrics"><div><b>${Math.round(a.s.avgQ)}</b><span>Quality</span></div><div><b>${mmss(a.s.avgT)}</b><span>Avg time</span></div><div><b>${pct(a.s.openRate)}</b><span>Opened</span></div><div><b>${a.s.rec?pct(a.s.apRate):'—'}</b><span>Approved</span></div></div>
    <div class="lbl" style="margin:4px 0 0">Coaching</div><ul>${coachTips(a,cur).map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}</div>`;
  bindFilters(renderCoaching);
}); }

/* ---------- weekly summary ---------- */
function renderWeekly(){ withData(rows=>{
  const cur=filterRows(rows,7,0), prev=filterRows(rows,7,7), s=stats(cur), p=stats(prev), list=techAgg(cur);
  const storeName = MF.store==='all' ? 'All stores' : (STORES.find(x=>x.id===MF.store)?.name||'');
  const delta=(a,b,fmt)=>{ if(!prev.length) return ''; const d=a-b; if(Math.abs(d)<1e-9) return '<small>same as last week</small>'; return `<small class="${d>0?'up':'down'}">${d>0?'▲':'▼'} ${fmt(Math.abs(d))} vs last week</small>`; };
  const late=cur.filter(r=>watchState(r).key==='late');
  const c={}; cur.forEach(r=> new Set((r.flags||[]).filter(f=>f.st!=='recall').map(f=>f.label)).forEach(l=>c[l]=(c[l]||0)+1));
  const topF=Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const monitorCount=cur.reduce((a,r)=>a+(r.flags||[]).filter(f=>f.prio!=='today' && !(r.approval?.keys||[]).includes(f.key)).length,0);
  const from=new Date(Date.now()-7*864e5).toLocaleDateString([], {month:'short',day:'numeric'}), to=new Date().toLocaleDateString([], {month:'short',day:'numeric'});
  const lines = [
    `Vehicle Health Check — weekly summary (${storeName}, ${from} – ${to})`,
    `Inspections: ${s.n}${prev.length?` (last week ${p.n})`:''}`,
    `Videos opened: ${s.n?pct(s.openRate):'—'} · watched to the end: ${s.n?pct(s.doneRate):'—'}`,
    `Items approved: ${s.rec?pct(s.apRate):'—'} (${s.ap} of ${s.rec})`,
    `Average tech time: ${s.n?mmss(s.avgT):'—'} · average quality: ${s.n?Math.round(s.avgQ):'—'}/100`,
    topF.length?`Most flagged: ${topF.map(([l,v])=>`${l} (${v})`).join(', ')}`:'',
    list[0]?`Top technician: ${list[0].name} (score ${list[0].score})`:'',
    late.length?`Needs follow-up: ${late.length} video${late.length===1?'':'s'} not opened after 2 hours`:'',
    monitorCount?`Open follow-up items (soon / next visit, not approved): ${monitorCount}`:'',
  ].filter(Boolean);
  main.innerHTML = `${filtersHTML(false)}<div class="card summary"><div class="eyebrow">${esc(from)} – ${esc(to)} · ${esc(storeName)}</div><h2>Weekly summary</h2>
    <div class="kpis" style="margin:0">${[['Inspections',s.n,delta(s.n,p.n,v=>v)],['Videos opened',s.n?pct(s.openRate):'—',delta(s.openRate,p.openRate,v=>Math.round(v*100)+' pts')],['Watched to the end',s.n?pct(s.doneRate):'—',delta(s.doneRate,p.doneRate,v=>Math.round(v*100)+' pts')],['Items approved',s.rec?pct(s.apRate):'—',delta(s.apRate,p.apRate,v=>Math.round(v*100)+' pts')],['Avg tech time',s.n?mmss(s.avgT):'—',''],['Avg quality',s.n?Math.round(s.avgQ):'—',delta(s.avgQ,p.avgQ,v=>Math.round(v)+' pts')]].map(([l,v,sub])=>`<div class="card kpi"><span>${l}</span><b>${v}</b>${sub}</div>`).join('')}</div>
    <div><div class="lbl">Most flagged</div>${topF.length?`<ul>${topF.map(([l,v])=>`<li>${esc(l)} — ${v} inspection${v===1?'':'s'}</li>`).join('')}</ul>`:'<p class="hint">Nothing flagged this week.</p>'}</div>
    <div><div class="lbl">Technicians</div>${list.length?`<ul>${list.map((a,i)=>`<li><b>${i===0?'🏆 ':''}${esc(a.name)}</b> — score ${a.score}, ${a.s.n} inspection${a.s.n===1?'':'s'}. ${esc(coachTips(a,cur)[0])}</li>`).join('')}</ul>`:'<p class="hint">No inspections this week.</p>'}</div>
    <div><div class="lbl">Needs follow-up</div>${late.length?`<ul>${late.slice(0,10).map(r=>`<li><a href="#/ready/${esc(r.id)}">${esc(r.veh.customer||'Customer')} · ${esc(r.veh.year)} ${esc(r.veh.model)}</a> — not opened</li>`).join('')}</ul>`:'<p class="hint">Every video was opened.</p>'}${monitorCount?`<p>${monitorCount} recommended item${monitorCount===1?'':'s'} marked Soon or Next visit weren’t approved — good candidates for a follow-up call.</p>`:''}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn primary" id="copySum">Copy summary</button><button class="btn" disabled>Email every Monday</button><span class="soon-tag">Coming soon</span></div></div>`;
  bindFilters(renderWeekly);
  $('copySum').onclick=async()=>{ try{ await navigator.clipboard.writeText(lines.join('\n')); toast('Summary copied'); }catch(e){ toast('Copy isn’t available here'); } };
}); }

/* ---------- stores ---------- */
let EDIT=null;
function renderStores(){
  if(!EDIT) EDIT=structuredClone(STORE||DEFAULT_STORE);
  const s=EDIT, logo=storeLogoUrl(s);
  main.innerHTML = `<div class="dfilters"><select id="stPick">${STORES.map(x=>`<option value="${esc(x.id)}" ${x.id===s.id?'selected':''}>${esc(x.name)}</option>`).join('')}${STORES.find(x=>x.id===s.id)?'':`<option selected>${esc(s.name||'New store')} (new)</option>`}</select><button class="btn small" id="stAdd">+ Add store</button><span style="flex:1"></span><button class="btn primary" id="stSave">Save store</button></div>
  <div class="sgrid">
    <div class="card"><h3>Dealership</h3><p>Name and logo appear on every card of the customer video.</p>
      <div class="field"><label for="stName">Store name</label><input id="stName" value="${esc(s.name)}"></div>
      <div class="logorow">${logo?`<div class="logo img"><img src="${esc(logo)}" alt=""></div>`:`<div class="logo">${esc(initials(s.name))}</div>`}<label class="btn small primary">Upload logo<input type="file" accept="image/*" id="stLogo" hidden></label>${logo?`<button class="btn small" id="stLogoClear">Remove</button>`:''}</div></div>
    <div class="card"><h3>Language & units</h3>
      <div class="field"><label for="stLang">Default video language</label><select id="stLang"><option value="en" ${s.lang==='en'?'selected':''}>English</option><option value="es" ${s.lang==='es'?'selected':''}>Español</option></select></div>
      <div class="field"><label for="stUnits">Tread depth units</label><select id="stUnits"><option value="32" ${s.units==='32'?'selected':''}>32nds of an inch</option><option value="mm" ${s.units==='mm'?'selected':''}>Millimetres</option></select></div></div>
    <div class="card"><h3>Status cutoffs</h3><p>Status fills in from the number.</p><div class="fields">
      <div class="field"><label>Tire good at or above (32nds)</label><input type="number" data-th="tireGood" value="${s.th.tireGood}" inputmode="decimal"></div>
      <div class="field"><label>Tire replace at or below (32nds)</label><input type="number" data-th="tireReplace" value="${s.th.tireReplace}" inputmode="decimal"></div>
      <div class="field"><label>Pads good at or above (mm)</label><input type="number" data-th="padGood" value="${s.th.padGood}" inputmode="decimal"></div>
      <div class="field"><label>Pads replace below (mm)</label><input type="number" data-th="padReplace" value="${s.th.padReplace}" inputmode="decimal"></div></div></div>
    <div class="card"><h3>Sections</h3><p>Turn sections off for this store (for example a quick-lane store). Intro, recommendations and closing always run.</p>
      ${OPTIONAL.map(id=>`<label class="toggle"><span>${SECTIONS.find(x=>x.id===id).en}</span><input type="checkbox" data-mod="${id}" ${s.mods[id]?'checked':''}></label>`).join('')}</div>
    <div class="card"><h3>Thank-you video</h3><p>Plays at the end of every customer video when the tech doesn’t record their own. Keep it under 20 seconds.</p>
      ${s.outro?`<video id="stOutroPrev" controls playsinline style="width:100%;max-height:220px;border-radius:10px;background:#000"></video>`:'<p class="hint">None yet.</p>'}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><label class="btn small primary">${s.outro?'Replace video':'Record or upload'}<input type="file" accept="video/*" capture="user" id="stOutro" hidden></label>${s.outro?`<button class="btn small" id="stOutroClear">Remove</button>`:''}</div></div>
    <div class="card"><h3>Technicians</h3><p>Their photo appears on the opening card of the customer video.</p>
      <div id="techList">${(s.techs||[]).map((t,i)=>`<div class="techrow">${techPhotoUrl(t)?`<img class="av" src="${esc(techPhotoUrl(t))}" alt="">`:`<div class="av">${esc(initials(t.name))}</div>`}<input type="text" data-tname="${i}" value="${esc(t.name)}"><label class="btn small">Photo<input type="file" accept="image/*" data-tphoto="${i}" hidden></label><button class="btn small" data-tdel="${i}">✕</button></div>`).join('')||'<p class="hint">No technicians yet.</p>'}</div>
      <div class="addrow" style="display:flex;gap:8px"><input id="newTech" placeholder="Technician name" style="flex:1;min-width:0;border:1px solid var(--line);background:var(--surface2);border-radius:9px;padding:9px 11px"><button class="btn small" id="addTech">Add</button></div></div>
  </div>`;
  const rer=()=>renderStores();
  $('stPick').onchange=e=>{ const x=STORES.find(y=>y.id===e.target.value); if(x){ EDIT=structuredClone(x); rer(); } };
  $('stAdd').onclick=()=>{ EDIT={...structuredClone(DEFAULT_STORE), id:'s'+uid(8), name:'New store', techs:[]}; rer(); };
  $('stName').oninput=e=>{ EDIT.name=e.target.value; };
  $('stLang').onchange=e=>{ EDIT.lang=e.target.value; };
  $('stUnits').onchange=e=>{ EDIT.units=e.target.value; };
  main.querySelectorAll('[data-th]').forEach(el=>el.oninput=()=>{ const n=parseFloat(el.value); if(!isNaN(n)) EDIT.th[el.dataset.th]=n; });
  main.querySelectorAll('[data-mod]').forEach(el=>el.onchange=()=>{ EDIT.mods[el.dataset.mod]=el.checked; });
  main.querySelectorAll('[data-tname]').forEach(el=>el.oninput=()=>{ EDIT.techs[+el.dataset.tname].name=el.value; });
  main.querySelectorAll('[data-tdel]').forEach(el=>el.onclick=()=>{ EDIT.techs.splice(+el.dataset.tdel,1); rer(); });
  main.querySelectorAll('[data-tphoto]').forEach(el=>el.onchange=async()=>{ const f=el.files[0]; if(!f) return; const t=EDIT.techs[+el.dataset.tphoto]; try{ const b=await shrinkImage(f, 400); const key='t'+uid(10); await uploadBlob('store', key, b, 'image/jpeg'); t.photoKey=key; toast('Photo added — tap Save store'); rer(); }catch(e){ toast('Upload failed: '+e.message); } });
  $('addTech').onclick=()=>{ const n=$('newTech').value.trim(); if(!n) return; (EDIT.techs ||= []).push({id:'t'+uid(8), name:n}); rer(); };
  $('stLogo').onchange=async e=>{ const f=e.target.files[0]; if(!f) return; try{ const b = f.type==='image/svg+xml' ? f : await shrinkImage(f, 800, 'image/png', true); const key='l'+uid(10); await uploadBlob('store', key, b, b.type||'image/png'); EDIT.logoKey=key; toast('Logo uploaded — tap Save store'); rer(); }catch(err){ toast('Upload failed: '+err.message); } };
  $('stLogoClear') && ($('stLogoClear').onclick=()=>{ EDIT.logoKey=null; rer(); });
  if(s.outro && $('stOutroPrev')) fetchMedia('store', s.outro).then(u=>{ const v=$('stOutroPrev'); if(v) v.src=u; }).catch(()=>{});
  $('stOutroClear') && ($('stOutroClear').onclick=()=>{ EDIT.outro=null; rer(); });
  $('stOutro').onchange=async e=>{ const f=e.target.files[0]; e.target.value=''; if(!f) return;
    if(f.size>80*1024*1024){ toast('That video is too large. Keep it under 20 seconds.'); return; }
    try{ toast('Uploading thank-you video…', 8000); const a=await analyzeClip(URL.createObjectURL(f)); const id='o'+uid(10), type=f.type||'video/mp4'; const parts=await uploadBlob('store', id, f, type);
      EDIT.outro={id, parts, type, dur:Math.round((a.dur||0)*10)/10}; toast('Thank-you video uploaded — tap Save store'); rer(); }
    catch(err){ toast('Upload failed: '+err.message); } };
  $('stSave').onclick=async()=>{ try{ if(!EDIT.name.trim()) EDIT.name='Brimell Toyota'; await api('stores/'+EDIT.id, {method:'PUT', body:JSON.stringify(EDIT)}); const i=STORES.findIndex(x=>x.id===EDIT.id); if(i>=0) STORES[i]=structuredClone(EDIT); else STORES.push(structuredClone(EDIT)); if(STORE?.id===EDIT.id || !STORE) setStore(EDIT.id); paintHeader(); toast('Store saved'); rer(); }catch(e){ toast('Couldn’t save: '+e.message); } };
}
function trimCanvas(c){
  // Crop empty margins (transparent or plain white) around a logo so it fills its space
  const x=c.getContext('2d',{willReadFrequently:true}), {width:w,height:h}=c, d=x.getImageData(0,0,w,h).data;
  const empty=i=>d[i+3]<16 || (d[i]>245&&d[i+1]>245&&d[i+2]>245);
  let t=h,l=w,r=-1,bm=-1;
  for(let y=0;y<h;y++) for(let xx=0;xx<w;xx++){ if(!empty((y*w+xx)*4)){ if(y<t)t=y; if(y>bm)bm=y; if(xx<l)l=xx; if(xx>r)r=xx; } }
  if(r<0) return c; const pad=Math.round(Math.max(r-l,bm-t)*0.03), L=Math.max(0,l-pad), Tp=Math.max(0,t-pad), W=Math.min(w,r+pad+1)-L, H=Math.min(h,bm+pad+1)-Tp;
  if(W>=w-2 && H>=h-2) return c;
  const o=document.createElement('canvas'); o.width=W; o.height=H; o.getContext('2d').drawImage(c,L,Tp,W,H,0,0,W,H); return o;
}
function shrinkImage(file, max, type='image/jpeg', trim=false){
  return new Promise((res,rej)=>{ const img=new Image(); img.onload=()=>{ const sc=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)); let c=document.createElement('canvas'); c.width=Math.round(img.naturalWidth*sc); c.height=Math.round(img.naturalHeight*sc); c.getContext('2d').drawImage(img,0,0,c.width,c.height); if(trim) c=trimCanvas(c); c.toBlob(b=>b?res(b):rej(new Error('image')), type, .9); }; img.onerror=()=>rej(new Error('Could not read image')); img.src=URL.createObjectURL(file); });
}

/* ================= router ================= */
function route(){ const h=location.hash.replace(/^#\/?/,''); const [name, id]=h.split('/'); return { name: name||'tech', id }; }
async function render(){
  const r=route(); clearInterval(readyTimer);
  document.querySelectorAll('#tabs .tab').forEach(a=>a.classList.toggle('on', a.dataset.r===(r.name==='ready'?'tech':r.name)));
  if(r.name!=='stores') EDIT=null;
  if(r.name==='tech' || r.name===''){ if(!S.insp){ const had=await loadDraft(); if(!had) await startNew(); else toast('Picked up where you left off'); if(!S.insp.techId && !S.insp.techName){ let id=null; try{ id=localStorage.getItem('vhc-tech'); }catch(e){} try{ const ts=STORE?.techs||[]; const t=ts.find(x=>x.id===id)||ts[0]; if(t){ S.insp.techId=t.id; S.insp.techName=t.name; } }catch(e){} } if(S.insp.veh.vin) loadHistory(); } renderTech(); }
  else if(r.name==='ready') renderReady(r.id);
  else if(r.name==='manager') renderManager();
  else if(r.name==='coaching') renderCoaching();
  else if(r.name==='weekly') renderWeekly();
  else if(r.name==='stores') renderStores();
  scrollTo({top:0});
}
addEventListener('hashchange', render);
(async()=>{ await loadStores(); render(); if(navigator.storage?.persist) navigator.storage.persist().catch(()=>{}); })();
})();
