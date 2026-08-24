import { decide, makeRng, STYLES } from './opponent.js';
import { cardToInt } from './evaluator.js';
const c = s => s.split(' ').map(cardToInt);
let f=0; const ck=(l,a,e)=>{const ok=a===e;if(!ok)f++;console.log((ok?'ok  ':'FAIL')+' '+l.padEnd(50), a, ok?'':'expected '+e);};

console.log('1. Bots actually look at their cards (facing a pot-sized bet)');
const spot = (hole)=>decide({hole:c(hole),board:[],pot:10,toCall:10,stack:100,style:'tag',position:0.2,rng:()=>0.9});
ck('AA continues', spot('As Ah').action!=='fold', true);
ck('KK continues', spot('Ks Kh').action!=='fold', true);
ck('72o folds', spot('7s 2h').action, 'fold');
ck('32o folds', spot('3s 2h').action, 'fold');
ck('J4o folds', spot('Js 4h').action, 'fold');

console.log('\n2. Postflop respects pot odds (hero drawing thin vs made hand)');
// Bot holds bottom pair on a scary board, facing a huge bet -> should fold
const thin = decide({hole:c('2h 3d'),board:c('As Ks Qs'),pot:10,toCall:30,stack:100,style:'tag',rng:()=>0.9,seed:7});
console.log('   trash vs 3x pot bet:', thin.action, '| equity', (thin.equity*100).toFixed(1)+'%', 'potOdds', (thin.potOdds*100).toFixed(1)+'%');
ck('folds when equity < pot odds', thin.equity < thin.potOdds && thin.action==='fold', true);
// Bot flopped a set, facing a small bet -> must not fold
const set = decide({hole:c('7h 7d'),board:c('7s Ks 2c'),pot:10,toCall:2,stack:100,style:'tag',rng:()=>0.9,seed:7});
console.log('   flopped set vs small bet:', set.action, '| equity', (set.equity*100).toFixed(1)+'%');
ck('never folds a flopped set to a small bet', set.action!=='fold', true);

console.log('\n3. Style profiles produce different VPIP (2000 random hands each)');
const deck=[...Array(52).keys()];
for (const style of Object.keys(STYLES)) {
  const rng=makeRng(12345); let played=0, n=2000;
  for(let i=0;i<n;i++){
    const a=Math.floor(rng()*52); let b=Math.floor(rng()*52); if(b===a) b=(b+1)%52;
    const d=decide({hole:[deck[a],deck[b]],board:[],pot:1.5,toCall:1,stack:100,style,position:0.5,rng});
    if(d.action!=='fold') played++;
  }
  const vpip=played/n;
  console.log(`   ${STYLES[style].label.padEnd(8)} target ${(STYLES[style].vpip*100).toFixed(0).padStart(3)}%  ->  actual ${(vpip*100).toFixed(1)}%`);
}

console.log('\n4. Decision throughput');
const rng=makeRng(99);
let t=performance.now(); let N=2000;
for(let i=0;i<N;i++) decide({hole:c('Ah Kd'),board:c('Qh 7s 2c'),pot:10,toCall:5,stack:100,style:'tag',rng,seed:i});
let ms=performance.now()-t;
console.log(`   postflop decisions: ${(N/ms*1000).toFixed(0)}/sec (${(ms/N).toFixed(3)} ms each)`);
t=performance.now();
for(let i=0;i<50000;i++) decide({hole:c('Ah Kd'),board:[],pot:10,toCall:5,stack:100,style:'tag',rng});
console.log(`   preflop decisions: ${(50000/(performance.now()-t)*1000).toFixed(0)}/sec`);
console.log(f?('\n'+f+' FAILED'):'\nAll opponent checks passed.');
process.exit(f?1:0);
