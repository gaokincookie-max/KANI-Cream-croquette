
(function(global){
  const defs={
    base:[
      {id:'plate',name:'皿',src:'assets/dishgen/plate.png',cat:'base'},
      {id:'cutFrame',name:'断面フレーム',src:'assets/dishgen/cutFrame.png',cat:'base'},
      {id:'whole',name:'丸ごとコロッケ',src:'assets/dishgen/whole.png',cat:'base'},
      {id:'shoeL',name:'足L',src:'assets/dishgen/shoeL.png',cat:'extra'},
      {id:'shoeR',name:'足R',src:'assets/dishgen/shoeR.png',cat:'extra'},
      {id:'glasses',name:'グラサン',src:'assets/dishgen/glasses.png',cat:'extra'},
      {id:'headphones',name:'ヘッドホン',src:'assets/dishgen/headphones.png',cat:'extra'},
      {id:'steam',name:'湯気',src:'assets/dishgen/steam.png',cat:'extra'},
      {id:'sparkle',name:'キラキラ',src:'assets/dishgen/sparkle.png',cat:'extra'}
    ],
    sauces:[
      {id:'cream',name:'クリーム',src:'assets/dishgen/cream.png',cat:'sauce'},
      {id:'ice',name:'アイス系',src:'assets/dishgen/ice.png',cat:'sauce'},
      {id:'mayo',name:'マヨ系',src:'assets/dishgen/mayo.png',cat:'sauce'},
      {id:'yogurt',name:'ヨーグルト系',src:'assets/dishgen/yogurt.png',cat:'sauce'},
      {id:'mysteryPurple',name:'謎の液体A',src:'assets/dishgen/mysteryPurple.png',cat:'sauce'},
      {id:'whiteSauce',name:'ホワイトソース',src:'assets/dishgen/whiteSauce.png',cat:'sauce'},
      {id:'milk',name:'ミルク系',src:'assets/dishgen/milk.png',cat:'sauce'},
      {id:'custard',name:'カスタード系',src:'assets/dishgen/custard.png',cat:'sauce'}
    ],
    mains:[
      {id:'crabShred',name:'カニほぐし',src:'assets/dishgen/crabShred.png',cat:'main'},
      {id:'kanikama',name:'カニカマ',src:'assets/dishgen/kanikama.png',cat:'main'},
      {id:'kombu',name:'昆布',src:'assets/dishgen/kombu.png',cat:'main'},
      {id:'starfish',name:'ヒトデ',src:'assets/dishgen/starfish.png',cat:'main'},
      {id:'boots',name:'長靴',src:'assets/dishgen/boots.png',cat:'main'},
      {id:'gloves',name:'手袋',src:'assets/dishgen/gloves.png',cat:'main'},
      {id:'crabPieces',name:'カニ身ごろ',src:'assets/dishgen/crabPieces.png',cat:'main'}
    ]
  };
  const assetMap={}; [...defs.base,...defs.sauces,...defs.mains].forEach(d=>assetMap[d.id]=d);
  const defaultRecipe={sauce:'cream',main:'crabShred',finish:'normal',layout:'standard',legs:false,glasses:false,headphones:false,steam:false,sparkle:false};
  const defaultMask={x:276,y:430,rx:118,ry:78,rotation:-0.34};
  // Completion-image style: whole croquette behind/right, cut face in front/left.
  const defaultSlots={
    plate:{x:380,y:566,scale:.77,rotation:0,z:0,alpha:1,flipX:false,visible:true},
    backBody:{x:452,y:416,scale:.69,rotation:0,z:1,alpha:1,flipX:false,visible:true},
    sauce:{x:276,y:430,scale:.88,rotation:-4,z:2,clip:true,alpha:1,flipX:false,visible:true},
    main:{x:276,y:430,scale:.72,rotation:-8,z:3,clip:true,alpha:1,flipX:false,visible:true},
    cutFrame:{x:283,y:429,scale:.82,rotation:0,z:4,alpha:1,flipX:false,visible:true},
    shoeL:{x:235,y:570,scale:.48,rotation:0,z:-1,alpha:1,flipX:false,visible:true},
    shoeR:{x:363,y:580,scale:.48,rotation:0,z:-1,alpha:1,flipX:false,visible:true},
    glasses:{x:300,y:345,scale:.46,rotation:0,z:5,alpha:1,flipX:false,visible:true},
    headphones:{x:310,y:315,scale:.44,rotation:0,z:5,alpha:1,flipX:false,visible:true},
    steam:{x:510,y:350,scale:.43,rotation:0,z:6,alpha:.95,flipX:false,visible:true},
    sparkle:{x:585,y:300,scale:.88,rotation:0,z:6,alpha:1,flipX:false,visible:true}
  };
  const clone=o=>JSON.parse(JSON.stringify(o));
  function createDefaultMask(){return clone(defaultMask);} function createDefaultSlots(){return clone(defaultSlots);} function normalizeRecipe(r){return Object.assign({},clone(defaultRecipe),r||{});}  
  function layer(role,name,assetId,slot,extra={}){return Object.assign({uid:'',role,name,assetId,x:slot.x,y:slot.y,scale:slot.scale,rotation:slot.rotation||0,alpha:slot.alpha==null?1:Number(slot.alpha),flipX:!!slot.flipX,clip:!!slot.clip,visible:slot.visible!==false,z:slot.z||0,bound:true},extra);}
  function buildRecipeLayers(recipe, slots, mask){
    const r=normalizeRecipe(recipe), s=slots||createDefaultSlots();
    const out=[];
    out.push(layer('plate','皿','plate',s.plate));
    out.push(layer('backBody','丸ごと本体','whole',s.backBody));
    out.push(layer('sauce','液体',r.sauce,s.sauce));
    out.push(layer('main','具材',r.main,s.main,{rotation:(s.main.rotation||0)+(r.main==='kombu'?12:r.main==='boots'?8:0)}));
    out.push(layer('cutFrame','断面フレーム','cutFrame',s.cutFrame));
    if(r.legs){out.push(layer('shoeL','足L','shoeL',s.shoeL));out.push(layer('shoeR','足R','shoeR',s.shoeR));}
    if(r.glasses)out.push(layer('glasses','グラサン','glasses',s.glasses));
    if(r.headphones)out.push(layer('headphones','ヘッドホン','headphones',s.headphones));
    if(r.steam)out.push(layer('steam','湯気','steam',s.steam));
    if(r.sparkle)out.push(layer('sparkle','キラキラ','sparkle',s.sparkle));
    return out;
  }
  function drawImageAsset(ctx,images,l){const img=images[l.assetId];if(!img)return;ctx.save();ctx.translate(l.x,l.y);ctx.rotate((l.rotation||0)*Math.PI/180);ctx.scale(l.flipX?-1:1,1);ctx.globalAlpha=l.alpha??1;const w=img.width*l.scale,h=img.height*l.scale;ctx.drawImage(img,-w/2,-h/2,w,h);ctx.restore();}
  function drawFinishOverlay(ctx,layers,finish){if(!finish||finish==='normal')return;const frame=layers.find(l=>l.role==='cutFrame');if(!frame)return;ctx.save();ctx.translate(frame.x,frame.y);ctx.rotate((frame.rotation||0)*Math.PI/180);ctx.scale(frame.scale,frame.scale);ctx.beginPath();ctx.ellipse(-5,0,205,120,-.10,0,Math.PI*2);ctx.clip();if(finish==='golden'){ctx.fillStyle='rgba(255,180,60,.16)';ctx.fillRect(-260,-180,520,360);}else{ctx.fillStyle=finish==='charcoal'?'rgba(35,14,8,.38)':'rgba(50,20,8,.20)';ctx.fillRect(-260,-180,520,360);}ctx.restore();}
  function renderDish(ctx,images,state,options={}){ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);if(options.backgroundFill){ctx.fillStyle=options.backgroundFill;ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);}const mask=state.mask||createDefaultMask();const layers=[...(state.layers||[])].filter(l=>l.visible!==false).sort((a,b)=>a.z-b.z);for(const l of layers){const d=()=>drawImageAsset(ctx,images,l);if(l.clip){ctx.save();ctx.translate(mask.x,mask.y);ctx.rotate(mask.rotation||0);ctx.beginPath();ctx.ellipse(0,0,mask.rx,mask.ry,0,0,Math.PI*2);ctx.clip();ctx.translate(-mask.x,-mask.y);d();ctx.restore();}else d();}drawFinishOverlay(ctx,layers,state.recipe?.finish);if(options.showMask){ctx.save();ctx.translate(mask.x,mask.y);ctx.rotate(mask.rotation||0);ctx.strokeStyle='#2563eb';ctx.setLineDash([9,7]);ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,mask.rx,mask.ry,0,0,Math.PI*2);ctx.stroke();ctx.restore();}}
  async function loadDefaultImages(loader){const o={};for(const d of Object.values(assetMap))o[d.id]=await loader(d.src);return o;}
  function makeThumbCanvas(img,w=100,h=68){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');const r=Math.min((w-8)/img.width,(h-8)/img.height);const dw=img.width*r,dh=img.height*r;x.drawImage(img,(w-dw)/2,(h-dh)/2,dw,dh);return c;}
  global.KaniDishRenderer={defs,assetMap,defaultRecipe,defaultMask,defaultSlots,createDefaultMask,createDefaultSlots,normalizeRecipe,buildRecipeLayers,renderDish,loadDefaultImages,makeThumbCanvas};
})(window);
