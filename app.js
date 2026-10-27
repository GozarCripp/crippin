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
  /* Backup feed: Kraken's public ticker (free, no key). Used only when CoinGecko fails or rate-limits.
     It gives price and today's open (since 00:00 UTC), so the % chip is "today" while on backup. */
  var KRAKEN='https://api.kraken.com/0/public/Ticker?pair=';
  var STORE='crippin:prices:v1';    // last good prices, kept in this browser only
  var STALE_MS=5*60000;             // older than this, the price shows its age
  var CG_PAUSE_MS=5*60000;          // after a CoinGecko failure, rest it this long and use the backup

  // launch = year the network went live (a fact, used for the AGE stat)
  var TOKENS=[
    {id:'ripple',           name:'XRP',  tick:'/XRP',  launch:2012, kr:['XRPUSD','XXRPZUSD']},
    {id:'hedera-hashgraph', name:'HBAR', tick:'/HBAR', launch:2019, kr:['HBARUSD']},
    {id:'stellar',          name:'XLM',  tick:'/XLM',  launch:2014, kr:['XLMUSD','XXLMZUSD']}
  ];
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
  function age(ms){ var m=Math.max(0,ms)/6e4; return m<60?Math.max(1,Math.round(m))+'M':m<1440?Math.round(m/60)+'H':Math.round(m/1440)+'D'; }

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
  function paint(v){ poly.setAttribute('points', v.map(function(x,i){return pt(i,x/100);}).join(' ')); }
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

  /* ---- 7-day price chart for the selected token ----
     Why: the line is just the price points scaled to fit the box. Find min and max,
     map each price to a y position between them, and join the dots into a path.
     The SVG is stretched to fit (preserveAspectRatio=none), so it stays crisp at any width. */
  var chartPanel=[].slice.call(document.querySelectorAll('.board > .p')).filter(function(p){ var h=p.querySelector('.ph h3'); return h&&h.textContent.trim()==='SIGNAL ACTIVITY'; })[0];
  var chartSvg=chartPanel&&chartPanel.querySelector('svg'), chartTag=chartPanel&&chartPanel.querySelector('.tag');
  var NS='http://www.w3.org/2000/svg';
  function node(n,attrs){ var e=document.createElementNS(NS,n); for(var k in attrs) e.setAttribute(k,attrs[k]); return e; }
  function drawSpark(t){
    if(!chartSvg) return;
    while(chartSvg.firstChild) chartSvg.removeChild(chartSvg.firstChild);
    var g=node('g',{stroke:'#14515c','stroke-width':'1.5'});
    [40,90,140,190].forEach(function(y){ g.appendChild(node('line',{x1:0,y1:y,x2:760,y2:y})); });
    chartSvg.appendChild(g);
    var pts=t&&t.spark;
    var old=t&&t.cgAt&&Date.now()-t.cgAt>STALE_MS;
    if(chartTag) chartTag.textContent=(t?t.name:'--')+' // 7 DAY PRICE // '+(pts?(old?'SAVED '+age(Date.now()-t.cgAt)+' AGO':'LIVE'):t&&t.quote?'WAITING FOR CHART DATA':'LOADING');
    if(!pts||pts.length<2) return;
    var lo=Math.min.apply(null,pts), hi=Math.max.apply(null,pts), span=(hi-lo)||1;
    var line=pts.map(function(p,i){ return (i?'L':'M')+(i/(pts.length-1)*760).toFixed(1)+','+(210-(p-lo)/span*180).toFixed(1); }).join(' ');
    var col=pts[pts.length-1]>=pts[0]?'#46ff7f':'#ff4fa3';
    chartSvg.appendChild(node('path',{d:line+' L760,240 L0,240 Z',fill:col,'fill-opacity':'.22'}));
    chartSvg.appendChild(node('path',{d:line,fill:'none',stroke:col,'stroke-width':'3','stroke-linejoin':'round'}));
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
    drawSpark(t);
  }

  /* ---- fetch + refresh ----
     Order: CoinGecko (full stats) -> Kraken (price only) -> last good prices saved in this browser.
     The page never goes blank once it has seen a price; a stale price shows how old it is. */
  var feedTag=document.querySelector('.p.tok .tag');
  function rescore(){
    TOKENS.forEach(function(t){ if(t.data) t.scores=scoreOf(t.data,t); });
    TOKENS.filter(function(t){return t.scores;})
      .sort(function(a,b){ return avg(b.scores)-avg(a.scores); })
      .forEach(function(t,i){ t.rank=i+1; });
    if(selected) choose(selected);
  }
  function showQuotes(){
    var now=Date.now(), oldest=0, backup=false, n=0;
    TOKENS.forEach(function(t){
      var q=t.quote; if(!q) return; n++;
      var stale=now-q.at>STALE_MS;
      t.sm.textContent=t.tick+' // '+fmtPrice(q.price)+(stale?' // '+age(now-q.at)+' AGO':'');
      t.chip.textContent=q.ch==null?'--':fmtPct(q.ch);
      t.chip.style.color=q.ch==null||q.ch>=0?'':'#ff6a7a';
      if(stale) oldest=Math.max(oldest,now-q.at);
      if(q.src==='KRAKEN') backup=true;
    });
    if(feedTag) feedTag.textContent='VETTED LIST // '+(!n?'FEED OFFLINE':oldest?'SAVED '+age(oldest)+' AGO':backup?'LIVE // BACKUP FEED':'LIVE');
  }
  // CoinGecko rows -> token stats. `at` is when the rows were fetched (now, or the saved time).
  function apply(arr,at){
    arr.forEach(function(d){
      TOKENS.forEach(function(t){
        if(!d||t.id!==d.id) return;
        t.data=d; t.cgAt=at;
        t.spark=(d.sparkline_in_7d&&Array.isArray(d.sparkline_in_7d.price))?d.sparkline_in_7d.price.map(num):null;
        var price=num(d.current_price);
        if(price>0&&(!t.quote||at>=t.quote.at)) t.quote={price:price, ch:num(d.price_change_percentage_24h_in_currency), src:'COINGECKO', at:at};
      });
    });
    rescore(); showQuotes();
  }
  function save(){
    try{
      var cg={}, q={};
      TOKENS.forEach(function(t){ if(t.data) cg[t.id]={at:t.cgAt,d:t.data}; if(t.quote) q[t.id]=t.quote; });
      localStorage.setItem(STORE,JSON.stringify({v:1,cg:cg,q:q}));
    }catch(e){ /* private mode or storage full: live prices still work */ }
  }
  function load(){
    var s=null;
    try{ s=JSON.parse(localStorage.getItem(STORE)||'null'); }catch(e){ return; }
    if(!s||s.v!==1||typeof s.cg!=='object'||typeof s.q!=='object') return;
    TOKENS.forEach(function(t){
      var c=s.cg&&s.cg[t.id], q=s.q&&s.q[t.id];
      if(c&&c.d&&typeof c.d==='object'&&num(c.at)>0) apply([c.d],num(c.at));
      if(q&&num(q.price)>0&&num(q.at)>0&&(!t.quote||num(q.at)>t.quote.at))
        t.quote={price:num(q.price), ch:q.ch==null?null:num(q.ch), src:q.src==='KRAKEN'?'KRAKEN':'COINGECKO', at:num(q.at)};
    });
    showQuotes();
  }
  function getJSON(url){
    var ctl=window.AbortController?new AbortController():null, timer=ctl&&setTimeout(function(){ ctl.abort(); },10000);
    return fetch(url,{cache:'no-store',signal:ctl?ctl.signal:undefined})
      .then(function(r){ if(!r.ok) throw new Error('feed '+r.status); return r.json(); })
      .finally(function(){ clearTimeout(timer); });
  }
  function kraken(){
    return getJSON(KRAKEN+TOKENS.map(function(t){return t.kr[0];}).join(',')).then(function(j){
      var res=j&&j.result, now=Date.now(), n=0;
      if(!res||typeof res!=='object') throw new Error('feed');
      TOKENS.forEach(function(t){
        var r=null;
        t.kr.forEach(function(k){ if(!r&&Object.prototype.hasOwnProperty.call(res,k)) r=res[k]; });
        var price=num(r&&r.c&&r.c[0]), open=num(r&&r.o);
        if(price>0){ t.quote={price:price, ch:open>0?(price-open)/open*100:null, src:'KRAKEN', at:now}; n++; }
      });
      if(!n) throw new Error('feed');
      showQuotes();
      if(selected&&!selected.spark) drawSpark(selected);
    });
  }
  var cgPauseUntil=0;
  function coingecko(){
    if(Date.now()<cgPauseUntil) return Promise.reject(new Error('resting'));
    return getJSON(API+TOKENS.map(function(t){return t.id;}).join(',')).then(function(arr){
      if(!Array.isArray(arr)||!arr.length) throw new Error('feed');
      apply(arr,Date.now());
    }).catch(function(e){ cgPauseUntil=Date.now()+CG_PAUSE_MS; throw e; });
  }
  function refresh(){
    if(document.hidden) return;
    coingecko()
      .catch(kraken)
      .then(save)
      .catch(function(){
        showQuotes();   // keeps saved prices up, now with their age
        TOKENS.forEach(function(t){ if(!t.quote) t.sm.textContent=t.tick+' // feed offline'; });
      });
  }
  // news mentions per coin (from the daily news file) feed the BUZZ stat
  document.addEventListener('crippin:news',function(e){
    var c=(e.detail&&e.detail.buzz&&e.detail.buzz.coins)||{};
    TOKENS.forEach(function(t){ t.news=Math.min(num(c[t.name]),10); });
    rescore();
  });
  document.getElementById('statTok').textContent=('00'+TOKENS.length).slice(-3);
  choose(TOKENS[0]);
  load();
  refresh();
  setInterval(refresh,REFRESH_MS);
})();
/* ---- header boxes: pixel dissolve ----
   Each header's mask is built once per size (seeded, so it looks the same every time) and
   then reused, so a resize or tab switch only looks the mask up instead of redrawing it. Columns are rounded to steps of 4 so small width changes reuse the same mask
   (it stretches a few pixels, which you can't see). Small screens and reduced-motion get no
   drifting pixels, just the static dissolve. */
(function(){
  var heads=[].slice.call(document.querySelectorAll('.ph')), cell=6, cache={};
  var mq=window.matchMedia?function(q){ return window.matchMedia(q).matches; }:function(){ return false; };
  var lite=mq('(max-width:700px)')||mq('(prefers-reduced-motion: reduce)');
  function rng(seed){ return function(){ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; }; }
  function maskFor(n,cols,rows){
    var key=n+':'+cols+'x'+rows; if(cache[key]) return cache[key];
    var rand=rng(n*7919+cols*131+rows*7+1), w=cols*cell, h=rows*cell, d='';
    for(var c=0;c<cols;c++){
      var t=c/cols, p=t<0.45?1:Math.max(0,1-(t-0.45)/0.55); p=Math.pow(p,1.2);
      for(var r=0;r<rows;r++){ if(rand()<p){ d+='M'+(c*cell)+' '+(r*cell)+'h'+cell+'v'+cell+'h-'+cell+'z'; } }
    }
    var svg="<svg xmlns='http://www.w3.org/2000/svg' width='"+w+"' height='"+h+"' viewBox='0 0 "+w+" "+h+"' preserveAspectRatio='none' shape-rendering='crispEdges'><path d='"+d+"' fill='#000'/></svg>";
    return (cache[key]='url("data:image/svg+xml;utf8,'+encodeURIComponent(svg)+'")');
  }
  function build(){
    heads.forEach(function(el,n){
      var w=el.offsetWidth, h=el.offsetHeight; if(!w||!h) return;          // hidden tab: keep the old mask
      var cols=Math.max(4,Math.round(w/cell/4)*4), rows=Math.ceil(h/cell), key=cols+'x'+rows;
      if(el._mk===key) return;
      var bg=el._bg, m=maskFor(n,cols,rows); bg.style.webkitMaskImage=m; bg.style.maskImage=m; el._mk=key;
    });
  }
  heads.forEach(function(el){
    var bg=document.createElement('div'); bg.className='phbg'; el._bg=bg;
    if(!lite){
      var pw=document.createElement('div'); pw.className='pixwrap';
      for(var i=0;i<16;i++){
        var p=document.createElement('i'), s=3+Math.floor(Math.random()*3)*2;
        p.className='pix';
        p.style.cssText='left:'+(40+Math.random()*58)+'%;top:'+(Math.random()*80)+'%;width:'+s+'px;height:'+s+'px;--dx:'+(20+Math.random()*60)+'px;--dy:'+(-18+Math.random()*30)+'px;--d:'+(2+Math.random()*3)+'s;animation-delay:-'+(Math.random()*4)+'s';
        pw.appendChild(p);
      }
      el.insertBefore(pw, el.firstChild);
    }
    el.insertBefore(bg, el.firstChild);
  });
  build();
  if(document.fonts&&document.fonts.ready){ document.fonts.ready.then(build); }
  window.addEventListener('load', build);
  var t; window.addEventListener('resize', function(){ clearTimeout(t); t=setTimeout(build,150); });
})();

/* ---- working nav: each tab shows its own panels; the URL hash remembers the tab ---- */
(function(){
  var VIEWS={
    overview:null,
    tokens:['SELECT TOKEN','SIGNAL ACTIVITY'],
    stories:['NEWS STORIES'],
    evidence:['EVIDENCE'],
    legislation:['LEGISLATION','ZONE LOAD'],
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
      var rows=(data.stories||[]).slice(0,wide?12:5).map(function(s){ return storyRow(s,STICK[s.tag]||'y'); });
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
      document.dispatchEvent(new CustomEvent('crippin:news',{detail:d}));
    })
    .catch(function(){ /* leave the placeholder text in place */ });
})();
