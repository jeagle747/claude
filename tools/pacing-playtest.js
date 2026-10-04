// Real-speed pacing playtest. Usage: node tools/pacing-playtest.js <std|first> <hawk|rand> [turns]
// Real-speed playtest with a "human" bot: waits ~reading time before answering any screen.
const { chromium } = require('playwright');
const MODE=process.argv[2]||'std', STRAT=process.argv[3]||'hawk', TURNS=+(process.argv[4]||7);
(async()=>{
 const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
 const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto('file://'+require('path').resolve(__dirname,'../index.html'));await p.waitForTimeout(300);
 await p.evaluate(m=>{SG.save().name='TESTER';SG.save().introSeen=true;SG.save().firstRunDone=(m!=='first');},MODE);
 await p.keyboard.press('Space');await p.waitForTimeout(300);await p.click('#b-skip');await p.waitForTimeout(400);
 await p.evaluate(()=>{window.__ev=[];const now=()=>performance.now();
  banner=(o=>function(t,k){__ev.push({k:'banner',t:now(),x:t});return o(t,k);})(banner);
  toast=(o=>function(a,c,k){__ev.push({k:'toast',t:now(),x:a+' '+(c||'')});return o(a,c,k);})(toast);
  const mt=MAP.text.bind(MAP);MAP.text=function(i,x,c){__ev.push({k:'maptext',t:now(),x,i});return mt(i,x,c);};
  const fs=FEED.step.bind(FEED);FEED.step=function(n,i,l){__ev.push({k:'step',t:now(),x:n?n.name:l});return fs(n,i,l);};
  const fp=FEED.pause.bind(FEED);FEED.pause=async function(){const t0=now(),ch=[...document.querySelectorAll('#feed-lines p')].reduce((s,p)=>s+p.textContent.length,0);await fp();__ev.push({k:'pause',t:now(),dur:now()-t0,ch});};
  const fa=FEED.add.bind(FEED);FEED.add=function(x,c){__ev.push({k:'feedline',t:now(),x});return fa(x,c);};
  const lg=log;log=function(x,c){__ev.push({k:'log',t:now(),x,c,phase:SG.G&&SG.G.phase});return lg(x,c);};
 });
 await p.click('.lcard:not(.locked) >> nth=1');
 const t0=Date.now();let lastTurn=0;const turnT=[];
 for(let i=0;i<6000;i++){
  const st=await p.evaluate(()=>({scr:SCREEN,open:!document.querySelector('#modal').hidden,txt:(document.querySelector('#m-text').textContent+document.querySelector('#m-result').textContent).length,choices:document.querySelectorAll('#m-choices .choice:not(:disabled)').length,cont:!!document.querySelector('#m-result .cont, #m-choices .cont'),mode:UI.mode,turn:SG.G&&SG.G.turn,acts:[...document.querySelectorAll('#act-buttons .act')].map(b=>({t:b.textContent,d:b.disabled}))}));
  if(st.scr==='s-end'||st.turn>TURNS)break;
  if(st.turn!==lastTurn){turnT.push(Date.now());lastTurn=st.turn;}
  const read=ms=>p.waitForTimeout(ms);
  if(st.open){ await read(800+st.txt*25); // human reading ~40 chars/s
    if(st.choices) await p.keyboard.press(String(1+Math.floor(Math.random()*st.choices))); else if(st.cont) await p.keyboard.press('Enter'); }
  else if(st.mode==='idle'){ await read(1500);
    const can=st.acts.map((a,i)=>!a.d&&!/LOCKED|ONLINE/.test(a.t)?i+1:0).filter(Boolean);
    let k; if(STRAT==='hawk'){ k = can.includes(2)&&Math.random()<.55?2:(can.includes(3)&&Math.random()<.5?3:1);} else k=can[Math.floor(Math.random()*can.length)];
    await p.keyboard.press(String(k)); }
  else if(st.mode==='target'||st.mode==='sub'){ await read(600); await p.keyboard.press('1'); }
  else if(st.mode==='confirm'){ await read(700); await p.keyboard.press('Enter'); }
  await p.waitForTimeout(150);
 }
 const ev=await p.evaluate(()=>__ev);
 const res=await p.evaluate(()=>({turn:SG.G.turn,result:SG.G.result}));
 // ---- analysis ----
 const out={mode:MODE,strat:STRAT,minutes:((Date.now()-t0)/60000).toFixed(1),res,errs};
 const turns=turnT.slice(1).map((t,i)=>((t-turnT[i])/1000).toFixed(0));out.secPerTurn=turns;
 const bn=ev.filter(e=>e.k==='banner');out.banners=bn.length;out.bannerClobbered=bn.filter((e,i)=>i&&e.t-bn[i-1].t<1500).map((e,i)=>e.x);
 const ts=ev.filter(e=>e.k==='toast');let maxC=0;ts.forEach(e=>{const c=ts.filter(o=>o.t<=e.t&&e.t-o.t<3200).length;maxC=Math.max(maxC,c);});out.toasts=ts.length;out.maxToastsOnScreen=maxC;
 const mt=ev.filter(e=>e.k==='maptext');out.mapTextSameNodeOverlap=mt.filter((e,i)=>mt.some((o,j)=>j<i&&o.i===e.i&&e.t-o.t<700)).length+'/'+mt.length;
 const ps=ev.filter(e=>e.k==='pause');out.feedPauses=ps.map(p=>`${(p.dur/1000).toFixed(1)}s/${p.ch}ch`);
 out.feedCps=ps.map(p=>(p.ch/(p.dur/1000)).toFixed(0)+'cps');
 const brief=ev.filter(e=>e.k==='log'&&e.phase==='briefing'&&/WORLD EVENT|ARGUS:|EXPOSED|COUP|BREAKS|WARNING/.test(e.x));out.briefingLogOnly=brief.map(e=>e.x.slice(0,70));
 console.log(JSON.stringify(out,null,1));
 await b.close();})();
