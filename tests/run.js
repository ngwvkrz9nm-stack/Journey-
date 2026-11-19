// My Journey regression tests. Run: node tests/run.js
// Uses the pre-installed Playwright + Chromium; serves the app from the repo root.
'use strict';
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const TYPES={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{const f=path.join(ROOT,decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/,'/index.html'));if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end()}res.writeHead(200,{'Content-Type':TYPES[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res)});
let BASE,browser,pass=0,fail=0;
const ok=(cond,name,extra='')=>{if(cond){pass++;console.log('  ✓ '+name)}else{fail++;console.log('  ✗ '+name+(extra?' — '+extra:''))}};
const K={entries:'calorie-calendar-v1',settings:'journey-calendar-settings-v3',pit:'journey-pit-wallet-v4',journal:'my-journey-journal-v5'};
async function page(time,seed){const ctx=await browser.newContext({acceptDownloads:true,serviceWorkers:'block'});const p=await ctx.newPage();p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));p.on('dialog',d=>{p.lastDialog=d.message();d.accept()});
 if(time)await p.clock.install({time:new Date(time)});
 await p.goto(BASE+'/index.html');if(seed){await p.evaluate(([s,K])=>{localStorage.clear();for(const [k,v] of Object.entries(s))localStorage.setItem(K[k],JSON.stringify(v))},[seed,K]);await p.reload()}return p}
const canon=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort()):x);
const store=(p,k)=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),K[k]);
const SETTINGS={name:'Test journey',type:'calories',target:2100,limit:3000,start:'2026-11-01',habitTarget:'A?',habitLimit:'B?'};
const SEED={settings:SETTINGS,entries:{'2026-11-10':{q1:'yes',q2:'yes',result:'good',note:'n1'},'2026-11-11':{pitstop:true,note:''},'2026-11-12':{q1:'no',q2:'no',result:'bad',note:''},'2026-11-13':{q1:'no',q2:'yes',result:'good',note:''}},journal:{'2026-11-12':'Private reflection'},pit:{spent:[{date:'2026-11-11',at:'2026-11-11T10:00:00Z'}],claimed:{'target-14':true,'participation-90':true}}};
(async()=>{
 await new Promise(r=>server.listen(0,r));BASE='http://localhost:'+server.address().port;browser=await chromium.launch();
 const NOW='2026-11-19T12:00:00';

 console.log('Backup & restore');
 {const p=await page(NOW,SEED);await p.goto(BASE+'/advanced.html#settings');
  const [dl]=await Promise.all([p.waitForEvent('download'),p.click('#export')]);const file=await dl.path();const data=JSON.parse(fs.readFileSync(file,'utf8'));
  ok(dl.suggestedFilename()==='MyJourney-Backup-2026-11-19.json','backup file name',dl.suggestedFilename());
  ok(data.version===5&&data.journal&&data.journal['2026-11-12']==='Private reflection','export includes journal');
  ok(data.entries['2026-11-11']?.pitstop===true,'export includes Pit Stop day');
  ok(/Last backup exported/.test(await p.textContent('#backupStatus')),'last-backup status shown');
  await p.evaluate(K=>{localStorage.setItem(K.entries,'{}');localStorage.setItem(K.journal,'{}');localStorage.setItem(K.pit,JSON.stringify({spent:[],claimed:{}}))},K);await p.reload();
  await p.setInputFiles('#backupFile',file);await p.waitForFunction(()=>Object.keys(JSON.parse(localStorage.getItem('calorie-calendar-v1')||'{}')).length>0);
  ok(/4 recorded days \(1 Pit Stop days\)/.test(p.lastDialog)||/Backup restored/.test(p.lastDialog),'restore confirmation lists contents');
  ok(canon(await store(p,'entries'))===canon(SEED.entries),'entries identical after round trip',JSON.stringify(await store(p,'entries')));
  ok(JSON.stringify(await store(p,'journal'))===JSON.stringify(SEED.journal),'journal identical after round trip');
  ok(JSON.stringify(await store(p,'pit'))===JSON.stringify(SEED.pit),'Pit Stop wallet identical after round trip');
  // v4-format backup (no journal) keeps the current journal
  const v4={app:'calorie-calendar',version:4,exportedAt:'2026-11-01T00:00:00Z',entries:{'2026-11-02':{q1:'yes',q2:'yes',result:'good',note:''}},pit:{spent:[],claimed:{}},settings:SETTINGS};
  const v4file=path.join(require('os').tmpdir(),'mj-v4.json');fs.writeFileSync(v4file,JSON.stringify(v4));
  await p.setInputFiles('#backupFile',v4file);await p.waitForFunction(()=>!!JSON.parse(localStorage.getItem('calorie-calendar-v1'))['2026-11-02']);
  ok(JSON.stringify(await store(p,'journal'))===JSON.stringify(SEED.journal),'older backup without journal keeps current journal');
  // invalid file changes nothing
  const bad=path.join(require('os').tmpdir(),'mj-bad.json');fs.writeFileSync(bad,'{"app":"something-else","entries":{}}');const before=await store(p,'entries');
  await p.setInputFiles('#backupFile',bad);await p.waitForTimeout(300);
  ok(/Nothing on this device was changed/.test(p.lastDialog)&&JSON.stringify(await store(p,'entries'))===JSON.stringify(before),'invalid backup rejected without changes');
  const newer=path.join(require('os').tmpdir(),'mj-new.json');fs.writeFileSync(newer,JSON.stringify({...v4,version:9}));
  await p.setInputFiles('#backupFile',newer);await p.waitForTimeout(300);ok(/newer version/.test(p.lastDialog),'backup from newer version refused');
  ok(!p.errors.length,'no page errors',p.errors.join('|'));await p.context().close()}

 console.log('Advanced page');
 {const p=await page(NOW,SEED);
  for(const t of ['settings','pitstops','insights']){await p.goto(BASE+'/advanced.html#'+t);ok(await p.getAttribute(`[data-tab=${t}]`,'class')==='btn active','#'+t+' opens '+t+' tab')}
  ok(await p.locator('a.home-link[href="./index.html"]').count()===1,'link back to Today');
  await p.goto(BASE+'/advanced.html');
  const legend=await p.locator('.legend .dot.bad').evaluate(e=>getComputedStyle(e).backgroundColor),cell=await p.locator('.day.bad').first().evaluate(e=>getComputedStyle(e).backgroundColor);
  ok(legend===cell,'Detour legend colour matches calendar',legend+' vs '+cell);
  await p.click('.day:not(:disabled) >> text="14"');await p.click('#q1 [data-answer=yes]');await p.click('#q2 [data-answer=no]');
  ok(await p.textContent('#q1 .active')==='No','choosing "boundary missed" clears "goal met"');
  await p.click('#q1 [data-answer=yes]');ok(await p.textContent('#q2 .active')==='Yes','choosing "goal met" sets "boundary met"');
  await p.click('#saveDay');ok((await store(p,'entries'))['2026-11-14']?.q2==='yes','saved entry is consistent');
  ok(!p.errors.length,'no page errors',p.errors.join('|'));await p.context().close()}

 console.log('Pit Stop cooldown (Mon–Wed run → next eligible Thursday a week later)');
 {const run={'2026-11-16':{pitstop:true,note:''},'2026-11-17':{pitstop:true,note:''},'2026-11-18':{pitstop:true,note:''}};
  const seed={settings:SETTINGS,entries:run,pit:{spent:Object.keys(run).map(date=>({date,at:''})),claimed:{a:true,b:true,c:true,d:true}}};
  for(const [day,expect] of [['2026-11-25T12:00:00',false],['2026-11-26T12:00:00',true]]){const p=await page(day,seed);await p.goto(BASE+'/advanced.html#pitstops');
   ok((await p.isEnabled('#activatePit'))===expect,`${day.slice(0,10)} eligible=${expect}`,await p.textContent('#pitEligibility'));await p.context().close()}
  const seed2={settings:SETTINGS,entries:{'2026-11-18':{pitstop:true,note:''}},pit:{spent:[{date:'2026-11-18',at:''}],claimed:{a:true,b:true}}};
  const p=await page(NOW,seed2);await p.goto(BASE+'/advanced.html#pitstops');ok(await p.isEnabled('#activatePit'),'day after a 1-day Pit Stop can continue the run');await p.context().close()}

 console.log('Home screen');
 {const p=await page(NOW,{settings:SETTINGS,entries:{}});
  ok(await p.locator('#roadSegments .segment').count()===0&&await p.locator('#roadSegments .future').count()===1,'empty journey: no fake segments, road ahead shown');
  ok(await p.textContent('#roadPct')==='—','empty journey: no percentage');
  ok(await p.isDisabled('#calendar .day >> text="25"'),'future day disabled');ok(await p.isDisabled('#calendar .day >> text="1"')===false&&await p.isDisabled('#calendar >> nth=0')===false,'start-date day enabled');
  await p.click('#checkin');await p.click('[data-question=q1][data-value=yes]');
  ok(await p.getAttribute('[data-question=q2][data-value=yes]','class')==='chosen','goal met implies boundary met');
  await p.click('#saveCheck');const e=(await store(p,'entries'))['2026-11-19'];ok(e&&e.q1==='yes'&&e.q2==='yes','check-in saved for today');
  ok(await p.locator('#roadSegments .segment').count()===1,'one segment after first check-in');
  const len=await p.evaluate(()=>[document.querySelector('#roadSegments .segment').getTotalLength(),document.getElementById('roadShadow').getTotalLength()]);
  ok(len[0]<len[1]*.1,'single day is a short section, not the whole road');
  ok(await p.textContent('#roadPct')==='100%','percentage updates');
  ok(!p.errors.length,'no page errors',p.errors.join('|'));await p.context().close()}
 {const entries={};const d=new Date('2026-10-01T12:00:00');for(let i=0;i<25;i++){const k=d.toISOString().slice(0,10);entries[k]={q1:i%3?'yes':'no',q2:i%5?'yes':'no',result:i%5?'good':'bad'};if(entries[k].q1==='yes')entries[k].q2='yes',entries[k].result='good';d.setDate(d.getDate()+1)}
  const p=await page(NOW,{settings:{...SETTINGS,start:'2026-09-01'},entries});const segs=await p.locator('#roadSegments .segment').evaluateAll(a=>a.map(s=>s.dataset.date));
  ok(segs.length===18&&segs.at(-1)==='2026-10-25'&&segs[0]==='2026-10-08','road shows the latest 18 recorded days in order');
  const s=Object.values(entries);const good=s.filter(e=>e.result==='good').length;ok(await p.textContent('#roadPct')===Math.round(good/s.length*100)+'%','Good Days % = (goal+progress)/recorded');await p.context().close()}
 {const p=await page('2026-11-19T23:59:40',{settings:SETTINGS,entries:{}});ok(await p.textContent('#calendar .today')==='19','today before midnight');
  await p.clock.runFor(60000);ok(await p.textContent('#calendar .today')==='20','today rolls over at midnight without reload');
  await p.click('#checkin');ok(await p.textContent('#checkDate')==='November 20, 2026','check-in targets the new day');await p.context().close()}
 {const p=await page(NOW,{settings:SETTINGS,entries:{},journal:{'2026-11-18':'keep','2026-11-17':'remove me'}});await p.click('[data-screen=journal]');
  await p.locator('.journal-entry',{hasText:'remove me'}).locator('text=Delete entry').click();
  ok(/Delete the journal entry for 2026-11-17/.test(p.lastDialog)&&JSON.stringify(await store(p,'journal'))==='{"2026-11-18":"keep"}','journal delete asks and removes only that entry');await p.context().close()}

 await browser.close();server.close();console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0)})().catch(e=>{console.error(e);process.exit(1)});
