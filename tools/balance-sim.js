const { chromium } = require('playwright');
// Headless balance simulator. Usage: node tools/balance-sim.js <random|hawk|smart|mixed|peace> [games] [first]
// Drives the real game code through window.SG with animations off and a scripted player.
(async()=>{
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push('PAGEERR '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text());});
  await p.goto('file://'+require('path').resolve(__dirname,'../index.html'));
  await p.waitForTimeout(500);
  const strat = process.argv[2]||'random';
  const N = +(process.argv[3]||60);
  const FIRST = process.argv[4]==='first';
  const res = await p.evaluate(async ({strat,N,FIRST})=>{
    SG.setSpeed(0);
    SG.save().firstRunDone = !FIRST;
    const out=[];
    const _det=detonate; window.__h={p:0,a:0};
    detonate=function(a,t){ if(t.isPlayer) __h.p++; else __h.a++; return _det(a,t); };
    const ids=['trumpet','putinov','jinpooh','jongfun','macroni','muskrat','stalemate','mussolinguini','gaddafty','idiamok'];
    for(let g=0;g<N;g++){
      let done;
      const pr=new Promise(r=>done=r);
      SG.sim={
        choose(o){
          const ok=o.choices.map((c,i)=>[c,i]).filter(([c])=>!c.disabled);
          if(strat==='mixed' && /SECURE LINE/.test(o.kicker||'')) return 0;
          if(strat==='mixed' && /INBOUND/.test(o.title||'')) return 1;
          if(strat==='mixed' && /PROPOSES A PACT/.test(o.title||'')) return 0;
          if(strat==='peace' && SG.__aid && /SECURE LINE/.test(o.kicker||'')){ SG.__aid=false; return 3; }
          if(strat==='peace'){
            // prefer pact / aid / dovish / wait
            const t=o.title||'';
            if(/INBOUND/.test(t)) return 1;
            if(/SUMMIT/.test(t)) return 0;
            const idx=ok.find(([c])=>/PACT|SIGN|AID|NO\. NOBODY|TRADE HONESTLY|COMPLY|LISTEN|CONFIRM|REPORT|TRADE HIM|CANCEL|OPEN THE|BURN IT|KEEP A HUMAN|DISMANTLE 2/.test(c.t));
            if(idx) return idx[1];
          }
          return ok[Math.floor(Math.random()*ok.length)][1];
        },
        act(G){
          const P=G.nations[0]; const os=G.nations.filter(n=>n.alive&&!n.isPlayer);
          const t=os[Math.floor(Math.random()*os.length)];
          if(strat==='peace'){
            const np=os.filter(o=>!G.pact[0][o.idx]).sort((a,b)=>G.rel[b.idx][0]-G.rel[a.idx][0]);
            if(np.length){ return {id:'diplo',t:np[0].idx}; }
            const low=os.slice().sort((a,b)=>G.rel[a.idx][0]-G.rel[b.idx][0])[0];
            if(low && G.rel[low.idx][0]<55 && P.stab>25) { SG.__aid=true; return {id:'diplo',t:low.idx}; }
            return {id:'build',opt:'shield'};
          }
          if(strat==='mixed'){
            const strong=os.slice().sort((a,b)=>b.warheads-a.warheads);
            const unp=strong.filter(o=>!G.pact[0][o.idx]);
            const enemies=os.filter(o=>!G.pact[0][o.idx]).sort((a,b)=>a.pop-b.pop);
            if(G.turn<=6 && unp.length>enemies.length-1 && unp.length) return {id:'diplo',t:unp[0].idx};
            if(P.shield<5) return {id:'build',opt:'shield'};
            const tg=enemies[0]||os[0];
            if(tg.shield>3 && tg.shieldDown<=0 && Math.random()<.4) return {id:'cyber',t:tg.idx};
            if(G.defcon<=2 && P.warheads>=3) return {id:'strike',t:tg.idx,opt:{n:Math.min(6,P.warheads)}};
            if(tg.stab<35) return {id:'disinfo',t:tg.idx};
            if(P.warheads<10) return {id:'build',opt:'warheads'};
            if(G.turn>7) return {id:'drones',t:tg.idx};
            return {id:'build',opt:'hyper'};
          }
          if(strat==='smart'){
            const weak=os.slice().sort((a,b)=>a.pop-b.pop)[0];
            if(P.shield<5) return {id:'build',opt:'shield'};
            if(G.defcon<=2 && P.warheads>=3){ if(P.hyper>0 && Math.random()<.4) return {id:'strike',t:weak.idx,opt:{n:1,hyper:true}}; return {id:'strike',t:weak.idx,opt:{n:Math.min(6,P.warheads)}}; }
            if(weak.stab<30) return {id:'disinfo',t:weak.idx};
            if(G.turn%4===0) return {id:'intel'};
            if(P.warheads<12) return {id:'build',opt:'warheads'};
            if(G.turn>8 && P.warheads>=6) return {id:'strike',t:weak.idx,opt:{n:6}};
            return {id:'build',opt:Math.random()<.5?'hyper':'shield'};
          }
          if(strat==='hawk'){
            if(P.warheads>=3 && Math.random()<.6) return {id:'strike',t:t.idx,opt:{n:Math.min(6,P.warheads)}};
            return {id:'build',opt:Math.random()<.6?'warheads':'shield'};
          }
          const opts=['build','strike','drones','cyber','disinfo','diplo','intel'];
          let id=opts[Math.floor(Math.random()*opts.length)];
          if(id==='strike'&&P.warheads<1) id='build';
          if(id==='build') return {id,opt:['warheads','hyper','shield'][Math.floor(Math.random()*3)]};
          if(id==='strike') return {id,t:t.idx,opt:{n:[1,3,6][Math.floor(Math.random()*3)]}};
          return {id,t:t.idx};
        },
        onEnd(r){done(r);}
      };
      const id=ids[g%ids.length];
      SG.save().firstRunDone = !FIRST;
      SG.start(id,false);
      __h={p:0,a:0};
      const r=await pr; r.id=id; r.hp=__h.p; r.ha=__h.a; r.aiDead=SG.G.nations.filter(n=>!n.isPlayer&&!n.alive).length; r.byP=SG.G.nations.filter(n=>!n.isPlayer&&!n.alive&&n.killedBy===0).length; r.stab=SG.G.nations[0].stab; out.push(r);
      await new Promise(r=>setTimeout(r,0));
    }
    return out;
  },{strat,N,FIRST});
  const tally={}; let turns=0,pacts=0;
  res.forEach(r=>{tally[r.res]=(tally[r.res]||0)+1;turns+=r.turn;pacts+=r.pacts;});
  console.log(strat,'games',res.length,tally,'avgTurn',(turns/res.length).toFixed(1),'avgMaxPacts',(pacts/res.length).toFixed(2),'avgClockEnd',(res.reduce((s,r)=>s+r.clock,0)/res.length).toFixed(0));
  const avg=k=>(res.reduce((s,r)=>s+r[k],0)/res.length).toFixed(2);
  console.log('  hitsOnPlayer',avg('hp'),'hitsOnAI',avg('ha'),'aiDead',avg('aiDead'),'killedByPlayer',avg('byP'),'endPop',avg('pop'));
  const e=errs.filter(x=>!/CERT/.test(x)); if(e.length) console.log('errors:',e.slice(0,10));
  await b.close();
})();
