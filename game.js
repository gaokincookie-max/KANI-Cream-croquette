(() => {
  'use strict';
  const screen = document.getElementById('screen');
  const stageChip = document.getElementById('stageChip');
  const menuTpl = document.getElementById('menuTpl');
  const hudTpl = document.getElementById('hudTpl');

  const storageKey = 'kaniCreamKorokkeProtoBook';
  const settingsKey = 'kaniCreamKorokkeProtoSettings';
  const TOTAL_RECIPES = 600;
  const recipeComments = window.KANI_RECIPE_COMMENTS || {};
  // Detect a missing or cached comment bundle instead of silently using generic text.
  if (Object.keys(recipeComments).length !== 600) {
    console.error('[KANI] レシピコメントの読み込みに失敗しました。実際の件数:', Object.keys(recipeComments).length);
    window.addEventListener('DOMContentLoaded', () => {
      const notice = document.createElement('div');
      notice.style.cssText = 'position:fixed;z-index:99999;bottom:12px;left:12px;right:12px;padding:12px 16px;background:#7c1e1e;color:#fff;font-weight:bold;border-radius:8px;box-shadow:0 3px 12px #0005';
      notice.textContent = 'レシピコメントの読み込みに失敗しました。最新版ZIPをすべて展開し、index.html から起動してください。';
      document.body.appendChild(notice);
    });
  }
  // A damaged or blocked localStorage must never stop the entire game boot sequence.
  function readStorage(key, fallback){
    try { const value=localStorage.getItem(key); return value===null ? fallback : JSON.parse(value); }
    catch(err){ console.warn('[KANI] セーブデータを読み込めません:',key,err); return fallback; }
  }
  function writeStorage(key, value){
    try { localStorage.setItem(key,JSON.stringify(value)); return true; }
    catch(err){ console.warn('[KANI] セーブデータを保存できません:',key,err); return false; }
  }
  let book = readStorage(storageKey, []);
  let settings = Object.assign({sfx:70, reducedMotion:false}, readStorage(settingsKey, {}) || {});

  const state = resetState();
  let timers = [];
  let raf = 0;
  let stage2VisibilityCleanup = null;
  let bookRenderCleanup = null;
  const stageAnimations = new Set();
  // Every screen change invalidates outstanding stage-three work.
  let stage3Session = 0;
  const stage3AbortListeners = new Set();
  const STAGE3_CANCELLED = Symbol('stage3-cancelled');
  function stage3Await(task, session){
    if(session !== stage3Session) return Promise.reject(STAGE3_CANCELLED);
    return new Promise((resolve,reject)=>{
      let settled=false;
      const abort=()=>finish(false,STAGE3_CANCELLED);
      const finish=(ok,value)=>{
        if(settled) return;
        settled=true;
        stage3AbortListeners.delete(abort);
        if(session !== stage3Session) reject(STAGE3_CANCELLED);
        else if(ok) resolve(value); else reject(value);
      };
      stage3AbortListeners.add(abort);
      Promise.resolve(task).then(value=>finish(true,value),err=>finish(false,err));
    });
  }
  function stage3Animation(element,frames,options){
    return trackStageAnimation(element.animate(frames,options)).finished;
  }
  function handleStage3Error(err){
    if(err !== STAGE3_CANCELLED) console.error('[KANI] 第3工程の演出エラー:',err);
  }

  function resetState(){
    return {
      stage:0,
      catch:null,
      freshness:0,
      liquid:null,
      liquidMix:{},
      amount:0,
      amountScore:0,
      verb:null,
      finishScore:0,
      finishLabel:'—',
      art:0,
      notes:[],
      special:null
    };
  }
  function clearAsync(){
    if(stage2VisibilityCleanup){ stage2VisibilityCleanup(); stage2VisibilityCleanup=null; }
    if(bookRenderCleanup){ bookRenderCleanup(); bookRenderCleanup=null; }
    stage3Session++;
    for(const abort of [...stage3AbortListeners]) abort();
    timers.forEach(clearTimeout); timers=[];
    cancelAnimationFrame(raf); raf=0;
    for(const animation of stageAnimations) animation.cancel();
    stageAnimations.clear();
  }
  function trackStageAnimation(animation){
    stageAnimations.add(animation);
    const cleanup=()=>stageAnimations.delete(animation);
    animation.addEventListener('finish',cleanup,{once:true});
    animation.addEventListener('cancel',cleanup,{once:true});
    return animation;
  }
  function later(fn,ms){ const id=setTimeout(fn,ms);timers.push(id);return id; }
  function wait(ms){ return new Promise(resolve=>later(resolve,ms)); }
  function setStage(label){ stageChip.textContent=label; }
  function clone(tpl){ return tpl.content.cloneNode(true); }
  function r(min,max){ return min+Math.random()*(max-min); }
  function ri(min,max){ return Math.floor(r(min,max+1)); }
  function choice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function toast(text){ const el=document.createElement('div');el.className='toast';el.textContent=text;screen.appendChild(el);later(()=>el.remove(),1000); }
  function pctScore(value,target,tolerance){ const err=Math.abs(value-target); return Math.round(clamp(100-(err/tolerance)*100,0,100)); }

  function burstFx(parent,x,y,text='',kind='good'){
    const fx=document.createElement('div');fx.className=`burst-fx ${kind}`;fx.style.left=x+'px';fx.style.top=y+'px';fx.innerHTML=`<i></i><b>${text}</b>`;parent.appendChild(fx);later(()=>fx.remove(),700);
  }
  function shake(el,kind='soft'){ if(settings.reducedMotion)return;el.classList.remove('shake-soft','shake-hard');void el.offsetWidth;el.classList.add(kind==='hard'?'shake-hard':'shake-soft');later(()=>el.classList.remove('shake-soft','shake-hard'),360); }

  function showMenu(){
    clearAsync(); setStage('MENU'); screen.innerHTML=''; screen.appendChild(clone(menuTpl));
    screen.querySelector('[data-action="start"]').onclick=startGame;
    screen.querySelector('[data-action="book"]').onclick=showBook;
    screen.querySelector('[data-action="settings"]').onclick=showSettings;
  }

  function startGame(){
    clearAsync(); Object.assign(state, resetState());
    showTransition({
      title:'第1工程',
      subtitle:'狙う食材を見極めよう',
      action:'タップでカニを捕まえろ！',
      note:'岩陰から飛び出した瞬間がチャンス',
      art:`<img src="assets/stage1/crab.png" alt="カニ" class="transition-art-main">`,
      next:()=>startStage1(),
      delay:2300
    });
  }

  function mountHud(){ screen.innerHTML=''; screen.appendChild(clone(hudTpl)); return screen.querySelector('#playArea'); }
  function updateCook(line,ingredient,icon='🍽️'){
    const a=screen.querySelector('#cookLine'), b=screen.querySelector('#ingredientLine'), c=screen.querySelector('#miniDish');
    if(a)a.textContent=line;if(b)b.textContent=ingredient;if(c)c.textContent=icon;
  }

  function showTransition(configOrTitle,subtitle,next,delay=1500){
    clearAsync();
    const cfg = typeof configOrTitle === 'object'
      ? configOrTitle
      : {title:configOrTitle, subtitle, next, delay};
    const titleText = cfg.title || '';
    const subtitleText = cfg.subtitle || '';
    const actionText = cfg.action || subtitleText || '';
    const noteText = cfg.note || '';
    const artHtml = cfg.art || '';
    const delayMs = cfg.delay ?? delay;
    const nextFn = cfg.next || next;
    setStage('MOVE');
    screen.innerHTML=`<section class="transition tutorial-transition">
      <div class="transition-flash"></div>
      <div class="transition-lines"></div>
      <div class="transition-card">
        <div class="transition-kicker">STAGE INTRO</div>
        <h2>${titleText}</h2>
        <small class="transition-subtitle">${subtitleText}</small>
        <div class="transition-visual">${artHtml}</div>
        <div class="transition-action">${actionText}</div>
        ${noteText ? `<div class="transition-note">${noteText}</div>` : ''}
      </div>
      <div class="transition-next">TAP READY...</div>
    </section>`;
    later(nextFn,delayMs);
  }

  // ---------- STAGE 1 ----------
  const stage1Items = [
    {id:'crab',name:'カニ',icon:'🦀',img:'assets/stage1/crab.png',good:true,base:100,weight:28},
    {id:'hairy',name:'毛ガニ',icon:'🦀',img:'assets/stage1/hairy.png',good:true,base:125,weight:10,speed:1.18},
    {id:'king',name:'タラバガニ',icon:'🦀',img:'assets/stage1/king.png',good:true,base:145,weight:7,speed:1.32},
    {id:'small',name:'小さいカニ',icon:'🦀',img:'assets/stage1/small.png',good:true,base:80,weight:7,speed:.9},
    {id:'kanikama',name:'カニカマ',icon:'🍥',img:'assets/stage1/kanikama.png',good:false,base:45,weight:14},
    {id:'kombu',name:'昆布',icon:'🌿',img:'assets/stage1/kombu.png',good:false,base:35,weight:9},
    {id:'boot',name:'長靴',icon:'🥾',img:'assets/stage1/boot.png',good:false,base:15,weight:6},
    {id:'star',name:'ヒトデ',icon:'⭐',img:'assets/stage1/star.png',good:false,base:30,weight:6},
    {id:'glove',name:'赤い手袋',icon:'🧤',img:'assets/stage1/glove.png',good:false,base:25,weight:5},
    {id:'mystery',name:'カニのおもちゃ',icon:'❓',img:'assets/stage1/toy.png',good:false,base:20,weight:4}
  ];
  function weightedItem(){
    const total=stage1Items.reduce((s,x)=>s+x.weight,0); let n=Math.random()*total;
    for(const x of stage1Items){ n-=x.weight;if(n<=0)return x; } return stage1Items[0];
  }

  function startStage1(){
    clearAsync(); state.stage=1;setStage('1 / 3　カニ');
    const area=mountHud(); area.classList.add('sea');
    area.innerHTML=`<div class="stage-title">第1工程　1匹だけ獲れ！</div><div class="asset-status"><span>獲物</span><b id="statusCatch">—</b></div><div class="score-pill">候補 <b id="seenCount">0 / 8</b></div><div class="rock left"></div><div class="rock right"></div><div id="spear" class="spear"></div><div class="hint">画面をタップして銛！　空振りすると回収中に次を逃します。</div>`;
    updateCook('獲物待ち…','獲得食材：まだなし','🧺');
    let current=null, cooldown=false, seen=0, startHit=0, phase='waiting', fromLeft=true;
    const spear=area.querySelector('#spear');

    function scheduleNext(){
      if(state.catch)return;
      if(seen>=8){
        state.catch={id:'none',name:'食材なし',icon:'💨',good:false,base:0};state.freshness=0;state.notes.push('8体すべて見送り');
        toast('食材なし！');return later(()=>showTransition({title:'第2工程',subtitle:'ボウルに材料を集めよう',action:'クリームをボウルに集めろ！',note:'左上のお題と同じ材料を集めて分量100を目指そう',art:`<div class="transition-art-pair"><img src="assets/stage2/cream.png" alt="クリーム" class="transition-art-small"><img src="assets/stage2/bowl.png" alt="ボウル" class="transition-art-bowl"></div>`,next:startStage2,delay:2500}),1100);
      }
      phase='waiting'; current=null;
      later(()=>spawn(), r(500,1050));
    }
    function spawn(){
      if(state.catch)return;
      seen++; area.querySelector('#seenCount').textContent=`${seen} / 8`;
      const item=weightedItem(); fromLeft=true;
      const fake=Math.random()<.24; // feint: shadow peeks then retreats before revealing itself
      const target=document.createElement('div');target.className='target shadowy';target.style.top=r(39,58)+'%';target.innerHTML=item.img?`<img src="${item.img}" alt="${item.name}">`:item.icon;
      const startX='-16%';
      const shadowEnd=(16 + Math.random()*4).toFixed(1)+'%';
      target.style.left=startX; area.appendChild(target); phase='tease';
      const shadowDur=r(300,390)/(item.speed||1);
      trackStageAnimation(target.animate([{left:startX},{left:shadowEnd}],{duration:shadowDur,fill:'forwards',easing:'linear'}));
      later(()=>{
        if(fake && Math.random()<.68){
          trackStageAnimation(target.animate([{left:shadowEnd},{left:'-10%'}],{duration:r(220,300),fill:'forwards',easing:'ease-in'}));
          later(()=>{target.remove();phase='waiting'; if(!cooldown)scheduleNext(); else later(scheduleNext,300);},320);
          return;
        }
        target.classList.remove('shadowy'); phase='active'; startHit=performance.now();
        const dur=(r(980,1380)/(item.speed||1));
        const anim=trackStageAnimation(target.animate([{left:shadowEnd},{left:'108%'}],{duration:dur,fill:'forwards',easing:'linear'}));
        current={item,target,anim};
        anim.onfinish=()=>{ if(current?.target===target){current=null;phase='waiting';target.remove();scheduleNext();} };
      },shadowDur+30);
    }
    function fire(ev){
      ev.preventDefault(); if(cooldown||state.catch)return;
      const rect=area.getBoundingClientRect(); const x=(ev.clientX??ev.touches?.[0]?.clientX??rect.left+rect.width/2)-rect.left;
      const ang=(x/rect.width-.5)*42; trackStageAnimation(spear.animate([{transform:`translateX(-50%) rotate(0deg)`},{transform:`translateX(-50%) rotate(${ang}deg) translateY(-24%)`},{transform:`translateX(-50%) rotate(0deg)`}],{duration:260}));
      if(phase==='active' && current){
        const tr=current.target.getBoundingClientRect();
        const hitX=ev.clientX??ev.touches?.[0]?.clientX??0;
        if(hitX>=tr.left-25 && hitX<=tr.right+25){
          const elapsed=performance.now()-startHit;
          const fresh=Math.round(clamp(110-elapsed/7.2,20,100));
          state.catch=current.item;state.freshness=fresh;
          state.art += current.item.good?Math.round(fresh*.25):Math.round(fresh*.5);
          const hitRect=current.target.getBoundingClientRect(),areaRect=area.getBoundingClientRect();
          burstFx(area,hitRect.left-areaRect.left+hitRect.width/2,hitRect.top-areaRect.top+hitRect.height/2,current.item.good?'HIT!':'!?',current.item.good?'good':'weird');
          shake(area,current.item.good?'soft':'hard');
          current.anim.cancel();current.target.remove();current=null;
          const label=fresh>=95?'神鮮':fresh>=80?'超新鮮':fresh>=60?'新鮮':fresh>=40?'普通':'遅め';
          updateCook(`${current?.item?.name||state.catch.name}を確保！`,`獲得：${state.catch.name} / 新鮮さ ${fresh}` , state.catch.icon);
          toast(`${state.catch.name}！　${label} ${fresh}`);
          later(()=>showTransition({title:'第2工程',subtitle:'ボウルに材料を集めよう',action:'クリームをボウルに集めろ！',note:'左上のお題と同じ材料を集めて分量100を目指そう',art:`<div class="transition-art-pair"><img src="assets/stage2/cream.png" alt="クリーム" class="transition-art-small"><img src="assets/stage2/bowl.png" alt="ボウル" class="transition-art-bowl"></div>`,next:startStage2,delay:2500}),1250);
          return;
        }
      }
      // Empty thrust or missed target
      cooldown=true; phase = phase==='active' ? phase : 'cooldown';
      shake(area,'hard');
      const mask=document.createElement('div');mask.className='cooldown-mask';mask.textContent='銛回収中…';area.appendChild(mask);
      updateCook('空振り！','次の獲物を逃すかも…','😨');
      later(()=>{cooldown=false;mask.remove(); if(!current && phase==='cooldown'){phase='waiting';scheduleNext();}},1000);
    }
    area.addEventListener('pointerdown',fire,{passive:false});
    scheduleNext();
  }

  // ---------- STAGE 2 ----------
  const liquids=[
    {id:'cream',name:'クリーム',icon:'🥛',img:'assets/stage2/cream.png',amount:11,weight:30,color:'#fff0ce'},
    {id:'ice',name:'バニラアイス',icon:'🍨',img:'assets/stage2/ice.png',amount:17,weight:17,color:'#fff7e8'},
    {id:'yogurt',name:'ヨーグルト',icon:'🥣',img:'assets/stage2/yogurt.png',amount:12,weight:13,color:'#f7f4ef'},
    {id:'mayo',name:'マヨネーズ',icon:'🧴',img:'assets/stage2/mayo.png',amount:8,weight:10,color:'#fff0a9'},
    {id:'milk',name:'牛乳',icon:'🥛',img:'assets/stage2/milk.png',amount:7,weight:10,color:'#f7fbff'},
    {id:'condensed',name:'練乳',icon:'🧃',img:'assets/stage2/condensed.png',amount:9,weight:7,color:'#fff4d9'},
    {id:'foam',name:'シェービングフォーム',icon:'🫧',img:'assets/stage2/foam.png',amount:10,weight:5,color:'#ecf6ff'},
    {id:'tofu',name:'ホワイトソース',icon:'⬜',img:'assets/stage2/sauce.png',amount:15,weight:4,color:'#f6f1dc'},
    {id:'mystery',name:'白いペンキ',icon:'❔',img:'assets/stage2/white.png',amount:13,weight:4,color:'#ddd'}
  ];
  function weightedLiquid(){const total=liquids.reduce((s,x)=>s+x.weight,0);let n=Math.random()*total;for(const x of liquids){n-=x.weight;if(n<=0)return x}return liquids[0]}

  function startStage2(){
    clearAsync();state.stage=2;setStage('2 / 3　クリーム');
    const area=mountHud();area.classList.add('kitchen');
    area.innerHTML=`<div class="tile-lines"></div><div class="stage-title">第2工程　分量を合わせろ！</div><div class="asset-status"><img src="${state.catch?.img||'assets/stage1/crab.png'}" alt=""><span>${state.catch?.name||'食材なし'}</span></div><div class="target-card pulse"><img src="assets/stage2/cream.png" alt="クリーム"><div class="target-copy"><small>これを集めろ！</small><strong>クリーム</strong></div></div><div class="timer-big">残り <b id="timer">16.0</b></div><div class="bowl-game" id="bowl"><img class="bowl-art" src="assets/stage2/bowl.png" alt="ボウル"><div class="catch-mouth"><span>ここで回収</span></div><div class="bowl-fill" id="bowlFill"></div><div class="goal-line"></div><div class="goal-label">目標量</div></div><div class="volume-meter" id="volumeMeter"><span class="meter-caption">分量</span><div class="volume-bar"><i id="vFill"></i><b></b></div><div id="vText">0 / 100</div><div class="dominant" id="dominant">主成分：—</div></div><div class="hint">左上と同じクリームを集めて、右のメーターを100に近づけよう！</div>`;
    updateCook('ボウルを構えた！',`前工程：${state.catch?.name||'なし'}`,'🥣');
    const bowl=area.querySelector('#bowl'), fill=area.querySelector('#bowlFill'), vFill=area.querySelector('#vFill'), timerEl=area.querySelector('#timer'), domEl=area.querySelector('#dominant'), vText=area.querySelector('#vText'), volumeMeter=area.querySelector('#volumeMeter');
    let bowlX=area.clientWidth/2, drops=[], active=true, time=16, last=performance.now(), spawnAcc=0;
    // Pause this real-time mini-game when the browser/tab is hidden. A large
    // background-frame gap must not count as a single frame or drain the clock.
    let paused=document.hidden;
    const onVisibility=()=>{
      paused=document.hidden;
      last=performance.now();
    };
    document.addEventListener('visibilitychange',onVisibility);
    stage2VisibilityCleanup=()=>document.removeEventListener('visibilitychange',onVisibility);
    const mix={}; state.amount=0;

    function setBowl(x){bowlX=clamp(x,62,area.clientWidth-62);bowl.style.left=bowlX+'px'} setBowl(bowlX);
    function pointerX(e){const ar=area.getBoundingClientRect();return e.clientX-ar.left}
    area.addEventListener('pointerdown',e=>{area.setPointerCapture?.(e.pointerId);setBowl(pointerX(e))});
    area.addEventListener('pointermove',e=>{if(e.buttons||e.pointerType==='touch')setBowl(pointerX(e))});

    function addDrop(){
      const l=weightedLiquid(), el=document.createElement('div');el.className='drop';el.innerHTML=l.img?`<img src="${l.img}" alt="${l.name}">`:l.icon;
      const fromLeft=Math.random()<.5;
      const startX=fromLeft?-62:area.clientWidth+10;
      const startY=r(-82,-28); // upper chef panel の裏側から飛び込んでくるように、play-areaの外から開始
      // Aim the arc at a random point near the lower play field. The bowl still has to be moved under it.
      const targetX=r(72,area.clientWidth-72);
      const targetY=area.clientHeight*.78;
      // v0.3: 弧を目で追えるように v0.2 より少しゆっくり。
      const flight=r(1.02,1.28);
      const gravity=r(560,690);
      const vx=(targetX-startX)/flight;
      const vy=(targetY-startY-.5*gravity*flight*flight)/flight;
      el.style.left='0px';el.style.top='0px';area.appendChild(el);
      drops.push({l,el,x:startX,y:startY,prevY:startY,vx,vy,g:gravity,rot:r(-25,25),vr:r(-120,120)});
    }
    function currentDominant(){
      const total=Object.values(mix).reduce((a,b)=>a+b,0);if(!total)return null;
      let best=null,val=0;for(const [id,n] of Object.entries(mix)){if(n>val){val=n;best=id}}
      const ratio=val/total;const l=liquids.find(x=>x.id===best);return {l,ratio};
    }
    function refresh(){
      const h=clamp(state.amount/140*100,0,100);fill.style.height=h+'%';vFill.style.height=h+'%';vText.textContent=`${Math.round(state.amount)} / 100`;
      const d=currentDominant();domEl.textContent=d?`主成分：${d.ratio>=2/3?d.l.name:'???'} ${Math.round(d.ratio*100)}%`:'主成分：—';
      if(d) fill.style.background=d.l.color;
      volumeMeter.classList.toggle('near-goal',state.amount>=92&&state.amount<=106);
      volumeMeter.classList.toggle('over-goal',state.amount>106);
    }
    function loop(now){
      if(!active)return;
      if(paused){last=now;raf=requestAnimationFrame(loop);return;}
      // Use real elapsed foreground time for the timer; cap only physics steps.
      // This prevents low-FPS devices from receiving extra game time.
      const elapsed=Math.max(0,(now-last)/1000);
      const dt=Math.min(elapsed,.035);
      last=now;
      time-=elapsed;
      timerEl.textContent=Math.max(0,time).toFixed(1);
      if(time<=0){active=false;finishStage2();return;}
      spawnAcc+=dt;
      // 前半・中盤のテンポはそのまま。ラスト3.5秒だけ過密になりすぎないよう少し緩和。
      const interval=time<3.5?.22:time<8?.24:.31;
      if(spawnAcc>=interval){
        spawnAcc=0; addDrop();
        const extraChance=time<3.5?.16:(time<7?.28:0);
        if(extraChance && Math.random()<extraChance) addDrop();
      }
      const br=bowl.getBoundingClientRect(), ar=area.getBoundingClientRect();
      const bowlLeft=br.left-ar.left, bowlTop=br.top-ar.top;
      const catchY=bowlTop+2;
      for(let i=drops.length-1;i>=0;i--){
        const d=drops[i];d.prevY=d.y;d.vy+=d.g*dt;d.x+=d.vx*dt;d.y+=d.vy*dt;d.rot+=d.vr*dt;
        d.el.style.transform=`translate(${d.x}px, ${d.y}px) rotate(${d.rot}deg)`;
        const centerX=d.x+26, centerY=d.y+26, prevCenterY=d.prevY+26;
        // Catch exactly when the item's center crosses the visible blue bowl-mouth line while descending.
        if(d.vy>0 && prevCenterY<catchY && centerY>=catchY && centerX>bowlLeft+7 && centerX<bowlLeft+br.width-7){
          mix[d.l.id]=(mix[d.l.id]||0)+d.l.amount;state.amount+=d.l.amount;
          burstFx(area,centerX,catchY,d.l.name,'splash');
          d.el.remove();drops.splice(i,1);refresh();
          bowl.classList.remove('catch-pop');void bowl.offsetWidth;bowl.classList.add('catch-pop');
          shake(area,'soft');
          updateCook(`${d.l.name}を入れた！`,`総量 ${Math.round(state.amount)} / 100`,'🥣');continue;
        }
        if(d.y>area.clientHeight+80 || d.x<-120 || d.x>area.clientWidth+120){d.el.remove();drops.splice(i,1)}
      }
      if(time<=0){active=false;finishStage2();return} raf=requestAnimationFrame(loop);
    }
    function finishStage2(){
      if(stage2VisibilityCleanup){stage2VisibilityCleanup();stage2VisibilityCleanup=null;}
      state.liquidMix=mix;const d=currentDominant();state.liquid=d&&d.ratio>=2/3?d.l:{id:'mystery_mix',name:'謎の液体',icon:'🧪',base:35};
      state.amountScore=pctScore(state.amount,100,65);state.art+=state.liquid.id==='mystery_mix'?45:Math.round(state.amountScore*.15);
      const ratioTxt=d?Math.round(d.ratio*100):0;
      updateCook(`${state.liquid.name}になった！`,`分量 ${Math.round(state.amount)} / 完成度 ${state.amountScore}` ,state.liquid.icon);
      toast(`${state.liquid.name}（${ratioTxt}%）`);
      later(()=>showTransition({title:'第3工程',subtitle:'最後の調理を決めよう',action:'「揚げる」で止めろ！',note:'ルーレットを止めた結果でコロッケの運命が決まる',art:`<div class="transition-art-stage3"><img src="assets/dish/normal.png" alt="コロッケ" class="transition-art-dish"><div class="transition-word-badge">揚げる</div></div>`,next:startStage3,delay:2700}),1200);
    }
    refresh();raf=requestAnimationFrame(loop);
  }


  // ---------- STAGE 3 ----------
  const verbs=[
    {id:'fry',label:'揚げる',weight:38},
    {id:'burn',label:'焦げる',weight:23},
    {id:'throw',label:'投げる',weight:17},
    {id:'escape',label:'逃げる',weight:14},
    {id:'age',label:'アげる',weight:8}
  ];

  function accessoryOverride(id){
    return (window.KANI_DISH_PROJECT && window.KANI_DISH_PROJECT.overrides && window.KANI_DISH_PROJECT.overrides[id]) || '';
  }
  function getStage3SlotTarget(kind){
    const final=screen.querySelector('#final');
    const canvas=screen.querySelector('#stage3DishCanvas');
    const tpl=window.KaniGameDish?.preferredTemplate?.();
    const slot=(tpl?.slots&&tpl.slots[kind])||{};
    if(!final || !canvas || typeof slot.x!=='number' || typeof slot.y!=='number'){
      return kind==='glasses' ? {left:'53.6%',top:'44%'} : {left:'42.5%',top:'44.5%'};
    }
    const fr=final.getBoundingClientRect();
    const cr=canvas.getBoundingClientRect();
    const left=(cr.left-fr.left) + (slot.x/760)*cr.width;
    const top=(cr.top-fr.top) + (slot.y/760)*cr.height;
    return {left:`${left}px`, top:`${top}px`};
  }
  function stage3PreviewState(overrides={}){
    return {
      catch: state.catch,
      liquid: state.liquid,
      verb: overrides.verb || state.verb || {id:'fry',label:'揚げる'},
      finishScore: overrides.finishScore ?? state.finishScore ?? 82,
      finishLabel: overrides.finishLabel ?? state.finishLabel ?? 'できたて',
      freshness: state.freshness,
      amountScore: state.amountScore,
      special: overrides.special ?? state.special ?? null,
      art: state.art,
      notes: state.notes
    };
  }
  async function renderStage3Dish(canvas, overrides={}){
    const session=stage3Session;
    if(!canvas || !window.KaniGameDish) return;
    await stage3Await(window.KaniGameDish.render(canvas, stage3PreviewState(overrides)), session);
  }
  function setStage3Caption(text, sub=''){
    const c=screen.querySelector('#stage3Caption');
    if(c)c.innerHTML=sub?`<strong>${text}</strong><small>${sub}</small>`:`<strong>${text}</strong>`;
  }
  function catchVisualHtml(){
    return state.catch?.img ? `<img src="${state.catch.img}" alt="${state.catch.name}">` : `<span class="stage3-emoji">${state.catch?.icon||'🦀'}</span>`;
  }
  async function hideRoulette(){
    const session=stage3Session;
    const wrap=screen.querySelector('#rouletteWrap');
    if(!wrap || wrap.classList.contains('hidden')) return;
    wrap.classList.add('hiding');
    await stage3Await(stage3Animation(wrap,[
      {top:'16%',opacity:1,transform:'translateX(-50%) scale(1)'},
      {top:'7%',opacity:0,transform:'translateX(-50%) scale(.92)'}
    ],{duration:300,easing:'cubic-bezier(.22,.8,.25,1)',fill:'forwards'}), session);
    wrap.classList.remove('show','locked','hiding');
    wrap.classList.add('hidden');
    wrap.style.opacity='0';
    wrap.style.pointerEvents='none';
    wrap.style.top='7%';
  }
  function showRoulette(final){
    const wrap=final.querySelector('#rouletteWrap');
    const word=wrap.querySelector('#word');
    const btn=wrap.querySelector('#stop');
    let i=0, running=true, lastSwap=0;
    wrap.classList.add('show');
    setStage3Caption('調理法を決めろ！','ルーレットを止めよう');
    function spin(t){
      if(!running) return;
      if(t-lastSwap>190){ lastSwap=t; i=(i+1)%verbs.length; word.textContent=verbs[i].label; }
      raf=requestAnimationFrame(spin);
    }
    raf=requestAnimationFrame(spin);
    btn.onclick=async()=>{
      const session=stage3Session;
      try {
      if(!running) return;
      running=false; cancelAnimationFrame(raf);
      state.verb=verbs[i];
      word.textContent=verbs[i].label;
      word.classList.add('locked-word');
      shake(screen,'soft');
      btn.disabled=true;
      await stage3Await(wait(260), session);
      await stage3Await(hideRoulette(), session);
      await stage3Await(wait(80), session);
      await stage3Await(resolveStage3Verb(verbs[i]), session);
      } catch(err) { handleStage3Error(err); }
    };
  }

  function startStage3(){
    clearAsync(); state.stage=3; setStage('3 / 3　FINAL');
    screen.innerHTML=`<section class="final-stage stage3-cook" id="final"><div class="lights"></div><div class="audience"></div><div class="stage3-header"><h2>第3工程　クライマックス調理</h2><p>食材を鍋へ投入して、最後の運命を決めろ！</p></div><div class="stage3-scene"><div class="stage3-pot-wrap"><div class="stage3-pot-shadow"></div><div class="stage3-pot" id="pot"><div class="stage3-pot-rim"></div><div class="stage3-pot-body"></div><div class="stage3-pot-soup"></div><div class="stage3-bubble b1"></div><div class="stage3-bubble b2"></div><div class="stage3-bubble b3"></div><div class="stage3-bubble b4"></div><div class="stage3-handle left"></div><div class="stage3-handle right"></div></div></div><div class="stage3-drop ingredient" id="dropIngredient">${catchVisualHtml()}</div><div class="stage3-drop bowl" id="dropBowl"><div class="stage3-mini-bowl"><img src="assets/stage2/bowl.png" alt="ボウル"><div class="stage3-mini-fill" style="background:${state.liquid?.color||'#fff0ce'}"></div></div></div><div class="mirrorball" id="mirrorball"><div class="mirror-chain"></div><div class="mirror-core"></div><div class="mirror-glow"></div></div><div class="dj-beams" id="djBeams"></div><canvas id="stage3DishCanvas" class="stage3-dish-canvas" width="760" height="760" aria-label="完成料理プレビュー"></canvas><div class="stage3-overlay" id="stage3Overlay"></div><div class="focus-burst" id="focusBurst"><div class="focus-lines"></div><b>完成！！</b></div><div class="roulette-wrap" id="rouletteWrap"><div class="roulette-title">◯げるルーレット</div><div class="word-slot" id="word">揚げる</div><button class="stop-btn roulette-stop" id="stop">ここだ！</button></div></div><div class="stage3-caption" id="stage3Caption"><strong>素材投入！</strong><small>まずは鍋に放り込もう</small></div></section>`;
    updateCook('最終工程スタート！',`${state.catch?.name||'食材なし'} と ${state.liquid?.name||'液体なし'} を投入！`,'🍲');
    beginStage3Flow().catch(handleStage3Error);
  }

  async function beginStage3Flow(){
    const session=stage3Session;
    const final=screen.querySelector('#final');
    if(!final) return;
    const pot=final.querySelector('#pot');
    const dropIngredient=final.querySelector('#dropIngredient');
    const dropBowl=final.querySelector('#dropBowl');
    await stage3Await(wait(260), session);
    setStage3Caption(`${state.catch?.name||'食材'}投入！`,'上から鍋へダイブ！');
    dropIngredient.classList.add('show');
    await stage3Await(stage3Animation(dropIngredient,[
      {top:'-16%',transform:'translate(-50%,-50%) rotate(-10deg) scale(.7)',opacity:0},
      {top:'47%',transform:'translate(-50%,-50%) rotate(5deg) scale(1)',opacity:1,offset:.72},
      {top:'59%',transform:'translate(-50%,-50%) rotate(8deg) scale(.96)',opacity:1,offset:.94},
      {top:'65%',transform:'translate(-50%,-50%) rotate(10deg) scale(.88)',opacity:0,offset:1}
    ],{duration:980,easing:'ease-in'}), session);
    dropIngredient.remove();
    shake(pot,'soft');
    pot.classList.add('boiling');
    await stage3Await(wait(220), session);
    setStage3Caption('ボウルごと投入！','ためらいは不要だ！');
    dropBowl.classList.add('show');
    await stage3Await(stage3Animation(dropBowl,[
      {top:'-18%',transform:'translate(-50%,-50%) rotate(-5deg) scale(.8)',opacity:0},
      {top:'46%',transform:'translate(-50%,-50%) rotate(3deg) scale(1)',opacity:1,offset:.7},
      {top:'59%',transform:'translate(-50%,-50%) rotate(6deg) scale(.96)',opacity:1,offset:.94},
      {top:'66%',transform:'translate(-50%,-50%) rotate(9deg) scale(.9)',opacity:0,offset:1}
    ],{duration:1060,easing:'ease-in'}), session);
    dropBowl.remove();
    shake(pot,'hard');
    pot.classList.add('crazy');
    await stage3Await(wait(420), session);
    showRoulette(final);
  }

  async function flashVerbBanner(v){
    const session=stage3Session;
    const final=screen.querySelector('#final');
    const banner=document.createElement('div');
    banner.className='event-banner verb-'+v.id;
    banner.textContent=v.label+'！';
    final.appendChild(banner);
    await stage3Await(wait(760), session);
    banner.remove();
  }

  async function launchAndLandDish(preview={}){
    const session=stage3Session;
    const canvas=screen.querySelector('#stage3DishCanvas');
    if(!canvas) return null;
    await stage3Await(renderStage3Dish(canvas, preview), session);
    canvas.classList.add('show');
    canvas.style.left='52%';
    canvas.style.top='72%';
    canvas.style.transform='translate(-50%,-50%) scale(.42)';
    setStage3Caption('完成品、発射！','鍋から飛び出した！');
    const anim=stage3Animation(canvas,[
      {left:'52%',top:'72%',transform:'translate(-50%,-50%) scale(.42)',opacity:0},
      {left:'53%',top:'61%',transform:'translate(-50%,-50%) scale(.52)',opacity:1,offset:.18},
      {left:'54%',top:'-20%',transform:'translate(-50%,-50%) scale(.54)',opacity:1,offset:.55},
      {left:'54%',top:'47%',transform:'translate(-50%,-50%) scale(1)',opacity:1}
    ],{duration:1220,easing:'cubic-bezier(.18,.82,.23,1)'});
    await stage3Await(anim, session);
    canvas.style.left='54%';
    canvas.style.top='47%';
    canvas.style.transform='translate(-50%,-50%) scale(1)';
    shake(screen,'soft');
    return canvas;
  }

  async function showFocusThenResult(text='完成！！'){
    const session=stage3Session;
    const focus=screen.querySelector('#focusBurst');
    if(focus){
      focus.querySelector('b').textContent=text;
      focus.classList.add('show');
    }
    await stage3Await(wait(980), session);
    if(focus) focus.classList.remove('show');
    await stage3Await(wait(240), session);
    finishGame();
  }

  async function dropAccessory(kind){
    const session=stage3Session;
    const overlay=screen.querySelector('#stage3Overlay');
    const src=accessoryOverride(kind);
    if(!overlay || !src) return null;
    const img=document.createElement('img');
    img.className='fall-asset '+kind;
    img.src=src;
    overlay.appendChild(img);
    const target = getStage3SlotTarget(kind);
    // エディターで保存された左右反転・回転を、装着前の落下素材にもそのまま適用。
    const tpl=window.KaniGameDish?.preferredTemplate?.();
    const slot=(tpl?.slots&&tpl.slots[kind])||{};
    const sx=slot.flipX?-1:1;
    const rot=Number(slot.rotation||0);
    const tf=(scale,extraRot=0)=>`translate(-50%,-50%) scale(${sx*scale},${scale}) rotate(${rot+extraRot}deg)`;
    await stage3Await(stage3Animation(img,[
      {left:'55%',top:'-18%',transform:tf(.72,-10),opacity:0},
      {left:target.left,top:target.top,transform:tf(1,0),opacity:1}
    ],{duration:620,easing:'cubic-bezier(.22,.8,.25,1)'}), session);
    img.style.left=target.left; img.style.top=target.top; img.style.opacity='1'; img.style.transform=tf(1,0);
    return img;
  }

  async function deployMirrorBall(){
    const session=stage3Session;
    const ball=screen.querySelector('#mirrorball');
    const beams=screen.querySelector('#djBeams');
    if(!ball || !beams) return;
    ball.classList.add('show');
    await stage3Await(stage3Animation(ball,[
      {top:'-24%',opacity:0,transform:'translateX(-50%) scale(.7)'},
      {top:'14%',opacity:1,transform:'translateX(-50%) scale(1)'}
    ],{duration:760,easing:'cubic-bezier(.22,.8,.25,1)',fill:'forwards'}), session);
    ball.classList.add('active');
    beams.classList.add('active');
    const final=screen.querySelector('#final');
    if(final) final.classList.add('dj-mode');
  }

  function clearDJMode(){
    const final=screen.querySelector('#final');
    const ball=screen.querySelector('#mirrorball');
    const beams=screen.querySelector('#djBeams');
    if(final) final.classList.remove('dj-mode');
    if(ball) ball.classList.remove('active');
    if(beams) beams.classList.remove('active');
  }

  function runTrackSkill(v){
    return new Promise(resolve=>{
      const final=screen.querySelector('#final');
      const panel=document.createElement('div'); panel.className='skill-panel stage3-skill';
      const titles={fry:'カリカリ度を決めろ！',burn:'一瞬の完璧な火入れを見切れ！',throw:'投げる強さを決めろ！'};
      panel.innerHTML=`<div class="skill-title">${titles[v.id]}</div><div class="skill-track"><div class="great-zone"></div><div class="perfect-zone"></div><div class="needle" id="needle"></div></div><button class="skill-btn">STOP</button>`;
      final.appendChild(panel);
      setStage3Caption(titles[v.id], v.id==='throw'?'ちょうど良い強さでぶん投げよう':'ベストタイミングを見極めろ');
      const needle=panel.querySelector('#needle'), stop=panel.querySelector('button');
      let pos=0, dir=1, last=performance.now(), done=false;
      const speed=v.id==='burn'?2.9:v.id==='throw'?.78:.95;
      function finish(score,label){
        state.finishScore=score; state.finishLabel=label;
        needle.style.left=(pos*100)+'%';
        if(score>=90){ panel.classList.add('skill-perfect'); burstFx(final,final.clientWidth/2,final.clientHeight*.49,'PERFECT!','good'); }
        else if(score<35){ shake(final,'hard'); }
        if(v.id==='burn' && label==='奇跡の火入れ') state.art+=180;
        if(v.id==='throw') state.art+=Math.round(score*.8);
        toast(`${label} ${score}`);
        later(()=>{ panel.remove(); resolve({score,label}); }, 420);
      }
      function loop(now){
        if(done) return;
        const dt=(now-last)/1000; last=now; pos+=dir*speed*dt;
        if(v.id==='burn'){
          if(pos>1.12){ done=true; state.art+=20; needle.style.left='110%'; return finish(0,'黒焦げ'); }
        }else{
          if(pos>=1){ pos=1; dir=-1; } else if(pos<=0){ pos=0; dir=1; }
        }
        needle.style.left=(pos*100)+'%';
        raf=requestAnimationFrame(loop);
      }
      stop.onclick=()=>{
        if(done) return;
        done=true; cancelAnimationFrame(raf);
        const dist=Math.abs(pos-.5);
        let score=Math.round(clamp(100-dist*230,0,100));
        let label='';
        if(v.id==='burn'){
          if(dist>.085){ score=Math.round(clamp(45-dist*160,0,45)); label='黒焦げ'; }
          else label='奇跡の火入れ';
        }else if(v.id==='fry'){
          label=score>=95?'究極カリカリ':score>=75?'サクサク':score>=45?'普通':'しなしな';
        }else if(v.id==='throw'){
          label=score>=92?'顔面ど真ん中':score>=65?'命中':score>=30?'かすった':'場外';
        }
        finish(score,label);
      };
      raf=requestAnimationFrame(loop);
    });
  }

  function runDJSkill(canvas){
    return new Promise(resolve=>{
      const final=screen.querySelector('#final');
      final.classList.add('dj-qte-active');
      const panel=document.createElement('div'); panel.className='dj-qte-panel';
      panel.innerHTML=`<div class="dj-qte-title">フロアをアげろ！</div><div class="dj-qte-sub">大きなボタンを連打して、盛り上がりゲージを満タンにしよう！</div><div class="dj-hype-wrap"><div class="dj-hype-label">盛り上がり</div><div class="dj-hype-bar"><div class="dj-hype-fill" id="djFill"></div><div class="dj-hype-spark"></div></div></div><div class="dj-status" id="djStatus">まだまだこれから！</div><button class="stop-btn dj-hit" id="djTap">TAP! TAP! TAP!</button><div class="dj-crowd" id="djCrowd"><span>🦀</span><span>✨</span><span>🎶</span></div>`;
      final.appendChild(panel);
      const btn=panel.querySelector('#djTap'), fill=panel.querySelector('#djFill'), status=panel.querySelector('#djStatus'), crowd=panel.querySelector('#djCrowd');
      const goal=30;
      let taps=0, last=performance.now(), time=4.8;
      const update=()=>{
        const ratio=clamp(taps/goal,0,1);
        fill.style.width=(ratio*100)+'%';
        panel.classList.toggle('dj-hot', ratio>.72);
        if(ratio>=1) status.textContent='フロア沸騰寸前！';
        else if(ratio>.72) status.textContent='かなりアがってる！';
        else if(ratio>.42) status.textContent='いい感じにノってきた！';
        else if(ratio>.18) status.textContent='その調子！';
        else status.textContent='まだまだこれから！';
      };
      btn.onclick=()=>{
        taps++;
        update();
        btn.classList.remove('hit'); void btn.offsetWidth; btn.classList.add('hit');
        crowd.classList.remove('pulse'); void crowd.offsetWidth; crowd.classList.add('pulse');
        if(taps%5===0) burstFx(final, final.clientWidth/2, final.clientHeight*.30, taps>=goal?'MAX!':'YEAH!', 'good');
      };
      setStage3Caption('DJタイム突入！','大きなボタンを連打して会場をアげよう');
      update();
      function loop(now){
        const dt=(now-last)/1000; last=now; time-=dt;
        if(time<=0){
          const ratio=clamp(taps/goal,0,1);
          state.finishScore=Math.round(45 + ratio*55);
          state.finishLabel=ratio>=.95?'フロア沸騰':ratio>=.68?'大盛況':ratio>=.4?'いい感じ':'ウォームアップ中';
          state.art+=220+Math.round(ratio*420);
          state.special='dj';
          panel.remove();
          final.classList.remove('dj-qte-active');
          renderStage3Dish(canvas,{verb:state.verb,special:'dj',finishScore:state.finishScore,finishLabel:state.finishLabel}).catch(handleStage3Error);
          return resolve({taps,ratio});
        }
        raf=requestAnimationFrame(loop);
      }
      raf=requestAnimationFrame(loop);
    });
  }

  async function resolveStage3Verb(v){
    const session=stage3Session;
    const final=screen.querySelector('#final');
    const canvas=screen.querySelector('#stage3DishCanvas');
    const wrap=screen.querySelector('#rouletteWrap');
    wrap.classList.add('locked');
    await stage3Await(flashVerbBanner(v), session);
    if(v.id==='fry' || v.id==='burn'){
      await stage3Await(runTrackSkill(v), session);
      await stage3Await(wait(180), session);
      await stage3Await(launchAndLandDish({verb:state.verb,finishScore:state.finishScore,finishLabel:state.finishLabel,special:null}), session);
      await stage3Await(showFocusThenResult(v.id==='burn'?'こんがり完成！！':'完成！！'), session);
      return;
    }
    if(v.id==='escape'){
      state.finishScore=0; state.finishLabel='逃走'; state.art+=120; state.special='escaped';
      await stage3Await(launchAndLandDish({verb:{id:'fry',label:'揚げる'},finishScore:72,finishLabel:'揚がった',special:null}), session);
      setStage3Caption('あれ…？','集中線が出ない……');
      await stage3Await(wait(300), session);
      setStage3Caption('足が生えた！','料理が逃げ出す！');
      await stage3Await(renderStage3Dish(canvas,{verb:state.verb,finishScore:state.finishScore,finishLabel:state.finishLabel,special:'escaped'}), session);
      await stage3Await(wait(120), session);
      await stage3Await(stage3Animation(canvas,[
        {left:'54%',top:'47%',transform:'translate(-50%,-50%) scale(1) rotate(0deg)',opacity:1},
        {left:'-14%',top:'37%',transform:'translate(-50%,-50%) scale(.95) rotate(-5deg)',opacity:1}
      ],{duration:980,easing:'linear'}), session);
      canvas.style.left='-14%'; canvas.style.top='37%'; canvas.style.transform='translate(-50%,-50%) scale(.95) rotate(-5deg)'; canvas.style.opacity='1';
      const cap1=screen.querySelector('#stage3Caption'); if(cap1) cap1.style.opacity='0';
      await stage3Await(wait(620), session);
      finishGame();
      return;
    }
    if(v.id==='throw'){
      await stage3Await(launchAndLandDish({verb:{id:'fry',label:'揚げる'},finishScore:70,finishLabel:'揚がった',special:null}), session);
      setStage3Caption('まだ終わらない！','ここから投擲だ！');
      await stage3Await(wait(250), session);
      await stage3Await(runTrackSkill(v), session);
      setStage3Caption('それっ！','もう一度上へ飛んでいく！');
      await stage3Await(stage3Animation(canvas,[
        {left:'54%',top:'47%',transform:'translate(-50%,-50%) scale(1) rotate(0deg)',opacity:1},
        {left:'66%',top:'29%',transform:'translate(-50%,-50%) scale(.95) rotate(-10deg)',opacity:1,offset:.25},
        {left:'78%',top:'-22%',transform:'translate(-50%,-50%) scale(.7) rotate(-26deg)',opacity:0}
      ],{duration:720,easing:'cubic-bezier(.22,.8,.25,1)'}), session);
      canvas.style.left='78%'; canvas.style.top='-22%'; canvas.style.transform='translate(-50%,-50%) scale(.7) rotate(-26deg)'; canvas.style.opacity='0';
      const cap2=screen.querySelector('#stage3Caption'); if(cap2) cap2.style.opacity='0';
      await stage3Await(wait(620), session);
      finishGame();
      return;
    }
    if(v.id==='age'){
      await stage3Await(launchAndLandDish({verb:{id:'fry',label:'揚げる'},finishScore:80,finishLabel:'揚がった',special:null}), session);
      setStage3Caption('まだ完成ではない…！','何かが降ってくる！');
      await stage3Await(wait(220), session);
      const g=await stage3Await(dropAccessory('glasses'), session);
      await stage3Await(wait(120), session);
      const h=await stage3Await(dropAccessory('headphones'), session);
      await stage3Await(wait(120), session);
      await stage3Await(deployMirrorBall(), session);
      await stage3Await(wait(160), session);
      state.special='dj';
      if(g) g.remove(); if(h) h.remove();
      await stage3Await(renderStage3Dish(canvas,{verb:state.verb,special:'dj',finishScore:82,finishLabel:'フロア準備OK'}), session);
      await stage3Await(runDJSkill(canvas), session);
      clearDJMode();
      await stage3Await(showFocusThenResult('アがった！！'), session);
    }
  }

  function calcCompletion(){
    return Math.round((state.freshness+state.amountScore+state.finishScore)/3);
  }
  function completionMultiplier(c){return +(0.45+(c/100)*1.25).toFixed(2)}
  function dishName(){
    const a=state.catch?.name||'食材なし', b=state.liquid?.name||'液体なし', v=state.verb?.id;
    if(state.special==='dj')return `${a}${b}DJ`;
    if(v==='escape')return `逃走した${a}${b}`;
    if(v==='throw')return `投げられた${a}${b}`;
    if(v==='burn')return `${state.finishLabel==='奇跡の火入れ'?'奇跡の':'焦げ'}${a}${b}コロッケ`;
    if(v==='fry')return `${a}${b}コロッケ`;
    return `${a}${b}料理`;
  }
  function dishIcon(){if(state.special==='dj')return '😎🎛️';if(state.special==='escaped')return '🟤💨';if(state.verb?.id==='throw')return '💥🟤';if(state.verb?.id==='burn')return '⚫';return '🟤'}
  function dishArtSrc(){
    if(state.special==='dj') return 'assets/dish/dj.png';
    if(state.catch?.id==='crab' && state.liquid?.id==='cream' && state.verb?.id==='fry') return state.freshness>=95&&state.amountScore>=95&&state.finishScore>=95?'assets/dish/perfect.png':'assets/dish/true.png';
    return state.verb?.id==='burn'?'assets/dish/true.png':'assets/dish/true.png';
  }
  function recipeFinishId(gs=state){
    const v=gs.verb?.id;
    if(v==='burn') return gs.finishLabel==='奇跡の火入れ' ? 'miracle_burn' : 'burn';
    if(v==='age') return 'age';
    if(v==='escape') return 'escape';
    if(v==='throw') return 'throw';
    return 'fry';
  }
  function recipeKeyFor(gs=state){
    const a=gs.catch?.id, b=gs.liquid?.id;
    if(!a || a==='none' || !b) return null;
    return `${a}__${b}__${recipeFinishId(gs)}`;
  }
  function recipeDefFor(gs=state){
    const key=recipeKeyFor(gs);
    return key ? recipeComments[key] : null;
  }
  function recipeBookName(gs=state){
    return recipeDefFor(gs)?.name || dishName();
  }
  function recipeBookComment(gs=state){
    return recipeDefFor(gs)?.comment || resultComment(calcCompletion(),dishName());
  }
  const RECIPE_IDS=Object.keys(recipeComments);
  const RECIPE_NUMBER=new Map(RECIPE_IDS.map((key,i)=>[key,i+1]));
  let bookSort='discovery';
  function migrateBook(){
    if(!Array.isArray(book)){ book=[]; return; }
    const merged=new Map();
    for(const x of book){
      if(!x) continue;
      let key=x.recipeKey;
      if(!key && x.catchId && x.liquidId){
        const oldState=gameStateFromBookEntry(x);
        key=recipeKeyFor(oldState);
      }
      // Old saves shared the same fry ID with burnt results. Separate when metadata proves burn.
      if(key?.endsWith('__fry') && (x.verbId==='burn' || x.verbLabel==='焦げる' || x.finishLabel==='黒焦げ' || x.finishLabel==='真っ黒焦げ' || x.finishLabel==='香ばしい焦げ')){
        key=key.replace(/__fry$/,'__burn');
      }
      if(!key || !recipeComments[key]) continue;
      const prev=merged.get(key);
      const score=Number(x.bestScore ?? x.totalScore ?? 0);
      const normalized={
        ...x,
        recipeKey:key,
        ...(key.endsWith('__burn')?{verbId:'burn',verbLabel:'焦げる',finishLabel:'黒焦げ'}:{}),
        name:recipeComments[key]?.name || x.name || key,
        comment:recipeComments[key]?.comment || x.comment || '',
        bestScore:score,
        cookCount:Number(x.cookCount||1),
        firstDate:x.firstDate||x.date||new Date().toLocaleDateString('ja-JP'),
        lastDate:x.lastDate||x.date||new Date().toLocaleDateString('ja-JP')
      };
      if(!prev) merged.set(key,normalized);
      else{
        prev.cookCount += normalized.cookCount;
        if(normalized.bestScore>prev.bestScore) Object.assign(prev,normalized,{cookCount:prev.cookCount,firstDate:prev.firstDate});
      }
    }
    book=[...merged.values()];
  }
  migrateBook();

  function registerRecipe(total){
    const key=recipeKeyFor(state);
    if(!key || !recipeComments[key]) return {isNew:false,isRecord:false,entry:null};
    const now=new Date().toLocaleDateString('ja-JP');
    const idx=book.findIndex(x=>x.recipeKey===key);
    const snapshot={
      recipeKey:key,
      name:recipeComments[key].name,
      comment:recipeComments[key].comment,
      icon:dishIcon(),
      firstDate:now,
      lastDate:now,
      cookCount:1,
      bestScore:total,
      special:state.special||state.verb?.id,
      catch:state.catch?.name,
      liquid:state.liquid?.name,
      catchId:state.catch?.id||null,
      liquidId:state.liquid?.id||null,
      verbId:state.verb?.id||null,
      verbLabel:state.verb?.label||'',
      finishScore:state.finishScore||0,
      finishLabel:state.finishLabel||'—',
      freshness:state.freshness||0,
      amountScore:state.amountScore||0,
      art:state.art||0
    };
    if(idx<0){
      book.unshift(snapshot);
      writeStorage(storageKey,book);
      return {isNew:true,isRecord:true,entry:snapshot};
    }
    const entry=book[idx];
    entry.cookCount=Number(entry.cookCount||1)+1;
    entry.lastDate=now;
    const isRecord=total>Number(entry.bestScore||0);
    if(isRecord){
      const firstDate=entry.firstDate||now, count=entry.cookCount;
      Object.assign(entry,snapshot,{firstDate,cookCount:count,lastDate:now});
    }
    writeStorage(storageKey,book);
    return {isNew:false,isRecord,entry};
  }

  function finishGame(){
    clearAsync();setStage('RESULT');
    const c=calcCompletion(),mult=completionMultiplier(c),ingredientBase=(state.catch?.base||25)+(state.liquid?.id==='cream'?100:state.liquid?.id==='mystery_mix'?35:55);
    const base=Math.round(ingredientBase*10), total=Math.round(base*mult+state.art*10),name=dishName();
    const reg=registerRecipe(total);
    const cls=state.verb?.id==='burn'?'burnt':state.verb?.id==='throw'?'thrown':state.special==='escaped'?'escaped':'';
    const comment=recipeDefFor(state)?.judgeComment || resultComment(c,name);
    const recordBadge=reg.isNew?'NEW RECIPE!':reg.isRecord?'NEW RECORD!':'';
    screen.innerHTML=`<section class="result-screen"><div class="result-card"><div class="result-heading">本日の作品</div><div class="dish-art ${cls}"><canvas id="resultDishCanvas" width="760" height="760" aria-label="${escapeHtml(name)}"></canvas></div><div class="dish-name">『${escapeHtml(name)}』</div><div class="total-score"><span>総合点</span><b>${total.toLocaleString()}</b><em>pt</em>${recordBadge?`<i>${recordBadge}</i>`:''}</div><div class="scores result-breakdown"><div class="score-box"><span>新鮮さ</span><b>${state.freshness}</b></div><div class="score-box"><span>分量</span><b>${state.amountScore}</b></div><div class="score-box"><span>${state.verb?.id==='throw'?'投擲':state.verb?.id==='age'?'盛り上がり':'仕上げ'}</span><b>${state.finishScore}</b></div><div class="score-box"><span>完成度倍率</span><b>×${mult}</b></div><div class="score-box wide"><span>芸術点</span><b>${state.art}</b></div></div><div class="comment">審査員「${escapeHtml(comment)}」</div>${reg.isNew?`<div class="result-discovery">📖 新しいレシピが図鑑に登録された！</div>`:''}<div class="action-row"><button class="again">もう一皿</button><button class="menu">メニュー</button></div></div></section>`;
    const dishCanvas=screen.querySelector('#resultDishCanvas');
    if(window.KaniGameDish && dishCanvas){
      window.KaniGameDish.render(dishCanvas,state).catch(err=>{
        console.warn('完成料理Canvasの描画に失敗しました',err);
        const fallback=document.createElement('img');fallback.src=dishArtSrc();fallback.alt=name;dishCanvas.replaceWith(fallback);
      });
    }
    screen.querySelector('.again').onclick=startGame;screen.querySelector('.menu').onclick=showMenu;
  }
  function resultComment(c,name){
    if(state.special==='dj')return '料理の評価をするつもりでしたが、気づいたら踊っていました。';
    if(state.special==='escaped')return '……料理はどこですか？';
    if(state.verb?.id==='throw')return state.finishScore>80?'非常に正確な投擲でした。二度としないでください。':'料理審査で投球フォームを見るとは思いませんでした。';
    if(state.verb?.id==='burn'&&state.finishScore>80)return '焦がすと宣言して、この火入れ。認めざるを得ません。';
    if(name==='カニクリームコロッケ')return '……普通においしい。逆に驚きました。';
    if(c>85)return '素材には疑問がありますが、技術だけは一流です。';
    if(c>60)return '形にはなっています。何の形かは聞かないでください。';
    return '既存の料理観に対する強い挑戦を感じます。';
  }

  function gameStateFromBookEntry(x){
    return {
      catch: x.catchId ? {id:x.catchId,name:x.catch||''} : null,
      liquid: x.liquidId ? {id:x.liquidId,name:x.liquid||''} : null,
      verb: x.verbId ? {id:x.verbId,label:x.verbLabel||''} : null,
      finishScore: x.finishScore||0,
      finishLabel: x.finishLabel||'—',
      freshness: x.freshness||0,
      amountScore: x.amountScore||0,
      art: x.art||0,
      notes: [],
      special: x.special==='escape' ? 'escaped' : (x.special==='age' ? 'dj' : (x.special||null))
    };
  }

  function renderBookDishCards(){
    if(!window.KaniGameDish) return;
    const canvases=[...screen.querySelectorAll('[data-book-canvas]')];
    const byKey=new Map(book.map(entry=>[entry.recipeKey,entry]));
    const queue=[];
    const queued=new Set();
    let cancelled=false, busy=false;
    const buffer=document.createElement('canvas');
    buffer.width=760; buffer.height=760;
    let observer=null;
    const enqueue=canvas=>{
      if(cancelled || !canvas.isConnected || queued.has(canvas)) return;
      queued.add(canvas);
      queue.push(canvas);
      processQueue();
    };
    async function processQueue(){
      if(busy || cancelled)return;
      busy=true;
      try{
        while(queue.length && !cancelled){
          const canvas=queue.shift();
          if(!canvas.isConnected)continue;
          const entry=byKey.get(canvas.dataset.bookCanvas);
          if(!entry)continue;
          try{
            await window.KaniGameDish.render(buffer,gameStateFromBookEntry(entry));
            if(cancelled || !canvas.isConnected)break;
            const ctx=canvas.getContext('2d');
            if(ctx){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(buffer,0,0,canvas.width,canvas.height);}
          }catch(err){
            if(cancelled)break;
            console.warn('図鑑料理Canvasの描画に失敗しました',err);
            const wrap=canvas.closest('.book-thumb');
            if(wrap)wrap.textContent=entry.icon||'🍽️';
          }
          // Yield so taps and navigation can be handled between thumbnails.
          await new Promise(resolve=>setTimeout(resolve,0));
        }
      } finally {busy=false;}
    }
    if('IntersectionObserver' in window){
      observer=new IntersectionObserver(entries=>{
        for(const entry of entries){
          if(entry.isIntersecting){observer.unobserve(entry.target);enqueue(entry.target);}
        }
      },{rootMargin:'280px 0px'});
      canvases.forEach(canvas=>observer.observe(canvas));
    }else{
      canvases.forEach(enqueue);
    }
    bookRenderCleanup=()=>{
      cancelled=true;
      observer?.disconnect();
      queue.length=0;
      // Do not clear the shared buffer while a render is still in flight.
    };
  }

  function showBook(){
    clearAsync();setStage('図鑑');
    const sortedBook=[...book];
    if(bookSort==='number') sortedBook.sort((a,b)=>(RECIPE_NUMBER.get(a.recipeKey)||9999)-(RECIPE_NUMBER.get(b.recipeKey)||9999));
    // book is unshifted on discovery, so the array is newest-first.
    const items=sortedBook.map(x=>`<button class="book-item" data-recipe-key="${escapeHtml(x.recipeKey)}"><div class="book-thumb"><canvas data-book-canvas="${escapeHtml(x.recipeKey)}" width="160" height="160" aria-label="${escapeHtml(recipeComments[x.recipeKey]?.name||x.name)}"></canvas></div><small class="book-number">No.${String(RECIPE_NUMBER.get(x.recipeKey)||0).padStart(3,'0')}</small><b>${escapeHtml(recipeComments[x.recipeKey]?.name||x.name)}</b><small>最高 ${Number(x.bestScore||0).toLocaleString()} pt</small></button>`).join('');
    screen.innerHTML=`<section class="book-screen"><div class="book-card"><button class="book-top-back" type="button">← メニューへ戻る</button><div class="book-head"><div><h2>レシピ図鑑</h2><p>発見した料理だけがここに残る。</p></div><div class="book-progress"><b>${book.length}</b><span>/ ${TOTAL_RECIPES}</span><small>発見</small></div></div><div class="book-tools"><label for="bookSort">並び順</label><select id="bookSort"><option value="discovery" ${bookSort==='discovery'?'selected':''}>発見順（新しい順）</option><option value="number" ${bookSort==='number'?'selected':''}>図鑑番号順</option></select></div>${items?`<div class="book-grid">${items}</div>`:'<div class="empty-note">まだ一皿も登録されていません。まずは何か作ってみよう。</div>'}</div></section>`;
    screen.querySelector('.book-top-back').onclick=showMenu;
    screen.querySelector('#bookSort').onchange=e=>{bookSort=e.target.value;showBook();};
    screen.querySelectorAll('[data-recipe-key]').forEach(btn=>btn.onclick=()=>showBookDetail(btn.dataset.recipeKey));
    renderBookDishCards();
  }

  function showBookDetail(key){
    const entry=book.find(x=>x.recipeKey===key);
    if(!entry) return showBook();
    clearAsync();setStage('図鑑 / 詳細');
    screen.innerHTML=`<section class="book-screen"><div class="book-card detail-card"><button class="detail-back">← 図鑑へ戻る</button><div class="detail-dish"><canvas id="bookDetailCanvas" width="760" height="760" aria-label="${escapeHtml(recipeComments[key]?.name||entry.name)}"></canvas></div><small class="detail-number">No.${String(RECIPE_NUMBER.get(key)||0).padStart(3,'0')}</small><h2 class="detail-name">${escapeHtml(recipeComments[key]?.name||entry.name)}</h2><div class="detail-best"><span>最高得点</span><b>${Number(entry.bestScore||0).toLocaleString()}</b><em>pt</em></div><div class="detail-stats"><div><span>材料</span><b>${escapeHtml(entry.catch||'—')} × ${escapeHtml(entry.liquid||'—')}</b></div><div><span>初回発見</span><b>${escapeHtml(entry.firstDate||'—')}</b></div><div><span>作った回数</span><b>${Number(entry.cookCount||1)}回</b></div></div><div class="book-comment"><small>図鑑説明</small><p>${escapeHtml(recipeComments[key]?.comment||entry.comment||'')}</p></div><div class="book-judge-comment"><small>審査員のコメント</small><p>${escapeHtml(recipeComments[key]?.judgeComment||'')}</p></div></div></section>`;
    screen.querySelector('.detail-back').onclick=showBook;
    const canvas=screen.querySelector('#bookDetailCanvas');
    if(window.KaniGameDish && canvas) window.KaniGameDish.render(canvas,gameStateFromBookEntry(entry)).catch(()=>{});
  }
  function showSettings(){
    clearAsync();setStage('設定');screen.innerHTML=`<section class="settings-screen"><div class="settings-card"><h2>設定</h2><label>効果音（プロトタイプでは未接続）</label><input id="sfx" type="range" min="0" max="100" value="${settings.sfx}"><label><input id="rm" type="checkbox" ${settings.reducedMotion?'checked':''}> 演出を控えめにする</label><button class="back-btn">保存して戻る</button></div></section>`;
    screen.querySelector('.back-btn').onclick=()=>{settings.sfx=+screen.querySelector('#sfx').value;settings.reducedMotion=screen.querySelector('#rm').checked;writeStorage(settingsKey,settings);showMenu()};
  }
  function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

  showMenu();
})();
