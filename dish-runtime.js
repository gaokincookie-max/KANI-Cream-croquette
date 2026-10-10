(() => {
  'use strict';
  const R = window.KaniDishRenderer;
  const project = window.KANI_DISH_PROJECT || {templates:[],overrides:{}};
  let images = null;
  let readyPromise = null;

  function loadImage(src){
    return new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(new Error('image load failed: '+src));
      img.src=src;
    });
  }

  async function init(){
    if(readyPromise) return readyPromise;
    readyPromise=(async()=>{
      images=await R.loadDefaultImages(loadImage);
      for(const [id,url] of Object.entries(project.overrides||{})){
        if(url) images[id]=await loadImage(url);
      }
      return true;
    })();
    return readyPromise;
  }

  function preferredTemplate(){
    const templates=project.templates||[];
    if(!templates.length) return {slots:R.createDefaultSlots(),mask:R.createDefaultMask(),extraLayers:[]};
    // Prefer the latest / most fully adjusted template (extra steam/sparkle layers are a useful signal).
    return [...templates].sort((a,b)=>((b.extraLayers?.length||0)-(a.extraLayers?.length||0)))[0];
  }

  function mapMain(catchId){
    const map={
      crab:'crabShred', hairy:'crabShred', king:'crabPieces', small:'crabShred',
      kanikama:'kanikama', kombu:'kombu', boot:'boots', star:'starfish', glove:'gloves',
      mystery:'crabPieces'
    };
    return map[catchId] || 'crabShred';
  }
  function mapSauce(liquidId){
    const map={
      cream:'cream', ice:'ice', yogurt:'yogurt', mayo:'mayo', milk:'milk',
      condensed:'custard', tofu:'whiteSauce', foam:'mysteryPurple', mystery:'mysteryPurple',
      mystery_mix:'mysteryPurple'
    };
    return map[liquidId] || 'mysteryPurple';
  }
  function finishMode(gameState){
    const v=gameState.verb?.id;
    if(v==='burn') return gameState.finishLabel==='奇跡の火入れ' ? 'golden' : 'charcoal';
    if(v==='fry' && gameState.finishScore>=92) return 'golden';
    return 'normal';
  }
  function displayRules(gameState){
    const dj=gameState.special==='dj' || gameState.verb?.id==='age';
    const escape=gameState.special==='escaped' || gameState.verb?.id==='escape';
    // Provisional rules; intentionally easy to change later.
    const steam=dj || (!escape && gameState.finishScore>=75);
    const sparkle=dj || gameState.finishScore>=90;
    return {legs:escape,glasses:dj,headphones:dj,steam,sparkle};
  }
  function normalizeSlot(slot){
    return Object.assign({x:0,y:0,scale:1,rotation:0,z:0,alpha:1,flipX:false,visible:true,clip:false},slot||{});
  }
  function makeLayer(role,name,assetId,slot,extra={}){
    const s=normalizeSlot(slot);
    return Object.assign({uid:'',role,name,assetId,x:s.x,y:s.y,scale:s.scale,rotation:s.rotation||0,alpha:s.alpha==null?1:Number(s.alpha),flipX:!!s.flipX,clip:!!s.clip,visible:s.visible!==false,z:s.z||0,bound:true},extra);
  }
  function buildFromTemplate(gameState){
    const t=preferredTemplate();
    const slots=Object.assign(R.createDefaultSlots(),t.slots||{});
    const mask=Object.assign(R.createDefaultMask(),t.mask||{});
    const rules=displayRules(gameState);
    const recipe={
      sauce:mapSauce(gameState.liquid?.id),
      main:mapMain(gameState.catch?.id),
      finish:finishMode(gameState),
      layout:'standard',
      ...rules
    };
    let layers=R.buildRecipeLayers(recipe,slots,mask);

    // Unknown/no catch: keep the liquid, but do not pretend a random ingredient is present.
    if(['can','none',undefined,null].includes(gameState.catch?.id)){
      layers=layers.filter(l=>l.role!=='main');
    }

    // Preserve duplicated decorative layers from the editor, but only when that semantic role is active.
    const activeRoles=new Set();
    if(rules.steam) activeRoles.add('steam');
    if(rules.sparkle) activeRoles.add('sparkle');
    if(rules.legs){activeRoles.add('shoeL');activeRoles.add('shoeR');activeRoles.add('legs');}
    if(rules.glasses) activeRoles.add('glasses');
    if(rules.headphones) activeRoles.add('headphones');
    for(const e of (t.extraLayers||[])){
      const semantic=e.semanticRole||e.role||e.assetId;
      if(!activeRoles.has(semantic)) continue;
      layers.push(Object.assign({},e,{uid:e.instanceId||'',role:semantic,name:e.name||semantic,visible:e.visible!==false,bound:false}));
    }
    return {recipe,layers,mask,rules};
  }

  function translateBuilt(built, dx, dy){
    if(!dx && !dy) return built;
    built.layers.forEach(l=>{ l.x += dx; l.y += dy; });
    built.mask.x += dx; built.mask.y += dy;
    return built;
  }

  function estimateBounds(built){
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    const mask=built.mask;
    for(const l of built.layers){
      if(l.visible===false) continue;
      if(l.clip){
        minX=Math.min(minX, mask.x-mask.rx);
        maxX=Math.max(maxX, mask.x+mask.rx);
        minY=Math.min(minY, mask.y-mask.ry);
        maxY=Math.max(maxY, mask.y+mask.ry);
        continue;
      }
      const img=images[l.assetId];
      if(!img) continue;
      const halfW=(img.width * (l.scale||1))/2;
      const halfH=(img.height * (l.scale||1))/2;
      minX=Math.min(minX, l.x-halfW);
      maxX=Math.max(maxX, l.x+halfW);
      minY=Math.min(minY, l.y-halfH);
      maxY=Math.max(maxY, l.y+halfH);
    }
    if(!isFinite(minX)) return {minX:0,minY:0,maxX:760,maxY:760};
    return {minX,minY,maxX,maxY};
  }

  function fitIntoCanvas(built, width, height, pad=18){
    const b=estimateBounds(built);
    let dx=0, dy=0;
    if(b.minX < pad) dx += pad - b.minX;
    if(b.maxX > width - pad) dx += (width - pad) - b.maxX;
    if(b.minY < pad) dy += pad - b.minY;
    if(b.maxY > height - pad) dy += (height - pad) - b.maxY;
    return translateBuilt(built, dx, dy);
  }

  async function render(canvas,gameState){
    await init();
    const ctx=canvas.getContext('2d');
    const built=buildFromTemplate(gameState);
    // Present the dish a little more to the upper-right in the result frame.
    const baseDx = 30;
    const baseDy = built.rules?.legs ? -108 : -38;
    translateBuilt(built, baseDx, baseDy);
    // Safety clamp so every decorative asset stays inside the frame.
    fitIntoCanvas(built, canvas.width, canvas.height, 20);
    R.renderDish(ctx,images,built,{backgroundFill:null});
  }

  window.KaniGameDish={init,render,preferredTemplate,finishMode,displayRules};
  init().catch(err=>console.warn('[dish renderer]',err));
})();
