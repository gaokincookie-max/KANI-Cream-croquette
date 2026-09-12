(() => {
  'use strict';
  const screen = document.getElementById('screen');
  const stageChip = document.getElementById('stageChip');
  const menuTpl = document.getElementById('menuTpl');
  const hudTpl = document.getElementById('hudTpl');

  const storageKey = 'kaniCreamKorokkeProtoBook';
  const settingsKey = 'kaniCreamKorokkeProtoSettings';
  let book = JSON.parse(localStorage.getItem(storageKey) || '[]');
  let settings = Object.assign({sfx:70, reducedMotion:false}, JSON.parse(localStorage.getItem(settingsKey) || '{}'));

  const state = resetState();
  let timers = [];
  let raf = 0;

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
  function clearAsync(){ timers.forEach(clearTimeout); timers=[]; cancelAnimationFrame(raf); }
  function later(fn,ms){ const id=setTimeout(fn,ms);timers.push(id);return id; }
  function setStage(label){ stageChip.textContent=label; }
  function clone(tpl){ return tpl.content.cloneNode(true); }
  function r(min,max){ return min+Math.random()*(max-min); }
  function ri(min,max){ return Math.floor(r(min,max+1)); }
  function choice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function toast(text){ const el=document.createElement('div');el.className='toast';el.textContent=text;screen.appendChild(el);later(()=>el.remove(),1000); }
  function pctScore(value,target,tolerance){ const err=Math.abs(value-target); return Math.round(clamp(100-(err/tolerance)*100,0,100)); }

  function showMenu(){
    clearAsync(); setStage('MENU'); screen.innerHTML=''; screen.appendChild(clone(menuTpl));
    screen.querySelector('[data-action="start"]').onclick=startGame;
    screen.querySelector('[data-action="book"]').onclick=showBook;
    screen.querySelector('[data-action="settings"]').onclick=showSettings;
  }

  function startGame(){
    clearAsync(); Object.assign(state, resetState()); showTransition('第1工程','岩陰を見切れ！',()=>startStage1(),900);
  }

  function mountHud(){ screen.innerHTML=''; screen.appendChild(clone(hudTpl)); return screen.querySelector('#playArea'); }
  function updateCook(line,ingredient,icon='🍽️'){
    const a=screen.querySelector('#cookLine'), b=screen.querySelector('#ingredientLine'), c=screen.querySelector('#miniDish');
    if(a)a.textContent=line;if(b)b.textContent=ingredient;if(c)c.textContent=icon;
  }

  function showTransition(title,subtitle,next,delay=1500){
    clearAsync(); setStage('MOVE'); screen.innerHTML=`<section class="transition"><h2>${title}<br><small>${subtitle}</small></h2><div class="moving-cook">👨‍🍳🛒</div><div class="road"></div></section>`;
    later(next,delay);
  }

  // ---------- STAGE 1 ----------
  const stage1Items = [
    {id:'crab',name:'カニ',icon:'🦀',good:true,base:100,weight:28},
    {id:'hairy',name:'毛ガニ',icon:'🦀',good:true,base:125,weight:10,speed:1.18},
    {id:'king',name:'タラバガニ',icon:'🦀',good:true,base:145,weight:7,speed:1.32},
    {id:'small',name:'小さいカニ',icon:'🦀',good:true,base:80,weight:7,speed:.9},
    {id:'kanikama',name:'カニカマ',icon:'🍥',good:false,base:45,weight:14},
    {id:'kombu',name:'昆布',icon:'🌿',good:false,base:35,weight:9},
    {id:'boot',name:'長靴',icon:'🥾',good:false,base:15,weight:6},
    {id:'star',name:'ヒトデ',icon:'⭐',good:false,base:30,weight:6},
    {id:'glove',name:'赤い手袋',icon:'🧤',good:false,base:25,weight:5},
    {id:'can',name:'空き缶',icon:'🥫',good:false,base:10,weight:4},
    {id:'mystery',name:'何か',icon:'❓',good:false,base:20,weight:4}
  ];
  function weightedItem(){
    const total=stage1Items.reduce((s,x)=>s+x.weight,0); let n=Math.random()*total;
    for(const x of stage1Items){ n-=x.weight;if(n<=0)return x; } return stage1Items[0];
  }

  function startStage1(){
    clearAsync(); state.stage=1;setStage('1 / 3　カニ');
    const area=mountHud(); area.classList.add('sea');
    area.innerHTML=`<div class="stage-title">第1工程　1匹だけ獲れ！</div><div class="score-pill">候補 <b id="seenCount">0 / 8</b></div><div class="rock left"></div><div class="rock right"></div><div id="spear" class="spear"></div><div class="hint">画面をタップして銛！　空振りすると回収中に次を逃します。</div>`;
    updateCook('獲物待ち…','獲得食材：まだなし','🧺');
    let current=null, cooldown=false, seen=0, startHit=0, phase='waiting', fromLeft=true;
    const spear=area.querySelector('#spear');

    function scheduleNext(){
      if(state.catch)return;
      if(seen>=8){
        state.catch={id:'none',name:'食材なし',icon:'💨',good:false,base:0};state.freshness=0;state.notes.push('8体すべて見送り');
        toast('食材なし！');return later(()=>showTransition('第2工程','厨房へ急げ！',startStage2),1100);
      }
      phase='waiting'; current=null;
      later(()=>spawn(), r(500,1050));
    }
    function spawn(){
      if(state.catch)return;
      seen++; area.querySelector('#seenCount').textContent=`${seen} / 8`;
      const item=weightedItem(); fromLeft=Math.random()<.5;
      const fake=Math.random()<.22; // feint: shadow peeks then retreats
      const target=document.createElement('div');target.className='target shadowy';target.textContent=item.icon;
      target.style.left=fromLeft?'-4%':'84%'; area.appendChild(target); phase='tease';
      const teaseX=fromLeft?'17%':'69%'; target.animate([{left:target.style.left},{left:teaseX}],{duration:220,fill:'forwards',easing:'ease-out'});
      later(()=>{
        if(fake && Math.random()<.65){
          target.animate([{left:teaseX},{left:fromLeft?'-8%':'88%'}],{duration:170,fill:'forwards'});
          later(()=>{target.remove();phase='waiting'; if(!cooldown)scheduleNext(); else later(scheduleNext,300);},190);
          return;
        }
        target.classList.remove('shadowy'); phase='active'; startHit=performance.now();
        const dur=(r(820,1220)/(item.speed||1));
        const end=fromLeft?'108%':'-14%';
        const anim=target.animate([{left:teaseX},{left:end}],{duration:dur,fill:'forwards',easing:'linear'});
        current={item,target,anim};
        anim.onfinish=()=>{ if(current?.target===target){current=null;phase='waiting';target.remove();scheduleNext();} };
      },250);
    }
    function fire(ev){
      ev.preventDefault(); if(cooldown||state.catch)return;
      const rect=area.getBoundingClientRect(); const x=(ev.clientX??ev.touches?.[0]?.clientX??rect.left+rect.width/2)-rect.left;
      const ang=(x/rect.width-.5)*42; spear.animate([{transform:`translateX(-50%) rotate(0deg)`},{transform:`translateX(-50%) rotate(${ang}deg) translateY(-24%)`},{transform:`translateX(-50%) rotate(0deg)`}],{duration:260});
      if(phase==='active' && current){
        const tr=current.target.getBoundingClientRect();
        const hitX=ev.clientX??ev.touches?.[0]?.clientX??0;
        if(hitX>=tr.left-25 && hitX<=tr.right+25){
          const elapsed=performance.now()-startHit;
          const fresh=Math.round(clamp(110-elapsed/7.2,20,100));
          state.catch=current.item;state.freshness=fresh;
          state.art += current.item.good?Math.round(fresh*.25):Math.round(fresh*.5);
          current.anim.cancel();current.target.remove();current=null;
          const label=fresh>=95?'神鮮':fresh>=80?'超新鮮':fresh>=60?'新鮮':fresh>=40?'普通':'遅め';
          updateCook(`${current?.item?.name||state.catch.name}を確保！`,`獲得：${state.catch.name} / 新鮮さ ${fresh}` , state.catch.icon);
          toast(`${state.catch.name}！　${label} ${fresh}`);
          later(()=>showTransition('第2工程','獲物を厨房へ！',startStage2),1250);
          return;
        }
      }
      // Empty thrust or missed target
      cooldown=true; phase = phase==='active' ? phase : 'cooldown';
      const mask=document.createElement('div');mask.className='cooldown-mask';mask.textContent='銛回収中…';area.appendChild(mask);
      updateCook('空振り！','次の獲物を逃すかも…','😨');
      later(()=>{cooldown=false;mask.remove(); if(!current && phase==='cooldown'){phase='waiting';scheduleNext();}},1000);
    }
    area.addEventListener('pointerdown',fire,{passive:false});
    scheduleNext();
  }

  // ---------- STAGE 2 ----------
  const liquids=[
    {id:'cream',name:'クリーム',icon:'🥛',amount:11,weight:30,color:'#fff0ce'},
    {id:'ice',name:'バニラアイス',icon:'🍨',amount:17,weight:17,color:'#fff7e8'},
    {id:'yogurt',name:'ヨーグルト',icon:'🥣',amount:12,weight:13,color:'#f7f4ef'},
    {id:'mayo',name:'マヨネーズ',icon:'🧴',amount:8,weight:10,color:'#fff0a9'},
    {id:'milk',name:'牛乳',icon:'🥛',amount:7,weight:10,color:'#f7fbff'},
    {id:'condensed',name:'練乳',icon:'🧃',amount:9,weight:7,color:'#fff4d9'},
    {id:'foam',name:'シェービングフォーム',icon:'🫧',amount:10,weight:5,color:'#ecf6ff'},
    {id:'tofu',name:'豆腐',icon:'⬜',amount:15,weight:4,color:'#f6f1dc'},
    {id:'mystery',name:'謎の白いもの',icon:'❔',amount:13,weight:4,color:'#ddd'}
  ];
  function weightedLiquid(){const total=liquids.reduce((s,x)=>s+x.weight,0);let n=Math.random()*total;for(const x of liquids){n-=x.weight;if(n<=0)return x}return liquids[0]}

  function startStage2(){
    clearAsync();state.stage=2;setStage('2 / 3　クリーム');
    const area=mountHud();area.classList.add('kitchen');
    area.innerHTML=`<div class="tile-lines"></div><div class="stage-title">第2工程　2/3を支配せよ！</div><div class="timer-big">残り <b id="timer">16.0</b></div><div class="throw-label left">← 投入口</div><div class="throw-label right">投入口 →</div><div class="bowl-game" id="bowl"><div class="catch-mouth"><span>ここで回収</span></div><div class="bowl-fill" id="bowlFill"></div><div class="goal-line"></div><div class="goal-label">目標量</div></div><div class="volume-meter"><div class="volume-bar"><i id="vFill"></i><b></b></div><div id="vText">0 / 100</div><div class="dominant" id="dominant">主成分：—</div></div><div class="hint">左右から飛んでくる材料をボウルでキャッチ。青い口を通ったものだけ回収！</div>`;
    updateCook('ボウルを構えた！',`前工程：${state.catch?.name||'なし'}`,'🥣');
    const bowl=area.querySelector('#bowl'), fill=area.querySelector('#bowlFill'), vFill=area.querySelector('#vFill'), timerEl=area.querySelector('#timer'), domEl=area.querySelector('#dominant'), vText=area.querySelector('#vText');
    let bowlX=area.clientWidth/2, drops=[], active=true, time=16, last=performance.now(), spawnAcc=0;
    const mix={}; state.amount=0;

    function setBowl(x){bowlX=clamp(x,62,area.clientWidth-62);bowl.style.left=bowlX+'px'} setBowl(bowlX);
    function pointerX(e){const ar=area.getBoundingClientRect();return e.clientX-ar.left}
    area.addEventListener('pointerdown',e=>{area.setPointerCapture?.(e.pointerId);setBowl(pointerX(e))});
    area.addEventListener('pointermove',e=>{if(e.buttons||e.pointerType==='touch')setBowl(pointerX(e))});

    function addDrop(){
      const l=weightedLiquid(), el=document.createElement('div');el.className='drop';el.textContent=l.icon;
      const fromLeft=Math.random()<.5;
      const startX=fromLeft?-62:area.clientWidth+10;
      const startY=r(90,Math.max(125,area.clientHeight*.30));
      // Aim the arc at a random point near the lower play field. The bowl still has to be moved under it.
      const targetX=r(72,area.clientWidth-72);
      const targetY=area.clientHeight*.78;
      const flight=r(.72,.98);
      const gravity=r(760,930);
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
    }
    function loop(now){
      if(!active)return;const dt=Math.min((now-last)/1000,.035);last=now;time-=dt;timerEl.textContent=Math.max(0,time).toFixed(1);
      spawnAcc+=dt;
      const interval=time<3.5?.18:time<8?.24:.31;
      if(spawnAcc>=interval){spawnAcc=0;addDrop();if(time<7&&Math.random()<.28)addDrop()}
      const br=bowl.getBoundingClientRect(), ar=area.getBoundingClientRect();
      const bowlLeft=br.left-ar.left, bowlTop=br.top-ar.top;
      const catchY=bowlTop+2;
      for(let i=drops.length-1;i>=0;i--){
        const d=drops[i];d.prevY=d.y;d.vy+=d.g*dt;d.x+=d.vx*dt;d.y+=d.vy*dt;d.rot+=d.vr*dt;
        d.el.style.transform=`translate(${d.x}px, ${d.y}px) rotate(${d.rot}deg)`;
        const centerX=d.x+26, centerY=d.y+26, prevCenterY=d.prevY+26;
        // Catch exactly when the item's center crosses the visible blue bowl-mouth line while descending.
        if(d.vy>0 && prevCenterY<catchY && centerY>=catchY && centerX>bowlLeft+7 && centerX<bowlLeft+br.width-7){
          mix[d.l.id]=(mix[d.l.id]||0)+d.l.amount;state.amount+=d.l.amount;d.el.remove();drops.splice(i,1);refresh();
          bowl.classList.remove('catch-pop');void bowl.offsetWidth;bowl.classList.add('catch-pop');
          updateCook(`${d.l.name}を入れた！`,`総量 ${Math.round(state.amount)} / 100`,'🥣');continue;
        }
        if(d.y>area.clientHeight+80 || d.x<-120 || d.x>area.clientWidth+120){d.el.remove();drops.splice(i,1)}
      }
      if(time<=0){active=false;finishStage2();return} raf=requestAnimationFrame(loop);
    }
    function finishStage2(){
      state.liquidMix=mix;const d=currentDominant();state.liquid=d&&d.ratio>=2/3?d.l:{id:'mystery_mix',name:'謎の液体',icon:'🧪',base:35};
      state.amountScore=pctScore(state.amount,100,65);state.art+=state.liquid.id==='mystery_mix'?45:Math.round(state.amountScore*.15);
      const ratioTxt=d?Math.round(d.ratio*100):0;
      updateCook(`${state.liquid.name}になった！`,`分量 ${Math.round(state.amount)} / 完成度 ${state.amountScore}` ,state.liquid.icon);
      toast(`${state.liquid.name}（${ratioTxt}%）`);
      later(()=>showTransition('FINAL STAGE','番組スタジオへ！',startStage3,2100),1200);
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
  function startStage3(){
    clearAsync();state.stage=3;setStage('3 / 3　FINAL');screen.innerHTML=`<section class="final-stage" id="final"><div class="lights"></div><div class="audience"></div><div class="host">🎤</div><div class="judge">🧑‍⚖️</div><div class="final-card"><h2>最終工程　◯げる</h2><div class="word-slot" id="word">揚げる</div></div><button class="stop-btn" id="stop">ここだ！</button></section>`;
    const word=screen.querySelector('#word'),btn=screen.querySelector('#stop');let i=0,running=true,lastSwap=0;
    function spin(t){if(!running)return;if(t-lastSwap>190){lastSwap=t;i=(i+1)%verbs.length;word.textContent=verbs[i].label;}raf=requestAnimationFrame(spin)}raf=requestAnimationFrame(spin);
    btn.onclick=()=>{if(!running)return;running=false;cancelAnimationFrame(raf);state.verb=verbs[i];btn.remove();showVerbEvent(verbs[i]);};
  }

  function showVerbEvent(v){
    const final=screen.querySelector('#final');const banner=document.createElement('div');banner.className='event-banner';banner.textContent=v.label+'！';final.appendChild(banner);later(()=>banner.remove(),900);
    if(v.id==='escape'){
      state.finishScore=0;state.finishLabel='逃走';state.art+=120;state.special='escaped';
      later(()=>{const runner=document.createElement('div');runner.style.cssText='position:absolute;z-index:20;left:20%;top:52%;font-size:70px;animation:runAcross 1s linear forwards';runner.textContent='🟤💨';final.appendChild(runner);},500);
      return later(finishGame,1900);
    }
    if(v.id==='age') return later(startDJ,600);
    later(()=>startSkill(v),650);
  }

  function startSkill(v){
    const final=screen.querySelector('#final');const panel=document.createElement('div');panel.className='skill-panel';
    const titles={fry:'カリカリ度を決めろ！',burn:'一瞬の完璧な火入れを見切れ！',throw:'投げる強さを決めろ！'};
    panel.innerHTML=`<div class="skill-title">${titles[v.id]}</div><div class="skill-track"><div class="great-zone"></div><div class="perfect-zone"></div><div class="needle" id="needle"></div></div><button class="skill-btn">STOP</button>`;final.appendChild(panel);
    const needle=panel.querySelector('#needle'),stop=panel.querySelector('button');let pos=0,dir=1,last=performance.now(),done=false;
    const speed=v.id==='burn'?2.9:v.id==='throw'?.78:.95; // normalized track lengths per sec
    function loop(now){if(done)return;const dt=(now-last)/1000;last=now;pos+=dir*speed*dt;
      if(v.id==='burn'){
        if(pos>1.12){done=true;state.finishScore=0;state.finishLabel='真っ黒焦げ';state.art+=20;needle.style.left='110%';toast('焦げた！！');return later(finishGame,950)}
      }else{if(pos>=1){pos=1;dir=-1}else if(pos<=0){pos=0;dir=1}}
      needle.style.left=(pos*100)+'%';raf=requestAnimationFrame(loop)
    }
    stop.onclick=()=>{
      if(done)return;done=true;cancelAnimationFrame(raf);const dist=Math.abs(pos-.5);
      let score=Math.round(clamp(100-dist*230,0,100));
      if(v.id==='burn' && dist>.085){ score=Math.round(clamp(45-dist*160,0,45)); state.finishLabel=score>25?'香ばしい焦げ':'真っ黒焦げ'; }
      else if(v.id==='burn'){state.finishLabel='奇跡の火入れ';state.art+=180;}
      else if(v.id==='fry')state.finishLabel=score>=95?'究極カリカリ':score>=75?'サクサク':score>=45?'普通':'しなしな';
      else if(v.id==='throw'){state.finishLabel=score>=92?'顔面ど真ん中':score>=65?'命中':score>=30?'かすった':'場外';state.art+=Math.round(score*.8);}
      state.finishScore=score;needle.style.left=(pos*100)+'%';toast(`${state.finishLabel} ${score}`);later(finishGame,900);
    };
    raf=requestAnimationFrame(loop);
  }

  function startDJ(){
    const final=screen.querySelector('#final');final.classList.add('dj-mode');final.innerHTML=`<div class="lights"></div><div class="audience"></div><div class="dj-title">KANI CREAM DJ</div><div class="dj-cook">😎</div><div class="dj-deck"></div><button class="stop-btn" id="djTap">フロアをアげる！</button>`;
    let taps=0,time=4.5,last=performance.now();const btn=final.querySelector('#djTap');btn.onclick=()=>{taps++;btn.textContent=`もっとアげる！ ${taps}`;};
    function loop(now){const dt=(now-last)/1000;last=now;time-=dt;if(time<=0){state.finishScore=clamp(taps*9,25,100);state.finishLabel='フロア沸騰';state.art+=250+taps*20;state.special='dj';return later(finishGame,500)}raf=requestAnimationFrame(loop)}raf=requestAnimationFrame(loop);
  }

  function calcCompletion(){
    return Math.round((state.freshness+state.amountScore+state.finishScore)/3);
  }
  function completionMultiplier(c){return +(0.45+(c/100)*1.25).toFixed(2)}
  function dishName(){
    const a=state.catch?.name||'食材なし',b=state.liquid?.name||'液体なし',v=state.verb?.id;
    if(state.special==='dj')return `${a}${b}DJ`;
    if(v==='escape')return `逃走した${a}${b}`;
    if(v==='throw')return `投げられた${a}${b}`;
    if(v==='burn')return `${a}${b}${state.finishLabel}`;
    if(a==='カニ' && b==='クリーム' && v==='fry' && state.finishScore>=92)return 'カニクリームコロッケ';
    return `${a}${b}${v==='fry'?'揚げ':'料理'}`;
  }
  function dishIcon(){if(state.special==='dj')return '😎🎛️';if(state.special==='escaped')return '🟤💨';if(state.verb?.id==='throw')return '💥🟤';if(state.verb?.id==='burn')return '⚫';return '🟤'}
  function finishGame(){
    clearAsync();setStage('RESULT');const c=calcCompletion(),mult=completionMultiplier(c),ingredientBase=(state.catch?.base||25)+(state.liquid?.id==='cream'?100:state.liquid?.id==='mystery_mix'?35:55);
    const base=Math.round(ingredientBase*10), total=Math.round(base*mult+state.art*10),name=dishName();
    const entry={name,icon:dishIcon(),date:new Date().toLocaleDateString('ja-JP'),special:state.special||state.verb?.id,catch:state.catch?.name,liquid:state.liquid?.name};
    if(!book.some(x=>x.name===name)){book.unshift(entry);localStorage.setItem(storageKey,JSON.stringify(book.slice(0,60)));}
    const cls=state.verb?.id==='burn'?'burnt':state.verb?.id==='throw'?'thrown':state.special==='escaped'?'escaped':'';
    const comment=resultComment(c,name);
    screen.innerHTML=`<section class="result-screen"><div class="result-card"><div class="result-heading">本日の作品</div><div class="dish-art ${cls}">${dishIcon()}</div><div class="dish-name">『${name}』</div><div class="scores"><div class="score-box"><span>新鮮さ</span><b>${state.freshness}</b></div><div class="score-box"><span>分量</span><b>${state.amountScore}</b></div><div class="score-box"><span>${state.verb?.id==='throw'?'投擲':state.verb?.id==='age'?'盛り上がり':'仕上げ'}</span><b>${state.finishScore}</b></div><div class="score-box"><span>完成度倍率</span><b>×${mult}</b></div><div class="score-box"><span>芸術点</span><b>${state.art}</b></div><div class="score-box"><span>総合点</span><b>${total}</b></div></div><div class="comment">審査員「${comment}」</div><div class="action-row"><button class="again">もう一皿</button><button class="menu">メニュー</button></div></div></section>`;
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

  function showBook(){
    clearAsync();setStage('図鑑');const items=book.map(x=>`<div class="book-item"><div class="icon">${x.icon}</div><b>${escapeHtml(x.name)}</b><small>${escapeHtml(x.catch||'')} × ${escapeHtml(x.liquid||'')}</small></div>`).join('');
    screen.innerHTML=`<section class="book-screen"><div class="book-card"><h2>料理図鑑 <small>${book.length}品</small></h2>${items?`<div class="book-grid">${items}</div>`:'<div class="empty-note">まだ一皿も登録されていません。<br>まずは何か作ってみよう。</div>'}<button class="back-btn">戻る</button></div></section>`;screen.querySelector('.back-btn').onclick=showMenu;
  }
  function showSettings(){
    clearAsync();setStage('設定');screen.innerHTML=`<section class="settings-screen"><div class="settings-card"><h2>設定</h2><label>効果音（プロトタイプでは未接続）</label><input id="sfx" type="range" min="0" max="100" value="${settings.sfx}"><label><input id="rm" type="checkbox" ${settings.reducedMotion?'checked':''}> 演出を控えめにする</label><button class="back-btn">保存して戻る</button></div></section>`;
    screen.querySelector('.back-btn').onclick=()=>{settings.sfx=+screen.querySelector('#sfx').value;settings.reducedMotion=screen.querySelector('#rm').checked;localStorage.setItem(settingsKey,JSON.stringify(settings));showMenu()};
  }
  function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

  showMenu();
})();
