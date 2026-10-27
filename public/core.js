/* Vehicle Health Check — shared rules, scripts and video player (used by the technician app, manager views and customer page) */
(function(){
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cap1 = s => s ? s.charAt(0).toUpperCase()+s.slice(1) : s;
const uid = (n=10) => { const a='abcdefghijkmnpqrstuvwxyz23456789'; let s=''; const r=crypto.getRandomValues(new Uint8Array(n)); for(const b of r) s+=a[b%a.length]; return s; };

const SECTIONS = [
  {id:'intro', en:'Vehicle intro', es:'Presentación', short:'Intro', prompt:'Film a front 3/4 shot of the vehicle, then the odometer. The tech timer starts with this clip.', rec:'Record vehicle'},
  {id:'extint', en:'Exterior & interior', es:'Exterior e interior', short:'Ext / Int', prompt:'Wipers, lights, floor mat clipped in, dash with no warning lights.', rec:'Record ext / int'},
  {id:'hood', en:'Under hood', es:'Bajo el cofre', short:'Under hood', prompt:'Only film what is noteworthy. A quick sweep is fine.', rec:'Record under hood'},
  {id:'tires', en:'Tires', es:'Llantas', short:'Tires', prompt:'One slow sweep: tread gauge on each tire, LF → RF → RR → LR.', rec:'Record tires'},
  {id:'brakes', en:'Brakes', es:'Frenos', short:'Brakes', prompt:'Film pad and rotor through the wheel where visible.', rec:'Record brakes'},
  {id:'under', en:'Under vehicle', es:'Debajo del vehículo', short:'Underbody', prompt:'Film problems if found. Otherwise one quick sweep.', rec:'Record underbody'},
  {id:'recs', en:'Recommendations', es:'Recomendaciones', short:'Recommend', prompt:'Flagged items land here automatically. Set priorities, confirm recalls, add a note.', rec:'Record explanation (optional)'},
  {id:'outro', en:'Thank you', es:'Gracias', short:'Outro', prompt:'Optional: 5–10 seconds on camera thanking the customer for the opportunity to work on their vehicle. Skip it and the store’s thank-you video plays instead, if one is set.', rec:'Record thank-you'},
];
const CLOSING = {en:'Thank you', es:'Gracias'};
const OPTIONAL = ['tires','brakes','hood','under','extint'];
const ITEM = {
  coolant:['Coolant','Refrigerante'], evCoolant:['Battery coolant','Refrigerante de la batería'], invCoolant:['Inverter coolant','Refrigerante del inversor'],
  brakeFluid:['Brake fluid','Líquido de frenos'], washer:['Washer fluid','Líquido limpiaparabrisas'], oil:['Engine oil','Aceite de motor'],
  battery:['12V battery','Batería de 12 V'], belts:['Belts & hoses','Correas y mangueras'], hvCables:['High-voltage cables','Cables de alto voltaje'],
  leaks:['Leaks','Fugas'], suspension:['Suspension','Suspensión'], exhaust:['Exhaust','Escape'], cv:['CV boots','Fuelles de homocinéticas'],
  packUnder:['Battery pack underside','Parte inferior de la batería'], wipers:['Wiper blades','Plumas limpiaparabrisas'], lights:['Exterior lights','Luces exteriores'],
  mats:['Floor mats secured','Tapetes bien sujetos'], warning:['Warning lights','Luces de advertencia'], filters:['Cabin & engine air filters','Filtros de aire de cabina y motor'],
  cabinFilter:['Cabin air filter','Filtro de aire de cabina'], hvFilter:['Hybrid battery cooling filter','Filtro de enfriamiento de la batería híbrida'],
};
const LI = {en:0, es:1};
const PT = {gas:'Gas', hybrid:'Hybrid', phev:'Plug-in hybrid', ev:'Electric'};
function itemsFor(sec, pt){
  pt = pt || 'gas';
  if(sec==='hood') return pt==='ev' ? ['evCoolant','brakeFluid','washer','battery','hvCables'] : (pt==='gas' ? ['coolant','brakeFluid','washer','oil','battery','belts'] : ['coolant','invCoolant','brakeFluid','washer','oil','battery','belts']);
  if(sec==='under') return pt==='ev' ? ['leaks','suspension','cv','packUnder'] : ['leaks','suspension','exhaust','cv'];
  if(sec==='extint') return pt==='ev' ? ['wipers','lights','mats','warning','cabinFilter'] : (pt==='gas' ? ['wipers','lights','mats','warning','filters'] : ['wipers','lights','mats','warning','filters','hvFilter']);
  return [];
}
const itemName = (k, lang='en') => (ITEM[k]||[k,k])[LI[lang]];
const POS = {lf:{en:'left front',es:'delantera izquierda',s:{en:'LF',es:'DI'}}, rf:{en:'right front',es:'delantera derecha',s:{en:'RF',es:'DD'}}, lr:{en:'left rear',es:'trasera izquierda',s:{en:'LR',es:'TI'}}, rr:{en:'right rear',es:'trasera derecha',s:{en:'RR',es:'TD'}}};
const TIRES = ['lf','rf','lr','rr'];
const PRIO = ['today','soon','next'];
const T = {
  en:{inspection:'Multipoint vehicle inspection', tech:'Technician', preparedFor:'Prepared for', st:{good:'Good',monitor:'Monitor',replace:'Replace',recall:'Recall',none:'Not measured'}, front:'Front pads', rear:'Rear pads',
      attention:n=>n===1?'1 item needs attention':`${n} items need attention`, none:'No items need attention', complete:'Inspection complete', approve:'Review & approve', advisor:'Your service advisor will review our recommendations with you.', last:'Last visit', vhc:'Vehicle<br>Health Check', photo:'Photo',
      prio:{today:'Do today', soon:'Soon', next:'Next visit'}, recall:'Recall'},
  es:{inspection:'Inspección multipunto', tech:'Técnico', preparedFor:'Preparado para', st:{good:'Bien',monitor:'Vigilar',replace:'Reemplazar',recall:'Llamado',none:'Sin medir'}, front:'Pastillas delanteras', rear:'Pastillas traseras',
      attention:n=>n===1?'1 punto requiere atención':`${n} puntos requieren atención`, none:'Ningún punto requiere atención', complete:'Inspección completa', approve:'Revisar y aprobar', advisor:'Su asesor de servicio revisará nuestras recomendaciones con usted.', last:'Última visita', vhc:'Chequeo de salud<br>del vehículo', photo:'Foto',
      prio:{today:'Hoy', soon:'Pronto', next:'Próxima visita'}, recall:'Llamado a revisión'},
};
/* Why it matters — one plain line per item */
const WHY = {
  tire:{en:'Worn tread grips less in rain and takes longer to stop.', es:'Una banda desgastada tiene menos agarre con lluvia y tarda más en frenar.'},
  pad:{en:'Thin brake pads increase stopping distance and can damage the rotors.', es:'Las pastillas delgadas aumentan la distancia de frenado y pueden dañar los discos.'},
  coolant:{en:'Low or old coolant can let the engine overheat.', es:'Un refrigerante bajo o viejo puede sobrecalentar el motor.'},
  evCoolant:{en:'Keeps the battery at a safe temperature for range and battery life.', es:'Mantiene la batería a una temperatura segura para su autonomía y vida útil.'},
  invCoolant:{en:'Keeps the hybrid system from overheating.', es:'Evita que el sistema híbrido se sobrecaliente.'},
  brakeFluid:{en:'Old brake fluid absorbs water and makes the pedal feel soft.', es:'El líquido de frenos viejo absorbe agua y hace que el pedal se sienta suave.'},
  washer:{en:'You need it to clear the windshield for safe visibility.', es:'Lo necesita para limpiar el parabrisas y ver con seguridad.'},
  oil:{en:'Low or dirty oil wears the engine faster.', es:'El aceite bajo o sucio desgasta el motor más rápido.'},
  battery:{en:'A weak battery can leave you unable to start the car.', es:'Una batería débil puede impedir que el auto arranque.'},
  belts:{en:'A cracked belt or hose can fail without warning and stop the car.', es:'Una correa o manguera agrietada puede fallar sin aviso y detener el auto.'},
  hvCables:{en:'Damaged high-voltage cables are a safety risk and need a qualified repair.', es:'Los cables de alto voltaje dañados son un riesgo y requieren reparación especializada.'},
  leaks:{en:'A leak can lead to low fluid levels and bigger repairs.', es:'Una fuga puede bajar los niveles de líquido y causar reparaciones mayores.'},
  suspension:{en:'Worn suspension affects handling, braking and tire wear.', es:'Una suspensión desgastada afecta el manejo, el frenado y el desgaste de llantas.'},
  exhaust:{en:'Exhaust leaks can let fumes into the cabin.', es:'Las fugas de escape pueden dejar entrar gases a la cabina.'},
  cv:{en:'A torn boot lets dirt in and can ruin the axle joint.', es:'Un fuelle roto deja entrar suciedad y puede dañar la junta del eje.'},
  packUnder:{en:'Damage under the battery pack should be checked before it gets worse.', es:'Un daño bajo la batería debe revisarse antes de que empeore.'},
  wipers:{en:'Streaking wipers reduce visibility in rain.', es:'Las plumas que rayan reducen la visibilidad con lluvia.'},
  lights:{en:'Working lights help you see and be seen.', es:'Las luces en buen estado le ayudan a ver y a ser visto.'},
  mats:{en:'A loose floor mat can slide under the pedals.', es:'Un tapete suelto puede deslizarse bajo los pedales.'},
  warning:{en:'A warning light means a system needs to be checked.', es:'Una luz de advertencia indica que un sistema necesita revisión.'},
  filters:{en:'Clogged filters reduce airflow, comfort and efficiency.', es:'Los filtros tapados reducen el flujo de aire, la comodidad y la eficiencia.'},
  cabinFilter:{en:'A clogged cabin filter lets dust and odors into the car.', es:'Un filtro de cabina tapado deja entrar polvo y olores.'},
  hvFilter:{en:'A clogged filter makes the hybrid battery run hotter.', es:'Un filtro tapado hace que la batería híbrida se caliente más.'},
  recall:{en:'Recall repairs fix a known safety issue and are done at no cost.', es:'Las reparaciones por llamado corrigen un problema de seguridad conocido y no tienen costo.'},
};
const V = {
  en:{
    intro:(v,first,store)=> first ? `Hi ${first}, this is ${v.tech||'your technician'} from ${store}. I just finished the inspection on your ${v.year} ${v.make} ${v.model}.` : `Hi, this is ${v.tech||'your technician'} from ${store}. I just finished the inspection on your ${v.year} ${v.make} ${v.model}.`,
    tiresLead:'Your tire inspection is complete.', tiresRange:(same,lo,hi)=> same?`All four tires measure ${same}.`:`All four tires measure between ${lo} and ${hi}.`, tiresOk:'That’s well within spec.', tiresGood:four=>four?'All four tires are within specification.':'Measured tires are within specification.',
    tireFlag:(p,val,st)=>`The ${POS[p].en} tire measures ${val}. `+(st==='replace'?'Replacement is recommended.':'We’ll keep an eye on it.'),
    brakes:(f,r)=>`Front brake pads measure ${f} mm and rear pads measure ${r} mm.`, brakesGood:'Both are in good condition.',
    padFlag:(ax,st,th)=> st==='replace'?`The ${ax} pads are below ${th} mm. Replacement is recommended.`:`The ${ax} pads are getting close to the minimum. We’ll keep an eye on them.`, ax:{front:'front',rear:'rear'},
    hist:(d,val)=>`Last visit, ${d}: ${val}.`,
    lead:{hood:'Under the hood',under:'Under the vehicle',extint:'Outside and inside'}, checked:(l,list)=>`${l}, we checked the ${list}.`, allGood:'Everything is in good condition.',
    itemFlag:(n,st)=>st==='replace'?`${n}: attention is needed now.`:`${n}: we’ll keep an eye on this.`,
    none:'Good news: nothing needs attention today.',
    group:{today:(n,l)=>`${n===1?'One item to take care of today':n+' items to take care of today'}: ${l}.`, soon:(n,l)=>`${n===1?'One item to plan for soon':n+' items to plan for soon'}: ${l}.`, next:(n,l)=>`${n===1?'One item to check at your next visit':n+' items to check at your next visit'}: ${l}.`},
    note:'Technician’s note: ',
    closing:s=>`Your inspection is complete. Your service advisor will review our recommendations with you. Thank you for choosing ${s}.`,
    and:', and ', t32:'thirty-seconds', mm:'millimetres'},
  es:{
    intro:(v,first,store)=> first ? `Hola ${first}, soy ${v.tech||'su técnico'} de ${store}. Acabo de terminar la inspección de su ${v.make} ${v.model} ${v.year}.` : `Hola, soy ${v.tech||'su técnico'} de ${store}. Acabo de terminar la inspección de su ${v.make} ${v.model} ${v.year}.`,
    tiresLead:'La inspección de llantas está completa.', tiresRange:(same,lo,hi)=> same?`Las cuatro llantas miden ${same}.`:`Las cuatro llantas miden entre ${lo} y ${hi}.`, tiresOk:'Están bien dentro de especificación.', tiresGood:four=>four?'Las cuatro llantas están dentro de especificación.':'Las llantas medidas están dentro de especificación.',
    tireFlag:(p,val,st)=>`La llanta ${POS[p].es} mide ${val}. `+(st==='replace'?'Se recomienda reemplazarla.':'La vigilaremos.'),
    brakes:(f,r)=>`Las pastillas delanteras miden ${f} mm y las traseras ${r} mm.`, brakesGood:'Ambas están en buen estado.',
    padFlag:(ax,st,th)=> st==='replace'?`Las pastillas ${ax} están por debajo de ${th} mm. Se recomienda reemplazarlas.`:`Las pastillas ${ax} se acercan al mínimo. Las vigilaremos.`, ax:{front:'delanteras',rear:'traseras'},
    hist:(d,val)=>`Última visita, ${d}: ${val}.`,
    lead:{hood:'Bajo el cofre',under:'Debajo del vehículo',extint:'Por fuera y por dentro'}, checked:(l,list)=>`${l}, revisamos: ${list}.`, allGood:'Todo está en buen estado.',
    itemFlag:(n,st)=>st==='replace'?`${n}: requiere atención ahora.`:`${n}: lo vigilaremos.`,
    none:'Buenas noticias: nada requiere atención hoy.',
    group:{today:(n,l)=>`${n===1?'Un punto para atender hoy':n+' puntos para atender hoy'}: ${l}.`, soon:(n,l)=>`${n===1?'Un punto para planear pronto':n+' puntos para planear pronto'}: ${l}.`, next:(n,l)=>`${n===1?'Un punto para revisar en su próxima visita':n+' puntos para revisar en su próxima visita'}: ${l}.`},
    note:'Nota del técnico: ',
    closing:s=>`Su inspección está completa. Su asesor de servicio revisará nuestras recomendaciones con usted. Gracias por elegir ${s}.`,
    and:' y ', t32:'treintaidosavos', mm:'milímetros'},
};
const LOCALE = {en:'en-US', es:'es-MX'};
const fmtDate = (iso, lang='en') => iso ? new Date(iso).toLocaleDateString(LOCALE[lang], {month:'short', day:'numeric', year:'numeric'}) : '';
const mmss = s => `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}`;
const glyph = s => ({good:'✓',monitor:'!',replace:'✕',recall:'⚠',none:'–'}[s]);

/* ---------- rules (all take a context: {insp, store, hist}) ---------- */
const DEFAULT_STORE = {id:'main', name:'Brimell Toyota', lang:'en', units:'32', th:{tireGood:5, tireReplace:2, padGood:5, padReplace:3}, mods:{tires:true, brakes:true, hood:true, under:true, extint:true}, techs:[], logoKey:null};
function rulesOf(ctx){ const i=ctx.insp||{}; return {units:i.units||ctx.store?.units||'32', th:i.th||ctx.store?.th||DEFAULT_STORE.th, mods:i.mods||ctx.store?.mods||DEFAULT_STORE.mods}; }
function toThirtySeconds(v, units){ let n=+v; return units==='mm' ? n/0.79375 : n; }
function tireStatus(v, ctx){ if(v===''||v==null||isNaN(+v)) return 'none'; const r=rulesOf(ctx), n=toThirtySeconds(v,r.units); return n>=r.th.tireGood?'good':n<=r.th.tireReplace?'replace':'monitor'; }
function padStatus(v, ctx){ if(v===''||v==null||isNaN(+v)) return 'none'; const r=rulesOf(ctx), n=+v; return n>=r.th.padGood?'good':n<r.th.padReplace?'replace':'monitor'; }
const tireFmt = (v, units) => units==='mm' ? `${v} mm` : `${v}/32"`;
function activeSections(ctx){ const m=rulesOf(ctx).mods; return SECTIONS.filter(s => !OPTIONAL.includes(s.id) || m[s.id]); }
const secName = (id, lang) => id==='closing' ? CLOSING[lang] : SECTIONS.find(s=>s.id===id)[lang];

function defaultPrio(f, ctx){
  if(f.st==='recall' || f.st==='replace') return 'today';
  const r=rulesOf(ctx);
  if(f.kind==='tire'){ const n=toThirtySeconds(f.value, r.units); return n<=r.th.tireReplace+1 ? 'soon' : 'next'; }
  if(f.kind==='pad'){ const n=+f.value; return n < r.th.padReplace+1 ? 'soon' : 'next'; }
  return 'soon';
}
function flagged(ctx, lang='en'){
  const out=[], I=ctx.insp, r=rulesOf(ctx), m=r.mods;
  if(m.tires) TIRES.forEach(p=>{ const st=tireStatus(I.tires[p],ctx); if(st==='monitor'||st==='replace') out.push({key:'tire:'+p, kind:'tire', sec:'tires', st, value:I.tires[p], why:WHY.tire[lang], base:`${cap1(POS[p].en)} tire`,
    label: lang==='en'?`${cap1(POS[p].en)} tire (${tireFmt(I.tires[p],r.units)})`:`Llanta ${POS[p].es} (${tireFmt(I.tires[p],r.units)})`, short: lang==='en'?`${POS[p].en} tire`:`llanta ${POS[p].es}`}); });
  if(m.brakes) ['front','rear'].forEach(k=>{ const st=padStatus(I.brakes[k],ctx); if(st==='monitor'||st==='replace') out.push({key:'pad:'+k, kind:'pad', sec:'brakes', st, value:I.brakes[k], why:WHY.pad[lang], base:T.en[k], label:`${T[lang][k]} (${I.brakes[k]} mm)`, short:T[lang][k].toLowerCase()}); });
  ['hood','under','extint'].forEach(sec=>{ if(!m[sec]) return; itemsFor(sec,I.veh.pt).forEach(k=>{ const st=(I.items[sec]||{})[k]; if(st==='monitor'||st==='replace') out.push({key:`item:${sec}.${k}`, kind:'item', item:k, sec, st, why:(WHY[k]||{})[lang]||'', base:itemName(k,'en'), label:itemName(k,lang), short:itemName(k,lang).toLowerCase()}); }); });
  (I.recalls||[]).filter(x=>x.include).forEach(x=> out.push({key:'recall:'+x.id, kind:'recall', sec:'recs', st:'recall', why:WHY.recall[lang], base:'Recall '+x.code, label:`${T[lang].recall} ${x.code}${x.component?' · '+cap1(x.component.toLowerCase()):''}`, short:`${T[lang].recall.toLowerCase()} ${x.code}`}));
  out.forEach(f=>{ f.prio = (I.prio||{})[f.key] || defaultPrio(f, ctx); });
  const rank={today:0, soon:1, next:2}, srank={recall:0, replace:1, monitor:2};
  return out.sort((a,b)=> rank[a.prio]-rank[b.prio] || srank[a.st]-srank[b.st]);
}
function histFor(ctx, kind, key){
  const h=ctx.hist; if(!h) return null;
  if(kind==='tire' && h.tires && h.tires[key]!=='' && h.tires[key]!=null) return tireFmt(h.tires[key], h.units||'32');
  if(kind==='pad' && h.brakes && h.brakes[key]!=='' && h.brakes[key]!=null) return `${h.brakes[key]} mm`;
  return null;
}
function firstName(n){ return (n||'').trim().split(/\s+/)[0]||''; }
function script(id, ctx, lang){
  const I=ctx.insp, v=I.veh, X=V[lang], r=rulesOf(ctx), storeName=ctx.store?.name||'';
  if(id==='intro') return X.intro({...v, tech:I.techName}, firstName(v.customer), storeName);
  if(id==='tires'){
    const meas = TIRES.filter(p=>I.tires[p]!=='').map(p=>`${cap1(POS[p][lang])} ${tireFmt(I.tires[p],r.units)}`);
    const bad = TIRES.map(p=>({p,st:tireStatus(I.tires[p],ctx)})).filter(x=>x.st==='monitor'||x.st==='replace');
    let s = X.tiresLead+' ';
    if(!bad.length && meas.length===4){
      const vals=TIRES.map(p=>+I.tires[p]), lo=Math.min(...vals), hi=Math.max(...vals), u = r.units==='mm' ? ' mm' : '/32"';
      return (s + X.tiresRange(lo===hi ? `${lo}${u}` : null, `${lo}`, `${hi}${u}`)+' '+X.tiresOk).trim();
    }
    s += (meas.length?meas.join(', ')+'. ':'');
    if(!bad.length) s += X.tiresGood(meas.length===4);
    bad.forEach(({p,st})=>{ s += X.tireFlag(p, tireFmt(I.tires[p],r.units), st)+' '; const h=histFor(ctx,'tire',p); if(h) s += X.hist(fmtDate(ctx.hist.createdAt,lang), h)+' '; });
    return s.trim();
  }
  if(id==='brakes'){
    const f=I.brakes.front, rr=I.brakes.rear, fs=padStatus(f,ctx), rs=padStatus(rr,ctx);
    let s = X.brakes(f||'—', rr||'—')+' ';
    if(fs==='good'&&rs==='good') return s+X.brakesGood;
    [['front',fs],['rear',rs]].forEach(([k,st])=>{ if(st==='monitor'||st==='replace'){ s += X.padFlag(X.ax[k], st, r.th.padReplace)+' '; const h=histFor(ctx,'pad',k); if(h) s += X.hist(fmtDate(ctx.hist.createdAt,lang), h)+' '; } });
    return s.trim();
  }
  if(['hood','under','extint'].includes(id)){
    const list = itemsFor(id,v.pt).filter(k=>(I.items[id]||{})[k]!=='na');
    const names = list.map(k=>{ const n=itemName(k,lang); return /^[A-Z][a-z]/.test(n) ? n[0].toLowerCase()+n.slice(1) : n; });
    const joined = names.length<2 ? names.join('') : names.slice(0,-1).join(', ')+X.and+names[names.length-1];
    let s = X.checked(X.lead[id], joined)+' ';
    const bad = list.filter(k=>['monitor','replace'].includes((I.items[id]||{})[k]));
    if(!bad.length) return s+X.allGood;
    bad.forEach(k=> s += X.itemFlag(itemName(k,lang), I.items[id][k])+' ');
    return s.trim();
  }
  if(id==='recs'){
    const fl=flagged(ctx, lang); if(!fl.length) return (X.none+' '+(I.note?.trim()? X.note+I.note.trim().replace(/([^.!?])$/,'$1.'):'')).trim();
    let s='';
    PRIO.forEach(p=>{ const g=fl.filter(f=>f.prio===p); if(!g.length) return; const names=g.map(f=>f.short); const l=names.length<2?names[0]:names.slice(0,-1).join(', ')+X.and+names[names.length-1]; s += X.group[p](g.length, l)+' '; });
    if(I.note?.trim()) s += X.note + I.note.trim().replace(/([^.!?])$/,'$1.');
    return s.trim();
  }
  if(id==='closing' || id==='outro') return X.closing(storeName);
  return '';
}
function speakify(t, lang){
  const X=V[lang], inch={en:' of an inch', es:' de pulgada'}[lang];
  let first=true;
  t = t.replace(/(\d+(?:\.\d+)?)\/32"/g, (m,n)=>{ const out=`${n} ${X.t32}${first?inch:''}`; first=false; return out; });
  t = t.replace(/(\d)\s?mm\b/g, `$1 ${X.mm}`).replace(/\b12V\b|\b12 V\b/g, {en:'12-volt',es:'12 voltios'}[lang]).replace(/ & /g, {en:' and ',es:' y '}[lang]);
  return t.replace(/[()]/g,'').replace(/\bCV\b/g,'C V');
}
const sentences = t => t.split(/(?<=[.!?:])\s+/).filter(Boolean);

/* ---------- visuals ---------- */
function badgeSVG(){
  let ticks=''; for(let i=0;i<7;i++){ const x=20+i*4; ticks+=`<line x1="${x}" y1="53" x2="${x}" y2="${i%3===0?60:57}"/>`; }
  return `<svg viewBox="0 0 64 72" role="img" aria-label="Vehicle Health Check badge"><path d="M32 2 L61 11.5 V35 C61 53.5 48 64.5 32 70 C16 64.5 3 53.5 3 35 V11.5 Z" fill="#EB0A1E"/><path d="M32 7.5 L56 15.3 V35 C56 50.6 45.3 60 32 64.6 C18.7 60 8 50.6 8 35 V15.3 Z" fill="none" stroke="#fff" stroke-width="1.6" opacity=".85"/><path d="M19 32.5 L28.5 42 L46 22.5" fill="none" stroke="#fff" stroke-width="6.2" stroke-linecap="round" stroke-linejoin="round"/><g stroke="#fff" stroke-width="1.8" stroke-linecap="round">${ticks}</g></svg>`;
}
function ticks(n,r1,r2){ let s=''; for(let i=0;i<n;i++){ const a=i/n*Math.PI*2; s+=`<line x1="${100+r1*Math.cos(a)}" y1="${100+r1*Math.sin(a)}" x2="${100+r2*Math.cos(a)}" y2="${100+r2*Math.sin(a)}"/>`; } return s; }
function holes(n,r){ let s=''; for(let i=0;i<n;i++){ const a=i/n*Math.PI*2; s+=`<circle cx="${100+r*Math.cos(a)}" cy="${100+r*Math.sin(a)}" r="4"/>`; } return s; }
const ILLU = {
  intro:`<svg viewBox="0 0 240 120" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><path d="M14 84 L20 62 Q24 56 34 54 L70 50 L98 30 Q106 25 118 25 L160 25 Q172 25 182 34 L204 52 Q224 56 228 66 L230 84 Z"/><path d="M104 32 L96 50 L150 50 L150 30 M158 30 L158 50 L196 50 L180 36 Q172 30 162 30"/><circle cx="62" cy="86" r="17" fill="#0A0A0A"/><circle cx="62" cy="86" r="7"/><circle cx="184" cy="86" r="17" fill="#0A0A0A"/><circle cx="184" cy="86" r="7"/></svg>`,
  tires:`<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="3"><circle cx="100" cy="100" r="92"/><circle cx="100" cy="100" r="74"/><circle cx="100" cy="100" r="48"/><circle cx="100" cy="100" r="14"/>${ticks(36,76,90)}${holes(5,31)}</svg>`,
  brakes:`<svg viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="3"><circle cx="100" cy="100" r="86"/><circle cx="100" cy="100" r="40"/><circle cx="100" cy="100" r="16"/>${holes(10,63)}${holes(5,28)}<path d="M150 30 Q196 70 184 130 L160 124 Q168 80 136 46 Z" fill="#0A0A0A"/></svg>`,
  hood:`<svg viewBox="0 0 220 160" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><rect x="40" y="50" width="130" height="80" rx="6"/><rect x="56" y="30" width="98" height="22" rx="4"/>${[0,1,2,3].map(i=>`<circle cx="${74+i*21}" cy="41" r="6"/>`).join('')}<rect x="176" y="70" width="30" height="40" rx="3"/><path d="M186 70 v-6 M198 70 v-6"/><circle cx="24" cy="80" r="12"/><circle cx="24" cy="116" r="8"/><path d="M24 68 Q40 96 24 108"/></svg>`,
  under:`<svg viewBox="0 0 240 140" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><rect x="40" y="24" width="160" height="92" rx="26"/><rect x="22" y="30" width="18" height="30" rx="4"/><rect x="200" y="30" width="18" height="30" rx="4"/><rect x="22" y="80" width="18" height="30" rx="4"/><rect x="200" y="80" width="18" height="30" rx="4"/><path d="M40 45 H200 M40 95 H200 M70 70 H210 Q226 70 230 78"/><rect x="120" y="62" width="40" height="16" rx="8"/></svg>`,
  extint:`<svg viewBox="0 0 240 140" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><path d="M30 120 L52 22 Q54 16 62 16 L178 16 Q186 16 188 22 L210 120 Z"/><path d="M70 118 L130 40"/><path d="M160 118 L210 58"/><path d="M60 118 A70 70 0 0 1 150 44" stroke-dasharray="4 7"/></svg>`,
  recs:`<svg viewBox="0 0 160 200" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><rect x="20" y="24" width="120" height="164" rx="8"/><rect x="54" y="12" width="52" height="24" rx="6" fill="#0A0A0A"/>${[0,1,2,3].map(i=>`<path d="M38 ${70+i*28} l8 8 l14 -16 M72 ${72+i*28} H120"/>`).join('')}</svg>`,
};
const initials = n => (n||'VH').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
function logoBox(store, extraStyle=''){ const src=store?.logoUrl; return src ? `<div class="logo img" style="${extraStyle}"><img src="${esc(src)}" alt=""></div>` : `<div class="logo" style="${extraStyle}">${esc(initials(store?.name))}</div>`; }

/* ---------- speech ---------- */
const tts = typeof window!=='undefined' && 'speechSynthesis' in window;
const BAD_VOICE=/compact|eloquence|novelty|bells|zarvox|whisper|bad news|good news|boing|bubbles|cellos|jester|organ|superstar|trinoids|wobble|albert|fred|junior|ralph|kathy|bahh|deranged|hysterical|grandma|grandpa|rocko|shelley|flo|reed|sandy/i;
function voiceScore(v, lang){ const n=v.name, l=(v.lang||'').replace('_','-'); let s=0;
  if(/natural|neural/i.test(n)) s+=60; if(/online/i.test(n)) s+=30; if(/premium/i.test(n)) s+=55; if(/enhanced/i.test(n)) s+=45; if(/siri/i.test(n)) s+=40; if(/google/i.test(n)) s+=30;
  if(v.localService===false) s+=8; if(BAD_VOICE.test(n)) s-=200;
  const reg={en:['en-US','en-CA'],es:['es-MX','es-US','es-ES']}[lang]; const ri=reg.findIndex(x=>l.toLowerCase()===x.toLowerCase()); if(ri>=0) s+=20-ri*6; return s; }
function voicesFor(lang){ if(!tts) return []; return speechSynthesis.getVoices().filter(v=>(v.lang||'').toLowerCase().replace('_','-').startsWith(lang)).sort((a,b)=>voiceScore(b,lang)-voiceScore(a,lang)); }
function savedVoice(lang){ try{ return localStorage.getItem('vhc-voice-'+lang); }catch(e){ return null; } }
function pickVoice(lang){ const vs=voicesFor(lang); const want=savedVoice(lang); return (want && vs.find(v=>v.name===want)) || vs[0] || null; }
function speakOne(text, lang){
  return new Promise(res=>{
    if(!tts) return res();
    const u=new SpeechSynthesisUtterance(speakify(text,lang)); u.lang={en:'en-US',es:'es-MX'}[lang]; const v=pickVoice(lang); if(v){ u.voice=v; u.lang=v.lang; } u.rate=0.95;
    let done=false; const fin=()=>{ if(!done){done=true; res();} };
    u.onend=fin; u.onerror=fin; setTimeout(fin,(text.split(/\s+/).length/1.6+4)*1000);
    speechSynthesis.speak(u);
  });
}
function unlockSpeech(){ if(!tts) return; try{ const u=new SpeechSynthesisUtterance(' '); u.volume=0; speechSynthesis.speak(u); }catch(e){} }
const wait = ms => new Promise(r=>setTimeout(r,ms));

/* ---------- player ----------
   ctx = {insp, store:{name, logoUrl}, hist, media:{clips:{sec:{url,dur}}, marks:{sec:[{url,label}]}}, techPhotoUrl, lang} */
function buildSegs(ctx){
  const lang=ctx.lang, TT=T[lang], I=ctx.insp, v=I.veh, r=rulesOf(ctx), secs=activeSections(ctx), fl=flagged(ctx, lang), store=ctx.store||{};
  const segs=[]; let n=0;
  const brand = () => `<div class="brandtag">${logoBox(store)}${esc(store.name)}</div>`;
  const small = `<div class="vhc sm"><span class="badge">${badgeSVG()}</span></div>`;
  const lt = (id, inner, cls='', hist='') => `${small}${brand()}<div class="lt"><div class="eb">${String(++n).padStart(2,'0')} · ${esc(secName(id,lang))}</div><h3>${esc(secName(id,lang))}</h3><div class="sg ${cls}">${inner}</div>${hist}</div>`;
  const mr = (k,val,st) => `<div class="mr"><span class="k">${esc(k)}</span><span class="v">${esc(val)}</span><span class="st ${st}" title="${TT.st[st]}">${glyph(st)}</span></div>`;
  const histLine = parts => ctx.hist && parts.some(Boolean) ? `<div class="hist">${TT.last} · ${fmtDate(ctx.hist.createdAt,lang)}: ${parts.filter(Boolean).join(' · ')}</div>` : '';
  const first = firstName(v.customer);
  secs.forEach(sec=>{
    if(sec.id==='outro') return;
    let card='';
    if(sec.id==='intro'){ n++;
      const tp = ctx.techPhotoUrl ? `<div class="techchip"><img src="${esc(ctx.techPhotoUrl)}" alt=""><span>${esc(I.techName||'')}<small>${TT.tech}</small></span></div>` : '';
      card = `<div class="full">${''}<div class="brandtag" style="position:static;margin-bottom:2cqw">${logoBox(store)}${esc(store.name)}</div><div class="eb">${first?`${TT.preparedFor} ${esc(first)}`:TT.inspection}</div><h2>${esc(v.year)} ${esc(v.make)}<br>${esc(v.model)}</h2><div class="meta">${ctx.techPhotoUrl?'':`${TT.tech}: ${esc(I.techName||'')} · `}${esc(v.odo||'')}${v.ro?' · '+esc(v.ro):''}</div>${tp}</div><div class="vhc"><span class="badge">${badgeSVG()}</span><span>${TT.vhc}</span></div>`;
    } else if(sec.id==='tires'){
      card = lt('tires', TIRES.map(p=>mr(POS[p].s[lang], I.tires[p]===''?'—':tireFmt(I.tires[p],r.units), tireStatus(I.tires[p],ctx))).join(''), '', histLine(TIRES.map(p=>{ const h=histFor(ctx,'tire',p); return h?`${POS[p].s[lang]} ${h}`:null; })));
    } else if(sec.id==='brakes'){
      card = lt('brakes', ['front','rear'].map(k=>mr(TT[k], I.brakes[k]===''?'—':`${I.brakes[k]} mm`, padStatus(I.brakes[k],ctx))).join(''), 'one', histLine(['front','rear'].map(k=>{ const h=histFor(ctx,'pad',k); return h?`${TT[k]} ${h}`:null; })));
    } else if(['hood','under','extint'].includes(sec.id)){
      card = lt(sec.id, itemsFor(sec.id,v.pt).filter(k=>(I.items[sec.id]||{})[k]!=='na').map(k=>{ const st=I.items[sec.id][k]; return `<div class="mr"><span class="st ${st}">${glyph(st)}</span><span>${esc(itemName(k,lang))}</span></div>`; }).join(''));
    } else if(sec.id==='recs'){ n++;
      const groups = PRIO.map(p=>{ const g=fl.filter(f=>f.prio===p); return g.length ? `<div class="pg"><div class="pgh ${p}">${TT.prio[p]}</div>${g.map(f=>`<div class="mr"><span class="st ${f.st}">${glyph(f.st)}</span><span>${esc(f.label)}</span></div>`).join('')}</div>` : ''; }).join('');
      card = `${small}<div class="full"><div class="eb">${String(n).padStart(2,'0')} · ${esc(secName('recs',lang))}</div><div class="big ${fl.length?'':'good'}">${fl.length?TT.attention(fl.length):TT.none}</div><div class="pgs">${groups}</div></div>`;
    }
    let clip=ctx.media?.clips?.[sec.id];
    if(sec.id==='recs' && !clip){ const f=fl.find(x=>ctx.media?.clips?.[x.sec]); if(f) clip=ctx.media.clips[f.sec]; }
    segs.push({id:sec.id, name:secName(sec.id,lang), card, text:script(sec.id,ctx,lang), clip, stills:(ctx.media?.marks?.[sec.id]||[]), voFirst:sec.id==='recs'&&!!ctx.media?.clips?.recs, flag:sec.id!=='recs'&&fl.some(f=>f.sec===sec.id)});
  });
  segs.push({id:'closing', name:CLOSING[lang], card:`<div class="full" style="align-items:center;text-align:center;background:rgba(10,10,10,.93)"><div class="brandtag" style="position:static;font-size:clamp(14px,2.6cqw,28px)">${logoBox(store,'width:clamp(34px,6cqw,64px);height:clamp(34px,6cqw,64px)')}${esc(store.name)}</div><span class="badge bigbadge" style="margin-top:2cqw">${badgeSVG()}</span><div class="big">${TT.complete}</div><div class="meta" style="margin-top:1cqw">${TT.advisor}</div>${ctx.approveHook?`<button class="approve" data-approve>${TT.approve}</button>`:''}</div>`, text:script('closing',ctx,lang), clip:(ctx.media?.clips?.outro || ctx.media?.storeOutro || null), talk:!!(ctx.media?.clips?.outro || ctx.media?.storeOutro), stills:[]});
  segs.forEach(s=>{ const w=s.text.split(/\s+/).length; s.voEst=w/2.6+0.6; s.minDur=s.clip?Math.min(s.clip.dur||8,20):3.5; s.est=(s.talk? Math.min(s.clip.dur||10,60)+s.voEst : s.voFirst? s.voEst+Math.min(ctx.media.clips.recs.dur||10,60) : Math.max(s.voEst,s.minDur)) + s.stills.length*4.2; });
  return segs;
}

function createPlayer(root, opts={}){
  root.innerHTML = `<div class="stage"><div class="ph"></div><video playsinline muted hidden></video><img class="still" alt="" hidden><div class="ov"></div><div class="cap"></div><button class="bigplay"><span>▶ ${esc(opts.playLabel||'Play inspection video')}</span></button></div><div class="tl"></div>`;
  const q = s => root.querySelector(s);
  const stage=q('.stage'), pv=q('video'), still=q('.still'), ov=q('.ov'), cap=q('.cap'), ph=q('.ph'), tl=q('.tl'), big=q('.bigplay');
  const P = {segs:[], cur:0, runId:0, playing:false, segStart:0, segEst:1, ctx:null, voice:true};
  function showSeg(k){
    const s=P.segs[k]; if(!s) return; P.cur=k;
    ov.hidden=false; ov.classList.remove('in'); ov.innerHTML=s.card; void ov.offsetWidth; ov.classList.add('in');
    still.hidden=true;
    if(s.clip){ if(pv.dataset.src!==s.clip.url){ pv.src=s.clip.url; pv.dataset.src=s.clip.url; } pv.hidden=false; ph.innerHTML=''; try{pv.currentTime=0;}catch(e){} }
    else { pv.pause(); pv.hidden=true; ph.innerHTML=(ILLU[s.id]||''); }
    cap.innerHTML='';
    tl.querySelectorAll('.tlc').forEach((el,i)=>{ el.classList.toggle('on',i===k); el.querySelector('b').style.width=i<k?'100%':'0'; });
    opts.onSeg && opts.onSeg(k, P.segs.length);
  }
  async function narrate(s,my){
    const lang=P.ctx.lang;
    for(const sen of sentences(s.text)){ if(my!==P.runId) return; cap.innerHTML=`<span>${esc(sen)}</span>`; if(P.voice && tts) await speakOne(sen,lang); else await wait((sen.split(/\s+/).length/2.6+0.5)*1000); }
  }
  function tick(){ if(!P.playing) return; const p=Math.min(1,(performance.now()-P.segStart)/1000/P.segEst); const b=tl.querySelectorAll('.tlc b')[P.cur]; if(b) b.style.width=(p*100)+'%'; requestAnimationFrame(tick); }
  async function playStills(s,my){
    for(const m of s.stills){ if(my!==P.runId) return;
      still.src=m.url; still.hidden=false; still.style.animation='none'; void still.offsetWidth; still.style.animation='';
      ov.hidden=true; cap.innerHTML=`<span>${esc(s.name)} · ${T[P.ctx.lang].photo}${m.label?': '+esc(m.label):''}</span>`;
      await wait(4200);
    }
    still.hidden=true; ov.hidden=false;
  }
  async function playSeg(s,my){
    showSeg(P.segs.indexOf(s)); P.segStart=performance.now(); P.segEst=s.est; requestAnimationFrame(tick);
    if(s.talk){
      // Thank-you video: play it with its own sound, then show the closing card and voiceover
      ov.hidden=true; cap.innerHTML=''; pv.loop=false; pv.muted=false; pv.currentTime=0; try{ await pv.play(); }catch(e){}
      await new Promise(r=>{ const t=setTimeout(fin,60000), chk=setInterval(()=>{ if(my!==P.runId) fin(); },200); function fin(){ clearTimeout(t); clearInterval(chk); r(); } pv.onended=fin; });
      pv.muted=true; if(my!==P.runId) return;
      pv.pause(); ov.hidden=false; await narrate(s,my); if(my===P.runId) await wait(400); return;
    }
    if(s.voFirst){
      pv.pause(); await narrate(s,my); if(my!==P.runId) return;
      cap.innerHTML=''; pv.loop=false; pv.muted=false; pv.currentTime=0; try{ await pv.play(); }catch(e){}
      await new Promise(r=>{ const t=setTimeout(fin,60000), chk=setInterval(()=>{ if(my!==P.runId) fin(); },200); function fin(){ clearTimeout(t); clearInterval(chk); r(); } pv.onended=fin; });
      pv.muted=true; return;
    }
    if(s.clip){ pv.loop=true; pv.muted=true; try{ await pv.play(); }catch(e){} }
    await Promise.all([narrate(s,my), wait(s.minDur*1000)]);
    if(my!==P.runId) return;
    if(s.stills.length){ pv.pause(); await playStills(s,my); }
    if(my===P.runId) await wait(400);
  }
  async function playFrom(i){
    const my=++P.runId; P.playing=true; big.hidden=true; opts.onState && opts.onState('playing');
    for(let k=i;k<P.segs.length;k++){ if(my!==P.runId) return; await playSeg(P.segs[k],my); if(my!==P.runId) return; const b=tl.querySelectorAll('.tlc b')[k]; if(b) b.style.width='100%'; opts.onSegDone && opts.onSegDone(k, P.segs.length); }
    if(my===P.runId){ P.playing=false; P.cur=0; opts.onState && opts.onState('ended'); opts.onEnd && opts.onEnd(); }
  }
  function stop(){ P.runId++; P.playing=false; if(tts) speechSynthesis.cancel(); pv.pause(); still.hidden=true; ov.hidden=false; opts.onState && opts.onState('paused'); }
  big.onclick=()=>{ unlockSpeech(); playFrom(P.cur); };
  tl.addEventListener('click', e=>{ const b=e.target.closest('[data-seg]'); if(!b) return; const k=+b.dataset.seg; unlockSpeech(); stop(); playFrom(k); });
  stage.addEventListener('click', e=>{ const a=e.target.closest('[data-approve]'); if(a && P.ctx?.approveHook){ stop(); P.ctx.approveHook(); } });
  return {
    load(ctx){ stop(); P.ctx=ctx; P.segs=buildSegs(ctx); P.cur=0;
      tl.innerHTML = P.segs.map((s,i)=>`<button class="tlc ${s.flag?'flagged':''}" data-seg="${i}" aria-label="Jump to ${esc(s.name)}"><div class="bar"><b></b></div><small>${esc(s.name)}</small></button>`).join('');
      showSeg(0); big.hidden=false; },
    play(){ unlockSpeech(); playFrom(P.cur); }, playFrom(i){ unlockSpeech(); playFrom(i); }, stop, toggle(){ if(P.playing) stop(); else { unlockSpeech(); playFrom(P.cur); } },
    get playing(){ return P.playing; }, get segs(){ return P.segs; }, setVoice(on){ P.voice=on; }, get duration(){ return P.segs.reduce((a,s)=>a+s.est,0); }
  };
}

window.VHC = { esc, cap1, uid, SECTIONS, CLOSING, OPTIONAL, ITEM, PT, POS, TIRES, PRIO, T, V, WHY, LOCALE, itemsFor, itemName, fmtDate, mmss, glyph,
  DEFAULT_STORE, rulesOf, tireStatus, padStatus, tireFmt, activeSections, secName, flagged, defaultPrio, histFor, script, speakify, sentences, firstName,
  badgeSVG, ILLU, initials, logoBox, tts, voicesFor, pickVoice, speakOne, unlockSpeech, wait, buildSegs, createPlayer };
})();
