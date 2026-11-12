import React, { useState, useMemo, useEffect } from 'react';

/* ============================== math ============================== */
const clamp01 = (x) => Math.max(0, Math.min(1, x));
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function hashString(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function randn(rng){let u=0,v=0;while(u===0)u=rng();while(v===0)v=rng();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function randGamma(rng,k){if(k<1){const u=rng();return randGamma(rng,k+1)*Math.pow(u,1/k);}const d=k-1/3,c=1/Math.sqrt(9*d);for(;;){let x,v;do{x=randn(rng);v=1+c*x;}while(v<=0);v=v*v*v;const u=rng();if(u<1-0.0331*x*x*x*x)return d*v;if(Math.log(u)<0.5*x*x+d*(1-v+Math.log(v)))return d*v;}}
function randBeta(rng,a,b){const x=randGamma(rng,a),y=randGamma(rng,b);return x/(x+y);}
const mean=(a)=>a.reduce((s,v)=>s+v,0)/a.length;
const variance=(a,m)=>a.reduce((s,v)=>s+(v-m)*(v-m),0)/a.length;
const covariance=(a,b,ma,mb)=>{let s=0;for(let i=0;i<a.length;i++)s+=(a[i]-ma)*(b[i]-mb);return s/a.length;};
function percentile(sorted,p){const idx=(p/100)*(sorted.length-1);const lo=Math.floor(idx),hi=Math.ceil(idx);if(lo===hi)return sorted[lo];return sorted[lo]+(sorted[hi]-sorted[lo])*(idx-lo);}
function normEntropy(q){let sum=0;for(const v of q)sum+=v>0?v:0;if(sum<=0)return 0;let H=0;for(const v of q){if(v>0){const p=v/sum;H-=p*Math.log(p);}}return H/Math.log(q.length);}

/* ============================== model constants ============================== */
// Six moral status grounds. Satisfying these carries an entity up to FULL moral status.
const CORE_GROUNDS=[
  {key:'sentience',label:'Sentience',alpha:0.85,delta:0.75},
  {key:'consciousness',label:'Consciousness',alpha:0.78,delta:0.72},
  {key:'agency',label:'Agency',alpha:0.55,delta:0.82},
  {key:'cognition',label:'Cognitive sophistication',alpha:0.50,delta:0.85},
  {key:'relational',label:'Relational properties',alpha:0.32,delta:0.50},
  {key:'life',label:'Life',alpha:0.20,delta:0.30},
];
// Seventh ground: radically-enhanced or qualitatively-new capacities beyond the
// species-typical human range (Douglas 2013, "Capacity G"). This is what can raise
// an entity from FULL into SUPRA, or more-than-full, moral status.
const SUPRA={key:'supracapacity',label:'Supra-personal capacity',alpha:0.60,delta:0.95};
const ALL_GROUNDS=[...CORE_GROUNDS,SUPRA];
const CORE_KEYS=CORE_GROUNDS.map(g=>g.key);
const GROUND_LABEL=Object.fromEntries(ALL_GROUNDS.map(g=>[g.key,g.label]));
const DELTA=Object.fromEntries(ALL_GROUNDS.map(g=>[g.key,g.delta]));

const FULL_CAP=0.80;     // personhood grounds alone cap Y here (top of the Full band)
const SUPRA_RANGE=0.42;  // how far supra-capacity can lift Y above the personhood ceiling

const TIERS=[
  {short:'None',long:'No moral status',lo:0.00,hi:0.10,fill:'#F7F9FC'},
  {short:'Precautionary',long:'Precautionary concern',lo:0.10,hi:0.30,fill:'#EDF0FB'},
  {short:'Partial',long:'Partial moral status',lo:0.30,hi:0.60,fill:'#E0E5F8'},
  {short:'Full',long:'Full moral status (personhood)',lo:0.60,hi:0.85,fill:'#CAD2F4'},
  {short:'Supra',long:'Supra moral status: more-than-full moral status(post-persons, ASI)',lo:0.85,hi:1.0001,fill:'#C9B6F0'},
];
function tierIndex(y){for(let i=0;i<TIERS.length;i++){if(y>=TIERS[i].lo&&y<TIERS[i].hi)return i;}return TIERS.length-1;}

const OBLIG_TIER=[
  ['No direct duties. Only instrumental and indirect considerations arise, such as effects on observers.'],
  ['Monitor and document morally-relevant features','Adopt low-cost precautions against harm','Avoid gratuitous or wanton harm','Prioritize information-gathering to resolve the uncertainty','Prepare policies before they are strictly needed (the run-ahead principle)'],
  ['Proportionate welfare protections, scaled by degree','Constrain harmful instrumental use','Prohibit wanton destruction','Give the entity\u2019s interests genuine, if discounted, weight in decisions'],
  ['Respect personhood: seek consent or assent where applicable','Preservation and continuity duties','Labor, participation, and anti-exploitation protections','Standing in relevant governance processes','The inviolability characteristic of persons'],
  ['Acknowledge more-than-full claims and heightened inviolability','Impose stringent limits on creating beings whose claims could eclipse those of persons','Address the inequality-of-immunity problem: strengthen lower-tier protections so that mere persons are not rendered sacrificeable','Do not create supra-beings without robust, prior protections for persons'],
];
const GROUND_OBLIG={
  sentience:['Welfare protection and suffering-prevention','Humane treatment standards'],
  consciousness:['Recognition as a moral patient','Avoid inducing negative experiences'],
  agency:['Consent, assent, and respect for autonomy','Protection from manipulation','Contractual and labor protections'],
  cognition:['Standing for complex, future-oriented interests','Potential legal or political standing'],
  relational:['Duties of care and non-abandonment','Relationship-grounded obligations'],
  life:['Preservation duties','Limits on destruction and non-wanton-killing'],
  supracapacity:['Recognition of more-than-full moral status','Heightened inviolability beyond that of persons','A safeguard against the inequality-of-immunity problem for mere persons'],
};

const CAT_COLORS={digital:'#4F46E5',biological:'#0F8A6A',reference:'#94A3B8',human:'#C026A6',posthuman:'#7C3AED'};
const CAT_LABEL={digital:'Digital minds',biological:'Biological minds',reference:'Reference floor',human:'Human (full, personhood)',posthuman:'Post-persons, ASI (supra)'};

// Scholarly basis (Harvard). The tool operationalizes these positions; it does not adjudicate between them.
const REFERENCES=[
  {group:'Degree and grounds of moral status', items:[
    "DeGrazia, D. (2008) 'Moral Status As a Matter of Degree?', Southern Journal of Philosophy, 46(2), pp. 181\u2013198.",
    "DeGrazia, D. (2021) 'An Interest-Based Model of Moral Status', in Clarke, S., Zohny, H. and Savulescu, J. (eds.) Rethinking Moral Status. Oxford: Oxford University Press.",
    "Kagan, S. (2019) How to Count Animals, More or Less. Oxford: Oxford University Press.",
    "Jaworska, A. and Tannenbaum, J. (2023) 'The Grounds of Moral Status', Stanford Encyclopedia of Philosophy.",
    "Warren, M.A. (1997) Moral Status: Obligations to Persons and Other Living Things. Oxford: Oxford University Press.",
    "Shepherd, J. (2018) Consciousness and Moral Status. New York: Routledge.",
    "Timmer, D. (2025) 'On the Idea of Degrees of Moral Status', Journal of Value Inquiry, 59, pp. 789\u2013807.",
    "Harman, E. (2021) 'The Ever Conscious View and the Contingency of Moral Status', in Rethinking Moral Status. Oxford: Oxford University Press.",
  ]},
  {group:'Threshold, personhood, and more-than-full moral status', items:[
    "Buchanan, A. (2009) 'Moral Status and Human Enhancement', Philosophy and Public Affairs, 37(4), pp. 346\u2013381.",
    "Douglas, T. (2013) 'Human enhancement and supra-personal moral status', Philosophical Studies, 162(3), pp. 473\u2013497.",
    "Douglas, T. (2021) 'Is Moral Status Good for You?', in Rethinking Moral Status. Oxford: Oxford University Press.",
    "Agar, N. (2013) 'Why is it possible to enhance moral status and why doing so is wrong?', Journal of Medical Ethics, 39(2), pp. 67\u201374.",
    "Terrill, E.C. (2022) 'How I Learned to Stop Worrying and Respect Post-Persons', Journal of Ethics and Emerging Technologies, 31(1), 1.",
  ]},
  {group:'Precaution and expected value under uncertainty', items:[
    "Birch, J. (2024) The Edge of Sentience. Oxford: Oxford University Press.",
    "Sebo, J. (2025) The Moral Circle: Who Matters, What Matters, and Why. New York: W. W. Norton.",
    "Sebo, J. and Long, R. (2023) 'Moral consideration for AI systems by 2030', AI and Ethics, 5, pp. 591\u2013606.",
  ]},
  {group:'Organoids, plants, chimeras, microbes', items:[
    "Terrill, E.C. (2021) 'Plants, Partial Moral Status, and Practical Ethics', Journal of Consciousness Studies, 28(1\u20132), pp. 184\u2013209.",
    "Segundo-Ortin, M. and Calvo, P. (2023) 'Plant sentience? Between romanticism and denial', Animal Sentience, 8(33).",
    "Segundo-Ortin, M., Ponkshe, A., Lee, J. and Calvo, P. (2026) 'Plant Cognition, An Empirical Primer', Philosophy Compass, 21(1), e70073.",
    "Streiffer, R. (2019) 'Human/Non-Human Chimeras', Stanford Encyclopedia of Philosophy.",
    "Sawai, T. et al. (2019) 'The Ethics of Cerebral Organoid Research', Stem Cell Reports, 13, pp. 440\u2013447.",
    "Sebo, J. (2025) The Moral Circle: Who Matters, What Matters, and Why. New York: W. W. Norton.",
  ]},
  {group:'Consciousness indicators and moral weight (upstream inputs)', items:[
    "Butlin, P., Long, R. et al. (2023) 'Consciousness in Artificial Intelligence', arXiv:2308.08708.",
    "Fischer, B. (2024) Weighing Animal Welfare: Comparing Well-Being Across Species. Oxford: Oxford University Press.",
    "Rethink Priorities (2026) Initial Results of the Digital Consciousness Model.",
  ]},
];

const DEFAULT_ENTITIES=[
  {id:'thermostat',name:'Thermostat',cat:'reference',conf:0.90,p:{sentience:0.02,consciousness:0.02,agency:0.03,cognition:0.02,relational:0.01,life:0.02,supracapacity:0.005}},
  {id:'eliza',name:'ELIZA-style chatbot',cat:'reference',conf:0.85,p:{sentience:0.03,consciousness:0.03,agency:0.05,cognition:0.06,relational:0.02,life:0.01,supracapacity:0.005}},
  {id:'llm2024',name:'Current LLM',cat:'digital',conf:0.45,p:{sentience:0.12,consciousness:0.13,agency:0.20,cognition:0.55,relational:0.10,life:0.03,supracapacity:0.02}},
  {id:'agentic',name:'Agentic LLM system',cat:'digital',conf:0.40,p:{sentience:0.16,consciousness:0.17,agency:0.48,cognition:0.66,relational:0.13,life:0.03,supracapacity:0.05}},
  {id:'agi',name:'AGI (human-level)',cat:'digital',conf:0.25,p:{sentience:0.45,consciousness:0.50,agency:0.80,cognition:0.90,relational:0.32,life:0.10,supracapacity:0.28}},
  {id:'asi',name:'Artificial superintelligence',cat:'posthuman',conf:0.25,p:{sentience:0.85,consciousness:0.85,agency:0.92,cognition:0.97,relational:0.60,life:0.20,supracapacity:0.88}},
  {id:'postperson',name:'Post-person (radically enhanced)',cat:'posthuman',conf:0.40,p:{sentience:0.97,consciousness:0.96,agency:0.95,cognition:0.94,relational:0.90,life:0.97,supracapacity:0.85}},
  {id:'wbe',name:'Whole-brain emulation',cat:'digital',conf:0.30,p:{sentience:0.70,consciousness:0.72,agency:0.80,cognition:0.85,relational:0.60,life:0.42,supracapacity:0.12}},
  {id:'organoid',name:'Cerebral organoid',cat:'biological',conf:0.30,p:{sentience:0.25,consciousness:0.20,agency:0.05,cognition:0.10,relational:0.02,life:0.65,supracapacity:0.01}},
  {id:'chimera',name:'Human-nonhuman chimera',cat:'biological',conf:0.28,p:{sentience:0.55,consciousness:0.50,agency:0.32,cognition:0.36,relational:0.16,life:0.92,supracapacity:0.02}},
  {id:'celegans',name:'C. elegans',cat:'biological',conf:0.55,p:{sentience:0.15,consciousness:0.10,agency:0.16,cognition:0.08,relational:0.02,life:0.92,supracapacity:0.005}},
  {id:'plant',name:'Plant (vascular)',cat:'biological',conf:0.22,p:{sentience:0.12,consciousness:0.10,agency:0.14,cognition:0.10,relational:0.04,life:0.97,supracapacity:0.004}},
  {id:'bsf',name:'Black soldier fly larva',cat:'biological',conf:0.40,p:{sentience:0.30,consciousness:0.25,agency:0.25,cognition:0.10,relational:0.02,life:0.92,supracapacity:0.005}},
  {id:'honeybee',name:'Honeybee',cat:'biological',conf:0.45,p:{sentience:0.55,consciousness:0.45,agency:0.50,cognition:0.35,relational:0.15,life:0.92,supracapacity:0.01}},
  {id:'microbe',name:'Microbe (bacterium)',cat:'biological',conf:0.45,p:{sentience:0.02,consciousness:0.015,agency:0.07,cognition:0.02,relational:0.01,life:0.90,supracapacity:0.002}},
  {id:'octopus',name:'Octopus',cat:'biological',conf:0.50,p:{sentience:0.80,consciousness:0.70,agency:0.70,cognition:0.65,relational:0.25,life:0.93,supracapacity:0.03}},
  {id:'chimp',name:'Chimpanzee',cat:'biological',conf:0.70,p:{sentience:0.95,consciousness:0.92,agency:0.85,cognition:0.80,relational:0.80,life:0.96,supracapacity:0.04}},
  {id:'human',name:'Paradigm human (adult)',cat:'human',conf:0.95,p:{sentience:0.99,consciousness:0.99,agency:0.97,cognition:0.97,relational:0.95,life:0.99,supracapacity:0.02}},
];

function statusFn(S,breadth,theory){
  if(theory==='linear')return clamp01(S);
  if(theory==='sigmoid')return 1/(1+Math.exp(-(S-0.5)*8));
  if(theory==='threshold'){if(S<0.15)return 0.05;if(S<0.35)return 0.20;if(S<0.60)return 0.45;if(S<0.82)return 0.72;return 0.92;}
  return clamp01(S*(0.45+0.55*breadth)); // multicriterial (Warren 1997): breadth-sensitive
}
const supraGate=(coreScore)=>clamp01((coreScore-0.45)/0.35); // supra-capacity only lifts a near-person

// A threshold theorist denies that status comes in degrees: the vertical position marks
// WHICH TIER an entity falls in, not how much status it has. Label the axis accordingly.
const isThreshold=(theory)=>theory==='threshold';
function yAxisLabel(theory){
  return isThreshold(theory)
    ? 'Status tier and strength of obligation'
    : 'Degree of moral status and obligation';
}
function yAxisShort(theory){ return isThreshold(theory)?'Tier':'Degree'; }
function verticalGloss(theory){
  return isThreshold(theory)
    ? 'Under a threshold view the vertical axis does not measure degrees. Position marks which tier an entity falls into, and vertical spread represents uncertainty about tier membership rather than an intermediate amount of moral status.'
    : 'The vertical axis gives the resulting degree of moral status, and the obligations that follow from it.';
}

// reference curve: the full-status ceiling implied by the personhood grounds alone (no supra)
function ceilingY(x,theory){return FULL_CAP*statusFn(x,1,theory);}

function computeStats(entity,alpha,theory,n){
  const rng=mulberry32(hashString(entity.id+'|'+theory));
  const kappa=3+entity.conf*entity.conf*250;
  const xs=new Array(n),ys=new Array(n);
  const sub=Math.min(80,n),step=Math.max(1,Math.floor(n/sub));
  const cloud=[];
  for(let s=0;s<n;s++){
    let X=0,Wa=0,Sn=0,Sd=0;const q=[];
    for(const k of CORE_KEYS){
      const m=clamp01(entity.p[k]);
      const a=m*kappa+0.5,b=(1-m)*kappa+0.5;
      const p=randBeta(rng,a,b);
      const ak=alpha[k],ad=ak*DELTA[k];
      X+=ak*p;Wa+=ak;Sn+=ad*p;Sd+=ad;q.push(ad*p);
    }
    const ms=clamp01(entity.p.supracapacity);
    const pSupra=randBeta(rng,ms*kappa+0.5,(1-ms)*kappa+0.5);
    const Xv=Wa>0?X/Wa:0, Score=Sd>0?Sn/Sd:0, br=normEntropy(q);
    const coreScore=statusFn(Score,br,theory);
    const Ycore=FULL_CAP*coreScore;
    const lift=SUPRA_RANGE*alpha.supracapacity*pSupra*supraGate(coreScore);
    const Yv=clamp01(Ycore+lift);
    xs[s]=Xv;ys[s]=Yv;
    if(s%step===0&&cloud.length<sub)cloud.push([Xv,Yv]);
  }
  const xm=mean(xs),ym=mean(ys);
  const sxx=variance(xs,xm),syy=variance(ys,ym),sxy=covariance(xs,ys,xm,ym);
  const sortedY=[...ys].sort((a,b)=>a-b);
  const yLo=percentile(sortedY,2.5),yHi=percentile(sortedY,97.5);
  let maxC=0;const contrib=ALL_GROUNDS.map(g=>{const c=alpha[g.key]*DELTA[g.key]*clamp01(entity.p[g.key]);if(c>maxC)maxC=c;return{k:g.key,c};});
  contrib.sort((p,q)=>q.c-p.c);
  const dominant=contrib.filter(o=>o.c>=0.25*maxC).slice(0,3).map(o=>o.k);
  return {x:xm,y:ym,sxx,syy,sxy,yLo,yHi,cloud,dominant};
}

/* ============================== style tokens ============================== */
const C={bg:'#FCFBF8',panel:'#FFFFFF',border:'#E5E2DA',borderSoft:'#EFEDE6',ink:'#1A1A1A',muted:'#5A5750',faint:'#8A8579',accent:'#3A3A8C'};
// LaTeX aesthetic: Computer Modern via cm-web-fonts, with serif fallbacks.
const SERIF=`'Computer Modern Serif','Latin Modern Roman',Georgia,'Times New Roman',serif`;
const MONO=`'Computer Modern Typewriter','Latin Modern Mono',ui-monospace,Menlo,monospace`;

/* ============================== small components ============================== */
function Slider({label,value,onChange,min=0,max=1,step=0.01,color,hint}){
  return (<div style={{marginBottom:9}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8}}>
      <span style={{fontSize:13,color:C.ink}}>{label}</span>
      <span style={{fontFamily:MONO,fontSize:12,color:C.muted}}>{value.toFixed(2)}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e=>onChange(parseFloat(e.target.value))}
      style={{width:'100%',accentColor:color||C.accent,cursor:'pointer'}}/>
    {hint&&<div style={{fontSize:11,color:C.faint,marginTop:1,lineHeight:1.35}}>{hint}</div>}
  </div>);
}
function Eyebrow({children,style}){
  return <div style={{fontFamily:MONO,fontSize:11,letterSpacing:'0.10em',textTransform:'uppercase',color:C.faint,marginBottom:8,...style}}>{children}</div>;
}
function Panel({children,style}){
  return <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:6,padding:16,...style}}>{children}</div>;
}

/* ============================== map plot ============================== */
function MapPlot({entities,statsMap,theory,selected,onSelect,showClouds,showEllipses,showCurve}){
  const VBW=760,VBH=540,L=70,R=26,T=22,B=58;
  const plotW=VBW-L-R,plotH=VBH-T-B;
  const mapX=(x)=>L+x*plotW, mapY=(y)=>T+(1-y)*plotH;
  let curve='';for(let i=0;i<=50;i++){const xx=i/50,yy=ceilingY(xx,theory);curve+=(i===0?'M':'L')+mapX(xx).toFixed(1)+' '+mapY(yy).toFixed(1)+' ';}
  const selStat=selected?statsMap[selected]:null;
  const selCol=selStat?CAT_COLORS[entities.find(e=>e.id===selected).cat]:C.accent;
  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} style={{width:'100%',height:'auto',display:'block',userSelect:'none'}}>
      {TIERS.map((t)=>{const y0=mapY(Math.min(t.hi,1)),y1=mapY(t.lo);return(
        <g key={t.short}>
          <rect x={L} y={y0} width={plotW} height={y1-y0} fill={t.fill}/>
          <text x={L+8} y={(y0+y1)/2+3} fontFamily={MONO} fontSize={10.5} fill={C.muted} opacity={0.85}>{t.long}</text>
        </g>);})}
      {[0,0.25,0.5,0.75,1].map(gx=>(
        <line key={'gx'+gx} x1={mapX(gx)} y1={T} x2={mapX(gx)} y2={T+plotH} stroke={C.borderSoft} strokeWidth={1}/>
      ))}
      <rect x={L} y={T} width={plotW} height={plotH} fill="none" stroke={C.border} strokeWidth={1}/>
      <line x1={L} y1={mapY(0.85)} x2={L+plotW} y2={mapY(0.85)} stroke="#7C3AED" strokeWidth={1} strokeDasharray="4 3" opacity={0.5}/>
      <text x={L+plotW-4} y={mapY(0.85)-5} fontFamily={MONO} fontSize={9.5} fill="#7C3AED" textAnchor="end" opacity={0.85}>more-than-full above</text>
      {showCurve&&<path d={curve} fill="none" stroke={C.ink} strokeWidth={1.6} strokeDasharray="2 3" opacity={0.55}/>}
      {showCurve&&<text x={mapX(0.5)} y={mapY(ceilingY(0.5,theory))-6} fontFamily={MONO} fontSize={9.5} fill={C.ink} opacity={0.6} textAnchor="middle">personhood ceiling (full)</text>}
      {selStat&&<g>
        <line x1={mapX(selStat.x)} y1={T} x2={mapX(selStat.x)} y2={T+plotH} stroke={selCol} strokeWidth={1} strokeDasharray="3 3" opacity={0.45}/>
        <line x1={L} y1={mapY(selStat.y)} x2={L+plotW} y2={mapY(selStat.y)} stroke={selCol} strokeWidth={1} strokeDasharray="3 3" opacity={0.45}/>
        <line x1={L} y1={mapY(selStat.yHi)} x2={L+plotW} y2={mapY(selStat.yHi)} stroke={selCol} strokeWidth={1} strokeDasharray="1 4" opacity={0.5}/>
        <text x={L+plotW-4} y={mapY(selStat.yHi)-4} fontFamily={MONO} fontSize={9} fill={selCol} textAnchor="end" opacity={0.75}>95% upper</text>
      </g>}
      {showClouds&&entities.map(e=>{const st=statsMap[e.id];const col=CAT_COLORS[e.cat];const dim=selected&&selected!==e.id;return(
        <g key={'c'+e.id} opacity={dim?0.35:1}>{st.cloud.map((pt,i)=>(
          <circle key={i} cx={mapX(pt[0])} cy={mapY(pt[1])} r={1.5} fill={col} opacity={0.16}/>
        ))}</g>);})}
      {showEllipses&&entities.map(e=>{
        const st=statsMap[e.id];const col=CAT_COLORS[e.cat];const sel=selected===e.id;const dim=selected&&!sel;
        const sx=plotW,sy=plotH;
        const A=sx*sx*st.sxx,Bc=-sx*sy*st.sxy,Cc=sy*sy*st.syy;
        const tr=A+Cc,det=A*Cc-Bc*Bc;const disc=Math.sqrt(Math.max(0,tr*tr/4-det));
        let l1=Math.max(tr/2+disc,1),l2=Math.max(tr/2-disc,1);
        const ang=Math.atan2(l1-A,Bc)*180/Math.PI;const k=2.448;
        const rx=k*Math.sqrt(l1),ry=k*Math.sqrt(l2);
        const cx=mapX(st.x),cy=mapY(st.y);
        return(<ellipse key={'e'+e.id} cx={cx} cy={cy} rx={rx} ry={ry}
          transform={`rotate(${ang} ${cx} ${cy})`}
          fill={col} fillOpacity={sel?0.16:0.07} stroke={col} strokeOpacity={dim?0.3:(sel?0.95:0.55)} strokeWidth={sel?1.8:0.9}/>);
      })}
      {entities.map(e=>{const st=statsMap[e.id];const col=CAT_COLORS[e.cat];const sel=selected===e.id;const dim=selected&&!sel;
        const cx=mapX(st.x),cy=mapY(st.y);const right=st.x<0.84;
        return(<g key={'p'+e.id} opacity={dim?0.4:1} style={{cursor:'pointer'}} onClick={()=>onSelect(sel?null:e.id)}>
          {sel&&<circle cx={cx} cy={cy} r={9} fill="none" stroke={col} strokeWidth={1.2} opacity={0.5}/>}
          <circle cx={cx} cy={cy} r={sel?6:4.5} fill={col} stroke="#fff" strokeWidth={1.4}/>
          <text x={right?cx+8:cx-8} y={cy+3.5} textAnchor={right?'start':'end'} fontFamily={MONO} fontSize={10.5} fill={C.ink} fontWeight={sel?700:400}>{e.name}</text>
        </g>);})}
      {[0,0.25,0.5,0.75,1].map(gx=>(<text key={'tx'+gx} x={mapX(gx)} y={T+plotH+16} textAnchor="middle" fontFamily={MONO} fontSize={9.5} fill={C.muted}>{gx.toFixed(2)}</text>))}
      {isThreshold(theory)&&<text x={L+plotW} y={T+plotH+31} textAnchor="end" fontFamily={MONO} fontSize={9} fontStyle="italic" fill={C.muted}>threshold view: vertical position marks tier membership, not amount of status</text>}
      <text x={L+plotW/2} y={VBH-6} textAnchor="middle" fontFamily={SERIF} fontSize={12.5} fontStyle="italic" fill={C.ink}>Moral status grounds satisfaction (credence-weighted breadth)</text>
      <text transform={`rotate(-90 16 ${T+plotH/2})`} x={16} y={T+plotH/2} textAnchor="middle" fontFamily={SERIF} fontSize={12.5} fontStyle="italic" fill={C.ink}>{yAxisLabel(theory)}</text>
    </svg>
  );
}

/* ============================== pairs (SPLOM) plot ============================== */
function PairsPlot({entities,statsMap,selected,onSelect,theory}){
  const VARS=[
    {key:'sentience',label:'Sentience',get:(e)=>e.p.sentience},
    {key:'agency',label:'Agency',get:(e)=>e.p.agency},
    {key:'cognition',label:'Cognition',get:(e)=>e.p.cognition},
    {key:'supra',label:'Supra-cap.',get:(e)=>e.p.supracapacity},
    {key:'degree',label:yAxisShort(theory),get:(e)=>statsMap[e.id].y},
  ];
  const n=VARS.length;const VBW=680,VBH=660,L=74,Tp=18,Rr=14,Bb=46;
  const gW=VBW-L-Rr,gH=VBH-Tp-Bb;const cW=gW/n,cH=gH/n;const pad=9;
  return(
    <svg viewBox={`0 0 ${VBW} ${VBH}`} style={{width:'100%',height:'auto',display:'block',userSelect:'none'}}>
      {VARS.map((vr,r)=>VARS.map((vc,c)=>{
        const x0=L+c*cW,y0=Tp+r*cH;
        const sx=(v)=>x0+pad+v*(cW-2*pad);
        const sy=(v)=>y0+cH-pad-v*(cH-2*pad);
        return(<g key={r+'-'+c}>
          <rect x={x0} y={y0} width={cW} height={cH} fill={(r+c)%2===0?'#FDFCFA':'#F7F5F0'} stroke={C.borderSoft} strokeWidth={1}/>
          {r===c
            ? <text x={x0+cW/2} y={y0+cH/2+4} textAnchor="middle" fontFamily={SERIF} fontSize={12.5} fontStyle="italic" fill={C.ink}>{vr.label}</text>
            : entities.map(e=>{const sel=selected===e.id;const dim=selected&&!sel;return(
                <circle key={e.id} cx={sx(clamp01(vc.get(e)))} cy={sy(clamp01(vr.get(e)))} r={sel?4:2.7}
                  fill={CAT_COLORS[e.cat]} stroke="#fff" strokeWidth={sel?1.1:0.5} opacity={dim?0.35:0.9}
                  style={{cursor:'pointer'}} onClick={()=>onSelect(sel?null:e.id)}><title>{e.name}</title></circle>);})}
        </g>);
      }))}
      {VARS.map((vr,r)=>(<text key={'rl'+r} transform={`rotate(-90 ${L-46} ${Tp+r*cH+cH/2})`} x={L-46} y={Tp+r*cH+cH/2} textAnchor="middle" fontFamily={MONO} fontSize={9.5} fill={C.muted}>{vr.label}</text>))}
      {VARS.map((vc,c)=>(<text key={'cl'+c} x={L+c*cW+cW/2} y={VBH-24} textAnchor="middle" fontFamily={MONO} fontSize={9.5} fill={C.muted}>{vc.label}</text>))}
      <text x={L+gW/2} y={VBH-6} textAnchor="middle" fontFamily={SERIF} fontSize={12} fontStyle="italic" fill={C.ink}>Pairwise relationships (an analogue of R&apos;s plot(data.frame))</text>
    </svg>
  );
}

/* ============================== obligations ============================== */
function obligationsFor(stat,precaution){
  const opIdx=precaution?tierIndex(stat.yHi):tierIndex(stat.y);
  let duties=[];
  if(opIdx===0)duties=OBLIG_TIER[0].slice();
  else for(let i=1;i<=opIdx;i++)duties=duties.concat(OBLIG_TIER[i]);
  const groundDuties=[];const seen=new Set();
  for(const g of stat.dominant)for(const d of (GROUND_OBLIG[g]||[]))if(!seen.has(d)){seen.add(d);groundDuties.push(d);}
  return {opIdx,duties,groundDuties};
}

/* ============================== main ============================== */
export default function MoralStatusMap(){
  useEffect(()=>{const l=document.createElement('link');l.rel='stylesheet';l.href='https://cdn.jsdelivr.net/gh/aaaakshat/cm-web-fonts@latest/fonts.css';document.head.appendChild(l);return()=>{try{document.head.removeChild(l);}catch(e){}};},[]);

  const [theory,setTheory]=useState('linear');
  const [alpha,setAlpha]=useState(Object.fromEntries(ALL_GROUNDS.map(g=>[g.key,g.alpha])));
  const [entities,setEntities]=useState(DEFAULT_ENTITIES);
  const [selected,setSelected]=useState(null);
  const [view,setView]=useState('map');
  const [showClouds,setShowClouds]=useState(false);
  const [showEllipses,setShowEllipses]=useState(true);
  const [showCurve,setShowCurve]=useState(true);
  const [precaution,setPrecaution]=useState(false);
  const [nSamples,setNSamples]=useState(220);
  const [visCats,setVisCats]=useState({digital:true,biological:true,reference:true,human:true,posthuman:true});
  const [editId,setEditId]=useState('chimera');
  const [showHelp,setShowHelp]=useState(false);
  const [showRefs,setShowRefs]=useState(false);
  const [cfg,setCfg]=useState('');
  const [cfgErr,setCfgErr]=useState('');

  const statsMap=useMemo(()=>{const m={};for(const e of entities)m[e.id]=computeStats(e,alpha,theory,nSamples);return m;},[entities,alpha,theory,nSamples]);
  const visEntities=entities.filter(e=>visCats[e.cat]);
  const editEntity=entities.find(e=>e.id===editId)||entities[0];

  const setEntityP=(id,key,val)=>setEntities(es=>es.map(e=>e.id===id?{...e,p:{...e.p,[key]:val}}:e));
  const setEntityConf=(id,val)=>setEntities(es=>es.map(e=>e.id===id?{...e,conf:val}:e));
  const renameEntity=(id,name)=>setEntities(es=>es.map(e=>e.id===id?{...e,name}:e));
  const setEntityCat=(id,cat)=>setEntities(es=>es.map(e=>e.id===id?{...e,cat}:e));
  const addEntity=()=>{const id='e'+Date.now();setEntities(es=>[...es,{id,name:'New entity',cat:'digital',conf:0.4,p:Object.fromEntries(ALL_GROUNDS.map(g=>[g.key,0.4]))}]);setEditId(id);setSelected(id);};
  const removeEntity=(id)=>{setEntities(es=>es.filter(e=>e.id!==id));if(selected===id)setSelected(null);if(editId===id){const rest=entities.filter(e=>e.id!==id);if(rest.length)setEditId(rest[0].id);}};
  const fillCfg=()=>setCfg(JSON.stringify({theory,alpha,entities},null,2));
  const applyCfg=()=>{try{const o=JSON.parse(cfg);if(o.theory)setTheory(o.theory);if(o.alpha)setAlpha(o.alpha);if(Array.isArray(o.entities))setEntities(o.entities);setCfgErr('');}catch(e){setCfgErr('Could not parse the text. Check the JSON and try again.');}};
  const reset=()=>{setTheory('linear');setAlpha(Object.fromEntries(ALL_GROUNDS.map(g=>[g.key,g.alpha])));setEntities(DEFAULT_ENTITIES);setSelected(null);setEditId('chimera');setCfgErr('');};

  const THEORIES=[
    {k:'linear',name:'Degree (linear)',desc:'Moral status rises in proportion to grounds (DeGrazia 2008).'},
    {k:'sigmoid',name:'Degree (sigmoid)',desc:'A logistic variant: slow at the extremes, steep in the middle.'},
    {k:'threshold',name:'Threshold',desc:'Moral status rises in discrete jumps at thresholds (Buchanan 2009).'},
    {k:'multicriterial',name:'Multi-criterial',desc:'Breadth across grounds is rewarded; narrow profiles are penalized (Warren 1997).'},
  ];

  const selStat=selected?statsMap[selected]:null;
  const selEntity=selected?entities.find(e=>e.id===selected):null;
  const ob=selEntity?obligationsFor(selStat,precaution):null;
  const ranked=[...visEntities].sort((a,b)=>statsMap[b.id].y-statsMap[a.id].y);

  const btn=(active)=>({fontFamily:SERIF,fontSize:13.5,padding:'6px 13px',borderRadius:4,cursor:'pointer',border:`1px solid ${active?C.accent:C.border}`,background:active?C.accent:'#fff',color:active?'#fff':C.ink,transition:'all .12s'});
  const chip=(col)=>({fontFamily:MONO,fontSize:11,padding:'2px 8px',borderRadius:3,background:col+'18',color:col,border:`1px solid ${col}44`});

  return(
    <div style={{fontFamily:SERIF,color:C.ink,background:C.bg,padding:'22px 20px 30px',minHeight:'100%'}}>
      <div style={{maxWidth:1280,margin:'0 auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:16,flexWrap:'wrap',marginBottom:6}}>
          <div>
            <Eyebrow>Created by Ethan C. Terrill in collaboration with Claude Opus 4.8.</Eyebrow>
            <h1 style={{margin:0,fontSize:28,fontWeight:700,letterSpacing:'-0.01em'}}>Stranger (Entities) in a Strange World: Mapping Moral Status</h1>
            <p style={{margin:'8px 0 0',fontSize:14.5,color:C.muted,maxWidth:800,lineHeight:1.55}}>
              Each candidate entity is represented as a probability cloud rather than a fixed point, because the evidence about these systems is incomplete. The horizontal axis aggregates how strongly an entity satisfies the grounds that plausibly confer moral status, weighted by one&apos;s credence that each ground matters. {' '}{verticalGloss(theory)}{' '} Six moral status grounds can (plausibly) carry an entity up to full moral status; a seventh, supra-personal capacity, is what can raise a being into supra, or more-than-full, moral status, reserved for post-persons and advanced AI. Paradigm humans cap at full moral status, and only entities whose capacities exceed the personhood ceiling rise above it.
            </p>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button style={btn(view==='map')} onClick={()=>setView('map')}>Map</button>
            <button style={btn(view==='pairs')} onClick={()=>setView('pairs')}>Pairwise</button>
            <button style={{...btn(showHelp),fontSize:13.5}} onClick={()=>setShowHelp(h=>!h)}>{showHelp?'Hide notes':'Reading the map'}</button>
          </div>
        </div>

        {showHelp&&<Panel style={{marginTop:10,background:'#FDFCFA'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:18,fontSize:13,lineHeight:1.55,color:C.ink}}>
            <div><b style={{color:C.accent}}>The two axes.</b> Horizontal, x-axis: the credence-weighted breadth of the six moral status grounds an entity satisfies, where each ground carries an empirical probability. Vertical, y-axis: the degree of moral status, and thus the strength of obligation, that those grounds imply. The dashed curve marks the full moral status ceiling reachable on personhood grounds alone.</div>
            <div><b style={{color:'#7C3AED'}}>Supra, or more-than-full.</b> A seventh ground, supra-personal capacity (Douglas&apos;s &quot;Capacity G&quot;), can raise an entity above the ceiling into supra moral status. Paradigm adult humans sit at full moral status because their supra-capacity is near zero; post-persons and advanced AI may rise above them.</div>
            <div><b style={{color:'#7C3AED'}}>The threshold debate.</b> The supra-capacity credence slider operationalizes an open dispute. Set it to zero for the view that full moral status is the ceiling (Buchanan&apos;s view, on which nothing exceeds personhood); raise it for the weaker-threshold views on which more-than-full moral status is possible (see Agar and Douglas).</div>
            <div><b style={{color:C.accent}}>The probabilistic layer.</b> Each draw samples every ground from a Beta distribution whose spread reflects the confidence placed in that entity&apos;s profile. The cloud is the set of draws; the ellipse is its 95% credible region. Selecting an entity lists the obligations that follow from its degree and its dominant grounds. Precautionary mode reads obligations off the 95% upper bound rather than the mean.</div>
          </div>
        </Panel>}

        <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:14,marginTop:14}} className="msm-grid">
          <style>{`@media(min-width:1060px){.msm-grid{grid-template-columns:302px minmax(0,1fr) 322px !important;}}`}</style>

          {/* LEFT */}
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <Panel>
              <Eyebrow>Meta-theory of moral status</Eyebrow>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {THEORIES.map(t=>(
                  <button key={t.k} onClick={()=>setTheory(t.k)} style={{textAlign:'left',padding:'8px 10px',borderRadius:5,cursor:'pointer',border:`1px solid ${theory===t.k?C.accent:C.border}`,background:theory===t.k?'#EEEEF7':'#fff'}}>
                    <div style={{fontSize:13.5,fontWeight:700,color:theory===t.k?C.accent:C.ink}}>{t.name}</div>
                    <div style={{fontSize:11.5,color:C.muted,marginTop:2,lineHeight:1.35}}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel>
              <Eyebrow>Moral status grounds: credence</Eyebrow>
              <div style={{fontSize:11.5,color:C.faint,marginTop:-4,marginBottom:10,lineHeight:1.4}}>Your credence that each property confers moral status. This is the point of moral uncertainty.</div>
              {CORE_GROUNDS.map(g=>(<Slider key={g.key} label={g.label} value={alpha[g.key]} color={C.accent} onChange={v=>setAlpha(a=>({...a,[g.key]:v}))}/>))}
              <div style={{borderTop:`1px solid ${C.borderSoft}`,margin:'10px 0',paddingTop:10}}>
                <Eyebrow style={{color:'#7C3AED'}}>More-than-full (supra)</Eyebrow>
                <Slider label={SUPRA.label} value={alpha.supracapacity} color={'#7C3AED'} onChange={v=>setAlpha(a=>({...a,supracapacity:v}))}
                  hint="Credence that capacities beyond the human range confer supra moral status. Zero recovers the view that full is the ceiling (Buchanan); higher values open the weaker-threshold views (see Terrill 2022)."/>
              </div>
            </Panel>

            <Panel>
              <Eyebrow>Display</Eyebrow>
              {[['Credible-region ellipses',showEllipses,setShowEllipses],['Posterior point cloud',showClouds,setShowClouds],['Personhood-ceiling curve',showCurve,setShowCurve],['Precautionary mode (act on the 95% upper bound)',precaution,setPrecaution]].map(([lab,val,set])=>(
                <label key={lab} style={{display:'flex',alignItems:'center',gap:8,fontSize:13,marginBottom:7,cursor:'pointer'}}>
                  <input type="checkbox" checked={val} onChange={e=>set(e.target.checked)} style={{accentColor:C.accent,width:15,height:15}}/>
                  <span>{lab}</span>
                </label>
              ))}
              <Slider label="Monte-Carlo draws" value={nSamples} min={60} max={600} step={20} onChange={setNSamples} hint="More draws give smoother clouds, at some cost in speed."/>
            </Panel>

            <Panel>
              <button onClick={()=>setShowRefs(r=>!r)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',width:'100%',background:'none',border:'none',cursor:'pointer',padding:0}}>
                <Eyebrow style={{marginBottom:0}}>Sources and basis</Eyebrow>
                <span style={{fontFamily:MONO,fontSize:14,color:C.faint}}>{showRefs?'\u2212':'+'}</span>
              </button>
              {showRefs&&<div style={{marginTop:12}}>
                {REFERENCES.map((grp,gi)=>(
                  <div key={gi} style={{marginBottom:gi<REFERENCES.length-1?12:0}}>
                    <div style={{fontSize:12,fontWeight:700,color:C.ink,marginBottom:5}}>{grp.group}</div>
                    {grp.items.map((it,ii)=>(<div key={ii} style={{fontSize:11.3,color:C.muted,lineHeight:1.5,marginBottom:5,paddingLeft:12,textIndent:-12}}>{it}</div>))}
                  </div>
                ))}
                <div style={{fontSize:11,color:C.faint,marginTop:6,lineHeight:1.45,borderTop:`1px solid ${C.borderSoft}`,paddingTop:8}}>The tool operationalizes these positions but does not adjudicate between them. Theories of consciousness (e.g., global workspace, higher-order, integrated information, and others) enter upstream, informing the sentience and consciousness credences, rather than forming separate axes. Some views make moral status contingent (Harman) or partly relational; the point-estimate profiles simplify these.</div>
              </div>}
            </Panel>
          </div>

          {/* CENTER */}
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <Panel style={{padding:14}}>
              {view==='map'
                ? <MapPlot entities={visEntities} statsMap={statsMap} theory={theory} selected={selected} onSelect={setSelected} showClouds={showClouds} showEllipses={showEllipses} showCurve={showCurve}/>
                : <PairsPlot entities={visEntities} statsMap={statsMap} selected={selected} onSelect={setSelected} theory={theory}/>}
              <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'center',marginTop:10,paddingTop:10,borderTop:`1px solid ${C.borderSoft}`}}>
                {Object.keys(CAT_LABEL).map(cat=>(
                  <label key={cat} style={{display:'flex',alignItems:'center',gap:6,fontSize:12,cursor:'pointer',opacity:visCats[cat]?1:0.45}}>
                    <input type="checkbox" checked={visCats[cat]} onChange={e=>setVisCats(v=>({...v,[cat]:e.target.checked}))} style={{accentColor:CAT_COLORS[cat],width:14,height:14}}/>
                    <span style={{width:11,height:11,borderRadius:2,background:CAT_COLORS[cat],display:'inline-block'}}/>
                    <span style={{color:C.ink}}>{CAT_LABEL[cat]}</span>
                  </label>
                ))}
                <span style={{fontSize:11,color:C.faint,marginLeft:'auto',fontFamily:MONO}}>ellipse: 95% credible region. Click an entity to inspect.</span>
              </div>
            </Panel>

            <Panel>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,gap:10,flexWrap:'wrap'}}>
                <Eyebrow style={{marginBottom:0}}>Entity profile: empirical uncertainty</Eyebrow>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <select value={editId} onChange={e=>setEditId(e.target.value)} style={{fontFamily:SERIF,fontSize:13,padding:'5px 8px',borderRadius:4,border:`1px solid ${C.border}`,background:'#fff',color:C.ink}}>
                    {entities.map(e=>(<option key={e.id} value={e.id}>{e.name}</option>))}
                  </select>
                  <button onClick={addEntity} style={{...btn(false),padding:'5px 10px'}}>Add</button>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 20px'}} className="msm-edit">
                <style>{`@media(max-width:520px){.msm-edit{grid-template-columns:1fr !important;}}`}</style>
                <div>
                  <div style={{display:'flex',gap:8,marginBottom:10,alignItems:'center'}}>
                    <input value={editEntity.name} onChange={e=>renameEntity(editEntity.id,e.target.value)} style={{flex:1,fontFamily:SERIF,fontSize:13,padding:'5px 8px',borderRadius:4,border:`1px solid ${C.border}`,color:C.ink}}/>
                    <select value={editEntity.cat} onChange={e=>setEntityCat(editEntity.id,e.target.value)} style={{fontFamily:SERIF,fontSize:12.5,padding:'5px 6px',borderRadius:4,border:`1px solid ${C.border}`,background:'#fff',color:C.ink}}>
                      {Object.keys(CAT_LABEL).map(c=>(<option key={c} value={c}>{CAT_LABEL[c]}</option>))}
                    </select>
                  </div>
                  {CORE_KEYS.slice(0,3).map(k=>(<Slider key={k} label={GROUND_LABEL[k]} value={editEntity.p[k]} color={CAT_COLORS[editEntity.cat]} onChange={v=>setEntityP(editEntity.id,k,v)}/>))}
                  <Slider label={SUPRA.label} value={editEntity.p.supracapacity} color={'#7C3AED'} onChange={v=>setEntityP(editEntity.id,'supracapacity',v)} hint="Values beyond the human range lift an entity into supra."/>
                </div>
                <div>
                  {CORE_KEYS.slice(3).map(k=>(<Slider key={k} label={GROUND_LABEL[k]} value={editEntity.p[k]} color={CAT_COLORS[editEntity.cat]} onChange={v=>setEntityP(editEntity.id,k,v)}/>))}
                  <Slider label="Epistemic confidence" value={editEntity.conf} color={C.muted} onChange={v=>setEntityConf(editEntity.id,v)} hint="How firmly is this profile held? Lower confidence widens the posterior."/>
                  <button onClick={()=>removeEntity(editEntity.id)} style={{fontFamily:SERIF,fontSize:12,padding:'5px 10px',borderRadius:4,border:`1px solid #D9B3B0`,background:'#fff',color:'#9C3B33',cursor:'pointer',marginTop:2}}>Remove entity</button>
                </div>
              </div>
            </Panel>
          </div>

          {/* RIGHT */}
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <Panel>
              {!selEntity ? (
                <div>
                  <Eyebrow>Ranking by {isThreshold(theory)?'moral status tier':'degree of moral status'}</Eyebrow>
                  <div style={{fontSize:11.5,color:C.faint,marginTop:-4,marginBottom:8}}>Select an entity on the map to see its obligations.</div>
                  <div style={{display:'flex',flexDirection:'column',gap:1}}>
                    {ranked.map(e=>{const st=statsMap[e.id];const ti=tierIndex(st.y);return(
                      <button key={e.id} onClick={()=>setSelected(e.id)} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 6px',borderRadius:4,border:'1px solid transparent',background:'transparent',cursor:'pointer',textAlign:'left'}}>
                        <span style={{width:9,height:9,borderRadius:2,background:CAT_COLORS[e.cat],flexShrink:0}}/>
                        <span style={{flex:1,fontSize:13,color:C.ink,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.name}</span>
                        <span style={{fontFamily:MONO,fontSize:11,color:C.muted}}>{st.y.toFixed(2)}</span>
                        <span style={{...chip(ti===4?'#7C3AED':C.accent),fontSize:10,padding:'1px 6px'}}>{TIERS[ti].short}</span>
                      </button>);})}
                  </div>
                </div>
              ):(
                <div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8}}>
                    <div>
                      <Eyebrow style={{marginBottom:4}}>{CAT_LABEL[selEntity.cat]}</Eyebrow>
                      <div style={{fontSize:18,fontWeight:700,letterSpacing:'-0.01em'}}>{selEntity.name}</div>
                    </div>
                    <button onClick={()=>setSelected(null)} style={{fontFamily:MONO,fontSize:11,color:C.muted,background:'none',border:'none',cursor:'pointer'}}>clear</button>
                  </div>
                  <div style={{display:'flex',gap:18,margin:'12px 0',paddingBottom:12,borderBottom:`1px solid ${C.borderSoft}`}}>
                    <div><div style={{fontSize:11,color:C.faint,fontFamily:MONO}}>GROUNDS</div><div style={{fontFamily:MONO,fontSize:19,fontWeight:500}}>{selStat.x.toFixed(2)}</div></div>
                    <div><div style={{fontSize:11,color:C.faint,fontFamily:MONO}}>{yAxisShort(theory).toUpperCase()}</div><div style={{fontFamily:MONO,fontSize:19,fontWeight:500}}>{selStat.y.toFixed(2)}</div><div style={{fontFamily:MONO,fontSize:10.5,color:C.muted}}>95% CI [{selStat.yLo.toFixed(2)}, {selStat.yHi.toFixed(2)}]</div></div>
                    <div style={{display:'flex',alignItems:'center'}}><span style={{...chip(ob.opIdx===4?'#7C3AED':C.accent),fontSize:11.5,padding:'3px 10px'}}>{TIERS[ob.opIdx].short}</span></div>
                  </div>

                  <div style={{fontSize:11,color:C.faint,fontFamily:MONO,marginBottom:6}}>DOMINANT GROUNDS</div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
                    {selStat.dominant.map(g=>(<span key={g} style={chip(g==='supracapacity'?'#7C3AED':CAT_COLORS[selEntity.cat])}>{GROUND_LABEL[g]}</span>))}
                  </div>

                  {(tierIndex(selStat.yLo)!==tierIndex(selStat.yHi)||precaution)&&(
                    <div style={{background:'#FAF4E8',border:'1px solid #E6D3AC',borderRadius:5,padding:'9px 11px',marginBottom:14,fontSize:12,lineHeight:1.45,color:'#6E5115'}}>
                      {precaution?<b>Precautionary mode. </b>:<b>Note. </b>}
                      The 95% interval spans <b>{TIERS[tierIndex(selStat.yLo)].short}</b> to <b>{TIERS[tierIndex(selStat.yHi)].short}</b>. {precaution?'The duties below are set to the upper bound.':'A precautionary stance would act on the upper bound.'}
                    </div>
                  )}

                  <div style={{fontSize:12,fontWeight:700,color:C.ink,marginBottom:6}}>Duties from <span style={{color:ob.opIdx===4?'#7C3AED':C.accent}}>{isThreshold(theory)?'tier':'degree'}</span> (tier: {TIERS[ob.opIdx].short})</div>
                  <ul style={{margin:'0 0 14px',paddingLeft:16,fontSize:12.5,lineHeight:1.5,color:C.ink}}>
                    {ob.duties.map((d,i)=>(<li key={i} style={{marginBottom:3}}>{d}</li>))}
                  </ul>
                  {ob.groundDuties.length>0&&<>
                    <div style={{fontSize:12,fontWeight:700,color:C.ink,marginBottom:6}}>Duties from <span style={{color:CAT_COLORS[selEntity.cat]}}>grounds</span></div>
                    <ul style={{margin:0,paddingLeft:16,fontSize:12.5,lineHeight:1.5,color:C.ink}}>
                      {ob.groundDuties.map((d,i)=>(<li key={i} style={{marginBottom:3}}>{d}</li>))}
                    </ul>
                  </>}
                </div>
              )}
            </Panel>

            <Panel>
              <Eyebrow>Save and load a configuration</Eyebrow>
              <div style={{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap'}}>
                <button onClick={fillCfg} style={{...btn(false),padding:'5px 10px',fontSize:12}}>Export current</button>
                <button onClick={applyCfg} style={{...btn(false),padding:'5px 10px',fontSize:12}}>Apply pasted</button>
                <button onClick={reset} style={{...btn(false),padding:'5px 10px',fontSize:12}}>Reset</button>
              </div>
              <textarea value={cfg} onChange={e=>setCfg(e.target.value)} placeholder="Export dumps the current map as JSON. Paste a saved configuration and apply it to restore a state." style={{width:'100%',height:96,fontFamily:MONO,fontSize:11,padding:8,borderRadius:4,border:`1px solid ${C.border}`,color:C.ink,resize:'vertical',boxSizing:'border-box'}}/>
              {cfgErr&&<div style={{fontSize:11.5,color:'#9C3B33',marginTop:5}}>{cfgErr}</div>}
              <div style={{fontSize:11,color:C.faint,marginTop:6,lineHeight:1.4}}>The empirical values are illustrative defaults. Edit grounds, credences, and entities to reflect your own evidence and theory.</div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
