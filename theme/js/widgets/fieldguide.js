/* Interactive figures for the embeddings and search chapters. Ported from the original "Geometry of Meaning" guide. */
(function () {
'use strict';
const L = CE.lib, { C, rgba, mulberry32, hslToRgb, star, arrow, reduceMotion } = L;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
/* the guide's colour names, mapped onto the book's concept colours */
const T = { get paper() { return C.bg; }, get surface() { return C.bg2; }, get ink() { return C.ink; }, get muted() { return C.muted; }, get rule() { return C.rule; }, get soft() { return C.bg3; },
  get cobalt() { return C.book; }, get amber() { return C.vec; }, get teal() { return C.dec; }, get rose() { return C.res; } };
const isDark = () => C.dark;
const gauss = r => { let u = 0; while (u === 0) u = r(); const v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const fit = cv => L.setup(cv);
const onRedraw = f => L.redraws.push(f);

CE.widget('nn-hero', el => {
  el.innerHTML = `<canvas id="hero-cv" style="aspect-ratio:1/0.62" aria-label="Animated scatter of points with a moving query star connected to its six nearest neighbors"></canvas>`;
  const cv=$('#hero-cv');if(!cv)return;
  const r=mulberry32(7);const pts=[];
  for(let c=0;c<7;c++){const cx=0.12+r()*0.76,cy=0.12+r()*0.76,s=0.035+r()*0.04;for(let i=0;i<24;i++)pts.push([cx+gauss(r)*s,cy+gauss(r)*s,c]);}
  for(let i=0;i<50;i++)pts.push([r(),r(),-1]);
  let t=1.3,visible=true,raf=0;
  function draw(){
    const {ctx,w,h}=fit(cv);ctx.clearRect(0,0,w,h);
    const S=Math.min(w,h)*0.92,ox=(w-S)/2,oy=(h-S)/2;
    const qx=0.5+0.34*Math.sin(t*0.7),qy=0.5+0.3*Math.sin(t*1.13+1);
    const d=pts.map((p,i)=>[(p[0]-qx)**2+(p[1]-qy)**2,i]).sort((a,b)=>a[0]-b[0]).slice(0,6);
    const nb=new Set(d.map(x=>x[1]));
    const cols=[T.cobalt,T.teal,T.muted,T.cobalt,T.teal,T.rose,T.muted];
    pts.forEach((p,i)=>{if(nb.has(i))return;ctx.beginPath();ctx.arc(ox+p[0]*S,oy+p[1]*S,2.2,0,7);ctx.fillStyle=rgba(p[2]<0?T.muted:cols[p[2]],p[2]<0?0.35:0.6);ctx.fill();});
    ctx.lineWidth=1.2;
    d.forEach(x=>{const p=pts[x[1]];ctx.strokeStyle=rgba(T.amber,0.75);ctx.beginPath();ctx.moveTo(ox+qx*S,oy+qy*S);ctx.lineTo(ox+p[0]*S,oy+p[1]*S);ctx.stroke();ctx.beginPath();ctx.arc(ox+p[0]*S,oy+p[1]*S,4,0,7);ctx.fillStyle=T.amber;ctx.fill();});
    ctx.beginPath();ctx.arc(ox+qx*S,oy+qy*S,Math.sqrt(d[5][0])*S,0,7);ctx.strokeStyle=rgba(T.amber,0.35);ctx.setLineDash([3,4]);ctx.stroke();ctx.setLineDash([]);
    star(ctx,ox+qx*S,oy+qy*S,9,T.amber,T.ink);
  }
  function loop(){t+=0.006;draw();if(visible&&!reduceMotion)raf=requestAnimationFrame(loop);}
  onRedraw(draw);draw();
  if(!reduceMotion){
    if('IntersectionObserver' in window){new IntersectionObserver(es=>{visible=es[0].isIntersecting;cancelAnimationFrame(raf);if(visible)raf=requestAnimationFrame(loop);}).observe(cv);}
    else raf=requestAnimationFrame(loop);
  }
});

CE.widget('word-space', el => {
  el.innerHTML = `<div class="play">
      <div class="play-head"><h4>A toy word space</h4><span class="eyebrow">Playground 1 · drag or tap</span></div>
      <div class="play-body">
        <canvas id="ws-cv" style="aspect-ratio:1.25" aria-label="Two-dimensional toy word embedding space with a draggable query point"></canvas>
        <div class="side">
          <div class="ctl"><label>Distance used for neighbors</label>
            <div class="seg" id="ws-metric"><button data-m="l2" aria-pressed="true">Euclidean (L2)</button><button data-m="cos" aria-pressed="false">Cosine (angle)</button></div></div>
          <div class="seg"><button class="btn" id="ws-analogy">Show king − man + woman</button><button class="btn" id="ws-jaguar">Query "jaguar"</button></div>
          <div><div class="eyebrow" style="margin-bottom:.35rem">5 nearest neighbors</div><ol class="nb-list" id="ws-list"></ol></div>
          <p class="small muted" style="margin:0">Hand-placed 2-D toy, not a real model. Real embeddings have hundreds of dimensions, but the logic is identical: similar items cluster, and consistent offsets (gender, royalty, age) act like directions you can add.</p>
        </div>
      </div>
    </div>`;
  const cv=$('#ws-cv');if(!cv)return;
  const W=[
    ['man',-.55,.25],['woman',-.36,.25],['boy',-.62,.10],['girl',-.43,.10],
    ['king',-.55,.60],['queen',-.34,.62],['prince',-.62,.45],['princess',-.43,.45],
    ['cat',.45,.55],['kitten',.38,.47],['dog',.60,.50],['puppy',.53,.41],['wolf',.74,.60],['lion',.62,.70],['tiger',.72,.77],
    ['apple',.50,-.35],['banana',.63,-.29],['bread',.40,-.55],['pizza',.55,-.63],['pasta',.67,-.54],
    ['car',-.55,-.45],['truck',-.69,-.52],['bus',-.60,-.63],['bicycle',-.40,-.38],['train',-.47,-.72],
    ['laptop',.05,-.70],['phone',.16,-.60],['tablet',.11,-.80],['computer',-.14,-.62],
    ['jaguar',.04,.12]
  ];
  let q=[.47,.35],sel=null,metric='l2',analogy=false,exclude=new Set();
  let geo=null;
  function toPx(x,y){return [geo.cx+x*geo.s,geo.cy-y*geo.s];}
  function toData(px,py){return [(px-geo.cx)/geo.s,-(py-geo.cy)/geo.s];}
  function neighbors(){
    const qn=Math.hypot(q[0],q[1])||1e-9;
    return W.filter(w=>w[0]!==sel&&!exclude.has(w[0])).map(w=>{
      const l2=Math.hypot(w[1]-q[0],w[2]-q[1]);const cos=(w[1]*q[0]+w[2]*q[1])/(Math.hypot(w[1],w[2])*qn);
      return {w:w[0],x:w[1],y:w[2],l2,cos};
    }).sort((a,b)=>metric==='l2'?a.l2-b.l2:b.cos-a.cos).slice(0,5);
  }
  function draw(){
    const {ctx,w,h}=fit(cv);ctx.clearRect(0,0,w,h);
    const s=Math.min((w-40)/2,(h-30)/2)/0.95;geo={cx:w/2,cy:h/2,s};
    // axes
    ctx.strokeStyle=rgba(T.muted,0.25);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,geo.cy);ctx.lineTo(w,geo.cy);ctx.moveTo(geo.cx,0);ctx.lineTo(geo.cx,h);ctx.stroke();
    ctx.fillStyle=rgba(T.muted,0.8);ctx.font='11px "JetBrains Mono", monospace';ctx.fillText('origin',geo.cx+5,geo.cy+14);
    const nb=neighbors();const nbs=new Set(nb.map(n=>n.w));
    const [qx,qy]=toPx(q[0],q[1]);
    if(metric==='cos'){
      const L=Math.hypot(qx-geo.cx,qy-geo.cy)||1;const ex=geo.cx+(qx-geo.cx)/L*w,ey=geo.cy+(qy-geo.cy)/L*w;
      ctx.strokeStyle=rgba(T.amber,0.45);ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(geo.cx,geo.cy);ctx.lineTo(ex,ey);ctx.stroke();ctx.setLineDash([]);
      nb.forEach(n=>{const [px,py]=toPx(n.x,n.y);ctx.strokeStyle=rgba(T.cobalt,0.35);ctx.beginPath();ctx.moveTo(geo.cx,geo.cy);ctx.lineTo(px,py);ctx.stroke();});
    } else {
      nb.forEach(n=>{const [px,py]=toPx(n.x,n.y);ctx.strokeStyle=rgba(T.cobalt,0.55);ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(qx,qy);ctx.lineTo(px,py);ctx.stroke();});
    }
    if(analogy){
      const g=(a)=>W.find(x=>x[0]===a);const m=g('man'),wo=g('woman'),k=g('king');
      const [mx,my]=toPx(m[1],m[2]),[wx,wy]=toPx(wo[1],wo[2]),[kx,ky]=toPx(k[1],k[2]);
      arrow(ctx,mx,my,wx,wy,T.teal,2);arrow(ctx,kx,ky,qx,qy,T.teal,2);
      ctx.fillStyle=T.teal;ctx.font='12px "Bricolage Grotesque", sans-serif';ctx.fillText('same offset',(kx+qx)/2-30,(ky+qy)/2-8);
    }
    ctx.font='12.5px "Bricolage Grotesque", sans-serif';
    W.forEach(wd=>{const [px,py]=toPx(wd[1],wd[2]);const isN=nbs.has(wd[0]);const isS=wd[0]===sel;
      ctx.beginPath();ctx.arc(px,py,isN?5:3.5,0,7);ctx.fillStyle=isS?T.amber:(isN?T.cobalt:rgba(T.ink,0.55));ctx.fill();
      ctx.fillStyle=isN?T.ink:rgba(T.ink,0.62);ctx.font=(isN?'600 ':'')+(w<500?'11px':'12.5px')+' "Bricolage Grotesque", sans-serif';ctx.fillText(wd[0],px+7,py+4);});
    if(!sel)star(ctx,qx,qy,9,T.amber,T.ink);else{ctx.beginPath();ctx.arc(qx,qy,9,0,7);ctx.strokeStyle=T.amber;ctx.lineWidth=2;ctx.stroke();}
    $('#ws-list').innerHTML=nb.map(n=>'<li><span>'+n.w+'</span><span>'+(metric==='l2'?'dist '+n.l2.toFixed(2):'cos '+n.cos.toFixed(3))+'</span></li>').join('');
  }
  let dragging=false,downAt=null;
  cv.addEventListener('pointerdown',e=>{if(!geo)return;const r=cv.getBoundingClientRect();const px=e.clientX-r.left,py=e.clientY-r.top;downAt=[px,py];dragging=true;cv.setPointerCapture(e.pointerId);
    let best=null,bd=18;W.forEach(wd=>{const [x,y]=toPx(wd[1],wd[2]);const d=Math.hypot(x-px,y-py);if(d<bd){bd=d;best=wd;}});
    analogy=false;exclude=new Set();
    if(best){sel=best[0];q=[best[1],best[2]];}else{sel=null;q=toData(px,py);}draw();});
  cv.addEventListener('pointermove',e=>{if(!dragging)return;const r=cv.getBoundingClientRect();const px=e.clientX-r.left,py=e.clientY-r.top;if(downAt&&Math.hypot(px-downAt[0],py-downAt[1])<4)return;sel=null;analogy=false;exclude=new Set();q=toData(px,py);draw();});
  const end=()=>{dragging=false;downAt=null;};cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);
  $$('#ws-metric button').forEach(b=>b.addEventListener('click',()=>{metric=b.dataset.m;$$('#ws-metric button').forEach(x=>x.setAttribute('aria-pressed',x===b?'true':'false'));draw();}));
  $('#ws-analogy').addEventListener('click',()=>{const g=a=>W.find(x=>x[0]===a);const k=g('king'),m=g('man'),wo=g('woman');q=[k[1]-m[1]+wo[1],k[2]-m[2]+wo[2]];sel=null;analogy=true;exclude=new Set(['king','man','woman']);draw();});
  $('#ws-jaguar').addEventListener('click',()=>{const j=W.find(x=>x[0]==='jaguar');q=[j[1],j[2]];sel='jaguar';analogy=false;exclude=new Set();draw();});
  onRedraw(draw);draw();
});

CE.widget('ann-lab', el => {
  el.innerHTML = `<div class="play">
      <div class="play-head"><h4>Four ways to search 1,600 points</h4><span class="eyebrow">Playground 2 · tap the map to move the query</span></div>
      <div class="play-body">
        <div>
          <canvas id="ann-cv" style="aspect-ratio:1.6" aria-label="Scatter of 1600 points with a movable query showing which points each index examines"></canvas>
          <div class="legend" style="margin-top:.6rem">
            <span><i style="background:var(--k-vec)"></i>query and the 10 results found</span>
            <span><i style="background:transparent;border:2px solid var(--ink)"></i>true 10 nearest</span>
            <span><i style="background:var(--k-book)"></i>points examined</span>
          </div>
        </div>
        <div class="side">
          <div class="seg" id="ann-mode" role="group" aria-label="Index type">
            <button data-mode="exact" aria-pressed="false">Brute force</button>
            <button data-mode="lsh" aria-pressed="false">LSH</button>
            <button data-mode="ivf" aria-pressed="true">IVF</button>
            <button data-mode="graph" aria-pressed="false">Graph</button>
          </div>
          <div class="ctl" id="g-ivf"><label for="nprobe">Clusters probed (nprobe) <output id="o-nprobe">2</output></label><input id="nprobe" type="range" min="1" max="12" value="2"></div>
          <div id="g-lsh" hidden>
            <div class="ctl"><label for="lshk">Bits per table (hyperplanes) <output id="o-lshk">5</output></label><input id="lshk" type="range" min="2" max="10" value="5"></div>
            <div class="ctl" style="margin-top:.6rem"><label for="lsht">Number of tables <output id="o-lsht">3</output></label><input id="lsht" type="range" min="1" max="10" value="3"></div>
          </div>
          <div class="ctl" id="g-graph" hidden><label for="ef">Search width (efSearch) <output id="o-ef">16</output></label><input id="ef" type="range" min="10" max="80" value="16"></div>
          <dl class="stat">
            <dt>Distances computed</dt><dd id="ann-comps">–</dd>
            <dt>Share of data touched</dt><dd id="ann-pct">–</dd>
            <dt>Recall@10</dt><dd id="ann-recall">–</dd>
          </dl>
          <div class="meter" aria-hidden="true"><span id="ann-bar"></span></div>
          <div class="mode-note" id="ann-note"></div>
          <button class="btn" id="ann-rand" style="justify-self:start">Random query</button>
        </div>
      </div>
    </div>`;
  const cv=$('#ann-cv');if(!cv)return;
  const N=1600,AW=1.6,K=10;const r=mulberry32(11);
  const X=new Float64Array(N),Y=new Float64Array(N);
  const C0=14,cen=[];for(let c=0;c<C0;c++)cen.push([0.1+r()*(AW-0.2),0.1+r()*0.8,0.018+r()*0.05]);
  for(let i=0;i<N;i++){let x,y;if(r()<0.85){const c=cen[Math.floor(r()*C0)];x=c[0]+gauss(r)*c[2];y=c[1]+gauss(r)*c[2];}else{x=r()*AW;y=r();}X[i]=Math.min(AW-0.01,Math.max(0.01,x));Y[i]=Math.min(0.99,Math.max(0.01,y));}
  // k-means
  const C=24,CX=new Float64Array(C),CY=new Float64Array(C),asg=new Int32Array(N);
  {const used=new Set();for(let c=0;c<C;c++){let i;do{i=Math.floor(r()*N);}while(used.has(i));used.add(i);CX[c]=X[i];CY[c]=Y[i];}
   for(let it=0;it<15;it++){const sx=new Float64Array(C),sy=new Float64Array(C),n=new Int32Array(C);
     for(let i=0;i<N;i++){let b=0,bd=1e9;for(let c=0;c<C;c++){const d=(X[i]-CX[c])**2+(Y[i]-CY[c])**2;if(d<bd){bd=d;b=c;}}asg[i]=b;sx[b]+=X[i];sy[b]+=Y[i];n[b]++;}
     for(let c=0;c<C;c++)if(n[c]){CX[c]=sx[c]/n[c];CY[c]=sy[c]/n[c];}}}
  const cellHue=Array.from({length:C},(_,c)=>(c*137.5)%360);
  // LSH lines
  const LT=10,LB=10,lines=[];
  for(let t=0;t<LT;t++){const arr=[];for(let b=0;b<LB;b++){const a=r()*Math.PI;arr.push({px:0.2*AW+r()*0.6*AW,py:0.2+r()*0.6,nx:Math.cos(a),ny:Math.sin(a)});}lines.push(arr);}
  function key(t,k,x,y){let v=0;const L=lines[t];for(let b=0;b<k;b++){if((x-L[b].px)*L[b].nx+(y-L[b].py)*L[b].ny>0)v|=(1<<b);}return v;}
  // graph (NSW)
  const M=6,order=Array.from({length:N},(_,i)=>i);for(let i=N-1;i>0;i--){const j=Math.floor(r()*(i+1));const tmp=order[i];order[i]=order[j];order[j]=tmp;}
  const adj=Array.from({length:N},()=>[]);
  for(let a=1;a<N;a++){const u=order[a];const best=[];
    for(let b=0;b<a;b++){const v=order[b];const d=(X[u]-X[v])**2+(Y[u]-Y[v])**2;if(best.length<M||d<best[best.length-1][0]){best.push([d,v]);best.sort((p,q)=>p[0]-q[0]);if(best.length>M)best.pop();}}
    best.forEach(p=>{adj[u].push(p[1]);adj[p[1]].push(u);});}
  const entry=order[0];

  let mode='ivf',q=[0.95,0.42];
  const ui={nprobe:$('#nprobe'),lshk:$('#lshk'),lsht:$('#lsht'),ef:$('#ef')};
  const NOTES={
    exact:'Brute force compares the query with every point. Perfect recall, but the work grows with N. Fine for small sets and as the "ground truth" for measuring the others.',
    lsh:'Each table cuts the plane with random lines (dashed: table 1). Points on the same side of every line share a bucket (shaded). More bits make buckets smaller and faster but miss more neighbors; more tables give extra chances to catch them.',
    ivf:'k-means splits the data into 24 cells (colors). The query is compared to the 24 centroids, then only the closest cells are scanned. Neighbors near a cell boundary are missed when nprobe is too low: raise it and watch recall climb.',
    graph:'Each point links to its nearby points (faint edges). The search starts at one fixed entry point and greedily hops toward the query (amber path), keeping the best efSearch candidates. HNSW adds upper layers of long links so that first stretch takes only a few hops.'
  };
  function compute(){
    const qx=q[0],qy=q[1];const dq=new Float64Array(N);for(let i=0;i<N;i++)dq[i]=(X[i]-qx)**2+(Y[i]-qy)**2;
    const idx=Array.from({length:N},(_,i)=>i);const exact=idx.slice().sort((a,b)=>dq[a]-dq[b]).slice(0,K);
    let examined=new Uint8Array(N),comps=0,found=[],extra={};
    if(mode==='exact'){examined.fill(1);comps=N;found=exact.slice();}
    else if(mode==='ivf'){const np=+ui.nprobe.value;const cd=Array.from({length:C},(_,c)=>[(CX[c]-qx)**2+(CY[c]-qy)**2,c]).sort((a,b)=>a[0]-b[0]);const probed=new Set(cd.slice(0,np).map(x=>x[1]));const cand=[];for(let i=0;i<N;i++)if(probed.has(asg[i])){examined[i]=1;cand.push(i);}comps=C+cand.length;found=cand.sort((a,b)=>dq[a]-dq[b]).slice(0,K);extra.probed=probed;}
    else if(mode==='lsh'){const k=+ui.lshk.value,T_=+ui.lsht.value;const qk=[];for(let t=0;t<T_;t++)qk.push(key(t,k,qx,qy));const cand=[];for(let i=0;i<N;i++){for(let t=0;t<T_;t++){if(key(t,k,X[i],Y[i])===qk[t]){examined[i]=1;cand.push(i);break;}}}comps=cand.length;found=cand.sort((a,b)=>dq[a]-dq[b]).slice(0,K);extra.k=k;extra.qk0=qk[0];}
    else{const ef=Math.max(K,+ui.ef.value);const visited=new Uint8Array(N);const parent=new Int32Array(N).fill(-1);visited[entry]=1;comps=1;let cand=[[dq[entry],entry]],res=[[dq[entry],entry]];
      while(cand.length){cand.sort((a,b)=>a[0]-b[0]);const cur=cand.shift();if(res.length>=ef&&cur[0]>res[res.length-1][0])break;
        for(const nb of adj[cur[1]]){if(visited[nb])continue;visited[nb]=1;comps++;parent[nb]=cur[1];const dn=dq[nb];
          if(res.length<ef||dn<res[res.length-1][0]){cand.push([dn,nb]);res.push([dn,nb]);res.sort((a,b)=>a[0]-b[0]);if(res.length>ef)res.pop();}}}
      examined=visited;found=res.slice(0,K).map(x=>x[1]);
      const path=[];let p=found[0];let guard=0;while(p!==-1&&guard++<N){path.push(p);p=parent[p];}extra.path=path;}
    const ex=new Set(exact);const rec=found.filter(i=>ex.has(i)).length;
    return {exact,examined,comps,found,rec,extra};
  }
  function draw(){
    const {ctx,w,h}=fit(cv);ctx.clearRect(0,0,w,h);
    const pad=8,s=Math.min((w-2*pad)/AW,(h-2*pad));const ox=(w-AW*s)/2,oy=(h-s)/2;
    const P=(x,y)=>[ox+x*s,oy+y*s];
    const res=compute();const dark=isDark();
    // mode backgrounds
    if(mode==='lsh'){const step=6;ctx.fillStyle=rgba(T.amber,0.13);for(let px=0;px<w;px+=step)for(let py=0;py<h;py+=step){const x=(px+step/2-ox)/s,y=(py+step/2-oy)/s;if(key(0,res.extra.k,x,y)===res.extra.qk0)ctx.fillRect(px,py,step,step);}
      ctx.strokeStyle=rgba(T.muted,0.6);ctx.setLineDash([4,4]);ctx.lineWidth=1;lines[0].slice(0,res.extra.k).forEach(L=>{const dx=-L.ny,dy=L.nx;const [a0,b0]=P(L.px-dx*3,L.py-dy*3),[a1,b1]=P(L.px+dx*3,L.py+dy*3);ctx.beginPath();ctx.moveTo(a0,b0);ctx.lineTo(a1,b1);ctx.stroke();});ctx.setLineDash([]);}
    if(mode==='graph'){ctx.strokeStyle=rgba(T.muted,0.13);ctx.lineWidth=0.7;ctx.beginPath();for(let i=0;i<N;i++){const [x0,y0]=P(X[i],Y[i]);for(const j of adj[i]){if(j<i)continue;const [x1,y1]=P(X[j],Y[j]);ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);}}ctx.stroke();}
    // points
    for(let i=0;i<N;i++){const [x,y]=P(X[i],Y[i]);let col,rad=1.9;
      if(mode==='ivf'){const probed=res.extra.probed.has(asg[i]);const [cr,cg,cb]=hslToRgb(cellHue[asg[i]],dark?55:60,dark?62:45);col='rgba('+cr+','+cg+','+cb+','+(probed?0.95:0.22)+')';if(probed)rad=2.4;}
      else col=res.examined[i]?rgba(T.cobalt,mode==='exact'?0.55:0.9):rgba(T.muted,0.35);
      if(res.examined[i]&&mode!=='exact'&&mode!=='ivf')rad=2.4;
      ctx.beginPath();ctx.arc(x,y,rad,0,7);ctx.fillStyle=col;ctx.fill();}
    if(mode==='ivf'){for(let c=0;c<C;c++){const [x,y]=P(CX[c],CY[c]);const pr=res.extra.probed.has(c);ctx.strokeStyle=pr?T.ink:rgba(T.ink,0.4);ctx.lineWidth=pr?2:1.2;ctx.beginPath();ctx.moveTo(x-5,y);ctx.lineTo(x+5,y);ctx.moveTo(x,y-5);ctx.lineTo(x,y+5);ctx.stroke();}}
    if(mode==='graph'&&res.extra.path){const [ex,ey]=P(X[entry],Y[entry]);ctx.strokeStyle=T.amber;ctx.lineWidth=2.2;ctx.beginPath();res.extra.path.forEach((p,k)=>{const [x,y]=P(X[p],Y[p]);if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();
      ctx.beginPath();ctx.arc(ex,ey,6,0,7);ctx.fillStyle=T.ink;ctx.fill();ctx.fillStyle=T.ink;ctx.font='11px "JetBrains Mono", monospace';ctx.fillText('entry',ex+8,ey-6);}
    const [qx,qy]=P(q[0],q[1]);
    res.exact.forEach(i=>{const [x,y]=P(X[i],Y[i]);ctx.beginPath();ctx.arc(x,y,6,0,7);ctx.strokeStyle=T.ink;ctx.lineWidth=1.4;ctx.stroke();});
    res.found.forEach(i=>{const [x,y]=P(X[i],Y[i]);ctx.beginPath();ctx.arc(x,y,3.6,0,7);ctx.fillStyle=T.amber;ctx.fill();});
    star(ctx,qx,qy,10,T.amber,T.ink);
    $('#ann-comps').textContent=res.comps.toLocaleString()+' / '+N.toLocaleString();
    const pct=Math.min(100,res.comps/N*100);$('#ann-pct').textContent=pct.toFixed(1)+'%';$('#ann-bar').style.width=pct+'%';
    $('#ann-recall').textContent=res.rec+' / '+K;$('#ann-recall').style.color=res.rec>=9?T.teal:(res.rec>=6?T.amber:T.rose);
    $('#ann-note').textContent=NOTES[mode];
    cv._geo={ox,oy,s};
  }
  function setQ(e){const g=cv._geo;if(!g)return;const rc=cv.getBoundingClientRect();const x=(e.clientX-rc.left-g.ox)/g.s,y=(e.clientY-rc.top-g.oy)/g.s;q=[Math.max(0,Math.min(AW,x)),Math.max(0,Math.min(1,y))];schedule();}
  let pending=false;function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;draw();});}
  let drag=false;cv.addEventListener('pointerdown',e=>{drag=true;cv.setPointerCapture(e.pointerId);setQ(e);});
  cv.addEventListener('pointermove',e=>{if(drag)setQ(e);});cv.addEventListener('pointerup',()=>drag=false);cv.addEventListener('pointercancel',()=>drag=false);
  $$('#ann-mode button').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;$$('#ann-mode button').forEach(x=>x.setAttribute('aria-pressed',x===b?'true':'false'));$('#g-ivf').hidden=mode!=='ivf';$('#g-lsh').hidden=mode!=='lsh';$('#g-graph').hidden=mode!=='graph';draw();}));
  [['nprobe','o-nprobe'],['lshk','o-lshk'],['lsht','o-lsht'],['ef','o-ef']].forEach(([a,o])=>{ui[a].addEventListener('input',()=>{$('#'+o).textContent=ui[a].value;schedule();});$('#'+o).textContent=ui[a].value;});
  $('#ann-rand').addEventListener('click',()=>{const i=Math.floor(Math.random()*N);q=[Math.min(AW,Math.max(0,X[i]+(Math.random()-0.5)*0.08)),Math.min(1,Math.max(0,Y[i]+(Math.random()-0.5)*0.08))];draw();});
  onRedraw(draw);draw();
});

CE.widget('napkin', el => {
  el.innerHTML = `<div class="play">
      <div class="play-head"><h4>How much memory does your index need?</h4><span class="eyebrow">Playground 3 · napkin calculator</span></div>
      <div class="calc-top">
        <div class="ctl"><label for="calc-n">Number of vectors <output id="o-calc-n">1 billion</output></label><input id="calc-n" type="range" min="3" max="11" step="0.25" value="9"></div>
        <div class="ctl" style="min-width:160px;flex:0"><label for="calc-d">Dimensions</label>
          <select id="calc-d"><option>256</option><option>384</option><option selected>768</option><option>1024</option><option>1536</option><option>3072</option></select></div>
      </div>
      <p class="calc-head" id="calc-head"></p>
      <div>
        <div class="bar-row" style="margin-bottom:.1rem"><span></span><div class="scale-row" id="calc-scale"></div><span></span></div>
        <div class="bars" id="calc-rows"></div>
      </div>
      <p class="small muted" style="margin:0">Vertical ticks: 16 GB laptop, 80 GB GPU, 1 TB of server RAM, 100 TB small cluster. Log scale: each step to the right is 10× more. HNSW adds roughly 2×M×4 bytes of links per vector on top (≈ 256 B at M = 32).</p>
    </div>`;
  const n=$('#calc-n'),d=$('#calc-d');if(!n)return;
  const ENC=[
    ['float32 (raw)',dd=>4*dd,'cobalt'],['float16',dd=>2*dd,'cobalt'],['int8 scalar quantization',dd=>dd,'teal'],
    ['Matryoshka 256 dims + int8',()=>256,'teal'],['binary, 1 bit per dim',dd=>dd/8,'amber'],['PQ, 64 one-byte codes',()=>64,'amber']
  ];
  const REF=[[16e9,'16 GB'],[80e9,'80 GB'],[1e12,'1 TB'],[1e14,'100 TB']];
  const LO=5,HI=15;const pos=b=>Math.max(0,Math.min(100,(Math.log10(Math.max(b,1))-LO)/(HI-LO)*100));
  function fmtB(b){const u=['B','KB','MB','GB','TB','PB','EB'];let i=0;while(b>=1000&&i<u.length-1){b/=1000;i++;}return (b>=100?b.toFixed(0):b>=10?b.toFixed(1):b.toFixed(2))+' '+u[i];}
  function fmtN(v){if(v>=1e9)return (v/1e9).toFixed(v%1e9===0?0:1).replace(/\.0$/,'')+' billion';if(v>=1e6)return (v/1e6).toFixed(1).replace(/\.0$/,'')+' million';if(v>=1e3)return (v/1e3).toFixed(1).replace(/\.0$/,'')+' thousand';return String(Math.round(v));}
  function fmtT(s){if(s<1e-3)return (s*1e6).toFixed(0)+' µs';if(s<1)return (s*1e3).toFixed(s<0.01?2:0)+' ms';if(s<120)return s.toFixed(1)+' s';if(s<7200)return (s/60).toFixed(0)+' min';return (s/3600).toFixed(1)+' h';}
  $('#calc-scale').innerHTML=REF.map(r=>'<span style="left:'+pos(r[0])+'%">'+r[1]+'</span>').join('');
  function render(){
    const N=Math.round(Math.pow(10,+n.value)/ (Math.pow(10,+n.value)>=1e6?1e5:1))*(Math.pow(10,+n.value)>=1e6?1e5:1);const D=+d.value;
    $('#o-calc-n').textContent=fmtN(N);
    const raw=N*4*D;
    $('#calc-head').innerHTML=fmtN(N)+' vectors × '+D+' dims × 4 bytes = <b>'+fmtB(raw)+'</b> as float32. Reading all of it once for a single brute-force query at ~50 GB/s of memory bandwidth takes about <b>'+fmtT(raw/5e10)+'</b>.';
    $('#calc-rows').innerHTML=ENC.map(e=>{const b=N*e[1](D);const per=e[1](D);
      return '<div class="bar-row"><span>'+e[0]+' <span class="muted">· '+(per>=1000?(per/1000).toFixed(per%1000?1:0)+' KB':per+' B')+'</span></span><div class="track">'+REF.map(r=>'<span class="ref" style="left:'+pos(r[0])+'%"></span>').join('')+'<span class="fill" style="width:'+pos(b)+'%;background:var(--'+e[2]+')"></span></div><span class="v">'+fmtB(b)+'</span></div>';}).join('');
  }
  n.addEventListener('input',render);d.addEventListener('change',render);render();
});

CE.widget('attention', el => {
  el.innerHTML = `<div class="play">
      <div class="play-head"><h4>Attention as a lookup</h4><span class="eyebrow">Playground 4 · drag the query arrow</span></div>
      <div class="play-body">
        <canvas id="att-cv" style="aspect-ratio:1.35" aria-label="Eight key vectors and a draggable query vector; arrow thickness shows attention weight"></canvas>
        <div class="side">
          <div class="ctl"><label for="att-t">Softmax temperature <output id="o-att-t">0.30</output></label><input id="att-t" type="range" min="0" max="100" value="55"></div>
          <div class="att-bars" id="att-bars"></div>
          <div class="out-sw"><i id="att-out"></i><span>Output = weighted mix of the value colors</span></div>
          <div class="mode-note" id="att-note"></div>
        </div>
      </div>
    </div>`;
  const cv=$('#att-cv');if(!cv)return;
  const KEYS=[[.85,.2],[.55,.62],[-.15,.88],[-.72,.42],[-.78,-.28],[-.12,-.82],[.5,-.62],[.32,.08]];
  const HUES=[220,170,40,345,280,95,15,195];
  let q=[.7,.45];const sl=$('#att-t');let geo=null;
  const tau=()=>0.05*Math.pow(30,(+sl.value)/100);
  function weights(){const t=tau();const s=KEYS.map(k=>(k[0]*q[0]+k[1]*q[1])/t);const m=Math.max(...s);const e=s.map(x=>Math.exp(x-m));const z=e.reduce((a,b)=>a+b,0);return e.map(x=>x/z);}
  function draw(){
    const {ctx,w,h}=fit(cv);ctx.clearRect(0,0,w,h);const S=Math.min(w,h)/2*0.82;geo={cx:w/2,cy:h/2,S};
    ctx.strokeStyle=rgba(T.muted,0.3);ctx.lineWidth=1;ctx.setLineDash([3,4]);ctx.beginPath();ctx.arc(geo.cx,geo.cy,S,0,7);ctx.stroke();ctx.setLineDash([]);
    ctx.beginPath();ctx.moveTo(geo.cx-S-10,geo.cy);ctx.lineTo(geo.cx+S+10,geo.cy);ctx.moveTo(geo.cx,geo.cy-S-10);ctx.lineTo(geo.cx,geo.cy+S+10);ctx.stroke();
    const wts=weights();const dark=isDark();
    KEYS.forEach((k,i)=>{const [r_,g_,b_]=hslToRgb(HUES[i],60,dark?62:48);const a=0.25+0.75*Math.min(1,wts[i]*2.2);arrow(ctx,geo.cx,geo.cy,geo.cx+k[0]*S,geo.cy-k[1]*S,'rgba('+r_+','+g_+','+b_+','+a+')',1.2+wts[i]*9);
      ctx.fillStyle=T.ink;ctx.font='12px "JetBrains Mono", monospace';ctx.fillText('k'+(i+1),geo.cx+k[0]*S*1.1-6,geo.cy-k[1]*S*1.1+4);});
    arrow(ctx,geo.cx,geo.cy,geo.cx+q[0]*S,geo.cy-q[1]*S,T.ink,3.2);
    ctx.beginPath();ctx.arc(geo.cx+q[0]*S,geo.cy-q[1]*S,7,0,7);ctx.fillStyle=T.amber;ctx.fill();ctx.strokeStyle=T.ink;ctx.lineWidth=1.2;ctx.stroke();
    ctx.fillStyle=T.ink;ctx.font='600 13px "Bricolage Grotesque", sans-serif';ctx.fillText('query',geo.cx+q[0]*S+10,geo.cy-q[1]*S-8);
    $('#o-att-t').textContent=tau().toFixed(2);
    const order=wts.map((x,i)=>[x,i]).sort((a,b)=>b[0]-a[0]);
    $('#att-bars').innerHTML=wts.map((x,i)=>{const [r_,g_,b_]=hslToRgb(HUES[i],60,dark?62:48);return '<div class="att-bar"><span>k'+(i+1)+'</span><span class="sw" style="background:rgb('+r_+','+g_+','+b_+')"></span><span class="tr"><span style="width:'+(x*100).toFixed(1)+'%"></span></span><span class="pc">'+(x*100).toFixed(0)+'%</span></div>';}).join('');
    let R=0,G=0,B=0;wts.forEach((x,i)=>{const c=hslToRgb(HUES[i],60,dark?62:48);R+=x*c[0];G+=x*c[1];B+=x*c[2];});$('#att-out').style.background='rgb('+Math.round(R)+','+Math.round(G)+','+Math.round(B)+')';
    const top2=(order[0][0]+order[1][0])*100;
    $('#att-note').textContent='The top 2 keys (k'+(order[0][1]+1)+', k'+(order[1][1]+1)+') hold '+top2.toFixed(0)+'% of the weight. '+(top2>85?'Attention here is almost a hard nearest-neighbor lookup: the other keys could be skipped with little change.':'Weight is spread out, so skipping keys would change the output noticeably.');
  }
  function setQ(e){if(!geo)return;const rc=cv.getBoundingClientRect();let x=(e.clientX-rc.left-geo.cx)/geo.S,y=-(e.clientY-rc.top-geo.cy)/geo.S;const L=Math.hypot(x,y);if(L>1.15){x*=1.15/L;y*=1.15/L;}q=[x,y];draw();}
  let drag=false;cv.addEventListener('pointerdown',e=>{drag=true;cv.setPointerCapture(e.pointerId);setQ(e);});cv.addEventListener('pointermove',e=>{if(drag)setQ(e);});cv.addEventListener('pointerup',()=>drag=false);cv.addEventListener('pointercancel',()=>drag=false);
  sl.addEventListener('input',draw);onRedraw(draw);draw();
});

CE.widget('timeline', el => {
  el.innerHTML = `<div class="tl-filters" role="group" aria-label="Filter timeline">
    <button class="chip" data-f="all" aria-pressed="true">All threads</button>
    <button class="chip" data-f="r" aria-pressed="false"><span class="dot tr-r"></span>Representations</button>
    <button class="chip" data-f="s" aria-pressed="false"><span class="dot tr-s"></span>Search algorithms</button>
    <button class="chip" data-f="i" aria-pressed="false"><span class="dot tr-i"></span>Industry</button>
  </div>
  <ol class="tl" id="tl"></ol>`;
const TL=[
 ['1954–57','r','"You shall know a word by the company it keeps"','Zellig Harris and J.R. Firth state the distributional hypothesis: meaning comes from context. Every embedding method stands on this.'],
 ['1957','s','Lloyd\'s quantizer at Bell Labs','Stuart Lloyd works out how to represent a signal with a few representative levels for telephone PCM. It becomes k-means, the engine inside IVF and PQ decades later.'],
 ['1960s','i','Salton\'s SMART system','Gerard Salton at Cornell represents documents as word-count vectors and ranks them by cosine. Search becomes geometry, but each dimension is still one word.'],
 ['1975','s','k-d trees','Jon Bentley splits space one coordinate at a time. Superb in a few dimensions, collapses past about twenty: the curse of dimensionality in action.'],
 ['1990','r','Latent Semantic Analysis','Dumais, Deerwester and colleagues at Bellcore compress the word–document matrix with SVD. "Car" and "automobile" land close. The first dense semantic vectors.'],
 ['1997–98','s','Hashing for similarity','Andrei Broder\'s MinHash finds near-duplicate pages for AltaVista. Indyk and Motwani define locality-sensitive hashing with sublinear search guarantees.'],
 ['2002','s','SimHash','Moses Charikar: random hyperplanes give a bit signature whose agreement tracks the angle between vectors. Later used for web-scale duplicate detection at Google.'],
 ['2003','r','Neural language model','Bengio and colleagues learn a table of word vectors jointly with a next-word predictor. The table is a by-product that turns out to be the valuable part.'],
 ['2006–09','i','The Netflix Prize','Matrix factorization wins: users and movies become short vectors whose dot product predicts a rating. Recommenders have been embedding-based ever since.'],
 ['2011','s','Product quantization','Jégou, Douze and Schmid (INRIA) compress vectors to a few bytes and compute distances from lookup tables. Billion-vector search starts to fit in RAM.'],
 ['2013','r','word2vec','Mikolov and colleagues at Google train fast word vectors on billions of words. King − man + woman ≈ queen makes the geometry famous.'],
 ['2013','i','Annoy at Spotify','Erik Bernhardsson open-sources random-projection trees for music recommendations; one of the first widely used ANN libraries.'],
 ['2014','r','GloVe and the PMI connection','Stanford\'s GloVe, and Levy & Goldberg\'s analysis, show predictive word vectors and count-matrix factorization are two views of the same thing.'],
 ['2015','r','FaceNet','Google trains face embeddings with a triplet loss: same person close, different people far. Metric learning goes mainstream.'],
 ['2016','s','HNSW','Malkov and Yashunin publish hierarchical navigable small-world graphs. It becomes the default index of the vector database era.'],
 ['2016','i','YouTube\'s two-stage recommender','Covington et al. describe candidate generation as nearest-neighbor search over user and video vectors, followed by a separate ranking model.'],
 ['2017','s','FAISS','Facebook AI Research open-sources its similarity search library: IVF, PQ, HNSW and GPU search, billion-scale on one machine.'],
 ['2018','r','BERT','Contextual vectors: "bank" now differs between "river bank" and "bank account". Pretrained transformers become the starting point for everything.'],
 ['2019','r','Sentence-BERT','Reimers and Gurevych fine-tune BERT as a siamese network so whole sentences become single vectors comparable by cosine.'],
 ['2019','s','DiskANN','Microsoft shows a graph index laid out on SSD can search a billion vectors on one machine with modest RAM.'],
 ['2019','i','DLRM','Meta open-sources its deep learning recommendation model: the heavy ranking stage that runs after retrieval.'],
 ['2020','r','Dense retrieval and RAG','DPR beats BM25 on open-domain question answering, and retrieval-augmented generation attaches a retriever to a text generator.'],
 ['2020','s','ScaNN','Google introduces quantization that keeps what matters for ranking (anisotropic loss), topping speed/recall benchmarks.'],
 ['2021','r','CLIP','OpenAI trains images and captions into one shared space with a contrastive loss. Searching photos with sentences becomes easy.'],
 ['2022','r','Matryoshka embeddings','Kusupati et al. train vectors whose leading dimensions carry the most information, so they can be truncated. Later adopted by major embedding APIs.'],
 ['2022–23','i','The vector database boom','Lucene and Elasticsearch add HNSW; after ChatGPT, RAG drives rapid adoption of Pinecone, Weaviate, Qdrant, Milvus, Chroma and pgvector.'],
 ['2023','i','Spotify retires Annoy for Voyager','Spotify releases an HNSW-based library to replace its own tree-based one: the field\'s shift from trees to graphs in miniature.'],
 ['2023–25','r','LLMs become embedders','E5-Mistral, NV-Embed, Qwen3-Embedding, gemini-embedding-001 and EmbeddingGemma: start from a pretrained LLM, then fine-tune contrastively.'],
 ['2024–25','s','Cheaper storage tiers','Binary codes with error bounds (RaBitQ), GPU graph indexes (CAGRA), and indexes on object storage push cost per vector down.']
];
const TRK={r:'Representations',s:'Search',i:'Industry'};
const tl=$('#tl');
tl.innerHTML=TL.map(e=>'<li data-t="'+e[1]+'"><span class="yr">'+e[0]+'</span><span class="mk tr-'+e[1]+'"></span><div><div class="tt">'+e[2]+'<span class="tag tag-'+e[1]+'">'+TRK[e[1]]+'</span></div><div class="tx">'+e[3]+'</div></div></li>').join('');
$$('.tl-filters .chip').forEach(b=>b.addEventListener('click',()=>{
  $$('.tl-filters .chip').forEach(x=>x.setAttribute('aria-pressed',x===b?'true':'false'));
  const f=b.dataset.f;$$('#tl li').forEach(li=>{li.hidden=!(f==='all'||li.dataset.t===f);});
}));
});

})();
