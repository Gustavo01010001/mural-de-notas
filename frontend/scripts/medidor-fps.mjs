// Medidor de fluidez (fps) do mural num Chrome invisível via CDP — não depende da janela estar à vista.
// Ver PROXIMA_SESSAO.md (raiz do projeto) para como usar e o que cada cenário mede.
// Uso: node scripts/medidor-fps.mjs http://127.0.0.1:3100 <cpu 1|4|6> <variações,separadas> [--celular]
// Env: CENAS=parado,arrastar_real,rolar_real,zoom,janela,...  MODO=full|lite  QTD=201|40 (post-its da conta de teste)
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] ?? 'http://127.0.0.1:3100';
const CPU = Number(process.argv[3] ?? 1);
const NAMES = (process.argv[4] ?? 'base').split(',').filter(Boolean);
const MOBILE = process.argv.includes('--celular');
const PORT = 9333;
// perfil do Chrome e conta de teste ficam FORA do repositório (pasta temporária do sistema)
const work = join(tmpdir(), 'mural-medidor');
mkdirSync(work, { recursive: true });
const profile = join(work, 'chrome-perfil');
mkdirSync(profile, { recursive: true });
const QTD = Number(process.env.QTD ?? 201);
const credFile = join(work, QTD === 201 ? 'conta-medidor.json' : `conta-medidor-${QTD}.json`);

const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1366,768',
  '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, seq = 0;
let traceBuf = [], traceDone = null, lastLayers = [];
const pending = new Map();
async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page');
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch {}
    await sleep(250);
  }
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    else if (d.method === 'LayerTree.layerTreeDidChange') lastLayers = d.params.layers || lastLayers;
    else if (d.method === 'Tracing.dataCollected') traceBuf.push(...d.params.value);
    else if (d.method === 'Tracing.tracingComplete') traceDone?.();
  });
}
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
}
async function go(path) { await send('Page.navigate', { url: BASE + path }); await sleep(3500); }

const SEED = `const QTD=${QTD};
const H={'X-Mural':'1','Content-Type':'application/json'};
const cores=['yellow','pink','blue','green','purple','orange'], tags=['trabalho','casa','estudo','ideia','saude']; const ids=[];
for(let i=0;i<QTD;i+=10){ const lote=await Promise.all(Array.from({length:Math.min(10,QTD-i)},(_,k)=>{const n=i+k; return fetch('/api/notes',{method:'POST',headers:H,body:JSON.stringify({title:'Nota de carga '+n,content:'Texto de exemplo para medir o desempenho do mural com muitos post-its. '+n,color:cores[n%6],tags:[tags[n%5]],x:60+(n%15)*300,y:60+Math.floor(n/15)*320})}).then(x=>x.json()).catch(()=>null);})); for(const j of lote){const id=j?.note?.id??j?.id; if(id) ids.push(id);} }
let f=0; for(let i=0;i+1<ids.length&&f<Math.round(QTD*0.3);i+=3){ const x=await fetch('/api/links',{method:'POST',headers:H,body:JSON.stringify({fromId:ids[i],toId:ids[i+1]})}); if(x.ok) f++; }
return ids.length;`;

async function login() {
  await go('/login');
  let cred = existsSync(credFile) ? JSON.parse(readFileSync(credFile, 'utf8')) : null;
  const H = `{'X-Mural':'1','Content-Type':'application/json'}`;
  if (!cred) {
    const rnd = Math.random().toString(36).slice(2);
    cred = { email: `qa.medidor.${rnd}@teste.dev`, password: `Qa!${rnd}${Date.now()}xY` };
    const st = await ev(`const r=await fetch('/api/auth/register',{method:'POST',headers:${H},body:JSON.stringify({name:'Medidor QA',...${JSON.stringify(cred)}})}); return r.status;`);
    if (st >= 300) throw new Error('cadastro falhou ' + st);
    writeFileSync(credFile, JSON.stringify(cred));
  } else {
    const st = await ev(`const r=await fetch('/api/auth/login',{method:'POST',headers:${H},body:JSON.stringify(${JSON.stringify(cred)})}); return r.status;`);
    if (st >= 300) throw new Error('login falhou ' + st);
  }
  await go('/login');
  const n = await ev(`return (await (await fetch('/api/notes?folder=root',{headers:{'X-Mural':'1'}})).json()).notes.length;`);
  if (n < QTD * 0.75) await ev(SEED);
  await ev(`localStorage.setItem('mural_logged','1'); localStorage.setItem('mural:desempenho', ${JSON.stringify(process.env.MODO ?? 'full')}); return 1;`);
}

const SETUP = `
window.__w=(ms)=>new Promise(r=>setTimeout(r,ms)); window.__f=()=>new Promise(r=>requestAnimationFrame(r));
window.__fps=async(acao,ms=2500)=>{ await __w(500); let n=0,lg=0,last=performance.now(); const t0=last; while(performance.now()-t0<ms){ acao&&acao(n); await __f(); const t=performance.now(); if(t-last>50) lg++; last=t; n++; } return Math.round(n*1000/(performance.now()-t0))+'/'+lg; };
window.__b=document.querySelector('.board');
window.__reset=async()=>{ window.dispatchEvent(new KeyboardEvent('keydown',{key:'0'})); await __w(500); __b.scrollTo(0,0); await __w(300); };
await __reset();
Element.prototype.setPointerCapture=function(){};
return document.querySelectorAll('.postit').length;`;
const SCEN = {
  parado: `return await __fps(null);`,
  perfil: `return 'x';`,
  todas_animacoes: `const g={}; for(const a of document.getAnimations()){ const t=a.effect?.target; const nome=(a.animationName||(a.constructor.name==='CSSTransition'?'transition:'+a.transitionProperty:'waapi'))+' @ '+((t?.className?.baseVal ?? t?.className)||t?.tagName||'?').toString().split(' ').slice(0,2).join('.')+(a.effect?.pseudoElement||''); const props=[...new Set((a.effect?.getKeyframes?.()||[]).flatMap(k=>Object.keys(k).filter(x=>!['offset','easing','composite','computedOffset'].includes(x))))].join(','); const k=nome+' ['+props+'] '+a.playState+' fill='+(a.effect?.getTiming?.().fill); g[k]=(g[k]||0)+1; } return Object.entries(g).sort((a,b)=>b[1]-a[1]).slice(0,15);`,
  camadas: `const g={}; for(const el of document.querySelectorAll('*')){ const cs=getComputedStyle(el); const motivos=[]; if(cs.willChange&&cs.willChange!=='auto') motivos.push('will-change:'+cs.willChange); if(cs.backdropFilter&&cs.backdropFilter!=='none') motivos.push('backdrop'); if(cs.transform!=='none'&&/3d|matrix3d/.test(cs.transform)) motivos.push('transform3d'); if(cs.filter!=='none') motivos.push('filter'); if(cs.mixBlendMode!=='normal') motivos.push('blend'); if(!motivos.length) continue; const nome=((el.className?.baseVal ?? el.className)||el.tagName).toString().split(' ')[0]; const k=nome+' → '+motivos.join(','); g[k]=(g[k]||0)+1; } return Object.entries(g).sort((a,b)=>b[1]-a[1]).slice(0,12);`,
  onde_gota: `const d=document.querySelector('.drop'); const cad=[]; let e=d; while(e&&cad.length<7){ cad.push(e.tagName+'.'+((e.className?.baseVal ?? e.className)||'').toString().split(' ').join('.')); e=e.parentElement; } return {cadeia:cad, anim:getComputedStyle(d).animationName, html:document.documentElement.className};`,
  mutacoes: `let n=0; const o=new MutationObserver(l=>{n+=l.length}); o.observe(document.body,{subtree:true,attributes:true,childList:true,characterData:true}); const alvos={}; const o2=new MutationObserver(l=>{ for(const m of l){ const t=m.target.nodeType===1?m.target:m.target.parentElement; const k=((t?.className?.baseVal ?? t?.className)||t?.tagName||'?').toString().split(' ')[0]+':'+m.type+(m.attributeName?'('+m.attributeName+')':''); alvos[k]=(alvos[k]||0)+1; } }); o2.observe(document.body,{subtree:true,attributes:true,childList:true,characterData:true}); await __w(2000); o.disconnect(); o2.disconnect(); return {mudancas_em_2s:n, onde:Object.entries(alvos).sort((a,b)=>b[1]-a[1]).slice(0,8)};`,
  animacoes: `const g={}; for(const a of document.getAnimations()){ if(a.playState!=='running') continue; const t=a.effect?.target; const nome=(a.animationName||a.transitionProperty||'js')+' @ '+((t?.className?.baseVal ?? t?.className)||t?.tagName||'?').toString().split(' ').slice(0,2).join('.'); const props=[...new Set((a.effect?.getKeyframes?.()||[]).flatMap(k=>Object.keys(k).filter(x=>!['offset','easing','composite','computedOffset'].includes(x))))].join(','); const k=nome+' ['+props+']'; g[k]=(g[k]||0)+1; } return g;`,
  rolar: MOBILE ? `const r=await __fps(i=>__b.scrollBy(0,Math.sin(i/25)*22)); __b.scrollTo(0,0); return r;` : `const r=await __fps(i=>__b.scrollBy(Math.cos(i/20)*14,Math.sin(i/20)*10)); await __reset(); return r;`,
  rolar_longe: `for(let k=0;k<4;k++){ window.dispatchEvent(new KeyboardEvent('keydown',{key:'-'})); await __w(350);} await __w(700); const r=await __fps(i=>__b.scrollBy(Math.cos(i/20)*14,Math.sin(i/20)*10)); await __reset(); return r;`,
  zoom: `const r=await __fps(i=>__b.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:Math.sin(i/12)*10,clientX:innerWidth/2,clientY:innerHeight/2}))); await __w(300); await __reset(); return r;`,
  arrastar: `const a=[...document.querySelectorAll('.postit')].find(p=>{const r=p.getBoundingClientRect(); return r.top>120&&r.bottom<innerHeight-100&&r.left>50&&r.right<innerWidth-300;}); if(!a) return 'sem alvo';
    const r=a.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+30; const e=(t,x,y)=>a.dispatchEvent(new PointerEvent(t,{bubbles:true,clientX:x,clientY:y,button:0,buttons:1,pointerId:1,pointerType:'mouse',isPrimary:true}));
    e('pointerdown',cx,cy); const res=await __fps(i=>e('pointermove',cx+Math.sin(i/10)*120,cy+60+Math.cos(i/10)*60)); e('pointerup',cx,cy); await __w(400); return res;`,
  mouse: `return await __fps(i=>window.dispatchEvent(new PointerEvent('pointermove',{clientX:500+Math.sin(i/10)*300,clientY:400+Math.cos(i/10)*200,pointerType:'mouse'})));`,
  janela: `let n=0,lg=0,last=performance.now(); const t0=last; let on=true; (async()=>{ while(on){ await __f(); const t=performance.now(); if(t-last>50) lg++; last=t; n++; } })();
    for(let k=0;k<3;k++){ document.querySelector('[aria-label="Novo post-it"]')?.click(); await __w(600); window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); await __w(600); }
    on=false; return Math.round(n*1000/(performance.now()-t0))+'/'+lg;`,
};
const VARIANTS = {
  conteudo_sem_corte: '.postit-content{overflow:visible!important;max-height:none!important}',
  sem_acoes_dom: '.postit-actions,.link-handle{display:none!important}',
  alca_fora: '.resize-handle{display:none!important}',
  fita_fora: '.postit-tape{display:none!important}',
  sem_blend: '.warm-filter{display:none!important}',
  sem_bgdim: '.bg-dim{display:none!important}',
  estrelas_sem_wc: '.stars{will-change:auto!important;animation:none!important}',
  fita_sem_transform: '.postit-tape{transform:none!important}',
  sem_alca: '.resize-handle{display:none!important}',
  estrelas_sem_camada: '.stars{will-change:auto!important;animation:none!important}',
  mural_uma_camada: '.canvas-zoom{will-change:transform!important}',
  sem_inclinacao: '.canvas-zoom .postit{transform:none!important}',
  sem_filtro_quente: '.warm-filter{display:none!important}',
  sem_cv: '.canvas.free .postit.offscreen{content-visibility:visible!important}',
  sem_minimapa: '.minimap{display:none!important}',
  sem_fios: '.links-layer,.pins-layer{display:none!important}',
  sem_zonas: '.subject-zone{display:none!important}',
  sem_relogio: '.weather .clock, .weather [class*=clock]{display:none!important}',
  sem_icone: '.weather-icon{display:none!important}',
  sem_clima: '.weather{display:none!important}',
  sem_postits: '.canvas-zoom .postit{display:none!important}',
  a_postits: '.postit{animation:none!important}',
  a_fab: '.fab{animation:none!important}',
  a_estrelas: '.stars{animation:none!important}',
  a_clima: '.weather *, .weather{animation:none!important}',
  a_relogio: '.clock *, .clock{animation:none!important}',
  a_marca: '.brand *, .brand{animation:none!important}',
  a_fios: '.pins-layer *, .links-layer *{animation:none!important}',
  sem_animacoes: '*,*::before,*::after{animation:none!important;transition:none!important}',
  esconder_display: '.canvas-zoom .postit :is(.postit-actions,.link-handle){display:none!important}',
  base: '',
  esconder_acoes: '.canvas-zoom .postit :is(.postit-actions,.link-handle){display:none!important}',
  lod: '.canvas-zoom .postit :is(.postit-content,.postit-checklist,.postit-tags,.postit-image,.postit-event){visibility:hidden!important}',
  sem_sombra: '.postit{box-shadow:none!important}',
};

try {
  await connect();
  await send('Page.enable'); await send('Runtime.enable'); await send('Performance.enable');
  await send('Emulation.setDeviceMetricsOverride', MOBILE ? { width: 375, height: 812, deviceScaleFactor: 2, mobile: true } : { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  if (MOBILE) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await login();
  await go('/');
  await sleep(1500);
  if (CPU > 1) await send('Emulation.setCPUThrottlingRate', { rate: CPU });
  const out = { cpu: `${CPU}x`, tela: MOBILE ? 'celular 375' : 'PC 1366', modo: process.env.MODO ?? 'full' };
  out.postits = await ev(SETUP);
  out.leve = await ev(`return document.documentElement.classList.contains('lite');`);
  const scen = (process.env.CENAS ?? (MOBILE ? 'parado,rolar,janela' : 'parado,mouse,arrastar,rolar,rolar_longe,zoom')).split(',');
  for (const [k, v] of NAMES.entries()) {
    await ev(`document.getElementById('__var')?.remove(); const s=document.createElement('style'); s.id='__var'; s.textContent=${JSON.stringify(VARIANTS[v] ?? '')}; document.head.append(s); return 1;`);
    const row = {};
    for (const c of scen) {
      if (c === 'perfil') {
        await sleep(800);
        const m = async () => Object.fromEntries((await send('Performance.getMetrics')).result.metrics.map((x) => [x.name, x.value]));
        const a = await m(); await sleep(2000); const b = await m();
        const d = (k) => Math.round(((b[k] - a[k]) * 1000) / 2);
        row.perfil = { tarefas_ms_s: d('TaskDuration'), estilo: d('RecalcStyleDuration'), layout: d('LayoutDuration'), script: d('ScriptDuration'), quadros: Math.round((b.Frames ?? 0) - (a.Frames ?? 0)) };
        continue;
      }
      if (c === 'funcional') {
        const R = {};
        await send('Log.enable'); const erros = [];
        ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.method === 'Runtime.exceptionThrown') erros.push(d.params.exceptionDetails?.exception?.description?.slice(0, 120)); if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') erros.push(d.params.entry.text.slice(0, 120)); });
        await ev('await __reset(); return 1;');
        // 1) arrastar e soltar com o mouse de verdade
        const alvo = await ev(`const ligados=new Set([...document.querySelectorAll('.links-layer g[data-a]')].flatMap(g=>[g.dataset.a,g.dataset.b])); const vis=[...document.querySelectorAll('.postit')].filter(p=>{const r=p.getBoundingClientRect(); return r.top>100&&r.bottom<innerHeight-60&&r.left>40&&r.right<innerWidth-300;}); const a=vis.find(p=>ligados.has(p.dataset.noteId))||vis[0]; window.__alvo=a; const fio=document.querySelector('.links-layer g[data-a="'+a.dataset.noteId+'"] .link-line, .links-layer g[data-b="'+a.dataset.noteId+'"] .link-line'); window.__fio=fio; const r=a.getBoundingClientRect(); return {id:a.dataset.noteId, x:r.left+r.width/2, y:r.top+40, left:a.style.left, top:a.style.top, fio:fio?.getAttribute('d')?.slice(0,30)};`);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: alvo.x, y: alvo.y });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: alvo.x, y: alvo.y, button: 'left', clickCount: 1 });
        for (let i = 1; i <= 20; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: alvo.x + i * 4, y: alvo.y + i * 3, button: 'left', buttons: 1 }); await sleep(20); }
        const meio = await ev(`return {translate:__alvo.style.translate, fio:__fio?.getAttribute('d')?.slice(0,30), arrastando:__alvo.classList.contains('is-dragging')};`);
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: alvo.x + 80, y: alvo.y + 60, button: 'left', clickCount: 1 });
        await sleep(900);
        const depois = await ev(`return {left:__alvo.style.left, top:__alvo.style.top, translate:__alvo.style.translate||'(vazio)', fio:__fio?.getAttribute('d')?.slice(0,30)};`);
        const salvo = await ev(`const n=(await (await fetch('/api/notes?folder=root',{headers:{'X-Mural':'1'}})).json()).notes.find(n=>String(n.id)===${JSON.stringify(alvo.id)}); return {x:n.x,y:n.y};`);
        R.arrastar = { antes: alvo.left + ',' + alvo.top, durante_translate: meio.translate, arrastando: meio.arrastando, fio_mudou_durante: meio.fio !== alvo.fio, depois: depois.left + ',' + depois.top, translate_depois: depois.translate, salvo_no_servidor: salvo.x + ',' + salvo.y };
        // 2) passar o mouse mostra os botões
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: alvo.x + 80, y: alvo.y + 40 });
        await sleep(400);
        R.hover_botoes = await ev(`const b=__alvo.querySelector('.postit-actions'); return getComputedStyle(b).visibility+' / opacidade '+getComputedStyle(b).opacity;`);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 700 }); await sleep(400);
        R.sem_hover_botoes = await ev(`return getComputedStyle(__alvo.querySelector('.postit-actions')).visibility;`);
        // 3) TAB foca o post-it, botões aparecem, Enter abre a edição
        await ev(`const prev=[...document.querySelectorAll('.postit')][[...document.querySelectorAll('.postit')].indexOf(__alvo)-1]; (prev||__alvo).focus(); return 1;`);
        if (await ev(`return document.activeElement!==__alvo;`)) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); }
        await sleep(300);
        R.foco_no_postit = await ev(`return (document.activeElement===__alvo)+' / focus-visible '+__alvo.matches(':focus-visible')+' / foco em: '+(document.activeElement?.getAttribute('aria-label')||document.activeElement?.className?.toString().slice(0,20));`);
        R.foco_botoes = await ev(`return getComputedStyle(__alvo.querySelector('.postit-actions')).visibility;`);
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        R.tab_entra_no_botao = await ev(`return document.activeElement?.getAttribute('aria-label')+' (dentro do post-it: '+__alvo.contains(document.activeElement)+')';`);
        await ev(`__alvo.focus(); return 1;`);
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        await sleep(700);
        R.enter_abre_edicao = await ev(`return !!document.querySelector('.note-modal') && (document.querySelector('.note-modal h2')?.textContent||'');`);
        await ev(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); await __w(600); return 1;`);
        // 4) zoom afastado esconde os detalhes e volta
        await ev(`for(let k=0;k<6;k++){ window.dispatchEvent(new KeyboardEvent('keydown',{key:'-'})); await __w(400);} await __w(900); return 1;`);
        R.zoom_longe = await ev(`const p=document.querySelector('.postit .postit-content'); return {far:__b.classList.contains('far'), texto:getComputedStyle(p).visibility, titulo:getComputedStyle(document.querySelector('.postit .postit-title')).visibility, escala:document.querySelector('.canvas-zoom').style.transform};`);
        await ev(`await __reset(); await __w(500); return 1;`);
        R.zoom_perto = await ev(`return {far:__b.classList.contains('far'), texto:getComputedStyle(document.querySelector('.postit .postit-content')).visibility};`);
        // 5) relógio anda e 6) erros
        R.relogio = await ev(`const a=document.querySelector('.clock-time')?.getAttribute('aria-label'); await __w(2100); const b=document.querySelector('.clock-time')?.getAttribute('aria-label'); return a+' → '+b;`);
        R.erros = erros.length ? erros.slice(0, 5) : 'nenhum';
        row.funcional = R;
        continue;
      }
      if (c === 'opac') {
        await sleep(4000); await send('DOM.enable'); await send('LayerTree.enable'); await sleep(1500);
        const out2 = [];
        for (const l of lastLayers) {
          const r = await send('LayerTree.compositingReasons', { layerId: l.layerId });
          const ids = r.result?.compositingReasonIds || [];
          if (!ids.some((x) => /Opacity|Overlap/.test(x)) || !l.backendNodeId) continue;
          const rn = await send('DOM.resolveNode', { backendNodeId: l.backendNodeId });
          const info = await send('Runtime.callFunctionOn', { objectId: rn.result.object.objectId, returnByValue: true, functionDeclaration: `function(){ const p=this.closest?.('.postit'); const chain=[]; let e=this; for(let i=0;i<5&&e;i++){ const cs=getComputedStyle(e); chain.push(((e.className?.baseVal??e.className)||e.tagName).toString().split(' ').slice(0,3).join('.')+' op='+cs.opacity+' anim='+cs.animationName+' trans='+cs.transitionProperty.slice(0,30)+' wc='+cs.willChange); e=e.parentElement; } return {nota:p?.dataset.noteId, offscreen:p?.classList.contains('offscreen'), anims:document.getAnimations().length, chain}; }` });
          out2.push({ motivo: ids.join('+'), ...info.result?.result?.value });
        }
        await send('LayerTree.disable'); row.opac = out2.slice(0, 4);
        continue;
      }
      if (c === 'nlayers') {
        await go('/'); await sleep(1000);
        await ev(`const s=document.createElement('style'); s.id='__var'; s.textContent=${JSON.stringify(VARIANTS[v] ?? '')}; document.head.append(s); return 1;`);
        await sleep(4000);
        const t = []; await send('LayerTree.enable'); await sleep(1200); t.push(lastLayers.length); await send('LayerTree.disable'); lastLayers = [];
        await sleep(5000); await send('LayerTree.enable'); await sleep(1200); t.push(lastLayers.length); await send('LayerTree.disable'); lastLayers = [];
        row.nlayers = t.join(' → ');
        await ev(SETUP);
        continue;
      }
      if (c === 'nlayers_old') {
        await sleep(1500); await send('LayerTree.enable'); await sleep(1200);
        row.nlayers = lastLayers.length; await send('LayerTree.disable'); lastLayers = [];
        continue;
      }
      if (c === 'layers') {
        await sleep(5000); await send('DOM.enable'); await send('LayerTree.enable'); await sleep(1500);
        const ls = lastLayers; const reasons = {};
        const donos = {};
        for (const l of ls.slice(0, 400)) {
          const r = await send('LayerTree.compositingReasons', { layerId: l.layerId }); const k = (r.result?.compositingReasonIds || ['?']).join('+') || 'sem-motivo'; reasons[k] = (reasons[k] || 0) + 1;
          let dono = l.backendNodeId ? 'node' : 'sem-node';
          if (l.backendNodeId) { const dn = await send('DOM.describeNode', { backendNodeId: l.backendNodeId }); const nd = dn.result?.node; const cls = (nd?.attributes || []).reduce((a, v, i, arr) => (v === 'class' ? arr[i + 1] : a), ''); dono = (nd?.nodeName || '?') + '.' + cls.split(' ').slice(0, 2).join('.') + (nd?.pseudoType ? '::' + nd.pseudoType : ''); }
          const kk = k + ' | ' + dono; donos[kk] = (donos[kk] || 0) + 1;
        }
        row.donos = Object.entries(donos).sort((a, b) => b[1] - a[1]).slice(0, 14);
        await send('LayerTree.disable');
        row.layers = { total: ls.length, motivos: Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 10) };
        continue;
      }
      if (c === 't_arrastar_real') { traceBuf = []; await send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,v8.execute', transferMode: 'ReportEvents' }); }
      if (c === 'rolar_real' || c === 'arrastar_real' || c === 't_arrastar_real') {
        await ev(`window.__cnt={n:0,lg:0,last:performance.now(),on:true,t0:performance.now()}; (async()=>{ while(__cnt.on){ await __f(); const t=performance.now(); if(t-__cnt.last>50) __cnt.lg++; __cnt.last=t; __cnt.n++; } })(); return 1;`);
        if (c === 'rolar_real') {
          const x = MOBILE ? 190 : 683, y = MOBILE ? 500 : 450;
          await send('Input.synthesizeScrollGesture', { x, y, yDistance: -1600, xDistance: MOBILE ? 0 : -600, speed: 900, gestureSourceType: MOBILE ? 'touch' : 'mouse', repeatCount: 1 });
          await send('Input.synthesizeScrollGesture', { x, y, yDistance: 1600, xDistance: MOBILE ? 0 : 600, speed: 900, gestureSourceType: MOBILE ? 'touch' : 'mouse', repeatCount: 1 });
        } else {
          const p = await ev(`const a=[...document.querySelectorAll('.postit')].find(p=>{const r=p.getBoundingClientRect(); return r.top>90&&r.bottom<innerHeight-60&&r.left>40&&r.right<innerWidth-280;}); const r=a.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+40};`);
          await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
          await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
          for (let i = 0; i < 150; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + Math.sin(i / 10) * 120, y: p.y + 60 + Math.cos(i / 10) * 60, button: 'left', buttons: 1 }); await sleep(16); }
          await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y + 60, button: 'left', clickCount: 1 });
        }
        row[c] = await ev(`__cnt.on=false; return Math.round(__cnt.n*1000/(performance.now()-__cnt.t0))+'/'+__cnt.lg;`);
        if (c === 't_arrastar_real') {
          const done = new Promise((r) => (traceDone = r)); await send('Tracing.end'); await done;
          const main = traceBuf.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
          const tot = {}; const fn = {};
          for (const e of traceBuf) { if (main && (e.pid !== main.pid || e.tid !== main.tid)) continue; if (e.ph === 'X' && e.dur) tot[e.name] = (tot[e.name] || 0) + e.dur / 1000; if (e.name === 'FunctionCall' && e.dur) { const k = (e.args?.data?.functionName || '?') + '@' + (e.args?.data?.url || '').split('/').pop().slice(0, 18); fn[k] = (fn[k] || 0) + e.dur / 1000; } }
          row[c] = { fps: row[c], top: Object.entries(tot).filter(([k]) => !['RunTask','ThreadControllerImpl::RunTask','RunMicrotasks'].includes(k)).sort((a, b) => b[1] - a[1]).slice(0, 9).map(([k, v]) => k + ' ' + Math.round(v)), funcoes: Object.entries(fn).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + ' ' + Math.round(v)) };
        }
        await ev(`await __reset(); return 1;`);
        continue;
      }
      if (c.startsWith('t_')) {
        traceBuf = [];
        await send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,v8.execute', transferMode: 'ReportEvents' });
        const fps = await ev(SCEN[c.slice(2)]);
        const done = new Promise((r) => (traceDone = r));
        await send('Tracing.end'); await done;
        const main = traceBuf.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
        const tot = {}; let elems = 0, n = 0; const inval = {};
        for (const e of traceBuf) {
          if (main && (e.pid !== main.pid || e.tid !== main.tid)) continue;
          if (e.ph === 'X' && e.dur) tot[e.name] = (tot[e.name] || 0) + e.dur / 1000;
          if (e.name === 'UpdateLayoutTree' && e.args?.elementCount) { elems += e.args.elementCount; n++; }
          if (e.name === 'StyleRecalcInvalidationTracking' || e.name === 'ScheduleStyleInvalidationTracking') { const k = (e.args?.data?.reason || e.args?.data?.invalidationSet?.id || '?') + ' ' + (e.args?.data?.nodeName || ''); inval[k] = (inval[k] || 0) + 1; }
        }
        const top = Object.entries(tot).filter(([k]) => !['RunTask','ThreadControllerImpl::RunTask','RunMicrotasks','EvaluateScript'].includes(k)).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => k + ' ' + Math.round(v));
        const fn = {};
        for (const e of traceBuf) { if (main && (e.pid !== main.pid || e.tid !== main.tid)) continue; if ((e.name === 'FunctionCall' || e.name === 'TimerFire') && e.dur) { const dd = e.args?.data || {}; const k = e.name + ':' + (dd.functionName || dd.timerId || '?') + '@' + (dd.url || '').split('/').pop().slice(0, 22) + ':' + (dd.lineNumber ?? '') + ':' + (dd.columnNumber ?? ''); fn[k] = (fn[k] || 0) + e.dur / 1000; } }
        row[c] = { fps, top, funcoes: Object.entries(fn).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => k + ' ' + Math.round(v)), recalc_elementos_por_vez: n ? Math.round(elems / n) : 0, recalcs: n };
        continue;
      }
      if (c.startsWith('p_')) {
        const m = async () => Object.fromEntries((await send('Performance.getMetrics')).result.metrics.map((x) => [x.name, x.value]));
        const a = await m(); const fps = await ev(SCEN[c.slice(2)]); const b = await m();
        const d = (k) => Math.round(b[k] - a[k] > 0 ? (b[k] - a[k]) * 1000 : 0);
        row[c] = { fps, tarefas: d('TaskDuration'), estilo: d('RecalcStyleDuration'), layout: d('LayoutDuration'), script: d('ScriptDuration'), estilos_recalc: Math.round(b.RecalcStyleCount - a.RecalcStyleCount), layouts: Math.round(b.LayoutCount - a.LayoutCount) };
        continue;
      }
      row[c] = await ev(SCEN[c]);
    }
    out[`${k}_${v}`] = row;
  }
  console.log(JSON.stringify(out));
} catch (e) {
  console.error('ERRO', e.message);
} finally {
  chrome.kill();
  process.exit(0);
}
