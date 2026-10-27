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
  var API='https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&price_change_percentage=24h,7d&ids=';
  var REFRESH_MS=60000;

  // launch = year the network went live (a fact, used for the AGE stat)
  var TOKENS=[
    {id:'ripple',           name:'XRP',  tick:'/XRP',  launch:2012},
    {id:'hedera-hashgraph', name:'HBAR', tick:'/HBAR', launch:2019},
    {id:'stellar',          name:'XLM',  tick:'/XLM',  launch:2014}
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

  /* ---- the ranking algorithm: five 0-100 scores, all subjective, all tweakable ----
     SIZE      market-cap rank on a log scale (#1 = 100, #500 = 0)
     VOLUME    24h trading volume on a log scale ($10M = 0, $10B = 100)
     AGE       years since launch, capped at 12 years = 100
     LIQUIDITY turnover = volume / market cap (0.15 or more = 100). High turnover = easy to trade
     BUZZ      how much the price is moving (24h move x12 + 7d move x3, capped at 100)
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
      clamp(a24*12+a7*3)
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
  }

  /* ---- fetch + refresh ---- */
  function apply(arr){
    arr.forEach(function(d){
      TOKENS.forEach(function(t){ if(t.id===d.id){ t.data=d; t.scores=scoreOf(d,t); } });
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
    if(selected) choose(selected);
  }
  function refresh(){
    if(document.hidden) return;
    fetch(API+TOKENS.map(function(t){return t.id;}).join(','),{cache:'no-store'})
      .then(function(r){ if(!r.ok) throw new Error('feed'); return r.json(); })
      .then(function(arr){ if(!Array.isArray(arr)) throw new Error('feed'); apply(arr); })
      .catch(function(){
        TOKENS.forEach(function(t){ if(!t.data) t.sm.textContent=t.tick+' // feed offline'; });
      });
  }
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
