// My Journey browser tests (unified V5 app). Run: node tests/run.js
// Uses the pre-installed Playwright + Chromium and serves the repo root.
'use strict';
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const ROOT=path.resolve(__dirname,'..');
const TYPES={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{const f=path.join(ROOT,decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/,'/index.html'));if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end()}res.writeHead(200,{'Content-Type':TYPES[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res)});
let BASE,browser,pass=0,fail=0;
const ok=(c,n,x='')=>{if(c){pass++;console.log('  ✓ '+n)}else{fail++;console.log('  ✗ '+n+(x?' — '+x:''))}};
const LEG={entries:'calorie-calendar-v1',settings:'journey-calendar-settings-v3',pit:'journey-pit-wallet-v4',journal:'my-journey-journal-v5'};
async function open(time,seed,{reduced=false}={}){
  const ctx=await browser.newContext({acceptDownloads:true,serviceWorkers:'block',viewport:{width:390,height:844},reducedMotion:reduced?'reduce':'no-preference'});const p=await ctx.newPage();
  p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));p.dialogs=[];p.on('dialog',d=>{p.dialogs.push(d.message());d.accept()});
  if(time)await p.clock.install({time:new Date(time)});
  await p.goto(BASE+'/blank.html').catch(()=>{});await p.goto(BASE+'/advanced.html#none');await p.waitForURL(/index\.html/);
  await p.evaluate(([seed,LEG])=>{localStorage.clear();if(!seed)return;if(seed.v6)localStorage.setItem('my-journey-data-v6',JSON.stringify(seed.v6));for(const [k,v] of Object.entries(seed.legacy||{}))localStorage.setItem(LEG[k],JSON.stringify(v))},[seed,LEG]);
  await p.goto(BASE+'/index.html#today');await p.reload();await p.waitForTimeout(150);return p}
const store=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('my-journey-data-v6')));
const go=(p,s)=>p.evaluate(s=>location.hash=s,s).then(()=>p.waitForTimeout(120));
const days=(start,list)=>{const e={};const d=new Date(start+'T12:00:00');for(const c of list){const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;if(c==='g')e[k]={q1:'yes',q2:'yes',result:'good',note:''};if(c==='p')e[k]={q1:'no',q2:'yes',result:'good',note:''};if(c==='d')e[k]={q1:'no',q2:'no',result:'bad',note:''};if(c==='s')e[k]={pitstop:true,note:''};d.setDate(d.getDate()+1)}return e};
const NOW='2026-11-19T19:00:00';
const LEGACY={legacy:{settings:{name:'Mindful eating',type:'calories',target:2100,limit:3000,start:'2026-11-01'},entries:days('2026-11-01','ggpgdggsgg'.split('')),pit:{spent:[{date:'2026-11-08',at:''}],claimed:{'target-14':true}},journal:{'2026-11-05':'Old reflection'}}};

(async()=>{
 await new Promise(r=>server.listen(0,r));BASE='http://localhost:'+server.address().port;browser=await chromium.launch();

 console.log('Upgrade from Build 1 / Version 4 data');
 {const p=await open(NOW,LEGACY);const s=await store(p);const j=s.journeys[0];
  ok(s.journeys.length===1&&Object.keys(j.entries).length===10,'all 10 days migrated into one journey');
  ok(j.entries['2026-11-08'].pitstop===true&&j.pit.spent.length===1,'Pit Stop day and wallet migrated');
  ok(s.journal.length===1&&s.journal[0].journeyId===j.id,'journal migrated and linked');
  ok(await p.evaluate(()=>!!localStorage.getItem('calorie-calendar-v1')&&!!localStorage.getItem('my-journey-journal-v5')),'original data kept on device');
  ok(/carried over/.test(await p.textContent('#fatal')),'user told about the upgrade');
  ok(await p.textContent('#pct')==='89%','Good Days % = 8 of 9 (Pit Stop excluded)',await p.textContent('#pct'));
  ok(await p.textContent('#jName')==='Mindful eating'&&/2,100/.test(await p.textContent('#jGoal')),'journey name and goal on Today');
  ok(!p.errors.length,'no page errors',p.errors.join('|'));await p.context().close()}

 console.log('New install');
 {const p=await open(NOW,null);ok(await p.isVisible('#journeyForm')&&!(await p.isVisible('.tabbar')),'first launch asks for a journey (no fake data)');
  await p.click('#jfTemplates button:has-text("Walking")');ok(await p.inputValue('#jfName')==='Walking'&&/walk/.test(await p.inputValue('#jfGoal')),'template fills editable fields');
  await p.fill('#jfGoal','Did I walk 10,000 steps?');await p.click('#jfSave');await p.waitForTimeout(200);
  const s=await store(p);ok(s.journeys.length===1&&s.journeys[0].goal==='Did I walk 10,000 steps?'&&s.journeys[0].start==='2026-11-19','journey created with my own wording');
  ok(await p.textContent('#pct')==='—'&&await p.evaluate(()=>road.days.length)===0,'empty road: no history shown');
  await p.click('#checkin');await p.click('[data-q=q1][data-v=yes]');ok(await p.getAttribute('[data-q=q2][data-v=yes]','aria-pressed')==='true','goal met implies boundary met');
  await p.click('#saveCheck');await p.waitForTimeout(150);
  ok(await p.evaluate(()=>road.days.length===1&&road.days[0].kind==='goal'&&road.anims.some(a=>a.type==='grow')&&road.anims.some(a=>a.type==='cam')),'check-in adds a road section and animates it forward');
  ok(/Goal Day/.test(await p.textContent('#todayAction')),'today shows as recorded');
  ok(!p.errors.length,'no page errors',p.errors.join('|'));await p.context().close()}

 console.log('Journey Path follows real data');
 {const p=await open(NOW,LEGACY);await p.waitForTimeout(300);
  const before=await p.evaluate(()=>road.days.map(d=>d.date+':'+d.kind).join());
  ok(before.split(',').length===10&&before.startsWith('2026-11-01:goal')&&before.includes('2026-11-08:pit'),'one section per recorded day, chronological, Pit Stop included');
  await p.evaluate(()=>openCheck('2026-11-05'));await p.click('[data-q=q1][data-v=yes]');await p.click('#saveCheck');await p.waitForTimeout(150);
  const after=await p.evaluate(()=>({list:road.days.map(d=>d.date+':'+d.kind),anims:road.anims.map(a=>a.type)}));
  ok(after.list.length===10&&after.list[4]==='2026-11-05:goal','editing an earlier day updates its own section, no duplicate');
  ok(after.anims.includes('pulse')&&!after.anims.includes('grow'),'edit highlights the section instead of growing the road');
  await p.evaluate(()=>openCheck('2026-11-12'));await p.click('[data-q=q2][data-v=no]');await p.click('#saveCheck');await p.waitForTimeout(150);
  ok(await p.evaluate(()=>road.days.length===11&&road.days.at(-1).kind==='detour'),'a Detour adds a section; nothing behind it is removed');
  // tap a section → day detail
  await p.waitForTimeout(2200);const hit=await p.evaluate(()=>{const r=document.getElementById('road').getBoundingClientRect();const c=h=>[h.poly.reduce((s,q)=>s+q[0],0)/h.poly.length,h.poly.reduce((s,q)=>s+q[1],0)/h.poly.length];
   const vis=road.hit.filter(h=>{const [x,y]=c(h);return x>5&&y>5&&x<r.width-5&&y<r.height-5});const h=vis.find(h=>h.date==='2026-11-10')||vis[0];if(!h)return null;const [x,y]=c(h);return {date:h.date,x:r.left+x,y:r.top+y}});
  if(hit){await p.mouse.click(hit.x,hit.y);await p.waitForTimeout(150)}
  ok(hit&&await p.isVisible('#dayDialog')&&(await p.textContent('#dayTitle')).includes(new Date(hit.date+'T12:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric'}))&&/Goal at the time/.test(await p.textContent('#dayBody')),'tapping a road section shows that day with the goal at the time');
  ok(!p.errors.length,'no page errors',p.errors.join('|'));await p.context().close()}
 {const p=await open(NOW,LEGACY,{reduced:true});await p.waitForTimeout(200);await p.click('#checkin');await p.click('[data-q=q1][data-v=no]');await p.click('[data-q=q2][data-v=yes]');await p.click('#saveCheck');await p.waitForTimeout(100);
  ok(await p.evaluate(()=>road.anims.length===0&&Math.abs(road.camZ-road.targetCam(road.days.length))<1e-9),'reduced motion: road updates without animation');await p.context().close()}

 console.log('Multiple journeys');
 {const p=await open(NOW,LEGACY);await go(p,'journeys');await p.click('#newJourney');await p.click('#jfTemplates button:has-text("Reading")');await p.click('#jfSave');await p.waitForTimeout(200);
  let s=await store(p);ok(s.journeys.length===2&&s.activeJourneyId===s.journeys[1].id,'second journey created and selected');
  ok(await p.textContent('#pct')==='—'&&await p.evaluate(()=>road.days.length)===0,'new journey has its own empty road');
  await p.click('#checkin');await p.click('[data-q=q2][data-v=no]');await p.click('#saveCheck');await p.waitForTimeout(150);
  s=await store(p);ok(Object.keys(s.journeys[0].entries).length===10&&Object.keys(s.journeys[1].entries).length===1,'check-ins stay in their own journey');
  await go(p,'journeys');await p.click('.jcard >> nth=0');await p.waitForTimeout(150);ok(await p.textContent('#pct')==='89%'&&await p.evaluate(()=>road.days.length)===10,'switching back restores that journey’s road and stats');
  await go(p,'journeys');await p.click('#editJourney');await p.fill('#jfGoal','Did I stay around 1,900 calories?');await p.click('#jfSave');await p.waitForTimeout(150);
  s=await store(p);const j=s.journeys[0];ok(j.chapters.length>=2&&j.chapters.at(-1).from==='2026-11-19'&&j.entries['2026-11-02'].result==='good','goal change starts a chapter; past days unchanged');
  await go(p,'history');ok(/1,900/.test(await p.textContent('#chapters'))&&/2,100/.test(await p.textContent('#chapters')),'History shows chapters');
  ok(!p.errors.length,'no page errors',p.errors.join('|'));await p.context().close()}

 console.log('Journal');
 {const p=await open(NOW,LEGACY);await go(p,'journal');ok((await p.locator('.note').count())===1,'migrated entry listed');
  await p.click('#newNote');await p.fill('#nText','Reached a milestone!');await p.selectOption('#nType','milestone');await p.click('#nSave');await p.waitForTimeout(150);
  await p.click('#newNote');await p.fill('#nText','Second entry same day');await p.selectOption('#nJourney','');await p.click('#nSave');await p.waitForTimeout(150);
  ok((await p.locator('.note').count())===3,'several entries per day, journey optional');
  await p.click('#noteTypes [data-type=milestone]');ok((await p.locator('.note').count())===1,'filter by type');
  await p.click('#noteTypes [data-type=all]');await p.fill('#noteSearch','second');ok((await p.locator('.note').count())===1,'search');
  await p.fill('#noteSearch','');await p.locator('.note',{hasText:'Old reflection'}).locator('text=Delete').click();await p.waitForTimeout(100);
  ok(p.dialogs.some(d=>/Delete this journal entry/.test(d))&&(await store(p)).journal.length===2,'delete asks first');
  ok(!p.errors.length,'no page errors',p.errors.join('|'));await p.context().close()}

 console.log('Pit Stops');
 {const v6=(await (async()=>{const MJ=require('../core.js');const s=MJ.emptyStore();const j=MJ.newJourney({name:'P',goal:'g?',boundary:'b?',start:'2026-10-01'});j.entries=days('2026-10-01',Array(18).fill('p'));s.journeys=[j];s.activeJourneyId=j.id;return s})());
  const p=await open(NOW,{v6});await go(p,'pit');ok(await p.textContent('#pitBalance')==='1','18 Good Days (all Progress) earn a credit');
  await p.click('#takePit');await p.waitForTimeout(200);let s=await store(p);
  ok(s.journeys[0].entries['2026-11-19'].pitstop&&/Pit Stop Day/.test(await p.textContent('#todayAction'))&&!(await p.isVisible('#checkin')),'Pit Stop closes today’s tracking');
  await p.reload();await p.waitForTimeout(150);ok(/Pit Stop Day/.test(await p.textContent('#todayAction')),'Pit Stop state survives reopening');
  ok(await p.evaluate(()=>road.days.at(-1).kind==='pit'),'Pit Stop appears as a purple road section');await p.context().close()}

 console.log('Backup, restore, reset, delete');
 {const p=await open(NOW,LEGACY);await go(p,'journeys');await p.click('#newJourney');await p.click('#jfTemplates button:has-text("Reading")');await p.click('#jfSave');await p.waitForTimeout(150);
  await p.click('#checkin');await p.click('[data-q=q1][data-v=yes]');await p.click('#saveCheck');await p.waitForTimeout(100);
  await go(p,'settings');const [dl]=await Promise.all([p.waitForEvent('download'),p.click('#exportBtn')]);const file=await dl.path();const data=JSON.parse(fs.readFileSync(file,'utf8'));
  ok(dl.suggestedFilename()==='MyJourney-Backup-2026-11-19.json','JSON backup file name');
  ok(data.format==='my-journey-backup'&&data.schema===6&&data.data.journeys.length===2&&data.data.journal.length===1,'backup has every journey and the journal');
  ok(data.summary[0].badges.length>0&&'pitCredits' in data.summary[0]&&data.data.journeys[0].pit.spent.length===1&&data.data.journeys[0].chapters.length>=1,'backup has achievements, Pit Stop ledger and chapters');
  const before=await store(p);
  // reset keeps journal
  await go(p,'journeys');await p.click('.jcard >> nth=0');await go(p,'settings');await p.click('#resetBtn');await p.click('#resetDialog button[value=reset]');await p.waitForTimeout(150);
  let s=await store(p);ok(Object.keys(s.journeys[0].entries).length===0&&s.journal.length===1&&s.journeys.length===2,'reset clears entries, keeps journal and journey');
  // delete requires typing the name
  await go(p,'settings');await p.click('#deleteBtn');ok(await p.isDisabled('#deleteGo'),'delete disabled until name typed');ok(await p.isVisible('#deleteExport'),'offers export first');
  await p.fill('#deleteConfirm','Mindful eating');await p.click('#deleteGo');await p.waitForTimeout(150);s=await store(p);
  ok(s.journeys.length===1&&s.journeys[0].name==='Reading'&&s.journal.length===1&&s.journal[0].journeyId===null,'journey deleted; journal kept as general entry');
  // restore: replace
  await go(p,'settings');await p.setInputFiles('#importFile',file);await p.waitForSelector('#restoreDialog[open]');ok(/2 journeys/.test(await p.textContent('#restoreBody')),'restore explains contents first');
  await p.click('#restoreReplace');await p.waitForTimeout(250);s=await store(p);
  const canon=x=>JSON.stringify(x,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort()):v);
  ok(canon(s.journeys.map(j=>({...j,pit:{spent:j.pit.spent}})))===canon(before.journeys.map(j=>({...j,pit:{spent:j.pit.spent}})))&&canon(s.journal)===canon(before.journal),'replace restores everything exactly');
  // restore: merge does not duplicate
  await go(p,'settings');await p.setInputFiles('#importFile',file);await p.waitForSelector('#restoreDialog[open]');await p.click('#restoreMerge');await p.waitForTimeout(250);s=await store(p);
  ok(s.journeys.length===4&&s.journal.length===1,'merge adds journeys alongside, no duplicate journal entries');
  // bad file
  const bad=path.join(os.tmpdir(),'mj-bad.json');fs.writeFileSync(bad,'{"hello":1}');const pre=JSON.stringify(await store(p));await go(p,'settings');await p.setInputFiles('#importFile',bad);await p.waitForTimeout(250);
  ok(p.dialogs.some(d=>/Nothing on this device was changed/.test(d))&&JSON.stringify(await store(p))===pre,'invalid file rejected, nothing changed');
  // Build 1 backups still import
  const b1=path.join(os.tmpdir(),'mj-b1.json');fs.writeFileSync(b1,JSON.stringify({app:'calorie-calendar',version:5,exportedAt:'2026-11-18T00:00:00Z',entries:days('2026-11-01',['g','s']),journal:{'2026-11-01':'b1 note'},pit:{spent:[{date:'2026-11-02',at:''}],claimed:{'target-14':true}},settings:{name:'From Build 1',type:'calories',target:2000,limit:2500,start:'2026-11-01'}}));
  await go(p,'settings');await p.setInputFiles('#importFile',b1);await p.waitForSelector('#restoreDialog[open]');await p.click('#restoreMerge');await p.waitForTimeout(250);s=await store(p);
  ok(s.journeys.some(j=>j.name==='From Build 1'&&j.entries['2026-11-02'].pitstop)&&s.journal.some(n=>n.text==='b1 note'),'Build 1 backup imports with Pit Stops and journal');
  ok(!p.errors.length,'no page errors',p.errors.join('|'));await p.context().close()}

 console.log('Dates and navigation');
 {const p=await open('2026-11-19T23:59:40',LEGACY);ok(await p.textContent('#calendar .today')==='19','today before midnight');
  await p.clock.runFor(60000);ok(await p.textContent('#calendar .today')==='20','day rolls over at midnight while open');
  await p.click('#checkin');ok(/NOVEMBER 20/.test(await p.textContent('#checkDate')),'check-in targets the new day');
  ok(await p.isDisabled('#calendar .day >> text="25"'),'future days disabled');await p.context().close()}
 {const p=await open(NOW,LEGACY);await p.goto(BASE+'/advanced.html#pitstops');await p.waitForURL(/#pit$/);ok(await p.isVisible('#pit'),'old advanced.html links open the matching screen');
  await go(p,'history');await p.click('[data-hview=year]');ok(await p.locator('.mini').count()===12,'year view');await p.click('[data-hview=lifetime]');ok(await p.locator('.mini').count()>=12,'lifetime view');
  await p.click('[data-hview=month]');await p.click('#hPrev');ok(/October 2026/.test(await p.textContent('#hTitle')),'month navigation');
  await p.setViewportSize({width:320,height:640});await go(p,'today');const sw=await p.evaluate(()=>document.documentElement.scrollWidth);ok(sw<=320,'no horizontal scroll at 320px',String(sw));
  ok(!p.errors.length,'no page errors',p.errors.join('|'));await p.context().close()}

 await browser.close();server.close();console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0)})().catch(e=>{console.error(e);process.exit(1)});
