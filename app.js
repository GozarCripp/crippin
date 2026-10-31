(function(){
  // starburst shapes
  document.querySelectorAll('polygon.burst').forEach(function(p){
    var pts=[], n=16;
    for(var i=0;i<n*2;i++){
      var r=(i%2)?34:48, a=Math.PI*i/n;
      pts.push((50+r*Math.cos(a)).toFixed(1)+','+(50+r*Math.sin(a)).toFixed(1));
    }
    p.setAttribute('points', pts.join(' '));
  });

  // radar chart
  var C=100, R=62;
  var labels=['SIZE','VOLUME','AGE','LIQUIDITY','BUZZ'];
  var ang=[-90,-18,54,126,198].map(function(a){return a*Math.PI/180;});
  function pt(i,s){ return (C+R*s*Math.cos(ang[i])).toFixed(1)+','+(C+R*s*Math.sin(ang[i])).toFixed(1); }
  function ring(s){ return ang.map(function(_,i){return pt(i,s);}).join(' '); }
  var svg=document.getElementById('radar'), h='';
  [1,.66,.33].forEach(function(s){ h+='<polygon points="'+ring(s)+'" fill="none" stroke="#1fb9a8" stroke-width="1.5" opacity=".7"/>'; });
  ang.forEach(function(_,i){ h+='<line x1="'+C+'" y1="'+C+'" x2="'+(C+R*Math.cos(ang[i])).toFixed(1)+'" y2="'+(C+R*Math.sin(ang[i])).toFixed(1)+'" stroke="#1fb9a8" stroke-width="1" opacity=".6"/>'; });
  ang.forEach(function(_,i){
    var lx=C+(R+20)*Math.cos(ang[i]), ly=C+(R+16)*Math.sin(ang[i])+3;
    h+='<text x="'+lx.toFixed(1)+'" y="'+ly.toFixed(1)+'" text-anchor="middle" font-family="Press Start 2P" font-size="7" letter-spacing="0" fill="#ffee33">'+labels[i]+'</text>';
    h+='<text class="rp" x="'+lx.toFixed(1)+'" y="'+(ly+10).toFixed(1)+'" text-anchor="middle" font-family="Press Start 2P" font-size="7" fill="#46ff7f">0%</text>';
  });
  h+='<g class="sweep"><line x1="100" y1="100" x2="100" y2="36" stroke="#c9ffd8" stroke-width="2" opacity=".55"/></g>';
  h+='<polygon id="radarPoly" points="" fill="#46ff7f" fill-opacity=".55" stroke="#c9ffd8" stroke-width="2.5"/>';
  svg.innerHTML=h;

  /* ================= LIVE TOKEN ENGINE =================
     Why it's built this way:
     - Every token is one entry in a config list, so adding a coin = adding one line.
     - All text from the network goes through textContent (never innerHTML),
       so even a hostile API response can't inject script into the page.
     - Rows are built in JS from the config, so the page and the data can't drift apart. */
  var API='https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&price_change_percentage=24h,7d&sparkline=true&ids=';
  var REFRESH_MS=60000;

  // launch = year the network went live (a fact, used for the AGE stat)
  var TOKENS=[
    {id:'ripple',           name:'XRP',  tick:'/XRP',  launch:2012},
    {id:'hedera-hashgraph', name:'HBAR', tick:'/HBAR', launch:2019},
    {id:'stellar',          name:'XLM',  tick:'/XLM',  launch:2014},
    {id:'quant-network',    name:'QNT',  tick:'/QNT',  launch:2018},
    {id:'algorand',         name:'ALGO', tick:'/ALGO', launch:2019},
    {id:'xdce-crowd-sale',  alt:'xdc-network', name:'XDC', tick:'/XDC', launch:2019},   // alt = second known CoinGecko id, whichever answers wins
    {id:'iota',             name:'IOTA', tick:'/IOTA', launch:2016},
    {id:'cardano',          name:'ADA',  tick:'/ADA',  launch:2017}
  ];
  function idList(){ var a=[]; TOKENS.forEach(function(t){ a.push(t.id); if(t.alt) a.push(t.alt); }); return a.join(','); }
  function big(n){ return n>=1e9?'$'+(n/1e9).toFixed(2)+'B':n>=1e6?'$'+(n/1e6).toFixed(1)+'M':'$'+Math.round(n).toLocaleString('en-US'); }
  // Not vetted. Display-only: no price feed, no click. Reasons are plain, opinion-style labels.
  var DENIED=[
    {name:'HAWK TUAH COIN', tick:'/HAWK',  note:'celebrity memecoin // not vetted', stamp:'NOT INVITED'},
    {name:'BONER COIN',     tick:'/BONER', note:'memecoin // no utility',           stamp:'NOPE'},
    {name:'FART COIN',      tick:'/FART',  note:'memecoin // no utility',           stamp:'NO-GO'}
  ];

  function el(tag,cls,text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
  function num(x){ x=Number(x); return isFinite(x)?x:0; }
  function clamp(x){ return Math.max(0,Math.min(100,x)); }
  function ord(n){ return n+(['th','st','nd','rd'][(n%100>10&&n%100<14)?0:(n%10<4?n%10:0)]); }
  function fmtPrice(p){ return p>=1 ? '$'+p.toFixed(2) : '$'+p.toFixed(4); }
  function fmtPct(p){ return (p>=0?'+':'')+p.toFixed(1)+'%'; }

  /* ---- the ranking algorithm: five 0-100 scores, all subjective, all tweakable ----
     SIZE      market-cap rank on a log scale (#1 = 100, #500 = 0)
     VOLUME    24h trading volume on a log scale ($10M = 0, $10B = 100)
     AGE       years since launch, capped at 12 years = 100
     LIQUIDITY turnover = volume / market cap (0.15 or more = 100). High turnover = easy to trade
     BUZZ      price movement (24h x10 + 7d x2) plus recent news mentions (x8 each), capped at 100
     Log scales are used because money spans huge ranges; a straight line would
     squash everything but Bitcoin to zero. */
  function scoreOf(d,t){
    var rank=num(d.market_cap_rank)||500, vol=Math.max(num(d.total_volume),1e7), cap=Math.max(num(d.market_cap),1);
    var a24=Math.abs(num(d.price_change_percentage_24h_in_currency)), a7=Math.abs(num(d.price_change_percentage_7d_in_currency));
    return [
      clamp(100-100*Math.log10(rank)/Math.log10(500)),
      clamp(100*Math.log10(vol/1e7)/3),
      clamp((new Date().getFullYear()-t.launch)/12*100),
      clamp(num(d.total_volume)/cap/0.15*100),
      clamp(a24*10+a7*2+(t.news||0)*8)
    ].map(Math.round);
  }
  function avg(a){ return a.reduce(function(s,x){return s+x;},0)/a.length; }

  /* ---- radar: animated tween so the star morphs when you switch tokens or prices update ---- */
  var poly=document.getElementById('radarPoly'), cur=[0,0,0,0,0], raf=0;
  var calm=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var rp=[].slice.call(svg.querySelectorAll('text.rp'));
  function paint(v){
    poly.setAttribute('points', v.map(function(x,i){return pt(i,x/100);}).join(' '));
    rp.forEach(function(n,i){ n.textContent=Math.round(v[i])+'%'; });   // each axis shows its real 0-100 score
  }
  function tween(target){
    cancelAnimationFrame(raf);
    if(calm){ cur=target.slice(); paint(cur); return; }
    var from=cur.slice(), t0=null;
    function step(ts){
      if(t0===null) t0=ts;
      var k=Math.min(1,(ts-t0)/650); k=1-Math.pow(1-k,3);          // ease-out
      cur=from.map(function(f,i){ return f+(target[i]-f)*k; });
      paint(cur);
      if(k<1) raf=requestAnimationFrame(step);
    }
    raf=requestAnimationFrame(step);
  }

  /* ---- price chart: hourly points, labelled axes, hover readout ----
     Why: a chart without scales can't be trusted. The y axis is the real price range (period low to
     high) and the x axis is real clock time in the viewer's own timezone. CoinGecko sends one point
     per hour, so a point's time = the newest point's time minus one hour per step back. */
  var chartPanel=[].slice.call(document.querySelectorAll('.board > .p')).filter(function(p){ var h=p.querySelector('.ph h3'); return h&&h.textContent.trim()==='SIGNAL ACTIVITY'; })[0];
  var chartTag=chartPanel&&chartPanel.querySelector('.tag'), cbox=chartPanel&&chartPanel.querySelector('.pb');
  var NS='http://www.w3.org/2000/svg';
  function node(n,attrs){ var e=document.createElementNS(NS,n); for(var k in attrs) e.setAttribute(k,attrs[k]); return e; }
  var cs={}, series=null;
  if(cbox){
    while(cbox.firstChild) cbox.removeChild(cbox.firstChild);
    cs.read=el('div','readout','LOADING PRICE HISTORY...');
    var wrap=el('div','chart'); cs.y=el('div','yax'); cs.plot=el('div','plot');
    cs.svg=document.createElementNS(NS,'svg'); cs.svg.setAttribute('viewBox','0 0 760 240'); cs.svg.setAttribute('preserveAspectRatio','none');
    cs.vline=el('div','vline'); cs.dot=el('div','dot'); cs.vline.hidden=true; cs.dot.hidden=true;
    cs.plot.appendChild(cs.svg); cs.plot.appendChild(cs.vline); cs.plot.appendChild(cs.dot);
    cs.x=el('div','xax'); cs.key=el('div','ckey');
    wrap.appendChild(cs.y); wrap.appendChild(cs.plot); wrap.appendChild(el('div')); wrap.appendChild(cs.x);
    cbox.appendChild(cs.read); cbox.appendChild(wrap); cbox.appendChild(cs.key);
  }
  function wipe(n){ while(n.firstChild) n.removeChild(n.firstChild); }
  function stamp(ms){ return new Date(ms).toLocaleString(undefined,{month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}); }
  function stampH(ms){ return new Date(ms).toLocaleString(undefined,{month:'numeric',day:'numeric',hour:'numeric'}); }
  function pctChange(a,b){ return a?((b-a)/a*100):0; }
  function px(p,s){ return '$'+p.toFixed(s.dec); }               // same decimals everywhere on one chart
  function yOf(p,s){ return 220-(p-s.lo)/s.span*200; }       // 20px padding top and bottom inside the 240px box
  function showAt(i){
    if(!series) return;
    var s=series, p=s.pts[i], f=i/(s.pts.length-1);
    cs.read.textContent=stamp(s.t0+i*s.step)+'  //  '+px(p,s)+'  //  '+fmtPct(pctChange(s.pts[0],p))+' VS 7D AGO';
    cs.vline.hidden=false; cs.dot.hidden=false;
    cs.vline.style.left=(f*100)+'%'; cs.dot.style.left=(f*100)+'%'; cs.dot.style.top=(yOf(p,s)/240*100)+'%';
  }
  function drawSpark(t){
    if(!cs.svg) return;
    var pts=t&&t.spark;
    if(chartTag) chartTag.textContent=(t?t.name:'--')+' // 7 DAY PRICE // HOURLY // YOUR LOCAL TIME';
    if(!pts||pts.length<2){
      series=null; cs.sig=''; wipe(cs.svg); wipe(cs.y); wipe(cs.x); wipe(cs.key); cs.vline.hidden=true; cs.dot.hidden=true;
      cs.read.textContent=(t&&t.data)?'NO PRICE HISTORY FOR '+t.name:'LOADING PRICE HISTORY...'; return;
    }
    var n=pts.length, sig=t.name+n+pts[n-1]+(t.data&&t.data.last_updated);
    if(sig===cs.sig) return;                       // nothing new since the last redraw (data changes hourly)
    cs.sig=sig; wipe(cs.svg); wipe(cs.y); wipe(cs.x);
    var lo=Math.min.apply(null,pts), hi=Math.max.apply(null,pts), span=(hi-lo)||1;
    var end=Date.parse(t.data&&t.data.last_updated); if(!isFinite(end)) end=Date.now();
    var step=3600000, s={pts:pts,lo:lo,span:span,step:step,t0:end-(n-1)*step,dec:hi>=1?2:4}; series=s;
    var g=node('g',{stroke:'#14515c','stroke-width':'1.5'});
    [0,.25,.5,.75,1].forEach(function(f){
      var y=yOf(lo+span*f,s);
      g.appendChild(node('line',{x1:0,y1:y,x2:760,y2:y}));
      var yl=el('span',null,px(lo+span*f,s)); yl.style.top=(y/240*100)+'%'; cs.y.appendChild(yl);
      var xl=el('span',null,stampH(s.t0+f*(n-1)*step)); xl.style.left=(f*100)+'%'; cs.x.appendChild(xl);
    });
    cs.svg.appendChild(g);
    var line=pts.map(function(p,i){ return (i?'L':'M')+(i/(n-1)*760).toFixed(1)+','+yOf(p,s).toFixed(1); }).join(' ');
    var col=pts[n-1]>=pts[0]?'#46ff7f':'#ff4fa3';
    cs.svg.appendChild(node('path',{d:line+' L760,240 L0,240 Z',fill:col,'fill-opacity':'.22'}));
    cs.svg.appendChild(node('path',{d:line,fill:'none',stroke:col,'stroke-width':'3','stroke-linejoin':'round'}));
    cs.key.textContent='7D HIGH '+px(hi,s)+'  //  7D LOW '+px(lo,s)+'  //  7D '+fmtPct(pctChange(pts[0],pts[n-1]))+'  //  24H '+fmtPct(num(t.data.price_change_percentage_24h_in_currency))+'  //  '+n+' HOURLY POINTS';
    showAt(n-1);
  }
  if(cs.plot){
    var move=function(e){ if(!series) return; var r=cs.plot.getBoundingClientRect(); var f=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)); showAt(Math.round(f*(series.pts.length-1))); };
    cs.plot.addEventListener('pointermove',move); cs.plot.addEventListener('pointerdown',move);
    cs.plot.addEventListener('pointerleave',function(){ if(series) showAt(series.pts.length-1); });
  }

  /* ---- what is behind each star percent ---- */
  var rkey=document.getElementById('radarKey');
  function radarKey(t){
    if(!rkey) return; wipe(rkey);
    var d=t.data; if(!d||!t.scores) return;
    var rows=[
      ['SIZE',t.scores[0],'RANK #'+(d.market_cap_rank||'--')+' BY MARKET CAP'],
      ['VOLUME',t.scores[1],big(num(d.total_volume))+' TRADED IN 24H'],
      ['AGE',t.scores[2],(new Date().getFullYear()-t.launch)+' YRS SINCE '+t.launch],
      ['LIQUIDITY',t.scores[3],'VOLUME IS '+(num(d.total_volume)/Math.max(num(d.market_cap),1)*100).toFixed(1)+'% OF MARKET CAP'],
      ['BUZZ',t.scores[4],'24H '+fmtPct(num(d.price_change_percentage_24h_in_currency))+' // 7D '+fmtPct(num(d.price_change_percentage_7d_in_currency))+' // '+(t.news||0)+' NEWS']
    ];
    rows.forEach(function(r){ var row=el('div','rk'); row.appendChild(el('b',null,r[0]+' '+r[1]+'%')); row.appendChild(el('span',null,r[2])); rkey.appendChild(row); });
  }

  /* ---- build the list ---- */
  var tlist=document.getElementById('tlist'), selected=null;
  function make(t){
    var row=el('div','trow'), nm=el('div','nm',t.name), sm=el('small',null,t.tick+' // loading...');
    nm.appendChild(sm); row.appendChild(nm);
    var chip=el('div','chip','--'); row.appendChild(chip);
    row.tabIndex=0;
    row.addEventListener('click',function(){ choose(t); });
    row.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); choose(t); } });
    t.row=row; t.sm=sm; t.chip=chip; tlist.appendChild(row);
  }
  TOKENS.forEach(make);

  var roul=el('div','trow roul'), rn=el('div','nm'); roul.tabIndex=0;
  var rc=['#ff4d4d','#ff9a2e','#ffee33','#46ff7f','#2f8fff','#c07bff','#ff4fa3','#ff9a2e'];
  'ROULETTE'.split('').forEach(function(ch,i){ var s=el('span',null,ch); s.style.color=rc[i]; rn.appendChild(s); });
  roul.appendChild(rn); tlist.appendChild(roul);
  function spin(){ var pool=TOKENS.filter(function(t){return t.scores;}); if(pool.length) choose(pool[Math.floor(Math.random()*pool.length)]); }
  roul.addEventListener('click',spin);
  roul.addEventListener('keydown',function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); spin(); } });

  DENIED.forEach(function(d){
    var row=el('div','trow denied'), nm=el('div','nm',d.name);
    nm.appendChild(el('small',null,d.tick+' // '+d.note));
    row.appendChild(nm); row.appendChild(el('div','stamp',d.stamp)); tlist.appendChild(row);
  });

  /* ---- select + show ---- */
  function choose(t){
    selected=t;
    TOKENS.forEach(function(x){ x.row.classList.toggle('on',x===t); });
    document.getElementById('selName').textContent=t.name;
    document.getElementById('selTick').textContent=t.tick;
    document.getElementById('selRank').textContent=t.rank?ord(t.rank):'--';
    document.getElementById('selBpm').textContent=t.scores?Math.round(60+t.scores[4]*0.9):'--';
    tween(t.scores||[0,0,0,0,0]);
    radarKey(t);
    drawSpark(t);
  }

  /* ---- fetch + refresh ---- */
  function apply(arr){
    arr.forEach(function(d){
      TOKENS.forEach(function(t){ if(t.id===d.id||t.alt===d.id){ t.data=d; t.scores=scoreOf(d,t); t.spark=(d.sparkline_in_7d&&Array.isArray(d.sparkline_in_7d.price))?d.sparkline_in_7d.price.map(num):null; } });
    });
    TOKENS.filter(function(t){return t.scores;})
      .sort(function(a,b){ return avg(b.scores)-avg(a.scores); })
      .forEach(function(t,i){ t.rank=i+1; });
    TOKENS.forEach(function(t){
      if(!t.data) return;
      var ch=num(t.data.price_change_percentage_24h_in_currency);
      t.sm.textContent=t.tick+' // '+fmtPrice(num(t.data.current_price));
      t.chip.textContent=fmtPct(ch);
      t.chip.style.color=ch>=0?'':'#ff6a7a';
    });
    TOKENS.forEach(function(t){ if(!t.data) t.sm.textContent=t.tick+' // no feed'; });
    if(selected) choose(selected);
  }
  function refresh(){
    if(document.hidden) return;
    fetch(API+idList(),{cache:'no-store'})
      .then(function(r){ if(!r.ok) throw new Error('feed'); return r.json(); })
      .then(function(arr){ if(!Array.isArray(arr)) throw new Error('feed'); apply(arr); })
      .catch(function(){
        TOKENS.forEach(function(t){ if(!t.data) t.sm.textContent=t.tick+' // feed offline'; });
      });
  }
  // news mentions per coin (from the daily news file) feed the BUZZ stat
  document.addEventListener('crippin:news',function(e){
    var c=(e.detail&&e.detail.buzz&&e.detail.buzz.coins)||{};
    TOKENS.forEach(function(t){ t.news=Math.min(num(c[t.name]),10); });
    var have=TOKENS.filter(function(t){return t.data;});
    if(have.length) apply(have.map(function(t){return t.data;}));
  });
  document.getElementById('statTok').textContent=('00'+TOKENS.length).slice(-3);
  choose(TOKENS[0]);
  refresh();
  setInterval(refresh,REFRESH_MS);
})();
(function(){
  var heads=[].slice.call(document.querySelectorAll('.ph')), cell=6;
  function maskFor(el){
    var w=el.offsetWidth, h=el.offsetHeight, cols=Math.ceil(w/cell), rows=Math.ceil(h/cell), d='';
    for(var c=0;c<cols;c++){
      var t=c/cols, p=t<0.45?1:Math.max(0,1-(t-0.45)/0.55); p=Math.pow(p,1.2);
      for(var r=0;r<rows;r++){ if(Math.random()<p){ d+='M'+(c*cell)+' '+(r*cell)+'h'+cell+'v'+cell+'h-'+cell+'z'; } }
    }
    var svg="<svg xmlns='http://www.w3.org/2000/svg' width='"+w+"' height='"+h+"' shape-rendering='crispEdges'><path d='"+d+"' fill='#000'/></svg>";
    return 'url("data:image/svg+xml;utf8,'+encodeURIComponent(svg)+'")';
  }
  function build(){ heads.forEach(function(el){ var bg=el.querySelector('.phbg'); var m=maskFor(el); bg.style.webkitMaskImage=m; bg.style.maskImage=m; }); }
  heads.forEach(function(el){
    var bg=document.createElement('div'); bg.className='phbg';
    var pw=document.createElement('div'); pw.className='pixwrap';
    for(var i=0;i<16;i++){
      var p=document.createElement('i'), s=3+Math.floor(Math.random()*3)*2;
      p.className='pix';
      p.style.cssText='left:'+(40+Math.random()*58)+'%;top:'+(Math.random()*80)+'%;width:'+s+'px;height:'+s+'px;--dx:'+(20+Math.random()*60)+'px;--dy:'+(-18+Math.random()*30)+'px;--d:'+(2+Math.random()*3)+'s;animation-delay:-'+(Math.random()*4)+'s';
      pw.appendChild(p);
    }
    el.insertBefore(pw, el.firstChild); el.insertBefore(bg, el.firstChild);
  });
  build();
  if(document.fonts&&document.fonts.ready){ document.fonts.ready.then(build); }
  window.addEventListener('load', build);
  var t; window.addEventListener('resize', function(){ clearTimeout(t); t=setTimeout(build,200); });
})();

/* ---- working nav: each tab shows its own panels; the URL hash remembers the tab ---- */
(function(){
  var VIEWS={
    overview:null,
    tokens:['SELECT TOKEN','SIGNAL ACTIVITY'],
    stories:['NEWS STORIES'],
    legislation:['LEGISLATION','ZONE LOAD','BILL TRACKER','TOKENIZATION'],
    lore:['THE LITTLE MAN RISES']
  };
  var links=[].slice.call(document.querySelectorAll('.nav a')),
      panels=[].slice.call(document.querySelectorAll('.board > .p')),
      tiles=document.querySelector('.tiles');
  panels.forEach(function(p){ var h=p.querySelector('.ph h3'); p.dataset.title=h?h.textContent.trim():''; });
  links.forEach(function(a){ var v=a.textContent.trim().toLowerCase(); a.dataset.view=v; a.setAttribute('href','#'+v); });
  function show(view){
    if(!Object.prototype.hasOwnProperty.call(VIEWS,view)) view='overview';
    var list=VIEWS[view];
    panels.forEach(function(p){
      var on=!list||list.indexOf(p.dataset.title)>-1;
      p.hidden=!on; p.classList.toggle('wide',!!list&&on);
    });
    if(tiles) tiles.hidden=!!list;
    links.forEach(function(a){
      var on=a.dataset.view===view; a.classList.toggle('on',on);
      if(on) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
    });
    document.title='CRIPPIN // '+view.toUpperCase();
    window.dispatchEvent(new Event('resize'));   // re-sizes the pixel header effect on newly shown panels
  }
  window.addEventListener('hashchange',function(){ show(location.hash.slice(1)); });
  show(location.hash.slice(1));
})();

/* ---- daily news: reads data/news.json (written once a day by the GitHub Action) ----
   Why: a static site can't safely call news sites itself (blocked by browsers, and keys would leak).
   A scheduled job collects headlines into one small file; the page just reads that file.
   Everything is inserted with textContent, and links must be https, so a bad feed can't inject code. */
(function(){
  function el(tag,cls,text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
  function panel(title){
    return [].slice.call(document.querySelectorAll('.board > .p')).filter(function(p){
      var h=p.querySelector('.ph h3'); return h&&h.textContent.trim()===title; })[0];
  }
  function ago(iso){
    var m=Math.max(0,(Date.now()-Date.parse(iso))/6e4);
    if(!isFinite(m)) return '--';
    return m<60?Math.round(m)+'m':m<1440?Math.round(m/60)+'h':Math.round(m/1440)+'d';
  }
  var STICK={XRP:'b',HBAR:'g',XLM:'k',CRYPTO:'y'}, LSTICK=['y','k','b','g'];
  function storyRow(s,cls){
    var row=el('div','row'), body=el('span');
    row.appendChild(el('span','t',ago(s.published)));
    row.appendChild(el('span','sticker '+cls,String(s.tag||'')));
    var a=el('a',null,s.title); a.href=/^https:\/\//i.test(s.url)?s.url:'#';
    a.target='_blank'; a.rel='noopener noreferrer nofollow';
    body.appendChild(a); body.appendChild(el('span','src',s.source));
    row.appendChild(body); return row;
  }
  function fill(box,rows,empty){
    while(box.firstChild) box.removeChild(box.firstChild);
    if(!rows.length) box.appendChild(el('div','row',empty));
    rows.forEach(function(r){ box.appendChild(r); });
  }
  function level(b){ return b>=60?['HOT','k']:b>=30?['WARM','y']:['CALM','b']; }

  var data=null;
  function render(){
    if(!data) return;
    var wide=location.hash==='#stories';
    var np=panel('NEWS STORIES'), lp=panel('LEGISLATION'), zp=panel('ZONE LOAD');
    var stamp=data.updated?('UPDATED '+data.updated.slice(0,10)+' // HEADLINES LINK TO SOURCES'):'FIRST UPDATE PENDING';
    if(np){
      var rows=(data.stories||[]).slice(0,wide?16:5).map(function(s){ return storyRow(s,STICK[s.tag]||'y'); });
      var box=np.querySelector('.pb');
      fill(box,rows,'NEWS UPDATES DAILY // FIRST RUN PENDING');
      box.appendChild(el('div','row',stamp));
      var tag=np.querySelector('.tag'); if(tag) tag.textContent='FEED // DAILY';
    }
    var topics=(data.buzz&&data.buzz.topics)||[];
    if(lp){
      var lb=lp.querySelector('.pb'); while(lb.firstChild) lb.removeChild(lb.firstChild);
      topics.forEach(function(t){
        var lv=level(t.buzz), r=el('div','bill'), left=el('span');
        left.appendChild(el('b',null,t.name)); left.appendChild(el('i',null,t.count+' stories // last 3 days'));
        var bar=el('div','bar'), fillb=el('i'); fillb.style.width=Math.max(4,t.buzz)+'%'; bar.appendChild(fillb);
        left.appendChild(bar);
        r.appendChild(left); r.appendChild(el('span','sticker '+lv[1],lv[0]+' '+t.buzz)); lb.appendChild(r);
      });
      (data.legislation||[]).slice(0,wide?8:5).forEach(function(s,i){ lb.appendChild(storyRow(s,LSTICK[i%4])); });
      if(!topics.length) lb.appendChild(el('div','row','BILL + TOKENIZATION BUZZ UPDATES DAILY // FIRST RUN PENDING'));
      var lt=lp.querySelector('.tag'); if(lt) lt.textContent='DC + TOKENIZATION // DAILY';
    }
    if(zp && topics.length){
      var bills=zp.querySelectorAll('.bill');
      topics.slice(0,bills.length).forEach(function(t,i){
        var lv=level(t.buzz), b=bills[i];
        while(b.firstChild) b.removeChild(b.firstChild);
        var left=el('span'); left.appendChild(el('b',null,t.name)); left.appendChild(el('i',null,t.count+' stories // 3 days'));
        b.appendChild(left); b.appendChild(el('span','sticker '+lv[1],lv[0]));
      });
      var zt=zp.querySelector('.tag'); if(zt) zt.textContent='BILL BUZZ';
    }
  }
  window.addEventListener('hashchange',render);
  fetch('data/news.json',{cache:'no-cache'})
    .then(function(r){ if(!r.ok) throw new Error('news'); return r.json(); })
    .then(function(d){
      data=d; render();
      var sn=document.getElementById('statNews'); if(sn) sn.textContent=('00'+(d.stories||[]).length).slice(-3);
      document.dispatchEvent(new CustomEvent('crippin:news',{detail:d}));
    })
    .catch(function(){ /* leave the placeholder text in place */ });
})();

/* ---- bills, rules and tokenization stats: reads data/gov.json (written daily by the Action) ---- */
(function(){
  function el(tag,cls,text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
  function clear(n){ while(n.firstChild) n.removeChild(n.firstChild); }
  function link(text,url){ var a=el('a',null,text); a.href=/^https:\/\//i.test(url||'')?url:'#'; a.target='_blank'; a.rel='noopener noreferrer nofollow'; return a; }
  function money(n){ n=Number(n); if(!isFinite(n)) return '--'; return n>=1e9?'$'+(n/1e9).toFixed(2)+'B':n>=1e6?'$'+(n/1e6).toFixed(1)+'M':'$'+Math.round(n).toLocaleString('en-US'); }
  function pct(p){ p=Number(p); return isFinite(p)?(p>=0?'+':'')+p.toFixed(1)+'%':'--'; }
  var STAGE={'LAW':'g','PASSED BOTH':'g','AT PRESIDENT':'g','PASSED HOUSE':'b','PASSED SENATE':'b','IN HOUSE':'y','IN SENATE':'y','VETOED':'k','ACTIVE':'y'};

  function bills(d){
    var box=document.getElementById('billBox'); if(!box) return;
    var list=d.bills||[], rules=d.rules||[];
    if(!list.length&&!rules.length) return;
    clear(box);
    list.forEach(function(b){
      var r=el('div','bill'), left=el('span'), t=el('b'); t.appendChild(link(b.id+' // '+b.title,b.url));
      left.appendChild(t);
      left.appendChild(el('i',null,'SPONSOR: '+(b.sponsor||'--')+' // INTRODUCED '+(b.introduced||'--')));
      var trail=[]; if(b.ball) trail.push('BALL IN: '+b.ball); if(b.house_passed) trail.push('HOUSE PASSED '+b.house_passed); if(b.senate_passed) trail.push('SENATE PASSED '+b.senate_passed);
      if(trail.length) left.appendChild(el('i','ball',trail.join(' // ')));
      left.appendChild(el('i',null,(b.action_date||'')+' '+(b.action||'')));
      r.appendChild(left); r.appendChild(el('span','sticker '+(STAGE[b.stage]||'y'),b.stage||'')); box.appendChild(r);
    });
    if(rules.length){
      box.appendChild(el('div','row','NEW FEDERAL RULES + NOTICES'));
      rules.forEach(function(x){
        var row=el('div','row'), body=el('span');
        row.appendChild(el('span','t',(x.date||'').slice(5)));
        row.appendChild(el('span','sticker b',String(x.type||'DOC').toUpperCase().slice(0,8)));
        body.appendChild(link(x.title,x.url)); body.appendChild(el('span','src',x.agency)); row.appendChild(body); box.appendChild(row);
      });
    }
    box.appendChild(el('div','row','UPDATED '+(d.updated||'').slice(0,10)+' // FACTS FROM OFFICIAL SOURCES, LINKED'));
  }
  function rwa(d){
    var box=document.getElementById('rwaBox'), r=d.rwa; if(!box||!r||!r.top||!r.top.length) return;
    clear(box);
    var head=el('div','bill'), hl=el('span');
    hl.appendChild(el('b',null,'TOTAL LOCKED '+money(r.total)));
    hl.appendChild(el('i',null,r.count+' real-world-asset protocols'));
    head.appendChild(hl); box.appendChild(head);
    r.top.forEach(function(p){
      var row=el('div','bill'), left=el('span'), b=el('b'); b.appendChild(link(p.name,p.url));
      left.appendChild(b); left.appendChild(el('i',null,money(p.tvl)+' // 1d '+pct(p.d1)));
      var up=Number(p.d7)>=0; row.appendChild(left); row.appendChild(el('span','sticker '+(up?'g':'k'),'7D '+pct(p.d7)));
      box.appendChild(row);
    });
  }
  fetch('data/gov.json',{cache:'no-cache'})
    .then(function(r){ if(!r.ok) throw new Error('gov'); return r.json(); })
    .then(function(d){ bills(d); rwa(d);
      var sb=document.getElementById('statBills'); if(sb&&(d.bills||[]).length) sb.textContent=('00'+d.bills.length).slice(-3);
      var sr=document.getElementById('statRwa'); if(sr&&d.rwa&&d.rwa.total) sr.textContent=money(d.rwa.total); })
    .catch(function(){ /* leave placeholders */ });
})();
