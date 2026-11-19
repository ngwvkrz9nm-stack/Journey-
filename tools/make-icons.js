// Regenerates the app icons (midnight sky, mountains, a road of coloured day sections).
// Run: node tools/make-icons.js   (uses the pre-installed Playwright + Chromium)
'use strict';
const {chromium}=require('playwright');const fs=require('fs'),path=require('path');
const draw=size=>{const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d'),S=size/512;g.scale(S,S);
 let gr=g.createLinearGradient(0,0,0,512);gr.addColorStop(0,'#030a18');gr.addColorStop(.48,'#0b2a57');gr.addColorStop(.62,'#123a6e');gr.addColorStop(1,'#030a18');g.fillStyle=gr;g.fillRect(0,0,512,512);
 const hy=300;const rg=g.createRadialGradient(256,hy,0,256,hy,260);rg.addColorStop(0,'rgba(170,230,255,.75)');rg.addColorStop(.35,'rgba(80,160,240,.25)');rg.addColorStop(1,'rgba(40,90,180,0)');g.fillStyle=rg;g.fillRect(0,0,512,512);
 const range=(pts,top,bot)=>{g.beginPath();g.moveTo(0,hy);pts.forEach(([x,y])=>g.lineTo(x,y));g.lineTo(512,hy);g.closePath();const l=g.createLinearGradient(0,170,0,hy);l.addColorStop(0,top);l.addColorStop(1,bot);g.fillStyle=l;g.fill()};
 range([[0,250],[70,205],[120,232],[190,160],[250,215],[320,150],[390,210],[450,182],[512,228]],'#4f7fbd','#2b5a96');
 range([[0,268],[90,236],[160,262],[230,228],[300,260],[380,232],[460,258],[512,240]],'#1d4278','#173a6c');
 gr=g.createLinearGradient(0,hy,0,512);gr.addColorStop(0,'#123462');gr.addColorStop(.4,'#071a36');gr.addColorStop(1,'#030a18');g.fillStyle=gr;g.fillRect(0,hy,512,212);
 // road: centre curve from bottom to horizon, perspective width
 const P=t=>{const y=512-(512-hy-4)*(1-Math.pow(1-t,2.2));const x=256+(Math.sin(t*5.2+.4)-Math.sin(.4))*70*(1-t)-10*t;const w=150*Math.pow(1-t,1.6)+3;return [x,y,w]};
 const strip=(a,b,k)=>{g.beginPath();for(let i=0;i<=20;i++){const [x,y,w]=P(a+(b-a)*i/20);i?g.lineTo(x-w*k,y):g.moveTo(x-w*k,y)}for(let i=20;i>=0;i--){const [x,y,w]=P(a+(b-a)*i/20);g.lineTo(x+w*k,y)}g.closePath()};
 strip(0,1,.62);g.fillStyle='rgba(120,210,255,.9)';g.fill();strip(0,1,.56);g.fillStyle='#0a1a36';g.fill();
 const cols=['#18c98c','#18c98c','#a8eec8','#18c98c','#f6b242','#18c98c','#aa8cff','#18c98c'];
 cols.forEach((c,i)=>{const a=i*.07,b=a+.064;strip(a,b,.47);g.fillStyle=c;g.fill()});
 const [tx,ty]=P(.56);const tg=g.createRadialGradient(tx,ty,0,tx,ty,40);tg.addColorStop(0,'rgba(240,252,255,1)');tg.addColorStop(.3,'rgba(150,225,255,.6)');tg.addColorStop(1,'rgba(90,190,255,0)');g.fillStyle=tg;g.beginPath();g.ellipse(tx,ty,40,22,0,0,7);g.fill();
 return c.toDataURL('image/png')};
(async()=>{const b=await chromium.launch(),p=await b.newPage();await p.setContent('<html></html>');
 for(const size of [180,192,512]){const url=await p.evaluate(`(${draw})(${size})`);fs.writeFileSync(path.join(__dirname,'..',`icon-${size}.png`),Buffer.from(url.split(',')[1],'base64'))}
 await b.close();console.log('icons written')})();
