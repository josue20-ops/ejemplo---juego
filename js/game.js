// CAOS: Noche de supervivencia
// Lógica del juego. La estructura visual está en index.html y los estilos en css/styles.css.

(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const $ = id => document.getElementById(id);
  const overlays = ['startOverlay','pauseOverlay','upgradeOverlay','gameOverOverlay'];
  const keys = new Set();
  const pointer = { x: W/2, y: H/2, down: false, moved: false };
  const joy = { active:false, x:0, y:0, pointerId:null };
  let mode = 'menu', lastTime = 0, muted = false, audioCtx = null;
  let player, enemies, bullets, enemyBullets, pickups, particles, stars, cameraShake;
  let wave, score, kills, coins, waveKills, waveGoal, level, xp, xpNext, elapsed, spawnClock, toastClock, dashCooldown, runBestAtStart;
  let upgradeChoices = [];
  const BEST_KEY = 'caos_noche_best_v1';
  const rand = (a,b) => Math.random()*(b-a)+a;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const dist2 = (a,b) => (a.x-b.x)**2 + (a.y-b.y)**2;
  const getBest = () => { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (_) { return 0; } };
  const setBest = n => { try { localStorage.setItem(BEST_KEY,String(n)); } catch (_) {} };

  function sound(freq=440, duration=.06, type='sine', volume=.025) {
    if (muted) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(volume, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + duration);
      osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + duration);
    } catch (_) {}
  }
  function hideOverlays() { overlays.forEach(id => $(id).classList.add('hidden')); }
  function showOverlay(id) { hideOverlays(); $(id).classList.remove('hidden'); }
  function toast(title, subtitle='MANTENTE EN MOVIMIENTO') {
    const el = $('waveToast'); el.innerHTML = `${title}<small>${subtitle}</small>`; el.classList.add('show'); toastClock = 2.0;
  }
  function newPlayer() {
    return {x:W/2,y:H/2,r:13,hp:100,maxHp:100,speed:235,damage:20,fireRate:.34,fireClock:.15,bulletSpeed:560,multi:1,pierce:0,magnet:95,invuln:0,angle:-Math.PI/2,dashTime:0,dashX:0,dashY:0,trail:0};
  }
  function resetGame() {
    player = newPlayer(); enemies=[]; bullets=[]; enemyBullets=[]; pickups=[]; particles=[]; cameraShake=0;
    wave=1; score=0; kills=0; coins=0; waveKills=0; waveGoal=12; level=1; xp=0; xpNext=40; elapsed=0; spawnClock=.5; toastClock=0; dashCooldown=0; runBestAtStart=getBest();
    stars = Array.from({length:95},()=>({x:rand(0,W),y:rand(0,H),r:rand(.4,1.8),a:rand(.12,.58),p:rand(0,6.28)}));
    updateHud();
  }
  function startGame() { resetGame(); mode='playing'; hideOverlays(); toast('OLEADA 1','NO TE DETENGAS'); sound(520,.12,'triangle',.04); lastTime=performance.now(); }
  function backToMenu() { mode='menu'; hideOverlays(); $('startOverlay').classList.remove('hidden'); $('menuBest').textContent=getBest().toLocaleString('es-PE'); resetDisplayOnly(); }
  function resetDisplayOnly() { updateHud(); }
  function pauseGame() { if(mode==='playing'){mode='paused';showOverlay('pauseOverlay');} else if(mode==='paused'){mode='playing';hideOverlays();lastTime=performance.now();} }
  function triggerDash() {
    if(mode!=='playing'||dashCooldown>0)return;
    let dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+joy.x;
    let dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+joy.y;
    if(Math.hypot(dx,dy)<.15){ const target=nearestEnemy(); if(target){dx=player.x-target.x;dy=player.y-target.y;}else{dx=1;dy=0;} }
    const mag=Math.hypot(dx,dy)||1;player.dashX=dx/mag;player.dashY=dy/mag;player.dashTime=.19;player.invuln=Math.max(player.invuln,.32);dashCooldown=3.1;cameraShake=5;
    for(let i=0;i<13;i++) particles.push({x:player.x,y:player.y,vx:rand(-170,170),vy:rand(-170,170),life:rand(.16,.38),max:.38,r:rand(2,5),color:'#54f2e8',glow:8});
    sound(175,.15,'sawtooth',.035);
  }
  function nearestEnemy() { let best=null, bestD=Infinity;for(const e of enemies){const d=dist2(player,e);if(d<bestD){bestD=d;best=e;}}return best; }
  function spawnEnemy(type) {
    const side=Math.floor(Math.random()*4);let x,y;
    if(side===0){x=rand(0,W);y=-28;}else if(side===1){x=W+28;y=rand(0,H);}else if(side===2){x=rand(0,W);y=H+28;}else{x=-28;y=rand(0,H);}
    const scale=1+(wave-1)*.11;
    const cfg={normal:{r:12,hp:34*scale,speed:75+Math.min(wave*2,32),damage:10,xp:9,score:80,color:'#ff4f91'},fast:{r:9,hp:19*scale,speed:136+Math.min(wave*2,38),damage:7,xp:8,score:105,color:'#b48aff'},tank:{r:19,hp:105*scale,speed:43+Math.min(wave,12),damage:17,xp:18,score:180,color:'#ffad66'},shooter:{r:13,hp:46*scale,speed:58+Math.min(wave,15),damage:9,xp:13,score:150,color:'#52b8ff'},boss:{r:35,hp:750+wave*85,speed:36+Math.min(wave,12),damage:24,xp:100,score:2500,color:'#ff365f'}}[type];
    if(type==='boss'){x=clamp(x,70,W-70);y=clamp(y,70,H-70);}
    enemies.push({x,y,type,...cfg,maxHp:cfg.hp,hit:0,attack:rand(.5,1.2),phase:rand(0,6.28),knockX:0,knockY:0});
    if(type==='boss') {toast('JEFE DETECTADO','MANTÉN LA DISTANCIA');sound(90,.35,'sawtooth',.07);cameraShake=7;}
  }
  function maybeSpawn() {
    spawnClock -= frameDt;
    if(spawnClock<=0 && enemies.length<70) {
      let type='normal';const r=Math.random();
      if(wave>=3 && r<.15) type='fast';
      if(wave>=4 && r>.74 && r<.88) type='tank';
      if(wave>=6 && r>.58 && r<.72) type='shooter';
      if(wave>=9 && r<.13) type='fast';
      spawnEnemy(type);
      spawnClock=Math.max(.27,1.15-wave*.045)*rand(.72,1.22);
    }
  }
  function startNextWave() {
    wave++;waveKills=0;waveGoal=12+(wave-1)*5;
    toast(wave%5===0?'OLEADA DE JEFE':'OLEADA '+wave,wave%5===0?'ALGO ENORME VIENE POR TI':'CADA VEZ SON MÁS');
    sound(240,.09,'triangle',.035);setTimeout(()=>sound(360,.13,'triangle',.035),80);
    if(wave%5===0) spawnEnemy('boss');
  }
  function addParticles(x,y,color,count=8,power=140) {
    for(let i=0;i<count;i++){const a=rand(0,Math.PI*2),s=rand(power*.25,power);particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.2,.55),max:.55,r:rand(1.4,4.2),color,glow:8});}
  }
  function shootAt(target, angleOverride=null) {
    if(!target && angleOverride===null)return;
    const base=angleOverride===null?Math.atan2(target.y-player.y,target.x-player.x):angleOverride;
    player.angle=base;
    const n=player.multi, spread=.14;
    for(let i=0;i<n;i++){
      const a=base+(i-(n-1)/2)*spread;
      const speed=player.bulletSpeed;
      bullets.push({x:player.x+Math.cos(a)*(player.r+7),y:player.y+Math.sin(a)*(player.r+7),vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r:4.3,damage:player.damage,pierce:player.pierce,life:1.35,hitIds:new Set()});
    }
    addParticles(player.x+Math.cos(base)*15,player.y+Math.sin(base)*15,'#54f2e8',2,45);
    sound(500+Math.random()*100,.035,'square',.009);
  }
  function killEnemy(index,e) {
    enemies.splice(index,1);kills++;waveKills++;score+=e.score;
    if(e.type==='boss') {score+=1500;coins+=12;addParticles(e.x,e.y,e.color,65,280);for(let i=0;i<6;i++)spawnPickup(e.x+rand(-28,28),e.y+rand(-28,28),'xp');spawnPickup(e.x,e.y,'med');toast('JEFE ELIMINADO','RECOMPENSA ÉPICA');sound(70,.5,'sawtooth',.06);}
    else {addParticles(e.x,e.y,e.color,e.type==='tank'?18:9,e.type==='tank'?190:145);spawnPickup(e.x,e.y,'xp');if(Math.random()<.16)spawnPickup(e.x,e.y,Math.random()<.34?'med':'coin');sound(e.type==='tank'?115:220,.06,'triangle',.017);}
    if(waveKills>=waveGoal) startNextWave();
  }
  function spawnPickup(x,y,type) {
    const map={xp:{r:6,color:'#9b7bff',value:1},coin:{r:7,color:'#ffd166',value:1},med:{r:8,color:'#5bffa9',value:20}};
    const c=map[type];pickups.push({x,y,type,r:c.r,color:c.color,value:c.value,vx:rand(-30,30),vy:rand(-30,30),life:18,phase:rand(0,6.28)});
  }
  function gainXp(n) {
    xp+=n;
    if(xp>=xpNext){xp-=xpNext;level++;xpNext=Math.round(40+level*17);openUpgrade();}
  }
  const upgrades=[
    {id:'damage',icon:'✹',name:'Munición pesada',desc:'+30% de daño por disparo.',apply:()=>player.damage=Math.round(player.damage*1.3)},
    {id:'rate',icon:'⚡',name:'Disparo rápido',desc:'Dispara un 20% más rápido.',apply:()=>player.fireRate=Math.max(.105,player.fireRate*.8)},
    {id:'health',icon:'♥',name:'Reparación urgente',desc:'Recupera 35 de vida y aumenta la vida máxima en 10.',apply:()=>{player.maxHp+=10;player.hp=Math.min(player.maxHp,player.hp+35)}},
    {id:'speed',icon:'➤',name:'Sobrecarga',desc:'+12% de velocidad de movimiento.',apply:()=>player.speed*=1.12},
    {id:'multi',icon:'✦',name:'Disparo múltiple',desc:'Añade un proyectil a cada ráfaga.',apply:()=>player.multi=Math.min(5,player.multi+1)},
    {id:'pierce',icon:'➤',name:'Proyectil perforante',desc:'Las balas atraviesan un enemigo adicional.',apply:()=>player.pierce=Math.min(5,player.pierce+1)},
    {id:'magnet',icon:'◉',name:'Imán de energía',desc:'Atrae cristales desde mucha más distancia.',apply:()=>player.magnet+=75},
    {id:'heal',icon:'✚',name:'Nanobots médicos',desc:'Recupera 55 de vida.',apply:()=>player.hp=Math.min(player.maxHp,player.hp+55)},
    {id:'velocity',icon:'☄',name:'Núcleo cinético',desc:'+18% de velocidad de las balas.',apply:()=>player.bulletSpeed*=1.18}
  ];
  function openUpgrade() {
    mode='upgrade';showOverlay('upgradeOverlay');sound(660,.16,'triangle',.035);sound(880,.18,'sine',.025);
    let pool=upgrades.filter(u=>!(u.id==='multi'&&player.multi>=5)&&!(u.id==='pierce'&&player.pierce>=5));
    upgradeChoices=[];while(upgradeChoices.length<3&&pool.length){const i=Math.floor(Math.random()*pool.length);upgradeChoices.push(pool.splice(i,1)[0]);}
    const grid=$('upgradeGrid');grid.innerHTML='';
    upgradeChoices.forEach((u,i)=>{const b=document.createElement('button');b.className='upgrade-card';b.type='button';b.innerHTML=`<div class="upgrade-icon">${u.icon}</div><div class="upgrade-name">${i+1}. ${u.name}</div><div class="upgrade-desc">${u.desc}</div>`;b.addEventListener('click',()=>chooseUpgrade(u));grid.appendChild(b);});
  }
  function chooseUpgrade(u) {
    u.apply();mode='playing';hideOverlays();addParticles(player.x,player.y,'#54f2e8',24,170);sound(740,.12,'triangle',.04);toast('MEJORA ACTIVADA',u.name.toUpperCase());updateHud();
    if(xp>=xpNext){xp-=xpNext;level++;xpNext=Math.round(40+level*17);openUpgrade();}
  }
  function damagePlayer(amount) {
    if(player.invuln>0||mode!=='playing')return;
    player.hp-=amount;player.invuln=.68;cameraShake=8;addParticles(player.x,player.y,'#ff4f91',10,170);sound(125,.12,'sawtooth',.04);
    if(player.hp<=0){player.hp=0;endGame();}
  }
  function endGame() {
    mode='gameover';const best=getBest();const isNew=score>best;if(isNew)setBest(score);
    $('finalScore').textContent=score.toLocaleString('es-PE');$('finalWave').textContent=wave;$('finalKills').textContent=kills;
    $('newRecord').classList.toggle('hidden',!isNew);showOverlay('gameOverOverlay');$('menuBest').textContent=getBest().toLocaleString('es-PE');sound(95,.5,'sawtooth',.05);
  }
  let frameDt=0;
  function update(dt) {
    if(mode!=='playing')return;
    frameDt=dt;elapsed+=dt;if(toastClock>0){toastClock-=dt;if(toastClock<=0)$('waveToast').classList.remove('show');}
    if(cameraShake>0)cameraShake=Math.max(0,cameraShake-dt*24);
    dashCooldown=Math.max(0,dashCooldown-dt);player.invuln=Math.max(0,player.invuln-dt);player.trail-=dt;
    let dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+joy.x;
    let dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+joy.y;
    let mag=Math.hypot(dx,dy);if(mag>1){dx/=mag;dy/=mag;}
    if(player.dashTime>0){player.x+=player.dashX*760*dt;player.y+=player.dashY*760*dt;player.dashTime-=dt;if(player.trail<=0){particles.push({x:player.x,y:player.y,vx:0,vy:0,life:.22,max:.22,r:player.r,color:'#54f2e8',glow:16});player.trail=.02;}}
    else {player.x+=dx*player.speed*dt;player.y+=dy*player.speed*dt;}
    player.x=clamp(player.x,player.r+5,W-player.r-5);player.y=clamp(player.y,player.r+5,H-player.r-5);
    const target=nearestEnemy();
    player.fireClock-=dt;
    if(player.fireClock<=0 && target && dist2(player,target)<700*700){shootAt(target);player.fireClock=player.fireRate;}
    maybeSpawn();

    for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];e.hit=Math.max(0,e.hit-dt);e.attack-=dt;e.phase+=dt*2;
      const vx=player.x-e.x,vy=player.y-e.y,d=Math.hypot(vx,vy)||1;const ux=vx/d,uy=vy/d;
      if(e.type==='shooter'){
        if(d>310){e.x+=ux*e.speed*dt;e.y+=uy*e.speed*dt;}else if(d<220){e.x-=ux*e.speed*.75*dt;e.y-=uy*e.speed*.75*dt;}else{e.x+=-uy*Math.sin(e.phase)*e.speed*.28*dt;e.y+=ux*Math.sin(e.phase)*e.speed*.28*dt;}
        if(e.attack<=0&&d<550){const a=Math.atan2(vy,vx);enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(a)*205,vy:Math.sin(a)*205,r:5,damage:e.damage,life:3,color:'#52b8ff'});e.attack=1.65;}
      } else {e.x+=ux*e.speed*dt;e.y+=uy*e.speed*dt;}
      if(e.type==='boss'&&e.attack<=0){for(let k=0;k<10;k++){const a=(Math.PI*2*k/10)+elapsed*.35;enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(a)*145,vy:Math.sin(a)*145,r:6,damage:13,life:4,color:'#ff365f'});}e.attack=1.45;cameraShake=4;}
      if(d<e.r+player.r){damagePlayer(e.damage);const push=(e.r+player.r-d+1);e.x-=ux*push*.5;e.y-=uy*push*.5;}
    }
    for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;let remove=b.life<=0||b.x<-20||b.x>W+20||b.y<-20||b.y>H+20;
      for(let j=enemies.length-1;j>=0&&!remove;j--){const e=enemies[j];if(b.hitIds.has(e))continue;const rr=b.r+e.r;if((b.x-e.x)**2+(b.y-e.y)**2<rr*rr){e.hp-=b.damage;e.hit=.08;b.hitIds.add(e);addParticles(b.x,b.y,e.color,3,65);b.damage*=.87;if(b.pierce>0)b.pierce--;else remove=true;if(e.hp<=0)killEnemy(j,e);}}
      if(remove)bullets.splice(i,1);
    }
    for(let i=enemyBullets.length-1;i>=0;i--){const b=enemyBullets[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(b.life<=0||b.x<-30||b.x>W+30||b.y<-30||b.y>H+30){enemyBullets.splice(i,1);continue;}const rr=b.r+player.r;if((b.x-player.x)**2+(b.y-player.y)**2<rr*rr){damagePlayer(b.damage);enemyBullets.splice(i,1);}}
    for(let i=pickups.length-1;i>=0;i--){const p=pickups[i];p.life-=dt;p.phase+=dt*3;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.12,dt);p.vy*=Math.pow(.12,dt);let d=Math.hypot(player.x-p.x,player.y-p.y)||1;
      if(d<player.magnet+38){p.x+=(player.x-p.x)/d*(210+Math.max(0,player.magnet-d)*1.8)*dt;p.y+=(player.y-p.y)/d*(210+Math.max(0,player.magnet-d)*1.8)*dt;}
      if(d<player.r+p.r+4){if(p.type==='xp'){gainXp(p.value);score+=15;}else if(p.type==='coin'){coins+=1;score+=50;sound(780,.04,'sine',.018);}else{player.hp=Math.min(player.maxHp,player.hp+p.value);sound(620,.09,'sine',.025);}addParticles(p.x,p.y,p.color,6,100);pickups.splice(i,1);continue;}
      if(p.life<=0)pickups.splice(i,1);
    }
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.08,dt);p.vy*=Math.pow(.08,dt);p.life-=dt;if(p.life<=0)particles.splice(i,1);}
    updateHud();
  }
  function updateHud() {
    $('waveValue').textContent=String(wave||1).padStart(2,'0');$('levelValue').textContent=level||1;$('scoreValue').textContent=(score||0).toLocaleString('es-PE');$('killsValue').textContent=kills||0;
    if(player){$('healthValue').textContent=`${Math.ceil(player.hp)}/${player.maxHp}`;$('healthFill').style.width=`${clamp(player.hp/player.maxHp*100,0,100)}%`;$('xpValue').textContent=`${xp}/${xpNext}`;$('xpFill').style.width=`${clamp(xp/xpNext*100,0,100)}%`;$('coinValue').textContent=coins||0;}
  }
  function roundedRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function drawBackground(t) {
    ctx.fillStyle='#080d1b';ctx.fillRect(0,0,W,H);
    const grad=ctx.createRadialGradient(W*.52,H*.46,30,W*.52,H*.46,Math.max(W,H)*.72);grad.addColorStop(0,'#111a32');grad.addColorStop(1,'#070b16');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.strokeStyle='rgba(91,130,199,.09)';ctx.lineWidth=1;const grid=42;const offset=(t*8)%grid;for(let x=-grid+offset;x<W;x+=grid){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(let y=-grid+offset;y<H;y+=grid){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}ctx.restore();
    for(const s of stars){ctx.globalAlpha=s.a*(.7+.3*Math.sin(t*1.5+s.p));ctx.fillStyle='#9fbfff';ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    ctx.strokeStyle='rgba(84,242,232,.07)';ctx.lineWidth=2;ctx.strokeRect(12,12,W-24,H-24);
  }
  function drawEnemy(e) {
    ctx.save();ctx.translate(e.x,e.y);const pulse=1+Math.sin(e.phase||0)*.035;ctx.scale(pulse,pulse);
    ctx.shadowBlur=e.type==='boss'?28:15;ctx.shadowColor=e.color;
    ctx.fillStyle=e.hit>0?'#ffffff':e.color;ctx.globalAlpha=.17;ctx.beginPath();ctx.arc(0,0,e.r*1.75,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    if(e.type==='boss'){
      ctx.rotate(elapsed*.22);ctx.strokeStyle=e.color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,e.r+8,0,Math.PI*2);ctx.stroke();ctx.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.moveTo(Math.cos(a)*(e.r+2),Math.sin(a)*(e.r+2));ctx.lineTo(Math.cos(a)*(e.r+12),Math.sin(a)*(e.r+12));}ctx.stroke();ctx.rotate(-elapsed*.22);
      ctx.fillStyle=e.hit>0?'#fff':'#361327';ctx.beginPath();ctx.arc(0,0,e.r,0,Math.PI*2);ctx.fill();ctx.strokeStyle=e.color;ctx.lineWidth=3;ctx.stroke();ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(0,0,e.r*.44,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(-7,-3,3,0,Math.PI*2);ctx.arc(7,-3,3,0,Math.PI*2);ctx.fill();
    } else if(e.type==='tank'){
      ctx.rotate(Math.PI/4);ctx.fillStyle=e.hit>0?'#fff':'#392820';ctx.fillRect(-e.r*.76,-e.r*.76,e.r*1.52,e.r*1.52);ctx.strokeStyle=e.color;ctx.lineWidth=3;ctx.strokeRect(-e.r*.76,-e.r*.76,e.r*1.52,e.r*1.52);ctx.rotate(-Math.PI/4);ctx.fillStyle=e.color;ctx.fillRect(-5,-5,10,10);
    } else if(e.type==='fast'){
      ctx.rotate(Math.atan2(player.y-e.y,player.x-e.x));ctx.beginPath();ctx.moveTo(e.r+5,0);ctx.lineTo(-e.r*.7,-e.r*.7);ctx.lineTo(-e.r*.4,0);ctx.lineTo(-e.r*.7,e.r*.7);ctx.closePath();ctx.fillStyle=e.hit>0?'#fff':e.color;ctx.fill();
    } else {
      ctx.fillStyle=e.hit>0?'#fff':'#151e35';ctx.beginPath();ctx.arc(0,0,e.r,0,Math.PI*2);ctx.fill();ctx.strokeStyle=e.color;ctx.lineWidth=2.5;ctx.stroke();ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(0,0,e.r*.39,0,Math.PI*2);ctx.fill();
      if(e.type==='shooter'){ctx.strokeStyle='#e8f5ff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-e.r*.6,0);ctx.lineTo(e.r*.6,0);ctx.stroke();}
    }
    ctx.shadowBlur=0;ctx.restore();
    if(e.type==='boss'||e.type==='tank') {const bw=e.type==='boss'?74:42,bh=4;ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(e.x-bw/2,e.y-e.r-14,bw,bh);ctx.fillStyle=e.color;ctx.fillRect(e.x-bw/2,e.y-e.r-14,bw*clamp(e.hp/e.maxHp,0,1),bh);}
  }
  function drawPlayer() {
    if(!player)return;ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.angle+Math.PI/2);
    ctx.shadowBlur=22;ctx.shadowColor='#54f2e8';ctx.globalAlpha=player.invuln>0&&Math.floor(elapsed*24)%2===0?.38:1;
    ctx.fillStyle='rgba(84,242,232,.18)';ctx.beginPath();ctx.arc(0,0,player.r+9,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#0b2231';ctx.strokeStyle='#54f2e8';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(0,-player.r-5);ctx.lineTo(player.r*.92,player.r*.7);ctx.lineTo(0,player.r*.34);ctx.lineTo(-player.r*.92,player.r*.7);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.shadowBlur=8;ctx.fillStyle='#efffff';ctx.beginPath();ctx.arc(0,-2,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#54f2e8';ctx.fillRect(-3,player.r*.4,6,5);ctx.restore();ctx.globalAlpha=1;
    if(dashCooldown>0){ctx.beginPath();ctx.arc(player.x,player.y,player.r+7,-Math.PI/2,-Math.PI/2+(Math.PI*2*(1-dashCooldown/3.1)));ctx.strokeStyle='rgba(84,242,232,.8)';ctx.lineWidth=2;ctx.stroke();}
  }
  function draw() {
    ctx.save();if(cameraShake>0){ctx.translate(rand(-cameraShake,cameraShake),rand(-cameraShake,cameraShake));}
    drawBackground(elapsed||0);
    for(const p of pickups){const bob=Math.sin(p.phase)*2.5;ctx.save();ctx.translate(p.x,p.y+bob);ctx.shadowBlur=16;ctx.shadowColor=p.color;ctx.fillStyle=p.color;if(p.type==='xp'){ctx.rotate(Math.PI/4);ctx.fillRect(-p.r*.7,-p.r*.7,p.r*1.4,p.r*1.4);}else if(p.type==='med'){ctx.beginPath();ctx.arc(0,0,p.r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#10332b';ctx.fillRect(-2,-5,4,10);ctx.fillRect(-5,-2,10,4);}else{ctx.beginPath();ctx.arc(0,0,p.r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#7e5012';ctx.beginPath();ctx.arc(0,0,p.r*.45,0,Math.PI*2);ctx.fill();}ctx.restore();}
    for(const b of bullets){ctx.save();ctx.shadowBlur=13;ctx.shadowColor='#54f2e8';ctx.fillStyle='#ddfffc';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.restore();}
    for(const b of enemyBullets){ctx.save();ctx.shadowBlur=13;ctx.shadowColor=b.color;ctx.fillStyle=b.color;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.restore();}
    for(const e of enemies)drawEnemy(e);
    for(const p of particles){ctx.save();ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.shadowBlur=p.glow||0;ctx.shadowColor=p.color;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r*clamp(p.life/p.max,.15,1),0,Math.PI*2);ctx.fill();ctx.restore();}
    drawPlayer();ctx.restore();
    if(mode==='menu'){ctx.fillStyle='rgba(6,10,24,.12)';ctx.fillRect(0,0,W,H);}
  }
  let lastFrame=0;
  function loop(now) {
    const dt=Math.min(.034,Math.max(0,(now-lastFrame)/1000||0));lastFrame=now;
    if(mode==='playing')update(dt);else if(mode==='menu'){elapsed+=dt;}
    draw();requestAnimationFrame(loop);
  }
  function canvasPoint(ev){const r=canvas.getBoundingClientRect();return{x:(ev.clientX-r.left)*W/r.width,y:(ev.clientY-r.top)*H/r.height};}
  canvas.addEventListener('pointermove',ev=>{const p=canvasPoint(ev);pointer.x=p.x;pointer.y=p.y;pointer.moved=true;});
  canvas.addEventListener('pointerdown',ev=>{if(ev.pointerType==='mouse'&&mode==='playing'){const p=canvasPoint(ev);pointer.x=p.x;pointer.y=p.y;pointer.down=true;canvas.setPointerCapture?.(ev.pointerId);}});
  window.addEventListener('pointerup',()=>{pointer.down=false;});
  window.addEventListener('keydown',ev=>{
    const k=ev.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))ev.preventDefault();keys.add(k);
    if((k==='p'||k==='escape')&&(['playing','paused'].includes(mode))){pauseGame();}
    if(k===' '&&!ev.repeat)triggerDash();
    if(mode==='upgrade'&&['1','2','3'].includes(k)){chooseUpgrade(upgradeChoices[Number(k)-1]);}
    if(mode==='gameover'&&k==='enter')startGame();
  });
  window.addEventListener('keyup',ev=>keys.delete(ev.key.toLowerCase()));
  window.addEventListener('blur',()=>{keys.clear();pointer.down=false;if(mode==='playing')pauseGame();});
  $('startBtn').addEventListener('click',startGame);$('restartBtn').addEventListener('click',startGame);$('resumeBtn').addEventListener('click',pauseGame);$('pauseBtn').addEventListener('click',()=>{if(mode==='playing'||mode==='paused')pauseGame();});$('menuBtn').addEventListener('click',backToMenu);
  $('soundBtn').addEventListener('click',()=>{muted=!muted;$('soundBtn').textContent=muted?'♪ Silencio':'♫ Sonido';if(!muted)sound(620,.06,'sine',.03);});
  $('shareBtn').addEventListener('click',async()=>{const msg=`Conseguí ${score.toLocaleString('es-PE')} puntos, llegué a la oleada ${wave} y eliminé ${kills} enemigos en CAOS: Noche de supervivencia.`;try{await navigator.clipboard.writeText(msg);$('shareBtn').textContent='¡COPIADO!';}catch(_){window.prompt('Copia tu resultado:',msg);}setTimeout(()=>$('shareBtn').textContent='COPIAR RESULTADO',1400);});
  // Joystick táctil
  const joystick=$('joystick'), knob=$('joyKnob');
  function setJoy(ev){const r=joystick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let dx=(ev.clientX-cx)/(r.width*.34),dy=(ev.clientY-cy)/(r.height*.34);const m=Math.hypot(dx,dy);if(m>1){dx/=m;dy/=m;}joy.x=dx;joy.y=dy;knob.style.left=`${50+dx*34}%`;knob.style.top=`${50+dy*34}%`;}
  joystick.addEventListener('pointerdown',ev=>{joy.active=true;joy.pointerId=ev.pointerId;joystick.setPointerCapture(ev.pointerId);setJoy(ev);});
  joystick.addEventListener('pointermove',ev=>{if(joy.active&&ev.pointerId===joy.pointerId)setJoy(ev);});
  function releaseJoy(){joy.active=false;joy.x=0;joy.y=0;joy.pointerId=null;knob.style.left='50%';knob.style.top='50%';}
  joystick.addEventListener('pointerup',releaseJoy);joystick.addEventListener('pointercancel',releaseJoy);
  $('dashTouch').addEventListener('pointerdown',ev=>{ev.preventDefault();triggerDash();});
  $('fireTouch').addEventListener('pointerdown',ev=>{ev.preventDefault();if(mode==='playing'){const target=nearestEnemy();if(target){const a=Math.atan2(target.y-player.y,target.x-player.x);shootAt(target,a);player.fireClock=player.fireRate*.45;}}});
  $('menuBest').textContent=getBest().toLocaleString('es-PE');resetGame();mode='menu';requestAnimationFrame(loop);
})();
