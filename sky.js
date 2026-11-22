/* ============================================================
   THE SKY (shared by every page: index.html and writing/flash.html)

   The Charles at the real time of day in Cambridge:
   - sky colors follow the actual sunrise and sunset
   - the sun and moon move across the sky (with the real moon phase)
   - clouds drift by, birds cross now and then in daylight
   - the city across the river lights up at night
   - sailboats drift on the water during the day
   - stars twinkle at night, with the odd shooting star
   - click the sky to add a star

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
  // moon phase: 0 = new, .5 = full (counted from a known new moon, Jan 6 2000)
  const moonPhase = () => (((Date.now() / 864e5 - 10962.76) % 29.530588) + 29.530588) % 29.530588 / 29.530588;

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
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  // a seeded random so the skyline is the same on every visit
  const seeded = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  /* ---------- the scene ---------- */
  let stars = [], ripples = [], meteor = null, nextMeteor = 4000;
  let clouds = [], city = [], boats = [], flock = null, nextFlock = rand(6000, 14000);
  const newStar = (x, y, born) => ({x, y, vx: rand(-.04, .04), r: rand(.5, 1.5), tw: rand(0, 6.28), sp: rand(.8, 1.6), born});

  // soft clouds are drawn once to their own little canvas, then moved around
  function makeCloud(scale){
    const w = Math.round(280 * scale), h = Math.round(150 * scale);
    const c = document.createElement('canvas'); c.width = w * DPR; c.height = h * DPR;
    const g = c.getContext('2d'); g.scale(DPR, DPR);
    const puffs = 7 + (Math.random() * 5 | 0);
    for (let i = 0; i < puffs; i++){
      const px = w * (.2 + .6 * (i / (puffs - 1))) + rand(-12, 12) * scale;
      const pr = (22 + Math.sin(Math.PI * i / (puffs - 1)) * 26 + rand(-6, 8)) * scale;
      const py = h * .78 - pr * .45;
      const rg = g.createRadialGradient(px, py, 0, px, py, pr);
      rg.addColorStop(0, 'rgba(255,255,255,.75)'); rg.addColorStop(.6, 'rgba(255,255,255,.35)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(px, py, pr, 0, 6.283); g.fill();
    }
    return {img: c, w, h};
  }

  function buildCity(){
    // low buildings on the left, Back Bay rising on the right, with two tall towers
    const r = seeded(11); city = [];
    const maxH = Math.min(H * .085, 80);
    let x = -6;
    while (x < W + 6){
      const pos = x / W;
      const w = 7 + r() * 22;
      let h = maxH * (.12 + r() * .3) * (.35 + pos * 1.05);
      if (r() < .06) h *= 1.8;
      const wins = [];
      for (let yy = 4; yy < h - 3; yy += 5) for (let xx = 2.5; xx < w - 2.5; xx += 4) if (r() < .35) wins.push([xx, yy, r()]);
      city.push({x, w, h, wins});
      x += w + (r() < .25 ? r() * 8 : 0);
    }
    const tower = (fx, w, hk, antenna, glass) => {
      const h = maxH * hk, x = W * fx, wins = [];
      for (let yy = 5; yy < h - 4; yy += 5) for (let xx = 2.5; xx < w - 2.5; xx += 4) if (r() < .45) wins.push([xx, yy, r()]);
      city.push({x, w, h, wins, antenna, glass});
    };
    if (W > 500){ tower(.74, 17, 1.25, true, false); tower(.81, 13, 1.45, false, true); }
  }

  function resize(){
    DPR = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    horizon = H * (W < 760 ? .84 : .79);
    const n = Math.round(Math.min(240, Math.max(80, W * horizon / 6000)));
    stars = stars.filter(p => p.y < horizon);
    while (stars.length < n){
      const y = horizon * Math.pow(Math.random(), 1.4);
      stars.push(newStar(rand(0, W), Math.max(8, y - 12), -1e9));
    }
    const nc = W < 760 ? 4 : 7, small = W < 760 ? .6 : 1;
    clouds = Array.from({length: nc}, (_, i) => {
      const depth = rand(.5, 1.2);
      return {...makeCloud(depth * small), x: rand(-200, W), y: horizon * rand(.06, .55), v: 3 + depth * 6, depth};
    });
    buildCity();
    boats = Array.from({length: W < 760 ? 2 : 3}, () => ({x: rand(0, W), d: rand(.25, .75), v: rand(2, 5) * (Math.random() < .5 ? -1 : 1), s: rand(.75, 1.25), ph: rand(0, 6)}));
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

  /* ---------- sun and moon ---------- */
  // position along an arc from the left edge (rising) to the right edge (setting)
  function arcPos(p){
    return {x: W * (.06 + .88 * p), y: horizon - Math.sin(Math.PI * p) * horizon * .72};
  }
  function drawMoon(x, y, r, phase, a, sky){
    const k = Math.cos(phase * 2 * Math.PI), ex = Math.abs(k) * r;
    ctx.save();
    ctx.globalAlpha = a;
    // the dark part of the moon, just barely visible
    ctx.fillStyle = rgb(mix(sky, [255, 255, 255], .08));
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgb(246,241,226)';
    ctx.beginPath();
    if (phase < .5){ ctx.arc(x, y, r, -Math.PI/2, Math.PI/2, false); ctx.ellipse(x, y, ex, r, 0, Math.PI/2, -Math.PI/2, k > 0); }
    else           { ctx.arc(x, y, r, Math.PI/2, Math.PI*1.5, false); ctx.ellipse(x, y, ex, r, 0, Math.PI*1.5, Math.PI/2, k > 0); }
    ctx.fill();
    ctx.restore();
  }
  function glow(x, y, r, color, a){
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgb(color, a)); g.addColorStop(1, rgb(color, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  /* ---------- birds ---------- */
  function drawBird(x, y, s, flap, color){
    const w = 6 * s, lift = Math.sin(flap) * 3.2 * s;
    ctx.strokeStyle = color; ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x - w, y - lift); ctx.quadraticCurveTo(x - w * .4, y - lift * .2 - 1.5 * s, x, y);
    ctx.quadraticCurveTo(x + w * .4, y - lift * .2 - 1.5 * s, x + w, y - lift);
    ctx.stroke();
  }

  /* ---------- draw ---------- */
  let inkNow = null, simT = 0, lastFrame = performance.now();
  function frame(now){
    if (paused) return;
    const dt = Math.min(50, now - lastFrame); lastFrame = now; simT += dt;
    const move = reduce ? 0 : 1;

    const b = bostonNow();
    const s = sun(b.doy, b.off);
    const h = forced !== null ? forced : b.h;
    const [top, bot] = skyAt(h, s);
    const L = lum(mix(top, bot, .45));
    const dark = L < .5;
    const ink = dark ? [240, 236, 226] : [28, 30, 38];
    const inkStr = ink.join(', ');
    if (inkStr !== inkNow){ document.documentElement.style.setProperty('--ink', inkStr); inkNow = inkStr; meta.content = rgb(top); }
    const night = clamp((.42 - L) / .3, 0, 1);       // 0 in daylight, 1 at full night
    const dayLen = s.set - s.rise;

    // sky
    const g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, rgb(top)); g.addColorStop(1, rgb(bot));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizon + 1);

    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, horizon); ctx.clip();

    // the sun
    let sunPos = null;
    const sp = (h - s.rise) / dayLen;
    if (sp > -.03 && sp < 1.03){
      sunPos = arcPos(clamp(sp, 0, 1)); if (sp < 0 || sp > 1) sunPos.y = horizon + 8;
      const low = 1 - Math.sin(Math.PI * clamp(sp, 0, 1));          // 1 near the horizon
      const sc = mix([255, 250, 232], [255, 168, 96], low * low);
      glow(sunPos.x, sunPos.y, 140 + low * 90, sc, .32 + low * .18);
      glow(sunPos.x, sunPos.y, 34, sc, .55);
      ctx.fillStyle = rgb(mix(sc, [255, 255, 255], .35), .95);
      ctx.beginPath(); ctx.arc(sunPos.x, sunPos.y, 13 + low * 3, 0, 6.283); ctx.fill();
    }

    // the moon: rises about 50 minutes later each day, so its place depends on the phase
    const phase = moonPhase();
    let moonPos = null;
    const mrise = s.rise + phase * 24.84, mp = (((h - mrise) % 24) + 24) % 24 / 12.4;
    const lit = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
    if (mp < 1 && lit > .03){
      moonPos = arcPos(mp);
      const ma = .35 + .65 * night;
      if (night > .2) glow(moonPos.x, moonPos.y, 90, [220, 226, 255], .18 * night * lit);
      drawMoon(moonPos.x, moonPos.y, 10, phase, ma, top);
    }

    // stars
    const starC = dark ? [255, 250, 240] : [40, 44, 58];
    for (const p of stars){
      p.x += p.vx * dt * .05 * move; if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
      const fade = Math.min(1, (now - p.born) / 900);
      const tw = reduce ? 1 : .55 + .45 * Math.sin(simT * .0015 * p.sp + p.tw);
      let a = (dark ? (.12 + .83 * night) * (.35 + .65 * tw) : 0) * fade;
      if (p.born > 0) a = Math.max(a, .6 * fade);
      p.a = a;
      if (a < .01) continue;
      ctx.fillStyle = rgb(starC, a);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      if (dark && p.r > 1.3 && night > .6){
        ctx.fillStyle = rgb(starC, a * .12);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, 6.283); ctx.fill();
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

    // clouds: bright by day, lit pink at dusk, faint and moonlit at night
    const cloudA = .62 - .55 * night;
    for (const c of clouds){
      c.x += c.v * dt / 1000 * move;
      if (c.x > W + 20) { c.x = -c.w - rand(0, 200); c.y = horizon * rand(.06, .55); }
      ctx.globalAlpha = cloudA * (.55 + .45 * c.depth);
      ctx.drawImage(c.img, c.x, c.y, c.w, c.h);
    }
    ctx.globalAlpha = 1;

    // birds: a small flock crosses now and then in daylight
    if (!reduce && night < .5){
      nextFlock -= dt;
      if (!flock && nextFlock < 0){
        const n = 4 + (Math.random() * 6 | 0), dir = Math.random() < .5 ? 1 : -1;
        flock = {x: dir > 0 ? -60 : W + 60, y: horizon * rand(.2, .5), dir, v: rand(38, 60),
                 birds: Array.from({length: n}, (_, i) => ({dx: -dir * (i * rand(12, 20)), dy: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * rand(6, 10), ph: rand(0, 6), s: rand(.8, 1.15)}))};
        nextFlock = rand(20000, 45000);
      }
      if (flock){
        flock.x += flock.dir * flock.v * dt / 1000;
        flock.y += Math.sin(simT * .0006) * .05;
        const bc = rgb(dark ? [235, 230, 222] : [44, 48, 60], .6);
        for (const bd of flock.birds) drawBird(flock.x + bd.dx, flock.y + bd.dy + Math.sin(simT * .002 + bd.ph) * 2, bd.s, simT * .012 + bd.ph, bc);
        if ((flock.dir > 0 && flock.x > W + 260) || (flock.dir < 0 && flock.x < -260)) flock = null;
      }
    }

    // the city across the river
    const cityC = dark ? mix(top, [0, 0, 0], .35) : mix(mix(top, bot, .5), [70, 82, 104], .45);
    const glassC = mix(cityC, mix(bot, [255, 255, 255], .3), dark ? .15 : .35);
    const winC = [255, 214, 150];
    for (const bl of city){
      const y0 = horizon - bl.h;
      ctx.fillStyle = rgb(bl.glass ? glassC : cityC, dark ? 1 : .72);
      ctx.fillRect(bl.x, y0, bl.w, bl.h + 1);
      if (bl.antenna){ ctx.fillRect(bl.x + bl.w / 2 - .6, y0 - 14, 1.2, 14); }
      if (night > .15){
        for (const [wx, wy, rr] of bl.wins){
          // most windows stay on, a few blink on and off slowly
          const on = rr < .6 || Math.sin(simT * .0003 + rr * 50) > .3;
          if (!on) continue;
          ctx.fillStyle = rgb(winC, (.35 + .55 * rr) * night);
          ctx.fillRect(bl.x + wx, y0 + wy, 1.6, 1.6);
        }
      }
      if (bl.antenna && night > .3){
        const blink = Math.sin(simT * .004) > .6 ? 1 : .15;
        ctx.fillStyle = rgb([255, 90, 80], blink * night);
        ctx.beginPath(); ctx.arc(bl.x + bl.w / 2, y0 - 14, 1.4, 0, 6.283); ctx.fill();
      }
    }
    ctx.restore();

    /* ----- the river ----- */
    const wtop = mix(bot, top, .35).map(v => v * (dark ? .62 : .8));
    const wbot = top.map(v => v * (dark ? .45 : .62));
    const wg = ctx.createLinearGradient(0, horizon, 0, H);
    wg.addColorStop(0, rgb(wtop)); wg.addColorStop(1, rgb(wbot));
    ctx.fillStyle = wg; ctx.fillRect(0, horizon, W, H - horizon);
    ctx.fillStyle = rgb(mix(bot, [255, 240, 220], .3), .35);
    ctx.fillRect(0, horizon - .5, W, 1);

    // the city's reflection, broken up by the water
    for (const bl of city){
      const rh = bl.h * .45;
      for (let yy = 0; yy < rh; yy += 2){
        const wob = reduce ? 0 : Math.sin(simT * .0018 + yy * .5 + bl.x * .05) * (1 + yy * .06);
        ctx.fillStyle = rgb(cityC, (dark ? .4 : .22) * (1 - yy / rh));
        ctx.fillRect(bl.x + wob, horizon + yy, bl.w, 1.4);
      }
      // long streaks of light under the lit towers
      if (night > .3 && bl.h > 30){
        for (let k = 0; k < 6; k++){
          const yy = horizon + 4 + k * 7 + (simT * .01 + k * 13) % 7;
          const wob = reduce ? 0 : Math.sin(simT * .002 + k + bl.x) * 2;
          ctx.fillStyle = rgb(winC, .14 * night * (1 - k / 6));
          ctx.fillRect(bl.x + bl.w * .3 + wob, yy, bl.w * .4, 1);
        }
      }
    }

    // shimmer on the water
    ctx.strokeStyle = rgb(mix(bot, [255, 255, 255], .25), dark ? .16 : .22); ctx.lineWidth = 1;
    for (let i = 0; i < 46; i++){
      const yy = horizon + 6 + ((i * 37) % (H - horizon - 6));
      const depth = (yy - horizon) / (H - horizon);
      const speed = (.006 + depth * .012) * (i % 2 ? 1 : -.6);
      const x0 = ((i * 211 + simT * speed * move) % (W + 200) + W + 200) % (W + 200) - 100;
      const len = 14 + depth * 60 + (i % 5) * 8;
      ctx.globalAlpha = .4 + .6 * Math.sin(simT * .0012 + i);
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 + len, yy); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // a path of glittering light on the water under the sun or moon
    const glitter = (x, color, strength) => {
      for (let i = 0; i < 30; i++){
        const yy = horizon + 3 + i * (H - horizon) / 30;
        const spread = 6 + i * 2.2;
        const tw = reduce ? .7 : .5 + .5 * Math.sin(simT * .006 + i * 2.3);
        const ox = reduce ? 0 : Math.sin(simT * .0013 + i * 1.7) * spread;
        ctx.fillStyle = rgb(color, strength * tw * (1 - i / 34));
        ctx.fillRect(x + ox - spread * .5, yy, spread * (.4 + tw * .6), 1.2);
      }
    };
    if (sunPos && sunPos.y < horizon){
      const low = 1 - Math.sin(Math.PI * clamp(sp, 0, 1));
      glitter(sunPos.x, mix([255, 250, 232], [255, 168, 96], low), .25 + low * .3);
    }
    if (moonPos && night > .4) glitter(moonPos.x, [235, 238, 255], .22 * night * Math.max(.3, lit));

    // star reflections
    for (const p of stars){
      if (!p.a || p.a < .01) continue;
      const ry = horizon + (horizon - p.y) * .32;
      if (ry < H){
        const wob = reduce ? 0 : Math.sin(simT * .002 + p.y * .1) * 2;
        ctx.fillStyle = rgb(starC, p.a * .22);
        ctx.fillRect(p.x - p.r * 1.6 + wob, ry, p.r * 3.2, .8);
      }
    }

    // sailboats in daylight, gone at night
    const boatA = clamp(1 - night * 1.6, 0, 1);
    if (boatA > .02){
      for (const bt of boats){
        bt.x += bt.v * dt / 1000 * move;
        if (bt.x > W + 40) bt.x = -40; if (bt.x < -40) bt.x = W + 40;
        const y = horizon + (H - horizon) * bt.d * .55 + 6;
        const sc = bt.s * (.7 + bt.d * .6);
        const bob = reduce ? 0 : Math.sin(simT * .0016 + bt.ph) * 1.2;
        const tilt = reduce ? 0 : Math.sin(simT * .0011 + bt.ph) * .05;
        const sailC = dark ? [236, 228, 220] : [252, 250, 244];
        const sail = rgb(sailC, .92 * boatA);
        ctx.save();
        ctx.translate(bt.x, y + bob); ctx.rotate(tilt);
        const dir = bt.v > 0 ? 1 : -1;
        ctx.fillStyle = sail;
        ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(0, -22 * sc); ctx.lineTo(dir * 11 * sc, -2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = rgb(mix(sailC, [120, 120, 120], .35), .8 * boatA);
        ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, -15 * sc); ctx.lineTo(-dir * 6 * sc, -3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = rgb([40, 46, 60], .8 * boatA);
        ctx.beginPath(); ctx.moveTo(-9 * sc, 0); ctx.lineTo(10 * sc, 0); ctx.lineTo(7 * sc, 3 * sc); ctx.lineTo(-7 * sc, 3 * sc); ctx.closePath(); ctx.fill();
        ctx.restore();
        // reflection
        ctx.fillStyle = rgb([252, 250, 244], .16 * boatA);
        for (let k = 0; k < 5; k++){
          const wob = reduce ? 0 : Math.sin(simT * .003 + k) * 1.5;
          ctx.fillRect(bt.x - 1 + wob + (bt.v > 0 ? 2 : -4) * sc, y + bob + 4 + k * 3 * sc, 5 * sc * (1 - k / 6), 1);
        }
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
