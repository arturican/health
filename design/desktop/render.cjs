const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../../node_modules/playwright');
const OUT = __dirname;
const C = { bg: '#EAF0F5', ink: '#182332', muted: '#586577', accent: '#560BAD', pink: '#C80D68', blue: '#007BA6', soft: '#F2EBFC', line: '#E7EDF2', danger: '#A52239' };
const paths = Object.fromEntries([...fs.readFileSync(path.join(OUT, '../../src/ui/Icon.tsx'), 'utf8').matchAll(/^\s+(\w+): "([^"]+)"/gm)].map(m => [m[1], m[2]]));
const font = fs.readFileSync(path.join(OUT, 'Roboto.ttf')).toString('base64');
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const nav = [['today', 'Сегодня'], ['nutrition', 'Питание'], ['activity', 'Активность'], ['weight', 'Вес'], ['photos', 'Фото'], ['documents', 'Документы'], ['profile', 'Профиль'], ['settings', 'Настройки']];
function sheet(id, title, subtitle, height = 1152, states = false) {
  let body = '';
  const add = s => { body += s; };
  const rect = (x, y, w, h, fill = 'white', r = 16, attrs = '') => add('<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+r+'" fill="'+fill+'" '+attrs+'/>');
  const text = (x, y, value, size = 14, color = C.ink, weight = 400, attrs = '') => add('<text x="'+x+'" y="'+y+'" font-size="'+size+'" font-weight="'+weight+'" fill="'+color+'" '+attrs+'>'+esc(value)+'</text>');
  const line = (x, y, w) => add('<path d="M'+x+' '+y+'h'+w+'" stroke="'+C.line+'"/>');
  const icon = (name, x, y, color = C.muted, size = 24) => add('<svg x="'+x+'" y="'+y+'" width="'+size+'" height="'+size+'" viewBox="0 -960 960 960"><path d="'+paths[name]+'" fill="'+color+'"/></svg>');
  const btn = (x, y, w, label, primary = false, danger = false) => {
    rect(x, y, w, 44, danger ? '#FCECF0' : primary ? C.accent : C.soft, 12);
    text(x+w/2, y+28, label, 14, danger ? C.danger : primary ? 'white' : C.accent, 600, 'text-anchor="middle"');
  };
  function panel(name, x, y, w, h, heading, sub = '') {
    add('<g data-panel="'+esc(name)+'" data-bounds="'+[x,y,w,h].join(',')+'"><title>'+esc(name)+'</title>');
    rect(x, y, w, h, 'white', 20);
    if (heading) text(x+24, y+37, heading, 20, C.ink, 700);
    if (sub) text(x+24, y+63, sub, 13, C.muted);
    return {
      t: (dx, dy, s, size=14, color=C.ink, weight=400, attrs='') => text(x+dx, y+dy, s, size, color, weight, attrs),
      rect: (dx,dy,rw,rh,fill=C.soft,r=12,attrs='') => rect(x+dx,y+dy,rw,rh,fill,r,attrs),
      icon: (name,dx,dy,color=C.accent,size=24) => icon(name,x+dx,y+dy,color,size),
      btn: (dy,label,primary=false,danger=false,rw=w-48,dx=24) => btn(x+dx,y+dy,rw,label,primary,danger),
      rule: dy => line(x+24,y+dy,w-48),
      field: (dy,label,value,rw=w-48,dx=24,error=false) => {
        text(x+dx,y+dy,label,13,C.muted,500);
        rect(x+dx,y+dy+12,rw,44,'#FAFBFD',10,'stroke="'+(error?C.danger:'#C4CDD8')+'"');
        text(x+dx+14,y+dy+40,value,14,error?C.danger:C.ink);
      },
      check: (dy,label,on=true,dx=24) => {
        rect(x+dx,y+dy-15,18,18,on?C.accent:'white',5,on?'':'stroke="#8994A3"');
        if(on) add('<path d="m'+(x+dx+4)+' '+(y+dy-6)+' 3 3 7-7" fill="none" stroke="white" stroke-width="2"/>');
        text(x+dx+30,y+dy,label,14);
      },
      lines: (dy,items,color=C.muted,size=13) => items.forEach((s,i)=>text(x+24,y+dy+i*22,s,size,color)),
      raw: add,
      end: () => add('</g>')
    };
  }
  rect(0,0,1440,height,C.bg,0);
  if (!states) {
    add('<g data-panel="Навигация" data-bounds="0,0,232,'+height+'">');
    rect(0,0,232,height,'white',0);rect(24,32,40,40,C.accent,13);icon('heart',32,40,'white');
    text(76,46,'Дневник',18,C.ink,700);text(76,69,'здоровья',18,C.ink,700);
    text(28,129,'МОЙ ДНЕВНИК',10,C.muted,600,'letter-spacing="1.6"');
    nav.forEach(([key,label],i)=>{const y=148+i*56+(i>5?26:0);if(key===id)rect(16,y,200,48,C.soft,13);icon(key,32,y+12,key===id?C.accent:C.muted);text(72,y+30,label,15,key===id?C.accent:C.ink,key===id?600:400);});
    line(28,498,176);rect(16,height-204,200,126,'#F6F8FA',16);
    icon('documents',32,height-188,C.accent,22);text(32,height-148,'Ваши записи — рядом',14,C.ink,600);
    text(32,height-124,'Хранятся в этом браузере.',12,C.muted);text(32,height-102,'Резервная копия',12,C.accent,600);
    text(28,height-39,'Личный дневник',12,C.muted);add('</g>');
  }
  const left=states?48:272;
  add('<g data-panel="Заголовок" data-bounds="'+left+',20,'+(1400-left)+',125">');
  text(left,46,states?'ФОРМЫ И СОСТОЯНИЯ':'ЛИЧНОЕ ПРОСТРАНСТВО',11,C.muted,500,'letter-spacing="1.6"');
  rect(1266,28,134,28,C.soft,14);text(1333,47,'Демо · пример',12,C.accent,500,'text-anchor="middle"');
  text(left,100,title,36,C.ink,700);text(left,130,subtitle,14,C.muted);add('</g>');
  text(left,height-30,'Все данные вымышлены · Статичный Desktop-макет · 1440 px',12,C.muted);
  return {id,title,height,states,panel,text,rect,line,icon,btn,add,finish:()=>'<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="'+height+'" viewBox="0 0 1440 '+height+'"><title>'+esc(title)+'</title><defs><style>@font-face{font-family:Roboto;src:url(data:font/ttf;base64,'+font+') format("truetype");font-weight:100 900}text{font-family:Roboto,sans-serif}</style></defs>'+body+'</svg>'};
}
function statusPanels(s, y, subject='записи') {
  let p=s.panel('Пустое состояние',48,y,432,214,'Пока нет '+subject);
  p.lines(78,['Отсутствие данных не означает ноль.','Добавьте первую запись, когда будете готовы.']);
  p.btn(142,'Добавить запись',true);p.end();
  p=s.panel('Загрузка и сохранение',504,y,432,214,'Операция выполняется');
  p.lines(78,['Загружаем записи…','Сохраняем… Изменения временно недоступны.','После сохранения фокус возвращается к форме.']);
  p.rect(155,153,252,12,'#E8EDF4',6);p.rect(155,153,128,12,C.soft,6);p.end();
  p=s.panel('Ошибка и результат',960,y,432,214,'Не удалось сохранить');
  p.lines(78,['Черновик сохранён в форме. Повторите попытку.'],C.danger);
  p.btn(102,'Повторить сохранение');p.t(24,182,'После успеха: «Изменения сохранены».',13,C.muted);p.end();
}
function plot(p, x, y, w, h, values, labels, min, max) {
  const points=values.map((v,i)=>[x+i/(values.length-1)*w,y+h-(v-min)/(max-min)*h]);
  for(let i=0;i<4;i++){const yy=y+i*h/3;p.raw('<path d="M'+x+' '+yy+'h'+w+'" stroke="'+C.line+'"/>');}
  p.raw('<path d="M'+x+' '+(y+h)+' L'+points.map(t=>t.join(' ')).join(' L')+' L'+(x+w)+' '+(y+h)+'Z" fill="'+C.pink+'" opacity=".06"/>');
  p.raw('<polyline points="'+points.map(t=>t.join(',')).join(' ')+'" fill="none" stroke="'+C.pink+'" stroke-width="3" stroke-linejoin="round"/>');
  points.forEach(([px,py])=>p.raw('<circle cx="'+px+'" cy="'+py+'" r="4" fill="white" stroke="'+C.pink+'" stroke-width="2"/>'));
  labels.forEach((label,i)=>p.raw('<text x="'+(x+i/(labels.length-1)*w)+'" y="'+(y+h+27)+'" font-size="12" fill="'+C.muted+'" text-anchor="middle">'+esc(label)+'</text>'));
}
function gallery() {
  const cards=nav.filter(([id])=>fs.existsSync(path.join(OUT,id+'-desktop.svg'))).map(([id,label])=>{
    const states=fs.existsSync(path.join(OUT,id+'-states.svg'));
    return '<article><h2>'+label+'</h2><a href="'+id+'-desktop.png"><img src="'+id+'-desktop.png" alt="Desktop-макет: '+label+'" loading="lazy"></a><p><a href="'+id+'-desktop.svg">SVG экрана</a> · <a href="'+id+'-desktop.png">PNG</a>'+(states?' · <a href="'+id+'-states.png">Формы и состояния</a> · <a href="'+id+'-states.svg">SVG состояний</a>':'')+'</p></article>';
  });
  fs.writeFileSync(path.join(OUT,'index.html'),'<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Дневник здоровья · Desktop-макеты</title><style>body{font:16px system-ui;margin:40px;background:#EAF0F5;color:#182332}main{max-width:1440px;margin:auto}section{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}article{background:white;border-radius:20px;padding:24px}img{width:100%;height:auto;border-radius:8px}a{color:#560BAD}p{line-height:1.6}@media(max-width:700px){section{grid-template-columns:1fr}body{margin:16px}}</style><main><h1>Дневник здоровья</h1><p>Desktop-концепты · 1440 px · Синтетические данные<br>Откройте PNG для просмотра или SVG для импорта. Это статичные макеты; формы не выполняют операции.</p><section>'+cards.join('')+'</section><p>Исходные SVG содержат текст и векторы. Auto Layout и компоненты Figma при импорте автоматически не создаются.</p></main></html>');
}
async function render(name) {
  const screens=require('./'+name+'.cjs')({sheet,C,statusPanels,plot});
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const reports=[];
  try {
    for(const s of screens){
      const base=name+(s.states?'-states':'-desktop'),svg=s.finish();
      fs.writeFileSync(path.join(OUT,base+'.svg'),svg);
      const page=await browser.newPage({viewport:{width:1440,height:s.height},deviceScaleFactor:1});
      await page.route('**/*',r=>r.abort());
      await page.setContent('<style>body{margin:0}</style>'+svg);
      await page.evaluate(()=>document.fonts.ready);
      const result=await page.evaluate(()=>{
        const overflow=[],overlaps=[];
        for(const panel of document.querySelectorAll('[data-panel]')){
          const [x,y,w,h]=panel.dataset.bounds.split(',').map(Number);
          const texts=[...panel.querySelectorAll('text')].map(t=>({text:t.textContent,b:t.getBBox()}));
          for(const {text,b} of texts)if(b.x<x-.5||b.y<y-.5||b.x+b.width>x+w+.5||b.y+b.height>y+h+.5)overflow.push({panel:panel.dataset.panel,text});
          for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++){
            const a=texts[i].b,b=texts[j].b;
            if(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y)overlaps.push([texts[i].text,texts[j].text]);
          }
        }
        const structural=[...document.querySelectorAll('svg')].every(n=>Number(n.getAttribute('width'))>0&&Number(n.getAttribute('height'))>0);
        const luminance=rgb=>{const v=rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
        const rectangles=[...document.querySelectorAll('rect')];
        const contrasts=[...document.querySelectorAll('text')].map(t=>{
          const b=t.getBBox(),cx=b.x+b.width/2,cy=b.y+b.height/2;
          const background=rectangles.filter(r=>{const rb=r.getBBox();return (r.compareDocumentPosition(t)&Node.DOCUMENT_POSITION_FOLLOWING)&&rb.x<=cx&&rb.x+rb.width>=cx&&rb.y<=cy&&rb.y+rb.height>=cy;}).at(-1);
          const a=luminance(getComputedStyle(t).fill),z=background?luminance(getComputedStyle(background).fill):1;
          return {text:t.textContent,ratio:(Math.max(a,z)+.05)/(Math.min(a,z)+.05)};
        });
        return {overflow,overlaps,texts:document.querySelectorAll('text').length,images:document.querySelectorAll('image').length,panels:document.querySelectorAll('[data-panel]').length,fontLoaded:document.fonts.check('14px Roboto'),structural,minTextContrast:Math.min(...contrasts.map(c=>c.ratio)),lowContrast:contrasts.filter(c=>c.ratio<4.5)};
      });
      result.minTextContrast=Number(result.minTextContrast.toFixed(2));
      reports.push({screen:base,...result});
      await page.screenshot({path:path.join(OUT,base+'.png')});await page.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(OUT,name+'-validation.json'),JSON.stringify(reports,null,2)+'\n');
  gallery();
  console.log(JSON.stringify(reports));
  if(reports.some(r=>r.overflow.length||r.overlaps.length||r.lowContrast.length||!r.fontLoaded||!r.structural))process.exitCode=1;
}
if(require.main===module)render(process.argv[2]).catch(e=>{console.error(e);process.exitCode=1;});
