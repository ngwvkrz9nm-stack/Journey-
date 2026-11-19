// Node unit tests for core.js. Run: node tests/core.test.js
'use strict';
const MJ=require('../core.js');
let pass=0,fail=0;const ok=(c,n,x='')=>{if(c){pass++;console.log('  ✓ '+n)}else{fail++;console.log('  ✗ '+n+(x?' — '+x:''))}};
const mem=(init={})=>{const m={...init};return{getItem:k=>k in m?m[k]:null,setItem:(k,v)=>{m[k]=String(v)},removeItem:k=>{delete m[k]},raw:m}};
const days=(start,list)=>{const e={};let k=start;for(const c of list){if(c==='g')e[k]={q1:'yes',q2:'yes',result:'good',note:''};else if(c==='p')e[k]={q1:'no',q2:'yes',result:'good',note:''};else if(c==='d')e[k]={q1:'no',q2:'no',result:'bad',note:''};else if(c==='s')e[k]={pitstop:true,note:''};k=MJ.addDays(k,1)}return e};
const journey=entries=>{const j=MJ.newJourney({name:'T',goal:'G?',boundary:'B?',start:'2025-01-01'});j.entries=entries;return j};

console.log('Migration from Version 4 / Prototype data');
{const entries={'2026-01-05':{q1:'yes',q2:'yes',result:'good',note:'a',target:2300,limit:3200,journeyType:'calories'},'2026-02-01':{q1:'no',q2:'yes',result:'good',note:'',target:2300,limit:3200},'2026-09-01':{q1:'yes',q2:'yes',result:'good',note:'',target:2100,limit:3000},'2026-09-02':{pitstop:true,note:''},'2026-09-03':{q1:'no',q2:'no',result:'bad',note:'tough',target:2100,limit:3000},'bad-key':{q1:'yes'}};
 const ls=mem({'calorie-calendar-v1':JSON.stringify(entries),'journey-calendar-settings-v3':JSON.stringify({name:'Eating',type:'calories',target:2100,limit:3000,start:'2026-01-01'}),'journey-pit-wallet-v4':JSON.stringify({spent:[{date:'2026-09-02',at:'x'}],claimed:{'target-14':true,'streak-2026-03-01':true}}),'my-journey-journal-v5':JSON.stringify({'2026-09-03':'A hard day','2026-09-04':'  '}),'my-journey-last-backup':'2026-10-01T00:00:00Z'});
 const before=JSON.stringify(ls.raw);
 const r=MJ.load(ls),j=r.store.journeys[0];
 ok(r.migrated&&r.store.journeys.length===1,'one journey created');
 ok(Object.keys(j.entries).length===5&&j.entries['2026-09-02'].pitstop,'all valid days kept, including the Pit Stop day');
 ok(j.entries['2026-01-05'].note==='a'&&j.entries['2026-01-05'].target===2300,'notes and goal snapshots kept');
 ok(MJ.kind(j.entries['2026-09-03'])==='detour'&&MJ.kind(j.entries['2026-02-01'])==='progress','classifications unchanged');
 ok(j.chapters.length===2&&j.chapters[0].goal.includes('2,300')&&j.chapters[1].from==='2026-09-01'&&j.chapters[1].goal.includes('2,100'),'goal chapters rebuilt from history',JSON.stringify(j.chapters));
 ok(MJ.chapterFor(j,'2026-02-01').goal.includes('2,300'),'day shows the goal of its own chapter');
 ok(r.store.journal.length===1&&r.store.journal[0].journeyId===j.id,'journal migrated and linked');
 ok(j.pit.claimed['target-14']&&j.pit.spent.length===1,'Pit Stop wallet migrated');
 ok(r.store.prefs.lastBackupAt==='2026-10-01T00:00:00Z','last backup date kept');
 const legacyKeys=Object.keys(JSON.parse(before));ok(legacyKeys.every(k=>ls.raw[k]===JSON.parse(before)[k]),'old keys left untouched');
 const r2=MJ.load(ls);ok(!r2.migrated&&r2.store.journeys[0].id===j.id,'migration runs only once');}
{const r=MJ.load(mem());ok(r.fresh&&r.store.journeys.length===0,'new install starts empty (no fake data)')}
{const ls=mem({'calorie-calendar-v1':JSON.stringify({'2026-11-10':{q1:'yes',q2:'yes',result:'good',note:''}})});const j=MJ.load(ls).store.journeys[0];
 ok(j.name==='My calorie journey'&&j.start==='2026-11-09'&&j.goal.includes('2,100'),'Prototype defaults used when settings were never saved')}
{const ls=mem({'calorie-calendar-v1':JSON.stringify({'2026-11-10':{q1:'yes',q2:'yes',result:'good',note:''}}),'journey-calendar-settings-v3':JSON.stringify({type:'habit',habitTarget:'Read 30 min?',habitLimit:'Read at all?',start:'2026-11-01',target:1,limit:2,name:'Reading'})});const j=MJ.load(ls).store.journeys[0];
 ok(j.goal==='Read 30 min?'&&j.boundary==='Read at all?','custom habit questions migrated')}

console.log('Pit Stop credits: 1 per 18 Good Days, 21-Goal-Day streak bonus, 90-day bonus');
{const j=journey(days('2025-01-01','gpgpgpgpgpgpgpgpg'.split('')));MJ.reconcilePit(j);ok(MJ.pitSummary(j,'2025-06-01').earned===0,'17 Good Days → no credit yet')}
{const j=journey(days('2025-01-01','gpgpgpgpgpgpgpgpgp'.split('')));MJ.reconcilePit(j);const s=MJ.pitSummary(j,'2025-06-01');ok(s.earned===1&&j.pit.claimed['good-18'],'18 Good Days (Goal + Progress) → 1 credit');ok(s.nextAt===36,'next credit at 36 Good Days')}
{const j=journey(days('2025-01-01',Array(17).fill('p').concat(['d'],Array(1).fill('p'))));MJ.reconcilePit(j);ok(MJ.pitSummary(j,'2025-06-01').earned===1,'Detours do not reset the cumulative count')}
{const j=journey(days('2025-01-01',Array(21).fill('g')));MJ.reconcilePit(j);ok(j.pit.claimed['streak#1']&&j.pit.claimed['good-18']&&MJ.pitSummary(j,'2025-06-01').earned===2,'21 consecutive Goal Days → bonus credit')}
{const j=journey(days('2025-01-01',Array(42).fill('g')));MJ.reconcilePit(j);ok(Object.keys(j.pit.claimed).filter(k=>k.startsWith('streak')).length===1,'one bonus per consecutive run, however long')}
{const j=journey(days('2025-01-01',Array(21).fill('p')));MJ.reconcilePit(j);ok(!Object.keys(j.pit.claimed).some(k=>k.startsWith('streak')),'Progress Days do not count toward the Goal streak')}
{const j=journey(days('2025-01-01',Array(90).fill('d')));MJ.reconcilePit(j);ok(MJ.pitSummary(j,'2025-06-01').earned===1&&j.pit.claimed['participation-90'],'one-time credit at 90 recorded days');MJ.reconcilePit(j);ok(MJ.pitSummary(j,'2025-06-01').earned===1,'participation credit is not repeated')}
{// historical edits cannot duplicate credits
 const j=journey(days('2025-01-01',Array(21).fill('g')));MJ.reconcilePit(j);const e1=MJ.pitSummary(j,'2025-06-01').earned;
 j.entries['2025-01-10']=MJ.makeEntry('no','no','');MJ.reconcilePit(j);ok(MJ.pitSummary(j,'2025-06-01').earned===e1,'editing a day to Detour does not remove credits');
 j.entries['2025-01-10']=MJ.makeEntry('yes','yes','');MJ.reconcilePit(j);ok(MJ.pitSummary(j,'2025-06-01').earned===e1,'editing it back does not award duplicates');
 for(let i=0;i<5;i++){j.entries['2025-01-03']=MJ.makeEntry('no','no','');MJ.reconcilePit(j);j.entries['2025-01-03']=MJ.makeEntry('yes','yes','');MJ.reconcilePit(j)}ok(MJ.pitSummary(j,'2025-06-01').earned===e1,'toggling repeatedly never adds credits');
 delete j.entries['2025-01-20'];MJ.reconcilePit(j);j.entries['2025-01-20']=MJ.makeEntry('yes','yes','');MJ.reconcilePit(j);ok(MJ.pitSummary(j,'2025-06-01').earned===e1,'clearing and re-recording a day does not duplicate')}
{// Version 4 credits are preserved and count toward the new cumulative series
 const j=journey(days('2025-01-01',Array(40).fill('p')));j.pit.claimed={'target-14':true,'target-28':true};MJ.reconcilePit(j);
 ok(MJ.pitSummary(j,'2025-06-01').earned===2,'2 V4 credits kept; 40 Good Days earn no duplicate',JSON.stringify(j.pit.claimed));
 for(let i=40;i<54;i++)j.entries[MJ.addDays('2025-01-01',i)]=MJ.makeEntry('no','yes','');MJ.reconcilePit(j);ok(MJ.pitSummary(j,'2025-06-01').earned===3&&j.pit.claimed['good-54'],'3rd cumulative credit at 54 Good Days')}
{const j=journey(days('2025-01-01',Array(21).fill('g')));j.pit.claimed={'streak-2025-01-21':true};MJ.reconcilePit(j);ok(Object.keys(j.pit.claimed).filter(k=>k.startsWith('streak')).length===1,'V4 streak credit counts as that run’s bonus')}

console.log('Pit Stop use and cooldown');
{const j=journey(days('2025-01-01',Array(18).fill('g')));MJ.reconcilePit(j);MJ.activatePit(j,'2025-02-01');ok(MJ.kind(j.entries['2025-02-01'])==='pit'&&MJ.pitSummary(j,'2025-02-01').balance===0,'activating spends a credit and records the day');
 let threw=false;try{MJ.activatePit(j,'2025-02-02')}catch{threw=true}ok(threw,'cannot activate without credits')}
{const j=journey(Object.assign(days('2025-01-01',Array(60).fill('g')),days('2025-03-02',['s','s','s'])));
 ok(!MJ.pitEligibility(j,'2025-03-11').allowed&&MJ.pitEligibility(j,'2025-03-12').allowed,'3-day run → 7 full days of cooldown');
 ok(!MJ.pitEligibility(j,'2025-03-04').allowed,'cannot take a 4th consecutive day')}
{const j=journey(days('2025-03-02',['s','s']));ok(!MJ.pitEligibility(j,'2025-03-08').allowed&&MJ.pitEligibility(j,'2025-03-09').allowed,'2-day run → 5 full days (Mar 4–8), eligible Mar 9');}
{const j=journey(days('2025-03-02',['s']));ok(MJ.pitEligibility(j,'2025-03-03').allowed,'run can continue next day');ok(!MJ.pitEligibility(j,'2025-03-05').allowed&&MJ.pitEligibility(j,'2025-03-06').allowed,'1-day run → 3 full days (Mar 3–5), eligible Mar 6')}

console.log('Statistics and chapters');
{const j=journey(days('2025-01-01','ggggggggggggppppddds'.split('')));const s=MJ.stats(j.entries);ok(s.good===16&&s.recorded===19&&s.rate===84,'12 goal + 4 progress + 3 detour = 84%, Pit Stop excluded')}
{const j=journey({});MJ.updateJourney(j,{goal:'New goal?'},'2025-06-01');ok(j.chapters.length===2&&MJ.chapterFor(j,'2025-05-31').goal==='G?'&&MJ.chapterFor(j,'2025-06-01').goal==='New goal?','goal change starts a new chapter, past keeps old goal');
 MJ.updateJourney(j,{goal:'Again?'},'2025-06-01');ok(j.chapters.length===2,'same-day edits update that chapter');
 MJ.updateJourney(j,{name:'Renamed'},'2025-06-02');ok(j.chapters.length===2,'renaming does not create a chapter')}

console.log('Backups');
{const ls=mem();const s=MJ.emptyStore();const a=MJ.newJourney({name:'A',goal:'g',boundary:'b',start:'2025-01-01'}),b=MJ.newJourney({name:'B',goal:'g2',boundary:'b2',start:'2025-02-01'});
 a.entries=days('2025-01-01',Array(20).fill('g').concat(['s','d']));MJ.reconcilePit(a);a.pit.spent.push({date:'2025-01-21',at:''});b.entries=days('2025-02-01',['p','d']);
 MJ.updateJourney(a,{goal:'g-new'},'2025-01-15');
 s.journeys=[a,b];s.activeJourneyId=b.id;s.journal=[MJ.cleanJournalEntry({date:'2025-01-05',text:'hello',journeyId:a.id,type:'milestone'}),MJ.cleanJournalEntry({date:'2025-01-06',text:'free',journeyId:null})];
 const file=JSON.parse(JSON.stringify(MJ.buildBackup(s,'2025-03-01')));
 ok(file.format==='my-journey-backup'&&file.schema===6&&file.counts.journeys===2,'versioned format with counts');
 ok(file.summary[0].pitCredits.available===0&&file.summary[0].badges.includes('First Entry'),'achievements and Pit Stop credits included');
 const p=MJ.parseBackup(file),restored=MJ.applyRestore(MJ.emptyStore(),p,'replace');
 const canon=x=>JSON.stringify(x,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort()):v);
 ok(canon(restored.journeys)===canon(s.journeys),'all journeys, days, chapters, wallets identical after restore');
 ok(canon(restored.journal)===canon(s.journal),'journal identical after restore');
 ok(restored.activeJourneyId===b.id,'active journey kept');
 const merged=MJ.applyRestore(restored,p,'merge');ok(merged.journeys.length===4&&merged.journal.length===2,'merge adds journeys beside existing ones and does not duplicate journal entries');
 ok(new Set(merged.journeys.map(j=>j.id)).size===4,'merged journeys get unique ids');
 let e='';try{MJ.parseBackup({...file,schema:7})}catch(x){e=x.message}ok(/newer version/.test(e),'newer schema refused');
 e='';try{MJ.parseBackup({hello:1})}catch(x){e=x.message}ok(/not a My Journey backup/.test(e),'foreign file refused');}
{const legacy={app:'calorie-calendar',version:5,entries:{'2026-11-10':{q1:'yes',q2:'yes',result:'good',note:''},'2026-11-11':{pitstop:true,note:''}},journal:{'2026-11-10':'hi'},pit:{spent:[{date:'2026-11-11',at:''}],claimed:{'target-14':true}},settings:{name:'Old',type:'calories',target:2000,limit:2800,start:'2026-11-01'}};
 const p=MJ.parseBackup(legacy);ok(p.kind==='legacy'&&Object.keys(p.journeys[0].entries).length===2&&p.journal.length===1,'Build 1 / V4 backups import as a journey');
 const v4=MJ.parseBackup({...legacy,version:4,journal:undefined});const st=MJ.emptyStore();st.journal=[MJ.cleanJournalEntry({date:'2026-01-01',text:'keep me'})];ok(MJ.applyRestore(st,v4,'replace').journal.length===1,'backup without journal keeps current journal')}

console.log('Reset and delete');
{const s=MJ.emptyStore();const a=MJ.newJourney({name:'A',start:'2025-01-01'}),b=MJ.newJourney({name:'B',start:'2025-01-01'});a.entries=days('2025-01-01',['g','d']);a.pit.claimed={x:true};s.journeys=[a,b];s.activeJourneyId=a.id;s.journal=[MJ.cleanJournalEntry({date:'2025-01-01',text:'n',journeyId:a.id})];
 MJ.resetEntries(s,a.id);ok(!Object.keys(a.entries).length&&!Object.keys(a.pit.claimed).length&&s.journal.length===1&&s.journeys.length===2,'reset clears days and wallet, keeps journal and journey');
 MJ.deleteJourney(s,a.id);ok(s.journeys.length===1&&s.journal[0].journeyId===null&&s.activeJourneyId===b.id,'delete journey keeps (unlinked) journal by default');
 s.journal[0].journeyId=b.id;MJ.deleteJourney(s,b.id,{deleteJournal:true});ok(!s.journal.length&&s.activeJourneyId===null,'optional journal deletion')}

console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
