'use strict';
/* CLINICAL opening screen: plays the logo reveal, then the user taps to enter the form */
(function(){
  const splash = document.getElementById('splash');
  if (!splash) return;
  let seen = false;
  try { seen = sessionStorage.getItem('clinicalEntered') === '1'; } catch (e) {}
  if (seen) { splash.remove(); document.body.classList.remove('splash-open'); return; }

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('clinLogo'), root = document.getElementById('clinStage');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MAX = 10;
  const B = [null,[878,636,1771,900],[668,636,1771,908],[467,559,1771,908],[467,559,1771,1022],
    [467,449,1771,1022],[467,449,1771,1022],[467,449,1771,1022],[467,449,1771,1022],[467,449,1976,1022],[467,449,1976,1022]];
  const PAD = 30;
  let vb = svg.getAttribute('viewBox').split(' ').map(Number), raf = 0, timers = [];
  const frame = n => { const b = B[Math.max(1, n)]; return [b[0]-PAD, b[1]-PAD, b[2]-b[0]+2*PAD, b[3]-b[1]+2*PAD]; };
  function tweenTo(n, instant){
    cancelAnimationFrame(raf);
    const to = frame(n), from = vb.slice(), t0 = performance.now(), dur = (instant || reduced) ? 0 : 1100;
    const ease = p => p < .5 ? 4*p*p*p : 1 - Math.pow(-2*p + 2, 3) / 2;
    (function step(t){
      const p = dur ? Math.min(1, (t - t0) / dur) : 1, k = ease(p);
      vb = from.map((v, i) => v + (to[i] - v) * k);
      svg.setAttribute('viewBox', vb.join(' '));
      if (p < 1) raf = requestAnimationFrame(step);
    })(t0);
  }
  function buildWord(){
    const g = document.getElementById('clinWord'), word = 'CLINICAL', W = 628, X0 = 1114;
    const widths = [...word].map(ch => {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('class', 'ltr'); t.style.transform = 'none'; t.textContent = ch; g.appendChild(t);
      let w = 0; try { w = t.getComputedTextLength(); } catch (e) {}
      g.removeChild(t); return w || 80;
    });
    const gap = (W - widths.reduce((a, b) => a + b, 0)) / (word.length - 1);
    const xs = []; let x = X0; widths.forEach(w => { xs.push(x); x += w + gap; });
    g.innerHTML = '';
    [...word].forEach((ch, i) => {
      const l = document.createElementNS(NS, 'text');
      l.setAttribute('class', 'ltr'); l.setAttribute('x', xs[i].toFixed(1)); l.setAttribute('y', '800');
      l.textContent = ch;
      const at = .1 + 1.6 * (xs[i] + 40 - 1090) / 654;
      l.style.setProperty('--dl', Math.max(0, at - .08).toFixed(2) + 's');
      g.appendChild(l);
    });
  }
  function setStage(n, instant){
    for (let s = 1; s <= MAX; s++) root.classList.toggle('s' + s, s <= n);
    tweenTo(n, instant);
  }
  function play(){
    setStage(0, true); void svg.getBoundingClientRect();
    const at = [300,2700,4300,5700,7100,8700,10600,12700,15200,17600];
    at.forEach((t, i) => timers.push(setTimeout(() => setStage(i + 1), reduced ? 0 : t)));
    timers.push(setTimeout(() => root.classList.add('alive'), reduced ? 0 : 2200));
    timers.push(setTimeout(() => splash.classList.add('ready'), reduced ? 0 : 19500));
  }
  function enter(){
    if (splash.classList.contains('leaving')) return;
    try { sessionStorage.setItem('clinicalEntered', '1'); } catch (e) {}
    splash.classList.add('leaving');
    document.body.classList.remove('splash-open');
    setTimeout(() => { timers.forEach(clearTimeout); cancelAnimationFrame(raf); splash.remove(); }, reduced ? 0 : 600);
  }
  splash.addEventListener('click', enter);
  splash.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(); } });

  const ready = (document.fonts && document.fonts.load)
    ? Promise.race([document.fonts.load('400 142px "Inter"').then(() => document.fonts.ready), new Promise(r => setTimeout(r, 2500))]).catch(() => {})
    : Promise.resolve();
  ready.then(() => { buildWord(); play(); });
})();
