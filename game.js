(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const CHARACTERS = [
    { id:'thomas', name:'Thomas', color:'#0ba7e7', dark:'#075c9d', track:'Sodor Countryside', boost:'Steam Boost', scenic:'left' },
    { id:'percy',  name:'Percy',  color:'#32b74b', dark:'#13742d', track:'The Big Bridge', boost:'Rocket Boost', scenic:'right' },
    { id:'james',  name:'James',  color:'#ef3539', dark:'#a71428', track:'Brendam Docks', boost:'Firecracker', scenic:'right' },
    { id:'emily',  name:'Emily',  color:'#8c3ea6', dark:'#52256c', track:'The Canyon', boost:'Lightning Boost', scenic:'right' },
    { id:'toby',   name:'Toby',   color:'#f0a31d', dark:'#9c5d11', track:'Castle Run', boost:'Rapid Fire', scenic:'right' }
  ].map(c => ({
    ...c,
    trackImage:`assets/images/track-${c.id}.jpg`,
    trainImage:`assets/images/train-${c.id}.png`,
    portraitImage:`assets/images/portrait-${c.id}.png`,
    trophyImage:`assets/images/trophy-${c.id}.png`
  }));

  const defaults = {
    cogs: 0,
    trophies: { thomas:0, percy:0, james:0, emily:0, toby:0 },
    best: {},
    settings: { music:true, sound:true, motion:true }
  };

  function loadSave() {
    try {
      const saved = JSON.parse(localStorage.getItem('gogo-thomas-web-v1') || '{}');
      return {
        ...defaults, ...saved,
        trophies: { ...defaults.trophies, ...(saved.trophies || {}) },
        settings: { ...defaults.settings, ...(saved.settings || {}) },
        best: { ...(saved.best || {}) }
      };
    } catch (_) { return typeof structuredClone === 'function' ? structuredClone(defaults) : JSON.parse(JSON.stringify(defaults)); }
  }

  const save = loadSave();
  const state = { mode:'one', selected:0, p1:0, p2:1, currentScreen:'bootScreen', openingStarted:false };
  let race = null;
  let requestTrackPrefetch=()=>{};
  let raceFrame = 0;
  let raceSession = 0;
  let countdownTimers = [];

  function storeSave() {
    try { localStorage.setItem('gogo-thomas-web-v1', JSON.stringify(save)); } catch (_) {}
  }

  /* Audio from the original APK */
  const audioSources = {
    menu:'assets/audio/menu.mp3', race:'assets/audio/race.mp3', tap:'assets/audio/tap.mp3',
    accelerate:'assets/audio/accelerate.mp3', start:'assets/audio/race-start.mp3', go:'assets/audio/go.mp3',
    boost:'assets/audio/boost.mp3', win:'assets/audio/win.mp3', youWin:'assets/audio/you-win.mp3'
  };
  const music = {
    menu: new Audio(audioSources.menu),
    race: new Audio(audioSources.race)
  };
  music.menu.loop = music.race.loop = true;
  music.menu.volume = .32;
  music.race.volume = .38;
  let currentMusic = null;

  function setMusic(which) {
    Object.values(music).forEach(a => { if (a !== music[which]) { a.pause(); a.currentTime = 0; } });
    currentMusic = which || null;
    if (which && save.settings.music) music[which].play().catch(() => {});
  }
  function pauseMusic() { Object.values(music).forEach(a => a.pause()); }
  function resumeMusic() { if (currentMusic && save.settings.music) music[currentMusic].play().catch(() => {}); }
  function sfx(name, volume = .8) {
    if (!save.settings.sound) return;
    const src = audioSources[name] || `assets/audio/${name}.mp3`;
    const a = new Audio(src); a.volume = volume; a.play().catch(() => {});
  }
  function tapSound() { sfx('tap', .52); }

  /* Image cache */
  const imageCache = new Map();
  function image(src) {
    if (!imageCache.has(src)) { const im = new Image(); im.src = src; imageCache.set(src, im); }
    return imageCache.get(src);
  }
  CHARACTERS.forEach(c => [c.trackImage,c.trainImage,c.portraitImage,c.trophyImage].forEach(image));

  function showScreen(id) {
    $$('.screen').forEach(el => el.classList.toggle('active', el.id === id));
    state.currentScreen = id;
  }

  function updateStats() {
    $('#cogTotal').textContent = save.cogs;
    $('#trophyTotal').textContent = Object.values(save.trophies).reduce((a,b) => a + b, 0);
  }

  /* Original startup flow recovered from SplashView, TitleView and IntroView. */
  const openingVideo=$('#openingVideo'),openingAudio=new Audio();let openingDone=null,titleTimer=0,openingFallback=0;
  function stopOpeningMedia(){clearTimeout(openingFallback);openingVideo.pause();openingAudio.pause();openingVideo.onended=null;openingVideo.onerror=null;openingVideo.removeAttribute('src');openingVideo.load()}
  function playOpeningMovie(video,audio,onDone,skippable){
    clearTimeout(titleTimer);stopOpeningMedia();openingDone=onDone;showScreen('movieScreen');$('#movieScreen').classList.toggle('budge-movie',video.includes('budge-splash'));$('#skipOpening').hidden=!skippable;
    openingVideo.src=video;openingVideo.muted=true;openingVideo.currentTime=0;openingAudio.src=audio;openingAudio.currentTime=0;openingAudio.volume=.9;
    let finished=false;const finish=()=>{if(finished)return;finished=true;stopOpeningMedia();onDone()};openingVideo.onended=finish;openingVideo.onerror=finish;openingFallback=setTimeout(finish,video.includes('budge-splash')?12000:90000);
    openingVideo.play().catch(finish);if(save.settings.sound)openingAudio.play().catch(()=>{});
  }
  function finishOriginalOpening(){clearTimeout(titleTimer);stopOpeningMedia();setMusic('menu');updateStats();showScreen('modeScreen');requestTrackPrefetch(CHARACTERS[state.selected]);sfx('mainmenu-intro',.88)}
  function showOriginalTitle(){showScreen('titleScreen');titleTimer=setTimeout(()=>playOpeningMovie('assets/video/intro.mp4','assets/audio/intro-en.mp3',finishOriginalOpening,true),3000)}
  $('#bootStart').addEventListener('click',()=>{if(state.openingStarted)return;state.openingStarted=true;tapSound();playOpeningMovie('assets/video/budge-splash.mp4','assets/audio/budge-splash.mp3',showOriginalTitle,false)});
  $('#skipOpening').addEventListener('click',()=>{tapSound();const done=openingDone;stopOpeningMedia();done?.()});

  /* Main navigation */
  $$('.mode-card').forEach(button => button.addEventListener('click', () => {
    tapSound();
    state.mode = button.dataset.mode;
    $('#selectKicker').textContent = state.mode === 'one' ? 'ONE PLAYER' : 'TWO PLAYERS';
    $('#onePlayerPicker').hidden = state.mode !== 'one';
    $('#twoPlayerPicker').hidden = state.mode !== 'two';
    updateCharacterPicker(false); updateTwoPlayerPicker(false); showScreen('selectScreen');
  }));
  $('.back-to-mode').addEventListener('click', () => { tapSound(); showScreen('modeScreen'); });

  /* Character selection */
  function buildCharacterStrip() {
    const strip = $('#characterStrip'); strip.innerHTML = '';
    CHARACTERS.forEach((c, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'character-chip'; button.dataset.index = index;
      button.setAttribute('role','option'); button.setAttribute('aria-label',c.name);
      button.innerHTML = `<img src="${c.portraitImage}" alt="">`;
      button.addEventListener('click', () => { state.selected = index; tapSound(); updateCharacterPicker(true); });
      strip.append(button);
    });
  }
  buildCharacterStrip();

  function updateCharacterPicker(withVoice = true) {
    const c = CHARACTERS[state.selected];
    const card = $('#heroCard'); card.classList.add('switching');
    setTimeout(() => card.classList.remove('switching'), 170);
    $('#heroTrack').src = c.trackImage; $('#heroTrack').alt = `${c.name}'s ${c.track} track`;
    $('#heroName').textContent = c.name.toUpperCase(); $('#heroTrackName').textContent = c.track.toUpperCase();
    $('#heroTrain').src = c.trainImage; $('#heroTrain').alt = c.name;
    $('#heroBoost').textContent = `⚡ ${c.boost.toUpperCase()}`;
    $('.select-backdrop').style.backgroundImage = `url("${c.trackImage}")`;
    $('.engine-nameplate').style.background = `linear-gradient(100deg,${c.color},${c.dark})`;
    $$('.character-chip').forEach((chip,i) => { chip.classList.toggle('selected', i === state.selected); chip.setAttribute('aria-selected', i === state.selected); });
    const trophyWrap = $('#heroTrophies'); trophyWrap.innerHTML = '';
    for (let i=0;i<5;i++) { const pip=document.createElement('i'); if(i < save.trophies[c.id]) pip.className='won'; trophyWrap.append(pip); }
    requestTrackPrefetch(c);if (withVoice) sfx(`select-${c.id}`, .9);
  }
  function cycleSelected(delta) {
    state.selected = (state.selected + delta + CHARACTERS.length) % CHARACTERS.length;
    tapSound(); updateCharacterPicker(true);
  }
  $('.prev-character').addEventListener('click', () => cycleSelected(-1));
  $('.next-character').addEventListener('click', () => cycleSelected(1));
  $('#onePlayerGo').addEventListener('click', () => { tapSound(); state.p1 = state.selected; startRace(); });

  function updateTwoPlayerPicker(withVoice = false, player = 'p1') {
    if (state.p1 === state.p2) state.p2 = (state.p2 + 1) % CHARACTERS.length;
    const p1 = CHARACTERS[state.p1], p2 = CHARACTERS[state.p2];
    $('#p1Portrait').src = p1.portraitImage; $('#p1Portrait').alt = p1.name; $('#p1Name').textContent = p1.name.toUpperCase();
    $('#p2Portrait').src = p2.portraitImage; $('#p2Portrait').alt = p2.name; $('#p2Name').textContent = p2.name.toUpperCase();
    requestTrackPrefetch(p1);if (withVoice) sfx(`select-${CHARACTERS[state[player]].id}`, .9);
  }
  function cyclePlayer(player, delta) {
    const other = player === 'p1' ? 'p2' : 'p1';
    do { state[player] = (state[player] + delta + CHARACTERS.length) % CHARACTERS.length; } while (state[player] === state[other]);
    tapSound(); updateTwoPlayerPicker(true, player);
  }
  $('.p1-prev').addEventListener('click', () => cyclePlayer('p1',-1));
  $('.p1-next').addEventListener('click', () => cyclePlayer('p1',1));
  $('.p2-prev').addEventListener('click', () => cyclePlayer('p2',-1));
  $('.p2-next').addEventListener('click', () => cyclePlayer('p2',1));
  $('#twoPlayerGo').addEventListener('click', () => { tapSound(); startRace(); });

  /* Settings */
  function syncSettings() {
    $('#musicToggle').checked = save.settings.music;
    $('#soundToggle').checked = save.settings.sound;
    $('#motionToggle').checked = save.settings.motion;
    document.body.classList.toggle('no-motion', !save.settings.motion);
  }
  function openModal(id) { syncSettings(); $('#'+id).hidden = false; }
  function closeModal(id) { $('#'+id).hidden = true; }
  $$('.settings-open').forEach(b => b.addEventListener('click', () => { tapSound(); openModal('settingsModal'); }));
  $$('.modal-close').forEach(b => b.addEventListener('click', () => { tapSound(); closeModal(b.dataset.close); }));
  $('#musicToggle').addEventListener('change', e => { save.settings.music=e.target.checked; storeSave(); if(e.target.checked) resumeMusic(); else pauseMusic(); });
  $('#soundToggle').addEventListener('change', e => { save.settings.sound=e.target.checked; storeSave(); if(e.target.checked) tapSound(); });
  $('#motionToggle').addEventListener('change', e => { save.settings.motion=e.target.checked; document.body.classList.toggle('no-motion',!e.target.checked); storeSave(); });
  $('#fullscreenButton').addEventListener('click', () => {
    tapSound();
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(()=>{});
    else document.exitFullscreen?.();
  });
  syncSettings(); updateStats(); updateCharacterPicker(false); updateTwoPlayerPicker(false);

  /* Genuine Three.js race view. The five OBJ files and texture maps are the APK's
     original Unity meshes; the scene, rails, lights, props and effects are live WebGL. */
  class PolylineRoute {
    constructor(points){this.points=[];points.forEach(p=>{const v=new THREE.Vector3(...p);if(!this.points.length||this.points[this.points.length-1].distanceTo(v)>.002)this.points.push(v)});this.lengths=[0];for(let i=1;i<this.points.length;i++)this.lengths[i]=this.lengths[i-1]+this.points[i-1].distanceTo(this.points[i]);this.length=this.lengths.at(-1)||1}
    getLength(){return this.length}
    segmentAt(t){const distance=clamp(t,0,1)*this.length;let lo=0,hi=this.lengths.length-1;while(lo+1<hi){const m=(lo+hi)>>1;if(this.lengths[m]<=distance)lo=m;else hi=m}return {i:lo,u:(distance-this.lengths[lo])/Math.max(this.lengths[lo+1]-this.lengths[lo],1e-8)}}
    getPointAt(t){const s=this.segmentAt(t);return this.points[s.i].clone().lerp(this.points[Math.min(s.i+1,this.points.length-1)],s.u)}
    getTangentAt(t){const s=this.segmentAt(t);return this.points[Math.min(s.i+1,this.points.length-1)].clone().sub(this.points[s.i]).normalize()}
  }

  class ThreeRaceView {
    constructor(host) {
      this.host=host; this.renderer=null; this.scene=null; this.camera=null; this.active=false;
      this.modelCache=new Map();this.trackCache=new Map();this.trackTextureCache=new Map();
      this.trainRoots={};this.cogMeshes=[];this.smoke=[];this.curves=null;this.syntheticObjects=[];
      this.worldScale=.12;this.loader=null;this.textureLoader=null;this.smokeTexture=null;this.prefetchTimer=0;this.mobileGPU=/iPad|iPhone|Android/i.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&screen.width<1400);
    }
    init() {
      if(this.renderer)return true;
      if(!window.THREE||!THREE.OBJLoader)return false;
      try {
        this.renderer=new THREE.WebGLRenderer({antialias:!this.mobileGPU,alpha:false,powerPreference:'high-performance'});
        this.renderer.setPixelRatio(Math.min(this.mobileGPU?1:2,window.devicePixelRatio||1));
        this.renderer.shadowMap.enabled=!this.mobileGPU;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
        this.renderer.outputEncoding=THREE.sRGBEncoding;
        this.renderer.toneMapping=this.mobileGPU?THREE.NoToneMapping:THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=this.mobileGPU?1:1.08;
        this.host.appendChild(this.renderer.domElement);
        this.loader=new THREE.OBJLoader();this.textureLoader=new THREE.TextureLoader();if(location.protocol==='file:')this.textureLoader.crossOrigin=undefined;
        this.smokeTexture=this.makeSmokeTexture();
        this.active=true;$('#raceScreen').classList.add('webgl-ready');this.resize();return true;
      } catch(err) { console.warn('Three.js fallback:',err);this.active=false;return false; }
    }
    resize() {
      if(!this.renderer)return;const rect=this.host.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height);
      this.renderer.setSize(w,h,false);if(this.camera){this.camera.aspect=w/h;this.camera.updateProjectionMatrix()}
    }
    seeded(id) {
      let n=[...id].reduce((a,c)=>a+c.charCodeAt(0),317);
      return ()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296};
    }
    start(currentRace) {
      if(!this.init())return Promise.resolve(false);this.buildScene(currentRace);this.resize();return this.trackReadyPromise||Promise.resolve(true);
    }
    prefetch(c){if(!this.init())return;clearTimeout(this.prefetchTimer);this.prefetchTimer=setTimeout(()=>{this.loadTrackPrototype(c).catch(()=>{});this.loadEngine(c).catch(()=>{})},220)}
    buildScene(currentRace) {
      this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x7bc8ed);this.scene.fog=new THREE.Fog(0xa9d8e7,34,120);
      this.camera=new THREE.PerspectiveCamera(46,1,.1,260);this.camera.position.set(9,8,20);
      this.trainRoots={};this.cogMeshes=[];this.smoke=[];this.curves=null;this.cameraProfile=null;this.originalTrack=null;this.trackCameraReady=false;
      const hemi=new THREE.HemisphereLight(0xdff6ff,0x35542b,1.4);this.scene.add(hemi);
      const sun=new THREE.DirectionalLight(0xfff4d7,2.15);sun.position.set(-20,30,18);sun.castShadow=true;
      sun.shadow.mapSize.set(this.mobileGPU?512:1024,this.mobileGPU?512:1024);sun.shadow.camera.left=-18;sun.shadow.camera.right=18;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-18;this.sun=sun;this.sunTarget=new THREE.Object3D();this.scene.add(this.sunTarget);sun.target=this.sunTarget;this.scene.add(sun);
      this.buildScenicBackground(currentRace.p1.char);
      const beforeWorld=new Set(this.scene.children);this.buildWorld(currentRace.p1.char,currentRace.target);
      this.syntheticObjects=this.scene.children.filter(o=>!beforeWorld.has(o)&&!this.cogMeshes.includes(o));
      this.addEngine('p1',currentRace.p1.char,-2.45);
      this.addEngine('p2',currentRace.p2.char,2.45);
      this.trackReadyPromise=this.loadOriginalTrack(currentRace.p1.char,currentRace.target,currentRace.session);
    }
    buildScenicBackground(c) {
      const im=image(c.trackImage),apply=()=>{
        if(!this.scene||!im.naturalWidth)return;const cv=document.createElement('canvas');cv.width=1024;cv.height=512;
        const cx=cv.getContext('2d'),sx=im.naturalWidth*.2,sw=im.naturalWidth*.68;
        cx.fillStyle='#8fd4f2';cx.fillRect(0,0,cv.width,cv.height);cx.drawImage(im,sx,0,sw,im.naturalHeight,0,0,cv.width,cv.height);
        const tx=new THREE.CanvasTexture(cv);tx.encoding=THREE.sRGBEncoding;this.scene.background=tx;
      };if(im.complete)apply();else im.addEventListener('load',apply,{once:true});
    }
    ensureOfflineBundle(name){window.__GGT_BUNDLES=window.__GGT_BUNDLES||{};if(window.__GGT_BUNDLES[name])return window.__GGT_BUNDLES[name];const p=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=`assets/offline/${name}.js`;s.onload=()=>resolve(true);s.onerror=()=>reject(new Error(`Offline bundle failed: ${name}`));document.head.appendChild(s)});window.__GGT_BUNDLES[name]=p;return p}
    async loadJSON(url){const local=window.__GGT_OFFLINE?.[url];if(local&&typeof local==='object')return local;const response=await fetch(url);if(!response.ok)throw new Error(`${url}: ${response.status}`);return response.json()}
    async fetchGzipBytes(url) {
      const encoded=window.__GGT_OFFLINE?.[url];let packed;
      if(typeof encoded==='string'){const binary=atob(encoded),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);packed=bytes.buffer}
      else{const response=await fetch(url);if(!response.ok)throw new Error(`${url}: ${response.status}`);packed=await response.arrayBuffer()}
      if(typeof DecompressionStream==='function'){const stream=new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'));return new Uint8Array(await new Response(stream).arrayBuffer())}
      if(window.fflate)return window.fflate.gunzipSync(new Uint8Array(packed));
      throw new Error('This browser has no local gzip decoder');
    }
    async fetchGzipText(url){return new TextDecoder().decode(await this.fetchGzipBytes(url))}
    loadTrackTexture(url) {
      if(this.trackTextureCache.has(url))return this.trackTextureCache.get(url);let source=window.__GGT_OFFLINE?.[url]||url,blobURL=null;
      if(typeof source==='string'&&source.startsWith('data:')){const comma=source.indexOf(','),mime=source.slice(5,source.indexOf(';')),binary=atob(source.slice(comma+1)),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);blobURL=URL.createObjectURL(new Blob([bytes],{type:mime}));source=blobURL}
      const finish=t=>{if(blobURL)URL.revokeObjectURL(blobURL);t.encoding=THREE.sRGBEncoding;t.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());return t};
      const p=location.protocol==='file:'&&source===url?new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const t=new THREE.Texture(img);t.needsUpdate=true;resolve(finish(t))};img.onerror=reject;img.src=url}):new Promise((resolve,reject)=>this.textureLoader.load(source,t=>resolve(finish(t)),undefined,e=>{if(blobURL)URL.revokeObjectURL(blobURL);reject(e)}));
      this.trackTextureCache.set(url,p);return p;
    }
    async makeTrackMaterial(id,info) {
      const entries=Object.entries(info.textures||{}),loaded={};
      await Promise.all(entries.map(async([prop,data])=>{const textureFile=this.mobileGPU&&data.mobileFile?data.mobileFile:data.file,base=await this.loadTrackTexture(`assets/tracks/${textureFile}`),t=base.clone();t.needsUpdate=true;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(data.scale?.[0]||1,data.scale?.[1]||1);t.offset.set(data.offset?.[0]||0,data.offset?.[1]||0);loaded[prop]=t}));
      const rgba=info.colors?._Color||[1,1,1,1],color=new THREE.Color(rgba[0],rgba[1],rgba[2]),shader=info.shader||'Diffuse';
      if(shader==='FirstPass'&&loaded._Control){
        const splats=[0,1,2,3].map(i=>({i,tex:loaded[`_Splat${i}`],cfg:info.textures[`_Splat${i}`]})).filter(x=>x.tex);
        if(splats.length){
          const channels=['r','g','b','a'],uniforms={controlMap:{value:loaded._Control}};
          let decl='',blend='vec4 mixedColor=vec4(0.0); float totalWeight=0.0;';
          splats.forEach((s,j)=>{uniforms[`splat${j}`]={value:s.tex};uniforms[`scale${j}`]={value:new THREE.Vector2(...(s.cfg.scale||[1,1]))};uniforms[`offset${j}`]={value:new THREE.Vector2(...(s.cfg.offset||[0,0]))};decl+=`uniform sampler2D splat${j}; uniform vec2 scale${j}; uniform vec2 offset${j};`;
            blend+=`float w${j}=control.${channels[s.i]}; mixedColor+=texture2D(splat${j},vUv*scale${j}+offset${j})*w${j}; totalWeight+=w${j};`;});
          blend+=`if(totalWeight<0.001){mixedColor=texture2D(splat0,vUv*scale0+offset0);}else{mixedColor/=totalWeight;}`;
          const mat=new THREE.ShaderMaterial({uniforms,side:THREE.DoubleSide,vertexShader:`varying vec2 vUv; varying vec3 vNormalView; void main(){vUv=uv;vNormalView=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`uniform sampler2D controlMap;${decl}varying vec2 vUv;varying vec3 vNormalView;void main(){vec4 control=texture2D(controlMap,vUv);${blend}float light=.63+.37*max(dot(normalize(vNormalView),normalize(vec3(.35,.8,.55))),0.0);gl_FragColor=vec4(mixedColor.rgb*light,1.0);}`});mat.name=id;return mat;
        }
      }
      const main=loaded._MainTex||loaded['Water fallback']||Object.values(loaded)[0];
      if(/Water/i.test(shader)||/Water/i.test(info.sourceName||'')){const m=new THREE.MeshPhongMaterial({name:id,map:main||null,color:main?0xffffff:0x319bc0,transparent:true,opacity:.78,shininess:85,side:THREE.DoubleSide,depthWrite:false});return m}
      const alphaBlend=/Alpha-Diffuse|Blend|Transparent/i.test(shader),alphaTest=/AlphaTest/i.test(shader)?(info.floats?._Cutoff??.5):0;
      const m=new THREE.MeshLambertMaterial({name:id,map:main||null,color,transparent:alphaBlend||rgba[3]<.99,opacity:rgba[3],alphaTest,side:alphaBlend||alphaTest?THREE.DoubleSide:THREE.FrontSide,depthWrite:!alphaBlend});return m;
    }
    async loadGeometryChunk(url,mats,readyBytes=null){
      const bytes=await (readyBytes||this.fetchGzipBytes(url)),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),view=new DataView(buffer);
      if(view.getUint32(0,false)!==0x47475431)throw new Error(`Invalid GGTB chunk: ${url}`);const headerLength=view.getUint32(4,true),header=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,8,headerLength)));let offset=(8+headerLength+3)&~3;
      const positions=new Float32Array(buffer,offset,header.vertices*3);offset+=positions.byteLength;const normals=new Float32Array(buffer,offset,header.vertices*3);offset+=normals.byteLength;const uvs=new Float32Array(buffer,offset,header.vertices*2);offset+=uvs.byteLength;const indices=new Uint32Array(buffer,offset,header.indices);
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));geometry.setIndex(new THREE.BufferAttribute(indices,1));header.groups.forEach(g=>geometry.addGroup(g.start,g.count,g.material));geometry.computeBoundingSphere();
      const materials=header.materials.map(name=>mats[name]||mats.Default);const mesh=new THREE.Mesh(geometry,materials);mesh.name=header.groups[0]?.name||url;mesh.receiveShadow=true;mesh.castShadow=!this.mobileGPU&&header.materials.every(n=>!/HighEnd|LowEnd|Water/i.test(n));return mesh;
    }
    loadTrackPrototype(c) {
      if(this.trackCache.has(c.id))return this.trackCache.get(c.id);
      const offlineReady=location.protocol==='file:'?this.ensureOfflineBundle(`track-${c.id}`):Promise.resolve();
      const promise=offlineReady.then(()=>this.loadJSON(`assets/tracks/${c.id}/manifest.json`)).then(async manifest=>{
        const mats={},bar=$('#gameLoading .original-loading-bar i'),chunkBytes=manifest.objects.map(file=>this.fetchGzipBytes(`assets/tracks/${c.id}/${file}`));await Promise.all(Object.entries(manifest.materials).map(async([id,info])=>mats[id]=await this.makeTrackMaterial(id,info)));bar.style.animation='none';bar.style.width='18%';
        const root=new THREE.Group();
        const pending=manifest.objects.map((file,i)=>this.loadGeometryChunk(`assets/tracks/${c.id}/${file}`,mats,chunkBytes[i]));
        for(let i=0;i<pending.length;i++){await new Promise(resolve=>setTimeout(resolve,0));root.add(await pending[i]);bar.style.width=`${18+82*(i+1)/pending.length}%`}
        return {root,manifest};
      });this.trackCache.set(c.id,promise);return promise;
    }
    loadOriginalTrack(c,target,session) {
      const sceneAtStart=this.scene;
      return this.loadTrackPrototype(c).then(({root,manifest})=>{
        if(!race||race.session!==session||this.scene!==sceneAtStart)return;
        const instance=root.clone(true);instance.name=`Original ${c.track} Unity scene`;this.scene.add(instance);this.originalTrack=instance;
        const curveFrom=points=>new PolylineRoute(points);
        this.curves={p1:curveFrom(manifest.lane1),p2:curveFrom(manifest.lane2)};this.cameraProfile=manifest.camera||{offset:[16,11.5,15],lookOffset:[1.5,1.2,0],fov:60};this.camera.fov=this.cameraProfile.fov||60;this.camera.updateProjectionMatrix();
        // Train.MoveBy in the APK consumes real path units. Replace the temporary
        // fallback length with the recovered Unity route length, which removes the
        // half-speed feeling caused by normalising every course to 720 units.
        const exactTarget=(this.curves.p1.getLength()+this.curves.p2.getLength())*.5;
        race.target=exactTarget;race.cogMarks=[.25,.56,.84].map(x=>exactTarget*x);this.syntheticObjects.forEach(o=>o.visible=false);
        this.cogMeshes.forEach((g,i)=>{g.userData.mark=race.cogMarks[i];const t=clamp(g.userData.mark/exactTarget,0,1),p=this.curves.p1.getPointAt(t);g.position.copy(p);g.position.y+=2.1});updateRaceControls();
      }).catch(err=>console.warn('Original Unity track fallback:',c.id,err));
    }
    buildWorld(c,target) {
      const colors={thomas:0x4d8739,percy:0x3b7b48,james:0x58634f,emily:0x806444,toby:0x50743a};
      const groundMat=new THREE.MeshStandardMaterial({color:colors[c.id],roughness:.98});
      const ground=new THREE.Mesh(new THREE.PlaneGeometry(90,240),groundMat);ground.rotation.x=-Math.PI/2;ground.position.set(0,-.08,-92);ground.receiveShadow=true;this.scene.add(ground);
      const ballastMat=new THREE.MeshStandardMaterial({color:0x8a7765,roughness:1});
      const railMat=new THREE.MeshStandardMaterial({color:0xcbd3d5,metalness:.8,roughness:.28});
      const sleeperMat=new THREE.MeshStandardMaterial({color:0x493225,roughness:.9});
      [-2.45,2.45].forEach(lane=>{
        const bed=new THREE.Mesh(new THREE.BoxGeometry(4.1,.16,220),ballastMat);bed.position.set(lane,.02,-91);bed.receiveShadow=true;this.scene.add(bed);
        [-1.05,1.05].forEach(off=>{const rail=new THREE.Mesh(new THREE.BoxGeometry(.13,.13,220),railMat);rail.position.set(lane+off,.2,-91);rail.castShadow=true;this.scene.add(rail)});
        const geom=new THREE.BoxGeometry(3.6,.13,.28),sleepers=new THREE.InstancedMesh(geom,sleeperMat,112),m=new THREE.Matrix4();
        for(let i=0;i<112;i++){m.makeTranslation(lane,.09,20-i*2);sleepers.setMatrixAt(i,m)}sleepers.receiveShadow=true;this.scene.add(sleepers);
      });
      this.buildScenery(c);
      const finishZ=-target*this.worldScale;this.buildFinish(finishZ);
      [180,405,625].forEach(mark=>this.buildCog(-2.45,2.2,-mark*this.worldScale,mark));
    }
    buildScenery(c) {
      const rnd=this.seeded(c.id);for(let i=0;i<42;i++){
        const side=i%2?-1:1,x=side*(7+rnd()*16),z=13-i*3.6-rnd()*4,s=.65+rnd()*1.25;
        if(c.id==='james')this.scene.add(this.makeContainer(x,z,s,i));
        else if(c.id==='emily')this.scene.add(this.makeRock(x,z,s));
        else if(c.id==='toby'&&i%4===0)this.scene.add(this.makeTower(x,z,s));
        else this.scene.add(this.makeTree(x,z,s,c.id==='percy'));
      }
    }
    makeTree(x,z,s,round=false) {
      const g=new THREE.Group(),trunk=new THREE.Mesh(new THREE.CylinderGeometry(.18*s,.25*s,1.5*s,7),new THREE.MeshStandardMaterial({color:0x654223,roughness:1}));trunk.position.y=.7*s;trunk.castShadow=true;g.add(trunk);
      const mat=new THREE.MeshStandardMaterial({color:round?0x277340:0x326b31,roughness:1});
      const crown=new THREE.Mesh(round?new THREE.SphereGeometry(1.05*s,8,6):new THREE.ConeGeometry(1.25*s,3.1*s,8),mat);crown.position.y=round?2.05*s:2.25*s;crown.castShadow=true;g.add(crown);g.position.set(x,0,z);return g;
    }
    makeRock(x,z,s) {const m=new THREE.Mesh(new THREE.DodecahedronGeometry(1.2*s,0),new THREE.MeshStandardMaterial({color:0x765d4e,roughness:1}));m.scale.y=.75;m.position.set(x,.65*s,z);m.rotation.set(Math.random(),Math.random(),Math.random());m.castShadow=true;return m}
    makeContainer(x,z,s,i) {const colors=[0xc53b35,0x2a708c,0xd59b2b,0x507b47],m=new THREE.Mesh(new THREE.BoxGeometry(2.5*s,1.35*s,1.25*s),new THREE.MeshStandardMaterial({color:colors[i%4],roughness:.75,metalness:.12}));m.position.set(x,.7*s,z);m.castShadow=true;return m}
    makeTower(x,z,s) {const g=new THREE.Group(),stone=new THREE.MeshStandardMaterial({color:0x9c8b72,roughness:1}),body=new THREE.Mesh(new THREE.CylinderGeometry(.9*s,1*s,3.3*s,8),stone);body.position.y=1.65*s;body.castShadow=true;g.add(body);const roof=new THREE.Mesh(new THREE.ConeGeometry(1.15*s,1.6*s,8),new THREE.MeshStandardMaterial({color:0x5a3a32,roughness:1}));roof.position.y=4*s;roof.castShadow=true;g.add(roof);g.position.set(x,0,z);return g}
    buildFinish(z) {
      const mat=new THREE.MeshStandardMaterial({color:0xf7f3e9,roughness:.65}),dark=new THREE.MeshStandardMaterial({color:0x263746,roughness:.7});
      [-5.3,5.3].forEach(x=>{const post=new THREE.Mesh(new THREE.BoxGeometry(.38,6,.38),mat);post.position.set(x,3,z);post.castShadow=true;this.scene.add(post)});
      const bar=new THREE.Mesh(new THREE.BoxGeometry(11,.42,.42),dark);bar.position.set(0,5.8,z);bar.castShadow=true;this.scene.add(bar);
      const cv=document.createElement('canvas');cv.width=512;cv.height=64;const cx=cv.getContext('2d');for(let y=0;y<2;y++)for(let x=0;x<16;x++){cx.fillStyle=(x+y)%2?'#fff':'#172936';cx.fillRect(x*32,y*32,32,32)}
      const banner=new THREE.Mesh(new THREE.PlaneGeometry(10.5,1.3),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),side:THREE.DoubleSide}));banner.position.set(0,5.1,z+.23);this.scene.add(banner);
    }
    buildCog(x,y,z,mark) {
      const shape=new THREE.Shape();for(let i=0;i<32;i++){const a=i*Math.PI/16,r=i%2?1:.78;const px=Math.cos(a)*r,py=Math.sin(a)*r;i?shape.lineTo(px,py):shape.moveTo(px,py)}shape.closePath();
      const hole=new THREE.Path();hole.absarc(0,0,.28,0,Math.PI*2,true);shape.holes.push(hole);
      const gear=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.3,bevelEnabled:true,bevelSize:.07,bevelThickness:.07,bevelSegments:1}),new THREE.MeshStandardMaterial({color:0xffc400,metalness:.55,roughness:.28,emissive:0x7a4500,emissiveIntensity:.18}));
      gear.position.set(x,y,z);gear.castShadow=true;gear.userData.mark=mark;this.scene.add(gear);this.cogMeshes.push(gear);
    }
    makeSmokeTexture() {const cv=document.createElement('canvas');cv.width=cv.height=64;const c=cv.getContext('2d'),g=c.createRadialGradient(32,32,2,32,32,30);g.addColorStop(0,'rgba(255,255,255,.9)');g.addColorStop(.45,'rgba(235,240,239,.55)');g.addColorStop(1,'rgba(220,230,230,0)');c.fillStyle=g;c.fillRect(0,0,64,64);return new THREE.CanvasTexture(cv)}
    placeholder(c) {
      const g=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color:c.color,roughness:.52,metalness:.08}),black=new THREE.MeshStandardMaterial({color:0x17222b,roughness:.62});
      const boiler=new THREE.Mesh(new THREE.CylinderGeometry(1.05,1.05,3.8,18),mat);boiler.rotation.x=Math.PI/2;boiler.position.set(0,1.55,.4);g.add(boiler);
      const cab=new THREE.Mesh(new THREE.BoxGeometry(2.35,2.8,2.2),mat);cab.position.set(0,1.55,-2);g.add(cab);
      const face=new THREE.Mesh(new THREE.CylinderGeometry(.87,.87,.26,24),new THREE.MeshStandardMaterial({color:0xd8d0c6,roughness:.75}));face.rotation.x=Math.PI/2;face.position.set(0,1.55,2.4);g.add(face);
      [-.95,.95].forEach(x=>[-1.8,.2,1.7].forEach(z=>{const w=new THREE.Mesh(new THREE.CylinderGeometry(.58,.58,.34,16),black);w.rotation.z=Math.PI/2;w.position.set(x,.55,z);g.add(w)}));g.traverse(o=>{if(o.isMesh)o.castShadow=true});return g;
    }
    addEngine(key,c,laneX) {
      const root=new THREE.Group(),holder=new THREE.Group();root.add(holder);holder.add(this.placeholder(c));
      const glow=new THREE.PointLight(c.color,0,9);glow.position.set(0,2,1);root.add(glow);root.userData={holder,glow};root.position.set(laneX,.18,0);this.scene.add(root);this.trainRoots[key]=root;
      this.loadEngine(c).then(proto=>{
        if(!this.trainRoots[key]||this.trainRoots[key]!==root)return;
        holder.clear();const instance=proto.clone(true);holder.add(instance);root.userData.eyes=[];root.userData.eyelids=[];
        instance.traverse(part=>{if(part.userData?.isEye)root.userData.eyes.push(part);if(part.userData?.isEyelid)root.userData.eyelids.push(part)});
      }).catch(err=>console.warn('Engine model fallback:',c.id,err));
    }
    loadEngine(c) {
      if(this.modelCache.has(c.id))return this.modelCache.get(c.id);
      const modelReady=location.protocol==='file:'?this.ensureOfflineBundle(`model-${c.id}`):Promise.resolve();
      const promise=modelReady.then(()=>Promise.all([
        this.fetchGzipText(`assets/models/${c.id}.obj.gz`).then(text=>this.loader.parse(text)),
        this.loadTrackTexture(`assets/textures3d/${c.id}.jpg`)
      ])).then(([obj,texture])=>{
        texture.encoding=THREE.sRGBEncoding;texture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
        // Unity material is AlphaTest-Diffuse. Lambert lighting and the recovered
        // per-engine tint reproduce that legacy mobile shader more closely than PBR.
        const tint={thomas:0xd9d9d9,james:0xcacaca}[c.id]||0xffffff;
        const material=new THREE.MeshLambertMaterial({map:texture,color:tint,alphaTest:.5,side:THREE.DoubleSide});
        obj.traverse(child=>{
          if(!child.isMesh)return;child.material=material;child.castShadow=true;child.receiveShadow=true;
          // The APK stores each eyeball as its own mesh. Give it a local pivot so the
          // original textured pupil can glance around during the race.
          if(/^Eye_(Right|Left|Righht|left)/i.test(child.name)){
            child.geometry.computeBoundingBox();const eyeCenter=child.geometry.boundingBox.getCenter(new THREE.Vector3());
            child.geometry.translate(-eyeCenter.x,-eyeCenter.y,-eyeCenter.z);child.position.copy(eyeCenter);child.userData.isEye=true;
          }else if(/^EyeLids/i.test(child.name)){
            child.geometry.computeBoundingBox();const lidCenter=child.geometry.boundingBox.getCenter(new THREE.Vector3());
            child.geometry.translate(-lidCenter.x,-lidCenter.y,-lidCenter.z);child.position.copy(lidCenter);child.userData.isEyelid=true;
          }
        });
        // The prefab hierarchy (including the separate left eye, right eye and eyelid
        // transforms) is baked into the OBJ. Convert the prefab axes once here; the
        // race root then aligns the resulting +Z nose axis to the recovered route tangent.
        obj.rotation.y=Math.PI/2;obj.updateMatrixWorld(true);
        const box=new THREE.Box3().setFromObject(obj),center=box.getCenter(new THREE.Vector3());
        obj.position.x-=center.x;obj.position.y-=box.min.y;obj.position.z-=center.z;
        const pivot=new THREE.Group();pivot.add(obj);return pivot;
      });this.modelCache.set(c.id,promise);return promise;
    }
    spawnSmoke(p) {
      const root=this.trainRoots[p.who];if(!root)return;const mat=new THREE.SpriteMaterial({map:this.smokeTexture,transparent:true,depthWrite:false,color:0xffffff,opacity:.65});const sprite=new THREE.Sprite(mat);
      sprite.position.set(root.position.x+(Math.random()-.5)*.3,root.position.y+3.35,root.position.z+.25);sprite.scale.set(.7,.7,.7);this.scene.add(sprite);this.smoke.push({sprite,age:0,drift:p.drift*.002});p.spawned3D=true;
    }
    render(currentRace,time,dt) {
      if(!this.active||!this.scene||!this.renderer)return;
      const center=(currentRace.p1.distance+currentRace.p2.distance)/2,cz=-center*this.worldScale;
      if(this.curves){
        ['p1','p2'].forEach((key,i)=>{
          const r=currentRace[key],root=this.trainRoots[key],curve=this.curves[key];if(!root||!curve)return;
          const t=clamp(r.distance/currentRace.target,0,1),p=curve.getPointAt(t),tangent=curve.getTangentAt(t).normalize();
          root.position.copy(p);root.position.y+=.22;root.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),tangent);
          root.userData.holder.position.y=Math.sin(time*10+i)*Math.min(.08,r.velocity*.002);root.userData.holder.rotation.z=Math.sin(time*8+i)*Math.min(.015,r.velocity*.0003);root.userData.glow.intensity=r.boostFx*7;
          (root.userData.eyes||[]).forEach((eye,j)=>{eye.rotation.y=Math.sin(time*.85+i*.9)*.085;eye.rotation.z=Math.sin(time*.47+j)*.025});const bp=(time+i*1.1)%4.2,blink=bp<.14?Math.sin(bp/.14*Math.PI):0;(root.userData.eyelids||[]).forEach(lid=>lid.scale.y=1+blink*1.35);
        });
        const cameraDistance=currentRace.mode==='one'?currentRace.p1.distance:center,t=clamp(cameraDistance/currentRace.target,0,1),a=this.curves.p1.getPointAt(t),b=this.curves.p2.getPointAt(t),focus=a.clone().add(b).multiplyScalar(.5),forward=this.curves.p1.getTangentAt(t).normalize(),up=new THREE.Vector3(0,1,0),right=new THREE.Vector3().crossVectors(forward,up).normalize();
        // Rotate the recovered Unity SideViewCamera offset with the current rail tangent.
        const cp=this.cameraProfile||{offset:[16,11.5,15],lookOffset:[1.5,1.2,0]},co=cp.offset,cl=cp.lookOffset;
        const desired=focus.clone().addScaledVector(forward,co[0]).addScaledVector(up,co[1]).addScaledVector(right,co[2]),look=focus.clone().addScaledVector(forward,cl[0]).addScaledVector(up,cl[1]).addScaledVector(right,cl[2]);
        this.sun.position.copy(focus).add(new THREE.Vector3(-20,30,18));this.sunTarget.position.copy(focus);
        this.camera.position.copy(desired);this.trackCameraReady=true;this.camera.lookAt(look);
      }else{
        ['p1','p2'].forEach((key,i)=>{const r=currentRace[key],root=this.trainRoots[key];if(!root)return;root.position.z=-r.distance*this.worldScale;root.position.y=.18+Math.sin(time*10+i)*Math.min(.08,r.velocity*.002);root.rotation.set(0,Math.PI,Math.sin(time*8+i)*Math.min(.015,r.velocity*.0003));root.userData.glow.intensity=r.boostFx*7;(root.userData.eyes||[]).forEach((eye,j)=>{eye.rotation.y=Math.sin(time*.85+i*.9)*.085;eye.rotation.z=Math.sin(time*.47+j)*.025});const bp=(time+i*1.1)%4.2,blink=bp<.14?Math.sin(bp/.14*Math.PI):0;(root.userData.eyelids||[]).forEach(lid=>lid.scale.y=1+blink*1.35)});
        this.camera.position.set(9.2,8.2,cz+20);this.camera.lookAt(0,1.7,cz-10);
      }
      this.cogMeshes.forEach((g,i)=>{g.visible=!currentRace.collected.has(g.userData.mark);g.rotation.z=time*2.4+i;g.rotation.y=Math.sin(time+i)*.22});
      currentRace.particles.forEach(p=>{if(!p.spawned3D)this.spawnSmoke(p)});
      this.smoke.forEach(s=>{s.age+=dt;s.sprite.position.y+=dt*1.9;s.sprite.position.x+=s.drift;s.sprite.position.z+=dt*.35;s.sprite.scale.multiplyScalar(1+dt*.75);s.sprite.material.opacity=Math.max(0,.68-s.age*.55)});
      this.smoke=this.smoke.filter(s=>{if(s.age<1.22)return true;this.scene.remove(s.sprite);s.sprite.material.dispose();return false});
      currentRace.particles=currentRace.particles.filter(p=>!p.spawned3D);
      this.renderer.render(this.scene,this.camera);
    }
  }
  const threeRace=new ThreeRaceView($('#threeRace'));requestTrackPrefetch=c=>threeRace.prefetch(c);
  window.addEventListener('resize',()=>threeRace.resize());

  class ThreeResultView {
    constructor(host){this.host=host;this.renderer=null;this.scene=null;this.camera=null;this.model=null;this.eyes=[];this.eyelids=[];this.active=false;this.raf=0}
    init(){if(this.renderer)return;this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:!threeRace.mobileGPU,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(threeRace.mobileGPU?1:2,devicePixelRatio||1));this.renderer.shadowMap.enabled=!threeRace.mobileGPU;this.renderer.outputEncoding=THREE.sRGBEncoding;this.host.appendChild(this.renderer.domElement)}
    resize(){if(!this.renderer)return;const r=this.host.getBoundingClientRect();this.renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);if(this.camera){this.camera.aspect=Math.max(1,r.width)/Math.max(1,r.height);this.camera.updateProjectionMatrix()}}
    start(c){this.init();this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(34,1,.1,100);this.camera.position.set(7,5.2,10);this.camera.lookAt(0,1.35,0);this.scene.add(new THREE.HemisphereLight(0xe8f8ff,0x3d5431,1.55));const sun=new THREE.DirectionalLight(0xfff1d2,2);sun.position.set(-5,10,8);sun.castShadow=true;this.scene.add(sun);const floor=new THREE.Mesh(new THREE.CircleGeometry(5.2,48),new THREE.ShadowMaterial({opacity:.24}));floor.rotation.x=-Math.PI/2;floor.position.y=-.05;floor.receiveShadow=true;this.scene.add(floor);this.model=null;this.eyes=[];this.eyelids=[];this.active=true;this.resize();$('#resultScreen').classList.remove('result-3d-ready');
      threeRace.loadEngine(c).then(proto=>{if(!this.active)return;this.model=proto.clone(true);this.model.rotation.y=-.5;this.model.traverse(x=>{if(x.userData?.isEye)this.eyes.push(x);if(x.userData?.isEyelid)this.eyelids.push(x)});this.scene.add(this.model);$('#resultScreen').classList.add('result-3d-ready')}).catch(()=>{});if(!this.raf)this.raf=requestAnimationFrame(t=>this.tick(t))}
    tick(ms){this.raf=requestAnimationFrame(t=>this.tick(t));if(!this.active||!this.scene||state.currentScreen!=='resultScreen')return;const t=ms/1000;if(this.model){this.model.position.y=.08+Math.sin(t*2.2)*.08;this.model.rotation.y=-.5+Math.sin(t*.8)*.08;this.eyes.forEach((e,i)=>{e.rotation.y=Math.sin(t*.9+i)*.09;e.rotation.z=Math.sin(t*.55+i)*.025});const p=t%3.8,b=p<.15?Math.sin(p/.15*Math.PI):0;this.eyelids.forEach(l=>l.scale.y=1+b*1.35)}this.renderer.render(this.scene,this.camera)}
    stop(){this.active=false;$('#resultScreen').classList.remove('result-3d-ready')}
  }
  const result3D=new ThreeResultView($('#resultThree'));window.addEventListener('resize',()=>result3D.resize());

  /* Race simulation — follows the APK's Player.Update model:
     velocity += tap acceleration (9), distance += velocity*dt, velocity loses velocity*dt each frame.
     Power-up boost is 18 with a 3-second cooldown (from Configurations). */
  const canvas = $('#raceCanvas');
  const ctx = canvas.getContext('2d', { alpha:false });
  let canvasW=0, canvasH=0, dpr=1;
  function resizeCanvas() {
    const r=canvas.getBoundingClientRect(); dpr=Math.min(2,window.devicePixelRatio||1); canvasW=Math.max(1,r.width);canvasH=Math.max(1,r.height);
    canvas.width=Math.round(canvasW*dpr);canvas.height=Math.round(canvasH*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  window.addEventListener('resize',resizeCanvas);

  function makeRacer(charIndex, human=true) {
    return { char:CHARACTERS[charIndex], human, distance:0, velocity:0, acceleration:0, boostReady:true, boostCooldown:0, boostFx:0, taps:0,
      inputDeltas:[.5,.5,.5,.5,.5],inputIndex:0,lastInputTime:0 };
  }

  function clearCountdown() { countdownTimers.forEach(clearTimeout); countdownTimers=[]; $('#countdown').textContent=''; }
  function schedule(ms, fn) { const id=setTimeout(fn,ms);countdownTimers.push(id); }
  function countdownPop(text) {
    const el=$('#countdown'); el.textContent=text; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }

  function startRace() {
    result3D.stop();clearCountdown(); raceSession++; const session=raceSession;
    const opponentIndex = state.mode === 'one' ? (state.p1 + 1 + Math.floor(Math.random()*3)) % CHARACTERS.length : state.p2;
    race = {
      session, mode:state.mode, p1:makeRacer(state.p1,true), p2:makeRacer(opponentIndex,state.mode==='two'),
      target:720, running:false, paused:false, over:false, elapsed:0, last:performance.now(), aiTimer:.32,
      cogs:0, cogMarks:[180,405,625], collected:new Set(), particles:[], lastAccelSound:0, winner:null
    };
    $('#raceScreen').classList.toggle('two-player', state.mode==='two');
    $('#p1Marker img').src=race.p1.char.portraitImage;$('#p1Marker img').alt=race.p1.char.name;
    $('#p2Marker img').src=race.p2.char.portraitImage;$('#p2Marker img').alt=race.p2.char.name;
    $('#raceCogCount').textContent='0'; updateRaceControls();
    showScreen('raceScreen'); resizeCanvas(); const trackReady=threeRace.start(race); setMusic('race');
    if (!raceFrame) raceFrame=requestAnimationFrame(raceLoop);
    const loading=$('#gameLoading'),loadingBar=$('.original-loading-bar i',loading);loadingBar.style.animation='';loadingBar.style.width='';loading.hidden=false;
    Promise.race([trackReady,new Promise(resolve=>setTimeout(resolve,12000))]).then(()=>{
      if(race?.session!==session)return;loading.hidden=true;
      schedule(250,()=>{if(race?.session===session){countdownPop('3');sfx('start',.85)}});
      schedule(950,()=>{if(race?.session===session)countdownPop('2')});
      schedule(1650,()=>{if(race?.session===session)countdownPop('1')});
      schedule(2350,()=>{
        if(race?.session!==session)return;countdownPop('GO!');sfx('go',.95);race.running=true;race.last=performance.now();
        announce(state.mode==='one'?'TAP FAST TO BUILD SPEED!':'P1: SPACE / P2: ENTER',1700);
      });
    });
  }

  function announce(text, duration=1000) {
    const el=$('#raceAnnouncement');el.textContent=text;el.classList.add('show');
    const session=race?.session;setTimeout(()=>{if(race?.session===session)el.classList.remove('show')},duration);
  }

  function accelerate(who, visualButton=null) {
    if(!race?.running||race.paused||race.over)return;
    const r=race[who]; if(!r?.human)return;
    const inputNow=performance.now()/1000;
    if(r.lastInputTime){r.inputDeltas[r.inputIndex%5]=clamp(inputNow-r.lastInputTime,.04,2);r.inputIndex++}r.lastInputTime=inputNow;
    r.acceleration+=9;r.taps++;
    race.particles.push({who,age:0,size:12+Math.random()*12,drift:(Math.random()-.5)*18});
    if(performance.now()-race.lastAccelSound>105){sfx(`accelerate-${1+Math.floor(Math.random()*5)}`,.42);race.lastAccelSound=performance.now()}
    const btn=visualButton||$(`.steam-control[data-player="${who}"]`);btn?.classList.add('pressed');setTimeout(()=>btn?.classList.remove('pressed'),85);
  }

  function useBoost(who) {
    if(!race?.running||race.paused||race.over)return;
    const r=race[who];if(!r||!r.human||!r.boostReady)return;
    r.acceleration+=18;r.boostReady=false;r.boostCooldown=3;r.boostFx=.7;
    sfx('boost',.72);sfx(`boost-${r.char.id}`,.88);announce(`${r.char.name.toUpperCase()} — ${r.char.boost.toUpperCase()}!`,1150);
    const flash=document.createElement('i');flash.className='boost-flash';$('#raceScreen').append(flash);setTimeout(()=>flash.remove(),500);
    updateRaceControls();
  }

  $$('.steam-control').forEach(b=>b.addEventListener('pointerdown',e=>{e.preventDefault();accelerate(b.dataset.player,b)}));
  $$('.boost-control').forEach(b=>b.addEventListener('pointerdown',e=>{e.preventDefault();useBoost(b.dataset.player)}));
  window.addEventListener('keydown', e => {
    if(state.currentScreen!=='raceScreen'||e.repeat)return;
    if(['Space','ArrowRight','ArrowDown'].includes(e.code))e.preventDefault();
    if(e.code==='Space'||e.code==='KeyA')accelerate('p1');
    else if(e.code==='KeyS'||e.code==='KeyW')useBoost('p1');
    else if(e.code==='Enter'||e.code==='KeyL'||e.code==='ArrowRight')accelerate('p2');
    else if(e.code==='KeyK'||e.code==='ArrowDown')useBoost('p2');
    else if(e.code==='Escape')togglePause(true);
  });

  function updateRacer(r,dt) {
    r.velocity += r.acceleration; r.acceleration=0;
    r.distance += r.velocity*dt;
    r.velocity = Math.max(0,r.velocity-r.velocity*dt);
    r.boostFx=Math.max(0,r.boostFx-dt);
    if(!r.boostReady){r.boostCooldown-=dt;if(r.boostCooldown<=0){r.boostCooldown=0;r.boostReady=true}}
  }
  function updateAI(dt) {
    race.aiTimer-=dt;if(race.aiTimer>0)return;
    const ai=race.p2,human=race.p1,lead=human.distance-ai.distance;
    ai.acceleration+=9;
    // Assembly-CSharp ComputerPlayer samples HumanPlayer's five recent input
    // intervals and never bursts faster than the configured ComputerMinSpeed (.25s).
    const humanRate=human.inputDeltas.reduce((a,b)=>a+b,0)/human.inputDeltas.length;
    race.aiTimer=lead>0?Math.max(.25,humanRate):(.25*(.5+Math.random()));
    if(ai.boostReady&&(lead>18||Math.random()<.12)){ai.acceleration+=18;ai.boostReady=false;ai.boostCooldown=3;ai.boostFx=.7}
  }

  function updateRace(dt) {
    if(!race.running||race.paused||race.over)return;
    race.elapsed+=dt;if(race.mode==='one')updateAI(dt);
    updateRacer(race.p1,dt);updateRacer(race.p2,dt);
    race.cogMarks.forEach(mark=>{
      if(race.p1.distance>=mark&&!race.collected.has(mark)){race.collected.add(mark);race.cogs++;$('#raceCogCount').textContent=race.cogs;announce('GOLDEN COGWHEEL! +1',700)}
    });
    updateRaceControls();
    if(race.p1.distance>=race.target||race.p2.distance>=race.target){
      race.over=true;race.running=false;race.winner=race.p1.distance>=race.p2.distance?'p1':'p2';
      const session=race.session;setTimeout(()=>{if(race?.session===session)showResult()},800);
    }
  }

  function updateRaceControls() {
    if(!race)return;
    ['p1','p2'].forEach(who=>{
      const b=$(`.boost-control[data-player="${who}"]`),r=race[who];if(!b||!r)return;
      b.classList.toggle('ready',r.boostReady);$('i',b).style.height=`${r.boostReady?100:clamp(1-r.boostCooldown/3,0,1)*100}%`;
    });
    $('#p1Marker').style.left=`${clamp(race.p1.distance/race.target*91,1,91)}%`;
    $('#p2Marker').style.left=`${clamp(race.p2.distance/race.target*91,1,91)}%`;
  }

  function raceLoop(now) {
    raceFrame=requestAnimationFrame(raceLoop);
    if(!race){drawIdle();return}
    const dt=Math.min(.05,Math.max(0,(now-race.last)/1000));race.last=now;
    updateRace(dt);if(threeRace.active)threeRace.render(race,now/1000,dt);else drawRace(now/1000);
  }

  function drawCover(im,sx=0,sy=0,sw=im.naturalWidth,sh=im.naturalHeight) {
    if(!im.complete||!im.naturalWidth)return false;
    const scale=Math.max(canvasW/sw,canvasH/sh),dw=sw*scale,dh=sh*scale;
    ctx.drawImage(im,sx,sy,sw,sh,(canvasW-dw)/2,(canvasH-dh)/2,dw,dh);return true;
  }
  function drawIdle(){ctx.fillStyle='#72c5eb';ctx.fillRect(0,0,canvasW,canvasH)}

  function drawTrackLane(y,scroll,accent) {
    const h=canvasH,railGap=clamp(h*.035,10,25),ballast=clamp(h*.085,25,62);
    const g=ctx.createLinearGradient(0,y-ballast/2,0,y+ballast/2);g.addColorStop(0,'rgba(111,92,76,.85)');g.addColorStop(.5,'rgba(202,185,157,.95)');g.addColorStop(1,'rgba(88,74,65,.9)');
    ctx.fillStyle=g;ctx.fillRect(0,y-ballast/2,canvasW,ballast);
    ctx.fillStyle='#6e452b';const spacing=clamp(canvasW*.055,35,76),off=-(scroll*2.7)%spacing;
    for(let x=off-spacing;x<canvasW+spacing;x+=spacing){ctx.save();ctx.translate(x,y);ctx.rotate(-.08);ctx.fillRect(-5,-ballast*.46,10,ballast*.92);ctx.restore()}
    [y-railGap,y+railGap].forEach(ry=>{ctx.strokeStyle='#392a23';ctx.lineWidth=clamp(h*.016,5,12);ctx.beginPath();ctx.moveTo(0,ry+3);ctx.lineTo(canvasW,ry+3);ctx.stroke();ctx.strokeStyle='#e9e6df';ctx.lineWidth=clamp(h*.006,2,5);ctx.beginPath();ctx.moveTo(0,ry);ctx.lineTo(canvasW,ry);ctx.stroke()});
    ctx.fillStyle=accent;ctx.fillRect(0,y+ballast*.46,canvasW,3);
  }

  function drawGear(x,y,size,alpha=1){
    ctx.save();ctx.translate(x,y);ctx.globalAlpha=alpha;ctx.fillStyle='#ffd329';ctx.strokeStyle='#fff3a1';ctx.lineWidth=3;
    ctx.beginPath();for(let i=0;i<16;i++){const a=i*Math.PI/8,r=i%2?size*.72:size;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#b97900';ctx.beginPath();ctx.arc(0,0,size*.3,0,Math.PI*2);ctx.fill();ctx.restore();
  }

  function drawRacer(who,laneY,centerDist,time) {
    const r=race[who],im=image(r.char.trainImage);if(!im.complete)return;
    const diff=r.distance-centerDist,x=clamp(canvasW*.5+diff*2.2,canvasW*.14,canvasW*.82);
    const maxH=canvasH*(who==='p1'?.31:.27),scale=Math.min(maxH/im.naturalHeight,canvasW*.29/im.naturalWidth);
    const w=im.naturalWidth*scale,h=im.naturalHeight*scale,bob=Math.sin(time*12+r.distance*.05)*Math.min(3,r.velocity*.05);
    if(r.boostFx>0){ctx.save();ctx.globalAlpha=r.boostFx/.7;const grad=ctx.createRadialGradient(x,laneY,4,x,laneY,w*.75);grad.addColorStop(0,'rgba(255,255,190,.8)');grad.addColorStop(1,'rgba(255,214,0,0)');ctx.fillStyle=grad;ctx.beginPath();ctx.arc(x,laneY,w*.8,0,Math.PI*2);ctx.fill();ctx.restore()}
    ctx.save();ctx.globalAlpha=.35;ctx.fillStyle='#001a28';ctx.beginPath();ctx.ellipse(x,laneY+8,w*.45,h*.11,0,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.save();ctx.translate(x,laneY-h*.68+bob);ctx.rotate(Math.sin(time*7)*Math.min(.012,r.velocity*.00025));ctx.drawImage(im,-w/2,-h/2,w,h);ctx.restore();
    for(let i=0;i<3&&r.velocity>8;i++){const age=(time*(.55+r.velocity*.003)+i/3)%1;ctx.globalAlpha=(1-age)*.28;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x-w*.14-age*35,laneY-h*.9-age*42,6+age*15,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;
  }

  function drawRace(time) {
    if(!canvasW||!canvasH)resizeCanvas();const c=race.p1.char,bg=image(c.trackImage);
    ctx.fillStyle='#75c8ee';ctx.fillRect(0,0,canvasW,canvasH);
    if(bg.complete&&bg.naturalWidth){
      const sx=bg.naturalWidth*.22,sw=bg.naturalWidth*.68;
      ctx.save();ctx.filter='saturate(.9) contrast(1.05) blur(1px)';drawCover(bg,sx,0,sw,bg.naturalHeight);ctx.restore();
    }
    const horizon=canvasH*.43,ground=ctx.createLinearGradient(0,horizon,0,canvasH);ground.addColorStop(0,'rgba(64,132,53,.78)');ground.addColorStop(.42,'rgba(45,112,43,.92)');ground.addColorStop(1,'#236b36');ctx.fillStyle=ground;ctx.fillRect(0,horizon,canvasW,canvasH-horizon);
    ctx.fillStyle='rgba(255,255,255,.28)';for(let i=0;i<6;i++){const x=((i*260-race.p1.distance*.45)%(canvasW+300))-100;ctx.beginPath();ctx.ellipse(x,horizon-35-(i%2)*22,75,16,0,0,Math.PI*2);ctx.fill()}
    const p2Y=canvasH*.59,p1Y=canvasH*.81,center=(race.p1.distance+race.p2.distance)/2;
    drawTrackLane(p2Y,center,c.color);drawTrackLane(p1Y,center,c.dark);
    race.cogMarks.forEach(mark=>{if(!race.collected.has(mark)){const x=canvasW*.5+(mark-center)*2.2;if(x>-40&&x<canvasW+40)drawGear(x,p1Y-canvasH*.11,clamp(canvasH*.026,10,22),.92)}});
    if(race.p2.distance>race.p1.distance){drawRacer('p1',p1Y,center,time);drawRacer('p2',p2Y,center,time)}else{drawRacer('p2',p2Y,center,time);drawRacer('p1',p1Y,center,time)}
    race.particles.forEach(p=>p.age+=1/60);race.particles=race.particles.filter(p=>p.age<1);
  }

  /* Pause and results */
  function togglePause(force=false) {
    if(!race||race.over||state.currentScreen!=='raceScreen')return;
    race.paused=force?!race.paused:!race.paused;
    $('#pauseModal').hidden=!race.paused;
    if(race.paused)pauseMusic();else{race.last=performance.now();resumeMusic()}
  }
  $('#pauseButton').addEventListener('click',()=>togglePause());
  $('#resumeButton').addEventListener('click',()=>{tapSound();togglePause()});
  $('#restartButton').addEventListener('click',()=>{tapSound();$('#pauseModal').hidden=true;startRace()});
  $('#quitRaceButton').addEventListener('click',()=>{tapSound();quitRace()});
  function quitRace(){clearCountdown();raceSession++;race=null;$('#pauseModal').hidden=true;$('#gameLoading').hidden=true;setMusic('menu');updateStats();showScreen('modeScreen')}

  function makeConfetti(active=true) {
    const wrap=$('#confetti');wrap.innerHTML='';if(!active||!save.settings.motion)return;
    const colors=['#ffd329','#e82e39','#13a9e7','#20b762','#fff','#8d4bb0'];
    for(let i=0;i<64;i++){const bit=document.createElement('i');bit.style.left=`${Math.random()*100}%`;bit.style.background=colors[i%colors.length];bit.style.setProperty('--fall',`${2.2+Math.random()*2.2}s`);bit.style.setProperty('--delay',`${-Math.random()*3}s`);bit.style.setProperty('--drift',`${(Math.random()-.5)*150}px`);bit.style.setProperty('--rot',`${Math.random()*360}deg`);wrap.append(bit)}
  }

  function formatTime(seconds){const m=Math.floor(seconds/60),s=Math.floor(seconds%60),t=Math.floor((seconds%1)*10);return `${m}:${String(s).padStart(2,'0')}.${t}`}
  function showResult() {
    if(!race)return;clearCountdown();const humanWon=race.winner==='p1',winner=race[race.winner],c=winner.char;
    const key=race.p1.char.id;
    if(race.mode==='one'){
      if(humanWon){save.trophies[key]=Math.min(5,save.trophies[key]+1);save.best[key]=Math.min(save.best[key]??Infinity,race.elapsed)}
      save.cogs+=race.cogs;
    } else save.cogs+=race.cogs;
    storeSave();updateStats();
    $('#resultScreen').style.backgroundImage=`url("${race.p1.char.trackImage}")`;
    $('#resultTrain').src=c.trainImage;$('#resultTrain').alt=c.name;
    $('#resultTrophy').src=c.trophyImage;$('#resultTrophy').alt=`Gold ${c.name} trophy`;
    if(race.mode==='one'){
      $('#resultKicker').textContent=humanWon?'PHOTO FINISH!':'SO CLOSE!';$('#resultTitle').textContent=humanWon?'YOU WIN!':'TRY AGAIN!';
      $('#resultSummary').textContent=humanWon?`${race.p1.char.name} earns a shiny new trophy!`:`${race.p2.char.name} wins this time. Tap faster and use your boost!`;
    } else {
      $('#resultKicker').textContent='PHOTO FINISH!';$('#resultTitle').textContent=race.winner==='p1'?'PLAYER 1 WINS!':'PLAYER 2 WINS!';$('#resultSummary').textContent=`${c.name} races over the line first!`;
    }
    $('#resultTime').textContent=formatTime(race.elapsed);$('#resultCogs').textContent=`+${race.cogs}`;
    makeConfetti(race.mode==='two'||humanWon);showScreen('resultScreen');result3D.start(c);setMusic(null);sfx('win',.92);if(humanWon)setTimeout(()=>sfx('youWin',.9),430);
  }
  $('#raceAgain').addEventListener('click',()=>{tapSound();startRace()});
  $('#resultHome').addEventListener('click',()=>{tapSound();result3D.stop();race=null;setMusic('menu');updateStats();showScreen('modeScreen')});

  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.currentScreen==='raceScreen'&&race&&!race.paused&&!race.over)togglePause()});
  if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
