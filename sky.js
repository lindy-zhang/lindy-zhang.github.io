/* ============================================================
   THE SKY (shared by every page: index.html and writing/flash.html)
   Colors follow the real sunrise and sunset in Cambridge.
   Stars twinkle and drift, the river reflects them, and at
   night a shooting star goes by now and then.
   Add ?t=18.5 to the URL to preview a time of day (in hours).
   ============================================================ */
(() => {
  const cv = document.getElementById('sky'), ctx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);
  const forced = params.has('t') ? parseFloat(params.get('t')) : null;
  let W, H, DPR, horizon, paused = false;

  /* ---------- time in Cambridge ---------- */
  function bostonNow(){
    const d = new Date();
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone:'America/New_York', hour:'numeric', minute:'numeric', second:'numeric', hour12:false,
      year:'numeric', month:'numeric', day:'numeric'
    }).formatToParts(d).map(p => [p.type, p.value]));
    const h = (+parts.hour % 24) + parts.minute / 60 + parts.second / 3600;
    const utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    let off = h - utcH; if (off > 12) off -= 24; if (off < -12) off += 24;
    const doy = Math.round((Date.UTC(+parts.year, parts.month - 1, +parts.day) - Date.UTC(+parts.year, 0, 0)) / 864e5);
    return {h, off, doy};
  }
  // NOAA approximation for sunrise / sunset in Boston
  function sun(doy, off){
    const lat = 42.36 * Math.PI / 180, lon = -71.06;
    const g = 2 * Math.PI / 365 * (doy - 1);
    const eqt = 229.18 * (0.000075 + 0.001868*Math.cos(g) - 0.032077*Math.sin(g) - 0.014615*Math.cos(2*g) - 0.040849*Math.sin(2*g));
    const dec = 0.006918 - 0.399912*Math.cos(g) + 0.070257*Math.sin(g) - 0.006758*Math.cos(2*g) + 0.000907*Math.sin(2*g) - 0.002697*Math.cos(3*g) + 0.00148*Math.sin(3*g);
    const ha = Math.acos(Math.cos(90.833*Math.PI/180) / (Math.cos(lat)*Math.cos(dec)) - Math.tan(lat)*Math.tan(dec)) * 180 / Math.PI;
    const noon = (720 - 4*lon - eqt) / 60 + off;
    return {rise: noon - ha*4/60, set: noon + ha*4/60, noon};
  }

  /* ---------- palette ---------- */
  const hex = s => [1,3,5].map(i => parseInt(s.slice(i, i+2), 16));
  const P = {
    night:   ['#070c1a', '#141c33'],
    predawn: ['#141b36', '#3b3456'],
    dawn:    ['#4b5a8c', '#e7a891'],
    morning: ['#9db8d6', '#f1d9c2'],
    day:     ['#b3cde3', '#eef0e8'],
    late:    ['#a9bdd4', '#f0dcc1'],
    golden:  ['#7488ad', '#f2a46f'],
    dusk:    ['#2c3762', '#b86e78'],
    blue:    ['#121a35', '#2f3157'],
  };
  function skyAt(h, s){
    const k = [
      [s.rise - 1.6, P.night], [s.rise - .7, P.predawn], [s.rise + .05, P.dawn], [s.rise + 1.1, P.morning],
      [s.noon, P.day], [s.set - 1.6, P.late], [s.set - .25, P.golden], [s.set + .45, P.dusk],
      [s.set + 1.2, P.blue], [s.set + 2.2, P.night]
    ];
    if (h < k[0][0]) h += 24;
    const ext = [...k, [k[0][0] + 24, k[0][1]]];
    for (let i = 0; i < ext.length - 1; i++){
      const [a, ca] = ext[i], [b, cb] = ext[i+1];
      if (h >= a && h <= b){
        let t = (h - a) / (b - a); t = t*t*(3 - 2*t);
        return [0,1].map(j => { const A = hex(ca[j]), B = hex(cb[j]); return A.map((v, n) => Math.round(v + (B[n] - v) * t)); });
      }
    }
    return [hex(P.night[0]), hex(P.night[1])];
  }
  const lum = c => (0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]) / 255;
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

  /* ---------- stars ---------- */
  let stars = [], ripples = [], meteor = null, nextMeteor = 4000;
  const rand = (a, b) => a + Math.random() * (b - a);
  const newStar = (x, y, born) => ({x, y, vx: rand(-.04, .04), r: rand(.5, 1.5), tw: rand(0, 6.28), sp: rand(.8, 1.6), born});
  function resize(){
    DPR = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    horizon = H * (W < 760 ? .84 : .79);
    const n = Math.round(Math.min(240, Math.max(80, W * horizon / 6000)));
    stars = stars.filter(p => p.y < horizon);
    while (stars.length < n){
      // more stars high up, fewer near the glow of the horizon
      const y = horizon * Math.pow(Math.random(), 1.4);
      stars.push(newStar(rand(0, W), Math.max(8, y - 12), -1e9));
    }
  }
  addEventListener('resize', resize);
  resize();

  // click the open sky to add a star
  addEventListener('pointerdown', e => {
    if (e.target.closest('a, button, .peek, .corner, .music, img')) return;
    if (e.clientY > horizon) return;
    const now = performance.now();
    const s = newStar(e.clientX, e.clientY, now); s.r = 1.6;
    stars.push(s);
    ripples.push({x: e.clientX, y: e.clientY, t: now});
    if (stars.length > 320) stars.shift();
  });

  // the caption fades once you start scrolling
  const caption = document.getElementById('caption');
  if (caption) addEventListener('scroll', () => caption.classList.toggle('hide', scrollY > 120), {passive:true});

  const pauseBtn = document.getElementById('pause') || document.createElement('button');
  pauseBtn.onclick = () => { paused = !paused; pauseBtn.textContent = paused ? 'resume time' : 'pause time'; if (!paused){ lastFrame = performance.now(); requestAnimationFrame(frame); } };
  const clock = document.getElementById('clock') || {};
  const meta = document.querySelector('meta[name=theme-color]');

  /* ---------- draw ---------- */
  let inkNow = null, simT = 0, lastFrame = performance.now();
  function frame(now){
    if (paused) return;
    const dt = Math.min(50, now - lastFrame); lastFrame = now; simT += dt;

    const b = bostonNow();
    const s = sun(b.doy, b.off);
    const h = forced !== null ? forced : b.h;
    const [top, bot] = skyAt(h, s);
    const L = lum(mix(top, bot, .45));
    const dark = L < .5;
    const ink = dark ? [240, 236, 226] : [28, 30, 38];
    const inkStr = ink.join(', ');
    if (inkStr !== inkNow){ document.documentElement.style.setProperty('--ink', inkStr); inkNow = inkStr; meta.content = rgb(top); }
    // 0 in daylight, 1 at full night
    const night = Math.max(0, Math.min(1, (.42 - L) / .3));

    // sky
    const g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, rgb(top)); g.addColorStop(1, rgb(bot));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizon + 1);

    // the river: a darker band with a soft line of light at the horizon
    const wtop = mix(bot, top, .35).map(v => v * (dark ? .62 : .8));
    const wbot = top.map(v => v * (dark ? .45 : .62));
    const wg = ctx.createLinearGradient(0, horizon, 0, H);
    wg.addColorStop(0, rgb(wtop)); wg.addColorStop(1, rgb(wbot));
    ctx.fillStyle = wg; ctx.fillRect(0, horizon, W, H - horizon);
    ctx.fillStyle = rgb(mix(bot, [255, 240, 220], .3), .35);
    ctx.fillRect(0, horizon - .5, W, 1);

    // shimmer on the water
    ctx.strokeStyle = rgb(mix(bot, [255, 255, 255], .25), dark ? .16 : .22); ctx.lineWidth = 1;
    for (let i = 0; i < 46; i++){
      const yy = horizon + 6 + ((i * 37) % (H - horizon - 6));
      const depth = (yy - horizon) / (H - horizon);
      const speed = (.006 + depth * .012) * (i % 2 ? 1 : -.6);
      const x0 = ((i * 211 + simT * speed * (reduce ? 0 : 1)) % (W + 200) + W + 200) % (W + 200) - 100;
      const len = 14 + depth * 60 + (i % 5) * 8;
      ctx.globalAlpha = .4 + .6 * Math.sin(simT * .0012 + i);
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + len, yy); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // stars and their reflections; by day they fade to faint specks
    const starC = dark ? [255, 250, 240] : [40, 44, 58];
    for (const p of stars){
      if (!reduce){ p.x += p.vx * dt * .05; if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10; }
      const fade = Math.min(1, (now - p.born) / 900);
      const tw = reduce ? 1 : .55 + .45 * Math.sin(simT * .0015 * p.sp + p.tw);
      // stars come out as it gets dark and are hidden in daylight
      let a = (dark ? (.12 + .83 * night) * (.35 + .65 * tw) : 0) * fade;
      // stars you add by clicking stay visible even in daylight
      if (p.born > 0) a = Math.max(a, .6 * fade);
      if (a < .01) continue;
      ctx.fillStyle = rgb(starC, a);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      if (dark && p.r > 1.3 && night > .6){
        ctx.fillStyle = rgb(starC, a * .12);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, 6.283); ctx.fill();
      }
      const ry = horizon + (horizon - p.y) * .32;
      if (ry < H){
        const wob = reduce ? 0 : Math.sin(simT * .002 + p.y * .1) * 2;
        ctx.fillStyle = rgb(starC, a * .22);
        ctx.fillRect(p.x - p.r * 1.6 + wob, ry, p.r * 3.2, .8);
      }
    }

    // a shooting star every so often, only when it's properly dark
    if (!reduce && night > .7){
      nextMeteor -= dt;
      if (!meteor && nextMeteor < 0){
        const fromLeft = Math.random() < .5;
        meteor = {x: fromLeft ? rand(W * .35, W * .6) : rand(W * .6, W * .95), y: rand(20, horizon * .35),
                  dx: fromLeft ? 1 : -1, t: 0, life: rand(700, 1100)};
        nextMeteor = rand(9000, 22000);
      }
      if (meteor){
        meteor.t += dt;
        const k = meteor.t / meteor.life, len = 120;
        const hx = meteor.x + meteor.dx * k * 320, hy = meteor.y + k * 130;
        const tg = ctx.createLinearGradient(hx, hy, hx - meteor.dx * len, hy - len * .4);
        const al = Math.sin(Math.PI * Math.min(1, k)) * .85;
        tg.addColorStop(0, rgb(starC, al)); tg.addColorStop(1, rgb(starC, 0));
        ctx.strokeStyle = tg; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - meteor.dx * len, hy - len * .4); ctx.stroke();
        if (k >= 1) meteor = null;
      }
    }

    // soft rings where someone added a star
    ripples = ripples.filter(r => now - r.t < 1200);
    for (const r of ripples){
      const t = (now - r.t) / 1200;
      ctx.strokeStyle = rgb(ink, .45 * (1 - t)); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, 3 + t * 30, 0, 6.283); ctx.stroke();
    }

    // clock
    const H12 = Math.floor(h) % 12 || 12, M = String(Math.floor((h % 1) * 60)).padStart(2, '0');
    clock.textContent = `cambridge ${H12}:${M} ${Math.floor(h) % 24 < 12 ? 'am' : 'pm'}`;

    if (!reduce) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  if (reduce){ addEventListener('resize', () => requestAnimationFrame(frame)); setInterval(() => requestAnimationFrame(frame), 60000); }
})();
