/* Vehicle Health Check — customer page (/v/:id) */
(function(){
const X=window.VHC, { esc, cap1, uid, PRIO, POS, TIRES, T, flagged, tireStatus, padStatus, tireFmt, fmtDate, glyph, initials, badgeSVG } = X;
const $=id=>document.getElementById(id), main=$('main');
let tt; function toast(m){ const el=$('toast'); el.textContent=m; el.hidden=false; clearTimeout(tt); tt=setTimeout(()=>el.hidden=true,3000); }

const C = {
  en:{ hi:n=>n?`Hi ${n},`:'Hello,', intro:(v,s)=>`Here is the inspection video for your ${v}. ${s?`From the team at ${s}.`:''}`, play:'Tap play to watch. Turn your sound on.',
    recs:'Recommendations', none:'Good news: nothing needs attention today.', approveTitle:'Choose what you’d like us to do', approveBtn:'Approve selected', approved:(n)=>`Thank you. You approved ${n} item${n===1?'':'s'}. Your service advisor will confirm with you.`,
    approvedNone:'Thank you. Your advisor will follow up with you.', change:'Change my selection', since:'Since your last visit', was:'Last visit', now:'Today', photos:'Photos side by side', recall:'Open recall',
    recallNote:'Recall repairs are free at any authorized dealer.', grp:{today:'Do today', soon:'Soon', next:'Next visit'}, grpSub:{today:'Recommended before you leave', soon:'Plan within the next few weeks', next:'We’ll check again next visit'},
    why:'Why it matters', notFound:'This inspection link isn’t valid or has expired.', voice:'Voiceover', lang:'Español', tech:'Technician', tread:'tread', pads:'pads', front:'Front brake pads', rear:'Rear brake pads', note:'Note from your technician', err:'Couldn’t send. Check your connection and try again.' },
  es:{ hi:n=>n?`Hola ${n},`:'Hola,', intro:(v,s)=>`Este es el video de la inspección de su ${v}. ${s?`Del equipo de ${s}.`:''}`, play:'Toque reproducir para verlo. Active el sonido.',
    recs:'Recomendaciones', none:'Buenas noticias: nada requiere atención hoy.', approveTitle:'Elija lo que desea que hagamos', approveBtn:'Aprobar selección', approved:(n)=>`Gracias. Aprobó ${n} punto${n===1?'':'s'}. Su asesor de servicio lo confirmará con usted.`,
    approvedNone:'Gracias. Su asesor se comunicará con usted.', change:'Cambiar mi selección', since:'Desde su última visita', was:'Última visita', now:'Hoy', photos:'Fotos lado a lado', recall:'Llamado abierto',
    recallNote:'Las reparaciones por llamado son gratuitas en cualquier concesionario autorizado.', grp:{today:'Hacer hoy', soon:'Pronto', next:'Próxima visita'}, grpSub:{today:'Recomendado antes de irse', soon:'Planee en las próximas semanas', next:'Lo revisaremos en la próxima visita'},
    why:'Por qué importa', notFound:'Este enlace de inspección no es válido o ha vencido.', voice:'Voz', lang:'English', tech:'Técnico', tread:'dibujo', pads:'pastillas', front:'Pastillas delanteras', rear:'Pastillas traseras', note:'Nota de su técnico', err:'No se pudo enviar. Revise su conexión e intente de nuevo.' }
};
const PCOL={today:'var(--rep)', soon:'var(--mon)', next:'var(--muted)'};

const id=(location.pathname.match(/\/v\/([A-Za-z0-9_-]+)/)||[])[1] || new URLSearchParams(location.search).get('id');
let REC, STORE, LANG='en', MEDIA, HISTMARKS={}, player, approvalOpen=false;
const mediaUrl=(o,i,p=0)=>`/api/media/${o}/${i}/${p}`;
async function fetchMedia(owner, m){ const parts=await Promise.all(Array.from({length:m.parts||1},(_,i)=>fetch(mediaUrl(owner,m.id,i)).then(r=>{ if(!r.ok) throw 0; return r.blob(); }))); return URL.createObjectURL(new Blob(parts,{type:m.type})); }

/* view tracking: one session per page load, stored per browser for repeat opens */
let SESSION; try{ SESSION=sessionStorage.getItem('vhc-s-'+id); if(!SESSION){ SESSION=uid(16); sessionStorage.setItem('vhc-s-'+id,SESSION); } }catch(e){ SESSION=uid(16); }
const VIEW={ startedAt:new Date().toISOString(), maxPct:0, completed:false };
let vt; function sendView(now){ clearTimeout(vt); const go=()=>{ const body=JSON.stringify({session:SESSION, ...VIEW}); try{ if(now && navigator.sendBeacon){ navigator.sendBeacon('/api/view/'+id, new Blob([body],{type:'application/json'})); return; } }catch(e){} fetch('/api/view/'+id,{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true}).catch(()=>{}); }; if(now) go(); else vt=setTimeout(go,1500); }
addEventListener('pagehide', ()=>sendView(true));

async function boot(){
  if(!id){ main.innerHTML=`<div class="banner">${C.en.notFound}</div>`; return; }
  let d; try{ const r=await fetch('/api/public/'+id); d=await r.json(); if(!r.ok) throw new Error(d.error); }catch(e){ main.innerHTML=`<div class="banner">${C.en.notFound}</div>`; return; }
  REC=d.inspection; STORE=d.store||{name:REC.storeName||''}; LANG=REC.lang==='es'?'es':'en';
  document.documentElement.lang=LANG;
  const logo = STORE.logoKey ? mediaUrl('store', STORE.logoKey) : null;
  $('hdrLogo').className=logo?'logo img':'logo none'; $('hdrLogo').innerHTML=logo?`<img src="${esc(logo)}" alt="${esc(STORE.name||'')}">`:'';
  $('hdrTitle').textContent=STORE.name||'Vehicle Health Check'; $('hdrShop').textContent=T[LANG].inspection; document.title=`${STORE.name?STORE.name+' · ':''}${T[LANG].inspection}`;
  sendView(true);
  MEDIA={clips:{}, marks:{}};
  await Promise.all(Object.entries(REC.media?.clips||{}).map(async([s,m])=>{ try{ MEDIA.clips[s]={url:await fetchMedia(REC.id,m), dur:m.dur}; }catch(e){} }));
  await Promise.all(Object.entries(REC.media?.marks||{}).map(async([s,l])=>{ MEDIA.marks[s]=[]; for(const m of l){ try{ MEDIA.marks[s].push({url:await fetchMedia(REC.id,m), label:m.label}); }catch(e){} } }));
  const hm=REC.histSnapshot?.marks||{};
  await Promise.all(Object.entries(hm).map(async([s,l])=>{ HISTMARKS[s]=[]; for(const m of l.slice(0,2)){ try{ HISTMARKS[s].push({url:await fetchMedia(m.owner||REC.histSnapshot.id,m), label:m.label}); }catch(e){} } }));
  render();
}

function ctx(){
  const tech=(STORE?.techs||[]).find(t=>t.id===REC.techId);
  return { insp:REC, store:{...STORE, logoUrl: STORE.logoKey?mediaUrl('store',STORE.logoKey):null}, hist:REC.histSnapshot, media:MEDIA, lang:LANG,
    techPhotoUrl: tech?.photoKey?mediaUrl('store',tech.photoKey):null, approveHook: ()=>{ document.getElementById('recs')?.scrollIntoView({behavior:'smooth'}); } };
}

function render(){
  const L=C[LANG], c=ctx(), v=REC.veh, first=X.firstName(v.customer), fl=flagged(c, LANG);
  const veh=`${v.year} ${v.make} ${v.model}`.trim();
  main.innerHTML = `
    <div class="hello">${esc(L.hi(first))}</div><p class="sub">${esc(L.intro(veh, STORE.name))} ${esc(L.play)}</p>
    <div id="player"></div>
    <div class="ctrl"><label class="btn small"><input type="checkbox" id="voice" checked> ${L.voice}</label><span class="sp"></span><button class="btn small" id="langBtn">${L.lang}</button></div>
    ${REC.note?`<div class="card panel" style="margin-top:14px"><h3>${L.note}</h3><p>${esc(REC.note)}</p></div>`:''}
    <section id="recs" style="margin-top:20px"><h2 style="font-family:var(--display);text-transform:uppercase;margin:0">${L.recs}</h2>${recsHTML(fl)}</section>
    ${compareHTML(c)}
    <p class="hint" style="margin-top:24px;text-align:center">${T[LANG].tech}: ${esc(REC.techName||'')} · ${fmtDate(REC.createdAt, LANG)}${v.ro?' · RO '+esc(v.ro):''}</p>`;
  player = X.createPlayer($('player'), {
    onSegDone:(k,n)=>{ const p=Math.round((k+1)/n*100); if(p>VIEW.maxPct){ VIEW.maxPct=p; sendView(); } },
    onEnd:()=>{ VIEW.maxPct=100; VIEW.completed=true; sendView(true); }
  });
  player.load(c);
  $('voice').onchange=e=>player.setVoice(e.target.checked);
  $('langBtn').onclick=()=>{ player.stop(); LANG=LANG==='en'?'es':'en'; document.documentElement.lang=LANG; render(); };
  bindApproval(fl);
}

function recsHTML(fl){
  const L=C[LANG]; if(!fl.length) return `<div class="card panel" style="margin-top:10px"><p style="margin:0">${glyph('good')||'✓'} ${L.none}</p></div>`;
  const ap=REC.approval;
  if(ap && !approvalOpen){
    const keys=new Set(ap.keys);
    return `<div class="banner neutral" style="margin-top:10px"><span>${esc(ap.keys.length?L.approved(ap.keys.length):L.approvedNone)}</span><button class="btn small" id="changeAp">${L.change}</button></div>`
      + PRIO.map(p=>{ const g=fl.filter(f=>f.prio===p); if(!g.length) return ''; return `<div class="recgroup"><h3><i style="background:${PCOL[p]}"></i>${L.grp[p]}</h3>${g.map(f=>`<div class="recitem"><span style="font-size:20px;line-height:1">${keys.has(f.key)?'✓':'·'}</span><div><b>${esc(f.label)}</b><span class="why">${esc(f.why)}</span></div></div>`).join('')}</div>`; }).join('');
  }
  const pre=ap?new Set(ap.keys):new Set(fl.filter(f=>f.prio==='today').map(f=>f.key));
  return `<p class="sub" style="margin-top:6px">${L.approveTitle}</p>` + PRIO.map(p=>{ const g=fl.filter(f=>f.prio===p); if(!g.length) return '';
    return `<div class="recgroup"><h3><i style="background:${PCOL[p]}"></i>${L.grp[p]}</h3><p class="hint" style="margin:-4px 0 8px">${L.grpSub[p]}</p>${g.map(f=>`<label class="recitem" for="ap-${esc(f.key)}"><input type="checkbox" id="ap-${esc(f.key)}" data-key="${esc(f.key)}" ${pre.has(f.key)?'checked':''}><div><b>${esc(f.label)} <span class="pill ${f.st}" style="vertical-align:middle">${glyph(f.st)||''} ${T[LANG].st[f.st]}</span></b><span class="why">${L.why}: ${esc(f.why)}</span></div></label>`).join('')}</div>`; }).join('')
    + `<button class="btn primary" id="apBtn" style="width:100%;margin-top:8px;padding:14px">${L.approveBtn}</button>`;
}
function bindApproval(){
  const ch=$('changeAp'); if(ch) ch.onclick=()=>{ approvalOpen=true; rerenderRecs(); };
  const b=$('apBtn'); if(!b) return;
  b.onclick=async()=>{
    const keys=[...main.querySelectorAll('[data-key]')].filter(x=>x.checked).map(x=>x.dataset.key);
    b.disabled=true;
    try{ const r=await fetch('/api/approve/'+id,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({keys})}); const d=await r.json(); if(!r.ok) throw 0; REC.approval=d.approval; approvalOpen=false; rerenderRecs(); toast(keys.length?C[LANG].approved(keys.length):C[LANG].approvedNone); }
    catch(e){ b.disabled=false; toast(C[LANG].err); }
  };
}
function rerenderRecs(){ const fl=flagged(ctx(),LANG); const s=$('recs'); s.innerHTML=`<h2 style="font-family:var(--display);text-transform:uppercase;margin:0">${C[LANG].recs}</h2>${recsHTML(fl)}`; bindApproval(); }

function compareHTML(c){
  const h=REC.histSnapshot, L=C[LANG]; if(!h) return '';
  const rows=[];
  if(REC.mods?.tires!==false) TIRES.forEach(p=>{ const was=h.tires?.[p], now=REC.tires?.[p]; if(was!==''&&was!=null&&now!==''&&now!=null) rows.push([cap1(`${POS[p][LANG]} ${L.tread}`), tireFmt(was,h.units||'32'), tireFmt(now,REC.units), tireStatus(now,c)]); });
  if(REC.mods?.brakes!==false) ['front','rear'].forEach(k=>{ const was=h.brakes?.[k], now=REC.brakes?.[k]; if(was!==''&&was!=null&&now!==''&&now!=null) rows.push([L[k], `${was} mm`, `${now} mm`, padStatus(now,c)]); });
  const pairs=[]; Object.entries(HISTMARKS).forEach(([s,l])=>{ const cur=MEDIA.marks[s]||[]; if(l[0] && cur[0]) pairs.push([l[0],cur[0]]); });
  if(!rows.length && !pairs.length) return '';
  return `<section class="card panel" style="margin-top:20px"><h3>${L.since} · ${fmtDate(h.createdAt,LANG)}${h.odo?' · '+esc(h.odo):''}</h3>
    ${rows.length?`<div>${`<div class="cmprow" style="color:var(--muted);font-size:12px"><span></span><span>${L.was}</span><span>${L.now}</span><span></span></div>`}${rows.map(([n,w,nw,st])=>`<div class="cmprow"><span>${esc(n)}</span><span class="was">${esc(w)}</span><span class="now">${esc(nw)}</span><span class="pill ${st}">${glyph(st)||''} ${T[LANG].st[st]}</span></div>`).join('')}</div>`:''}
    ${pairs.length?`<div class="lbl" style="margin-top:14px">${L.photos}</div>${pairs.map(([a,b])=>`<div class="compare" style="margin-top:8px"><figure><img src="${esc(a.url)}" alt=""><figcaption>${L.was}</figcaption></figure><figure><img src="${esc(b.url)}" alt=""><figcaption>${L.now}</figcaption></figure></div>`).join('')}`:''}</section>`;
}
boot();
})();
