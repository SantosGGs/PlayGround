(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const intro = $('intro'), result = $('result'), hud = $('hud'), controls = $('mobile-controls');
  const WORLD = { w: 1200, h: 760 };
  const COLORS = { pink:'#ff3d79', cyan:'#53e6dc', gold:'#ffce69', cream:'#eee5d5', dark:'#121622' };
  let dpr=1, vw=0, vh=0, scale=1, cam={x:0,y:0}, running=false, last=0, elapsed=0, score=0, kills=0, streak=0, lastKill=0, shake=0, toastTimer=0;
  let player, enemies=[], bullets=[], particles=[], sparks=[], decor=[], keys={}, pointer={x:0,y:0,down:false,active:false}, mobile={x:0,y:0,fire:false}, audioCtx=null, soundOn=true, dashCooldown=0, fireTimer=0, ammo=12, reloading=0;
  const walls=[];
  const addWall=(x,y,w,h,type='wall')=>walls.push({x,y,w,h,type});
  function buildMap(){
    walls.length=0;
    // Exterior shell with a welcoming gap at the south entrance.
    addWall(0,0,1200,34,'outer'); addWall(0,0,34,760,'outer'); addWall(1166,0,34,760,'outer');
    addWall(0,726,455,34,'outer'); addWall(745,726,455,34,'outer');
    // Room partitions: generous doorways let both the player and the crew flow naturally.
    addWall(34,250,270,18); addWall(410,250,240,18); addWall(770,250,396,18);
    addWall(34,492,340,18); addWall(484,492,210,18); addWall(804,492,362,18);
    addWall(365,34,18,126); addWall(365,218,18,32); addWall(365,268,18,115); addWall(365,448,18,44);
    addWall(790,34,18,153); addWall(790,245,18,5); addWall(790,268,18,132); addWall(790,465,18,27);
    // Furniture and fixtures (also solid to bullets).
    addWall(100,82,160,20,'furniture'); addWall(100,102,20,78,'furniture');
    addWall(480,70,120,54,'furniture'); addWall(652,80,68,70,'furniture');
    addWall(900,90,170,28,'furniture'); addWall(900,118,22,82,'furniture');
    addWall(85,322,78,86,'furniture'); addWall(220,330,92,42,'furniture');
    addWall(440,312,115,66,'furniture'); addWall(630,334,100,58,'furniture');
    addWall(870,320,125,48,'furniture'); addWall(1030,322,90,94,'furniture');
    addWall(98,568,176,70,'furniture'); addWall(455,560,125,74,'furniture');
    addWall(875,570,180,60,'furniture'); addWall(1077,560,35,90,'furniture');
    // Decorative seating nooks / bars.
    decor=[
      {x:62,y:60,w:270,h:140,type:'rug',c:'#8e3156'}, {x:834,y:56,w:294,h:142,type:'rug',c:'#25545b'},
      {x:403,y:278,w:350,h:194,type:'rug',c:'#39404b'}, {x:54,y:523,w:310,h:177,type:'rug',c:'#39404b'},
      {x:824,y:520,w:320,h:180,type:'rug',c:'#6d3942'},
      {x:325,y:560,w:75,h:100,type:'plant'}, {x:740,y:86,w:35,h:35,type:'plant'}, {x:1110,y:432,w:38,h:38,type:'plant'},
      {x:555,y:450,w:42,h:26,type:'table'}, {x:600,y:450,w:42,h:26,type:'table'},
      {x:432,y:105,w:25,h:60,type:'lamp'}, {x:832,y:420,w:25,h:60,type:'lamp'},
    ];
  }
  buildMap();
  const initialEnemies=[
    [180,195,'guard'],[530,183,'guard'],[1010,190,'guard'],[180,425,'guard'],
    [570,425,'guard'],[700,438,'guard'],[960,430,'guard'],[690,610,'guard']
  ];
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  function resize(){
    const r=canvas.getBoundingClientRect(); vw=r.width; vh=r.height; dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(vw*dpr); canvas.height=Math.round(vh*dpr);
    scale=Math.min(vw/850,vh/520,1.15); if(!Number.isFinite(scale)||scale<=0)scale=1;
  }
  window.addEventListener('resize',resize); resize();
  function reset(){
    player={x:600,y:675,r:13,hp:3,maxHp:3,faceX:0,faceY:-1,invuln:0,walk:0};
    enemies=initialEnemies.map((p,i)=>({x:p[0],y:p[1],r:12,hp:1,state:'idle',cooldown:.35+(i%4)*.37,alert:0,phase:Math.random()*5,kind:p[2],alive:true}));
    bullets=[];particles=[];sparks=[];elapsed=0;score=0;kills=0;streak=0;lastKill=-99;shake=0;dashCooldown=0;fireTimer=0;ammo=12;reloading=0;running=true;
    $('score').textContent='000000';$('enemy-count').textContent=String(enemies.length).padStart(2,'0');$('weapon-label').textContent='9MM / 12';$('objective-text').textContent='CLEAR THE BUILDING';$('combo').innerHTML='STREAK <b>x0</b>';
    result.classList.add('hidden');intro.classList.add('hidden');hud.classList.remove('hidden');controls.classList.remove('hidden');$('rotate-hint').classList.toggle('hidden',window.innerWidth>window.innerHeight||!matchMedia('(pointer:coarse)').matches);
    last=performance.now(); requestAnimationFrame(loop); ping('start');
  }
  function finish(win){if(!running)return;running=false;controls.classList.add('hidden');$('rotate-hint').classList.add('hidden');hud.classList.add('hidden');result.classList.remove('hidden');$('result-kicker').textContent=win?'JOB COMPLETE':'JOB FAILED';$('result-title').innerHTML=win?'CLEAN<br><em>GETAWAY</em>':'NIGHT<br><em>OVER</em>';$('result-copy').textContent=win?'The night belongs to you. The street is clear.':'One more run. You know the layout now.';$('result-time').textContent=formatTime(elapsed);$('result-score').textContent=String(score).padStart(6,'0');$('result-streak').textContent='x'+streak;ping(win?'win':'dead');}
  function formatTime(t){let s=Math.floor(t);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
  function intersectsCircleRect(x,y,r,rect){const cx=clamp(x,rect.x,rect.x+rect.w),cy=clamp(y,rect.y,rect.y+rect.h);return (x-cx)**2+(y-cy)**2<r*r}
  function blocked(x,y,r){return walls.some(w=>intersectsCircleRect(x,y,r,w))}
  function moveBody(body,dx,dy){let nx=body.x+dx;if(!blocked(nx,body.y,body.r))body.x=nx;let ny=body.y+dy;if(!blocked(body.x,ny,body.r))body.y=ny;}
  function lineBlocked(x1,y1,x2,y2){let steps=Math.ceil(Math.hypot(x2-x1,y2-y1)/10);for(let i=1;i<steps;i++){let x=x1+(x2-x1)*i/steps,y=y1+(y2-y1)*i/steps;if(walls.some(w=>x>w.x&&x<w.x+w.w&&y>w.y&&y<w.y+w.h))return true;}return false}
  function visible(a,b){return !lineBlocked(a.x,a.y,b.x,b.y)}
  function nearestEnemy(){let best=null,bd=Infinity;for(const e of enemies)if(e.alive){let d=dist(player,e);if(d<bd&&!lineBlocked(player.x,player.y,e.x,e.y)){best=e;bd=d}}return best}
  function firePlayer(){if(!running||fireTimer>0||reloading>0)return;if(ammo<=0){reloading=1.05;ping('reload');return}
    let target=null,dx=0,dy=0;
    if(pointer.active&&!matchMedia('(pointer:coarse)').matches){let wx=cam.x+(pointer.x-vw/2)/scale,wy=cam.y+(pointer.y-vh/2)/scale;dx=wx-player.x;dy=wy-player.y;target=enemies.filter(e=>e.alive).sort((a,b)=>Math.hypot(a.x-wx,a.y-wy)-Math.hypot(b.x-wx,b.y-wy))[0];}
    else{target=nearestEnemy();if(target){dx=target.x-player.x;dy=target.y-player.y}else{dx=player.faceX;dy=player.faceY}}
    const len=Math.hypot(dx,dy)||1;dx/=len;dy/=len;player.faceX=dx;player.faceY=dy;
    const spread=(Math.random()-.5)*.045,cs=Math.cos(spread),sn=Math.sin(spread),vx=(dx*cs-dy*sn),vy=(dx*sn+dy*cs);
    bullets.push({x:player.x+vx*17,y:player.y+vy*17,vx:vx*560,vy:vy*560,r:3,life:1.05,from:'player'});
    ammo--;fireTimer=.22;shake=Math.max(shake,2.1);burst(player.x+vx*20,player.y+vy*20,COLORS.gold,3,45);ping('shot');
    $('weapon-label').textContent=reloading>0?'9MM / RLD':`9MM / ${ammo}`;
  }
  function enemyFire(e){let dx=player.x-e.x,dy=player.y-e.y,len=Math.hypot(dx,dy)||1;dx/=len;dy/=len;let spread=(Math.random()-.5)*.09;let c=Math.cos(spread),s=Math.sin(spread),vx=dx*c-dy*s,vy=dx*s+dy*c;bullets.push({x:e.x+vx*16,y:e.y+vy*16,vx:vx*320,vy:vy*320,r:3.5,life:2.5,from:'enemy'});burst(e.x+vx*14,e.y+vy*14,COLORS.pink,2,30);ping('enemy')}
  function burst(x,y,color,n=8,speed=110){for(let i=0;i<n;i++){let a=Math.random()*Math.PI*2,v=speed*(.25+Math.random()*.75);particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.2+Math.random()*.42,max:.62,r:1+Math.random()*2,color})}}
  function toast(text){const el=$('toast');el.textContent=text;el.classList.add('show');toastTimer=1.35}
  function update(dt){
    elapsed+=dt;fireTimer=Math.max(0,fireTimer-dt);dashCooldown=Math.max(0,dashCooldown-dt);if(player.invuln>0)player.invuln-=dt;if(reloading>0){reloading-=dt;if(reloading<=0){ammo=12;$('weapon-label').textContent='9MM / 12';toast('RELOADED')}}if(toastTimer>0&&(toastTimer-=dt)<=0)$('toast').classList.remove('show');
    $('timer').textContent=formatTime(elapsed);$('score').textContent=String(score).padStart(6,'0');$('enemy-count').textContent=String(enemies.filter(e=>e.alive).length).padStart(2,'0');
    let ix=(keys.ArrowRight||keys.KeyD?1:0)-(keys.ArrowLeft||keys.KeyA?1:0)+mobile.x,iy=(keys.ArrowDown||keys.KeyS?1:0)-(keys.ArrowUp||keys.KeyW?1:0)+mobile.y;let il=Math.hypot(ix,iy);if(il>1){ix/=il;iy/=il}
    if(il>.12){player.faceX=ix;player.faceY=iy;player.walk+=dt*10;moveBody(player,ix*190*dt,iy*190*dt)}
    if((keys.Space||keys.Shift)&&dashCooldown<=0&&il>.1){moveBody(player,ix*115,iy*115);player.invuln=.38;dashCooldown=1.4;shake=4;burst(player.x,player.y,COLORS.cyan,9,90);keys.Space=false;keys.Shift=false;ping('dash')}
    if(pointer.down||mobile.fire||keys.KeyJ)firePlayer();
    for(const e of enemies){if(!e.alive)continue;e.phase+=dt;e.cooldown-=dt;let d=dist(e,player),canSee=d<440&&visible(e,player);if(canSee){e.alert=Math.min(1,e.alert+dt*2);e.state='alert'}else{e.alert=Math.max(0,e.alert-dt*.3);if(e.alert<.1)e.state='idle'}
      if(e.state==='alert'&&d>220&&d<380){let tx=(player.x-e.x)/d,ty=(player.y-e.y)/d;let mx=tx*42*dt,my=ty*42*dt;if(!blocked(e.x+mx,e.y,e.r)&&!blocked(e.x,e.y+my,e.r))moveBody(e,mx,my)}
      if(canSee&&d<400&&e.cooldown<=0){enemyFire(e);e.cooldown=1.25+Math.random()*.72}
    }
    for(const b of bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(b.life<=0||walls.some(w=>b.x>w.x&&b.x<w.x+w.w&&b.y>w.y&&b.y<w.y+w.h)){b.life=0;continue}
      if(b.from==='player'){for(const e of enemies){if(e.alive&&Math.hypot(b.x-e.x,b.y-e.y)<e.r+5){e.alive=false;b.life=0;kills++;let now=elapsed;if(now-lastKill<3)streak++;else streak=1;lastKill=now;let points=100+Math.min(streak-1,9)*50;score+=points;shake=5;burst(e.x,e.y,COLORS.pink,16,155);burst(e.x,e.y,COLORS.gold,8,90);$('combo').innerHTML=`STREAK <b>x${streak}</b>`;toast(streak>1?`+${points}  /  ${streak}X STREAK`:`+${points}  /  TARGET DOWN`);ping('hit');if(!enemies.some(x=>x.alive)){score+=Math.max(0,1000-Math.floor(elapsed)*4);$('objective-text').textContent='STREET IS CLEAR';setTimeout(()=>finish(true),850)}break}}}
      else if(Math.hypot(b.x-player.x,b.y-player.y)<player.r+5&&player.invuln<=0){b.life=0;player.hp--;player.invuln=1.1;shake=12;burst(player.x,player.y,COLORS.pink,12,120);toast(player.hp>0?`HIT — ${player.hp} LEFT`:'DOWN');ping('hurt');if(player.hp<=0)finish(false)}
    }
    bullets=bullets.filter(b=>b.life>0);for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.08,dt);p.vy*=Math.pow(.08,dt);p.life-=dt}particles=particles.filter(p=>p.life>0);
    if(shake>0)shake=Math.max(0,shake-dt*28);
    cam.x=clamp(player.x,460,740);cam.y=clamp(player.y,330,430);
  }
  function worldToScreen(x,y){return {x:vw/2+(x-cam.x)*scale,y:vh/2+(y-cam.y)*scale}}
  function roundRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r)}
  function draw(){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,vw,vh);ctx.fillStyle='#111421';ctx.fillRect(0,0,vw,vh);
    // Exterior midnight gradient and pool of sodium light.
    let grad=ctx.createRadialGradient(vw*.52,vh*.55,30,vw*.52,vh*.55,Math.max(vw,vh)*.75);grad.addColorStop(0,'#1b2431');grad.addColorStop(1,'#080a14');ctx.fillStyle=grad;ctx.fillRect(0,0,vw,vh);
    ctx.save();let sx=vw/2-cam.x*scale,sy=vh/2-cam.y*scale;ctx.translate(sx,sy);ctx.scale(scale,scale);
    // House floor with alternating boards, outer glow.
    ctx.shadowColor='rgba(255,61,121,.18)';ctx.shadowBlur=22;ctx.fillStyle='#222630';ctx.fillRect(34,34,1132,692);ctx.shadowBlur=0;
    ctx.save();ctx.beginPath();ctx.rect(34,34,1132,692);ctx.clip();
    for(let y=36;y<726;y+=34){let row=Math.floor(y/34);ctx.fillStyle=row%2?'#292a32':'#272831';ctx.fillRect(35,y,1130,33);ctx.strokeStyle='rgba(235,213,181,.055)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(35,y+33);ctx.lineTo(1165,y+33);ctx.stroke();for(let x=45+(row%2)*30;x<1160;x+=90){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+33);ctx.stroke()}}
    // Subtle cool light pools and warm party-room lamps.
    radial(190,145,190,'rgba(255,61,121,.14)');radial(1000,140,200,'rgba(83,230,220,.12)');radial(595,365,235,'rgba(239,185,91,.08)');radial(190,610,210,'rgba(83,230,220,.08)');radial(990,610,210,'rgba(255,61,121,.1)');
    for(const d of decor)drawDecor(d);
    // Wall shadows and wall material.
    for(const w of walls){if(w.type==='furniture')continue;ctx.fillStyle='rgba(0,0,0,.32)';ctx.fillRect(w.x+5,w.y+7,w.w,w.h);ctx.fillStyle='#45434a';ctx.fillRect(w.x,w.y,w.w,w.h);ctx.fillStyle='#625b5d';ctx.fillRect(w.x,w.y,w.w,5);ctx.fillStyle='#292b35';ctx.fillRect(w.x,w.y+w.h-4,w.w,4);ctx.strokeStyle='rgba(255,255,255,.07)';ctx.strokeRect(w.x+.5,w.y+.5,w.w-1,w.h-1)}
    for(const w of walls)if(w.type==='furniture')drawFurniture(w);
    // Door thresholds / room labels
    label('LOUNGE',115,236,'#d87291');label('THE BAR',470,236,'#66c7c0');label('BACK ROOM',878,236,'#66c7c0');label('KITCHEN',75,480,'#8dc6bd');label('DANCE FLOOR',465,480,'#d5a974');label('PRIVATE',850,480,'#d87291');
    // Entrance glow and floor arrow.
    ctx.fillStyle='rgba(83,230,220,.12)';ctx.fillRect(455,727,290,5);ctx.fillStyle='#53e6dc';ctx.globalAlpha=.7;ctx.font='10px monospace';ctx.textAlign='center';ctx.fillText('EXIT',600,715);ctx.globalAlpha=1;
    for(const e of enemies)if(e.alive)drawEnemy(e);
    drawPlayer();for(const b of bullets){ctx.fillStyle=b.from==='player'?COLORS.gold:COLORS.pink;ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=13;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='rgba(255,255,255,.8)';ctx.beginPath();ctx.arc(b.x,b.y,1.2,0,Math.PI*2);ctx.fill()}
    for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.r,p.r);ctx.globalAlpha=1}
    ctx.restore();
    // Exterior building perimeter / neon trim.
    ctx.strokeStyle='rgba(83,230,220,.45)';ctx.lineWidth=2;ctx.strokeRect(34,34,1132,692);ctx.strokeStyle='rgba(255,61,121,.55)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(34,726);ctx.lineTo(455,726);ctx.moveTo(745,726);ctx.lineTo(1166,726);ctx.stroke();
    ctx.restore();
    // Low-light vignette over the level, not over HUD.
    const v=ctx.createRadialGradient(vw/2,vh/2,Math.min(vw,vh)*.22,vw/2,vh/2,Math.max(vw,vh)*.68);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(2,3,10,.48)');ctx.fillStyle=v;ctx.fillRect(0,0,vw,vh);
    // Touch aim reticle, drawn in screen coordinates.
    if(running&&pointer.active&&!matchMedia('(pointer:coarse)').matches){ctx.strokeStyle='rgba(255,206,105,.85)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(pointer.x,pointer.y,8,0,Math.PI*2);ctx.moveTo(pointer.x-12,pointer.y);ctx.lineTo(pointer.x-5,pointer.y);ctx.moveTo(pointer.x+5,pointer.y);ctx.lineTo(pointer.x+12,pointer.y);ctx.moveTo(pointer.x,pointer.y-12);ctx.lineTo(pointer.x,pointer.y-5);ctx.moveTo(pointer.x,pointer.y+5);ctx.lineTo(pointer.x,pointer.y+12);ctx.stroke()}
  }
  function radial(x,y,r,color){let g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2)}
  function label(text,x,y,color){ctx.save();ctx.font='9px monospace';ctx.textAlign='left';ctx.fillStyle='rgba(0,0,0,.4)';ctx.fillText(text,x+1,y+1);ctx.fillStyle=color;ctx.globalAlpha=.7;ctx.fillText(text,x,y);ctx.restore()}
  function drawDecor(d){if(d.type==='rug'){ctx.fillStyle=d.c;ctx.globalAlpha=.34;roundRect(d.x,d.y,d.w,d.h,8);ctx.fill();ctx.globalAlpha=.8;ctx.strokeStyle='rgba(228,199,167,.18)';ctx.lineWidth=2;ctx.strokeRect(d.x+7,d.y+7,d.w-14,d.h-14);ctx.globalAlpha=1;for(let x=d.x+12;x<d.x+d.w-5;x+=22){ctx.fillStyle='rgba(255,255,255,.035)';ctx.fillRect(x,d.y+8,1,d.h-16)}}else if(d.type==='plant'){ctx.fillStyle='#5e493f';ctx.fillRect(d.x,d.y+10,d.w,d.h-10);ctx.fillStyle='#466854';for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(d.x+d.w/2+Math.sin(i*7+d.x)*5,d.y+10+Math.cos(i*4+d.y)*3,4,11,i*.55,0,Math.PI*2);ctx.fill()}}else if(d.type==='table'){ctx.fillStyle='rgba(15,17,25,.5)';ctx.fillRect(d.x+3,d.y+5,d.w,d.h);ctx.fillStyle='#756454';ctx.fillRect(d.x,d.y,d.w,d.h);ctx.strokeStyle='rgba(255,210,140,.18)';ctx.strokeRect(d.x+3,d.y+3,d.w-6,d.h-6)}else{radial(d.x,d.y+5,95,'rgba(255,189,102,.14)')}}
  function drawFurniture(w){ctx.fillStyle='rgba(0,0,0,.36)';ctx.fillRect(w.x+4,w.y+6,w.w,w.h);ctx.fillStyle='#584c4b';ctx.fillRect(w.x,w.y,w.w,w.h);ctx.fillStyle='#80706a';ctx.fillRect(w.x,w.y,w.w,5);ctx.strokeStyle='rgba(255,255,255,.1)';ctx.strokeRect(w.x+.5,w.y+.5,w.w-1,w.h-1);if(w.w>60&&w.h>35){ctx.fillStyle='rgba(32,26,34,.34)';ctx.fillRect(w.x+8,w.y+9,w.w-16,w.h-18)}}
  function drawEnemy(e){let alert=e.alert>.2;ctx.save();ctx.translate(e.x,e.y);ctx.fillStyle='rgba(0,0,0,.45)';ctx.beginPath();ctx.ellipse(2,5,12,8,0,0,Math.PI*2);ctx.fill();ctx.fillStyle=alert?'#a73552':'#43505a';ctx.beginPath();ctx.arc(0,0,e.r,0,Math.PI*2);ctx.fill();ctx.fillStyle=alert?'#ed607b':'#758287';ctx.beginPath();ctx.arc(-2,-4,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#191923';ctx.fillRect(-8,-9,16,4);ctx.fillStyle=alert?'#ffbe75':'#7ee2d8';ctx.fillRect(2,-7,4,2);ctx.strokeStyle='#191923';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(4,4);ctx.lineTo(13,10);ctx.stroke();if(alert){ctx.strokeStyle='rgba(255,61,121,.23)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,17+Math.sin(e.phase*8)*2,0,Math.PI*2);ctx.stroke()}ctx.restore()}
  function drawPlayer(){ctx.save();ctx.translate(player.x,player.y);if(player.invuln>0&&Math.floor(elapsed*18)%2===0)ctx.globalAlpha=.36;ctx.fillStyle='rgba(0,0,0,.45)';ctx.beginPath();ctx.ellipse(2,5,14,9,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#176e77';ctx.beginPath();ctx.arc(0,0,player.r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#72e4d7';ctx.beginPath();ctx.arc(-2,-5,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#162532';ctx.fillRect(-8,-10,16,5);ctx.fillStyle='#ffce69';ctx.fillRect(2,-8,4,2);ctx.strokeStyle='#eee5d5';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(player.faceX*6,player.faceY*6);ctx.lineTo(player.faceX*17,player.faceY*17);ctx.stroke();ctx.restore();
    // Three clear pips are a readable mobile-friendly health bar.
    const sx=player.x-17;for(let i=0;i<3;i++){ctx.fillStyle=i<player.hp?'#ff5b83':'rgba(255,255,255,.18)';ctx.fillRect(sx+i*12,player.y-28,8,3)}
  }
  function loop(now){if(!running)return;let dt=Math.min(.034,(now-last)/1000||0);last=now;update(dt);draw();requestAnimationFrame(loop)}
  function pointerPos(ev){let r=canvas.getBoundingClientRect();pointer.x=ev.clientX-r.left;pointer.y=ev.clientY-r.top}
  canvas.addEventListener('pointermove',ev=>{pointerPos(ev);pointer.active=true});canvas.addEventListener('pointerdown',ev=>{if(ev.pointerType==='mouse'){pointerPos(ev);pointer.down=true;pointer.active=true;canvas.setPointerCapture(ev.pointerId)}});window.addEventListener('pointerup',ev=>{if(ev.pointerType==='mouse')pointer.down=false});
  window.addEventListener('keydown',ev=>{keys[ev.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(ev.code))ev.preventDefault()});window.addEventListener('keyup',ev=>{keys[ev.code]=false});
  const stickZone=$('stick-zone'),knob=$('stick-knob');let stickId=null,stickRect=null;
  stickZone.addEventListener('pointerdown',ev=>{stickId=ev.pointerId;stickRect=stickZone.getBoundingClientRect();stickZone.setPointerCapture(stickId);moveStick(ev)});
  stickZone.addEventListener('pointermove',ev=>{if(ev.pointerId===stickId)moveStick(ev)});
  function moveStick(ev){let cx=stickRect.left+stickRect.width/2,cy=stickRect.top+stickRect.height/2,dx=ev.clientX-cx,dy=ev.clientY-cy,max=38,len=Math.hypot(dx,dy);if(len>max){dx*=max/len;dy*=max/len}mobile.x=dx/max;mobile.y=dy/max;knob.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`}
  function endStick(ev){if(ev.pointerId===stickId){stickId=null;mobile.x=0;mobile.y=0;knob.style.transform='translate(-50%,-50%)'}}stickZone.addEventListener('pointerup',endStick);stickZone.addEventListener('pointercancel',endStick);
  const fireButton=$('fire-button');fireButton.addEventListener('pointerdown',ev=>{ev.preventDefault();mobile.fire=true;fireButton.setPointerCapture(ev.pointerId)});fireButton.addEventListener('pointerup',()=>mobile.fire=false);fireButton.addEventListener('pointercancel',()=>mobile.fire=false);
  $('dash-button').addEventListener('pointerdown',ev=>{ev.preventDefault();keys.Space=true;setTimeout(()=>keys.Space=false,80)});
  $('start-button').addEventListener('click',reset);$('retry-button').addEventListener('click',reset);
  $('sound-toggle').addEventListener('click',()=>{soundOn=!soundOn;$('sound-toggle').innerHTML=soundOn?'♪ <span>SOUND ON</span>':'♪ <span>SOUND OFF</span>';if(soundOn)ping('start')});
  function ping(kind){if(!soundOn)return;try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();let now=audioCtx.currentTime,osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.connect(gain);gain.connect(audioCtx.destination);let freq={shot:185,enemy:95,hit:420,hurt:72,dash:330,reload:230,start:270,win:560,dead:65}[kind]||200;osc.type=kind==='enemy'?'triangle':'square';osc.frequency.setValueAtTime(freq,now);osc.frequency.exponentialRampToValueAtTime(Math.max(35,freq*.55),now+.09);gain.gain.setValueAtTime(kind==='shot'?.035:.045,now);gain.gain.exponentialRampToValueAtTime(.001,now+.11);osc.start(now);osc.stop(now+.12)}catch(_){}}
  // Paint a quiet animated attract screen before the run starts.
  function attract(){if(running)return;drawAttract();requestAnimationFrame(attract)}
  function drawAttract(){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,vw,vh);let g=ctx.createRadialGradient(vw*.5,vh*.5,0,vw*.5,vh*.5,Math.max(vw,vh)*.7);g.addColorStop(0,'#1a1b2a');g.addColorStop(1,'#080a14');ctx.fillStyle=g;ctx.fillRect(0,0,vw,vh);let s=Math.min(vw/850,vh/520,1.15),cx=vw/2,cy=vh/2;ctx.save();ctx.translate(cx-600*s,cy-380*s);ctx.scale(s,s);ctx.fillStyle='#222630';ctx.fillRect(34,34,1132,692);for(let y=40;y<726;y+=34){ctx.fillStyle=y%2?'#292a32':'#272831';ctx.fillRect(35,y,1130,33)}for(const w of walls){ctx.fillStyle=w.type==='furniture'?'#584c4b':'#45434a';ctx.fillRect(w.x,w.y,w.w,w.h)}for(const d of decor)drawDecor(d);ctx.strokeStyle='rgba(83,230,220,.48)';ctx.lineWidth=2;ctx.strokeRect(34,34,1132,692);ctx.restore();ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(0,0,vw,vh)}
  attract();
})();
