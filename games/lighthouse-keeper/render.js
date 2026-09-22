// Отрисовка сцены: море, скалы, корабли, луч и темнота вокруг него.
import { LAYOUT, BALANCE } from './config.js';

export const COLORS = {
  night: '#0B1B2B',
  sea: '#16384A',
  wave: '#2E6F7A',
  light: '#FFD27A',
  lantern: '#F29E4C',
  foam: '#E8F1F2',
  danger: '#E5533D',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const TITLE_FONT = 'Georgia, "Times New Roman", serif';

export const images = {};

export function loadImages(names) {
  return Promise.all(names.map(name => new Promise(resolve => {
    const img = new Image();
    img.onload = () => { images[name] = img; resolve(); };
    img.onerror = () => resolve();
    img.src = `assets/img/${name}.png`;
  })));
}

// Спрайты нарисованы в двойном разрешении — выводим в половину размера.
function sprite(ctx, name, x, y, alpha = 1) {
  const img = images[name];
  if (!img) return;
  const w = img.width / 2;
  const h = img.height / 2;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
  ctx.globalAlpha = 1;
}

let dark = null;
let dctx = null;

export function drawSea(ctx, view, time) {
  const { x0, y0, x1, y1 } = view;
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, COLORS.night);
  g.addColorStop(0.55, COLORS.sea);
  g.addColorStop(1, '#1b4556');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  // короткие штрихи волн, медленно плывут вниз
  ctx.strokeStyle = 'rgba(46,111,122,0.45)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  const step = 38;
  const shift = (time * 6) % step;
  for (let row = Math.floor(y0 / step) - 1; row * step < y1 + step; row++) {
    const y = row * step + shift;
    for (let col = Math.floor(x0 / 46) - 1; col * 46 < x1 + 46; col++) {
      const x = col * 46 + ((row & 1) ? 23 : 0) + Math.sin(time * 0.8 + row + col) * 4;
      ctx.beginPath();
      ctx.moveTo(x - 8, y);
      ctx.quadraticCurveTo(x, y - 4, x + 8, y);
      ctx.stroke();
    }
  }
}

export function drawRocks(ctx) {
  for (const r of LAYOUT.rocks) sprite(ctx, r.img, r.x, r.y);
}

export function drawHarbor(ctx) {
  const img = images.pier;
  if (img) {
    ctx.drawImage(img, -12, LAYOUT.harborY - 14, 180, 48);
    ctx.drawImage(img, 192, LAYOUT.harborY - 14, 180, 48);
  }
  const lh = LAYOUT.lighthouse;
  if (images.lighthouse) ctx.drawImage(images.lighthouse, lh.x, lh.y, lh.w, lh.h);
}

function courseColor(k) {
  if (k > 0.5) return COLORS.light;
  if (k > 0.25) return COLORS.lantern;
  return COLORS.danger;
}

export function drawShips(ctx, ships, time) {
  for (const s of ships) {
    let alpha = 1;
    if (s.state === 'docked' || s.state === 'wrecked') alpha = Math.max(0, 1 - s.fade / 0.6);
    let rot = Math.atan2(s.vy, s.vx) - Math.PI / 2;
    if (s.state === 'lost') rot += Math.sin(s.t * 9) * 0.15;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(rot);
    const img = images[`ship-${s.type}`];
    if (img) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, -img.width / 4, -img.height / 4, img.width / 2, img.height / 2);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    if (s.state === 'sail' && s.y > -20) {
      const k = s.course / s.max;
      const rr = s.r + 6;
      const low = k < 0.25 && Math.sin(time * 16) > 0;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(232,241,242,0.18)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = low ? COLORS.foam : courseColor(k);
      ctx.beginPath();
      ctx.arc(s.x, s.y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      ctx.stroke();
    }
  }
}

export function drawWrecks(ctx, wrecks) {
  for (const w of wrecks) sprite(ctx, 'ship-wreck', w.x, w.y, Math.min(1, (4 - w.t) / 1));
}

export function drawFog(ctx, fogs) {
  const img = images.fog;
  if (!img) return;
  for (const f of fogs) {
    ctx.globalAlpha = 0.42;
    ctx.drawImage(img, f.x - f.r * 1.25, f.y - f.r * 1.25, f.r * 2.5, f.r * 2.5);
  }
  ctx.globalAlpha = 1;
}

function beamPath(c, angle, half, len) {
  const { x, y } = LAYOUT.lamp;
  c.beginPath();
  c.moveTo(x, y);
  c.arc(x, y, len, angle - half, angle + half);
  c.closePath();
}

// Темнота поверх сцены с «вырезанным» лучом, затем тёплое свечение луча.
export function drawLight(ctx, canvas, transform, view, angle, halfWidth, ships, time) {
  if (!dark || dark.width !== canvas.width || dark.height !== canvas.height) {
    dark = document.createElement('canvas');
    dark.width = canvas.width;
    dark.height = canvas.height;
    dctx = dark.getContext('2d');
  }
  const { x0, y0, x1, y1 } = view;
  const { x, y } = LAYOUT.lamp;
  const len = BALANCE.beam.length;

  dctx.setTransform(1, 0, 0, 1, 0, 0);
  dctx.clearRect(0, 0, dark.width, dark.height);
  dctx.setTransform(...transform);
  dctx.globalCompositeOperation = 'source-over';
  dctx.fillStyle = 'rgba(3,10,18,0.58)';
  dctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  dctx.globalCompositeOperation = 'destination-out';
  const rg = dctx.createRadialGradient(x, y, 10, x, y, len);
  rg.addColorStop(0, 'rgba(0,0,0,1)');
  rg.addColorStop(0.7, 'rgba(0,0,0,0.85)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  dctx.fillStyle = rg;
  beamPath(dctx, angle, halfWidth * 1.25, len);
  dctx.globalAlpha = 0.45;
  dctx.fill();
  beamPath(dctx, angle, halfWidth, len);
  dctx.globalAlpha = 1;
  dctx.fill();

  // огоньки: фонари кораблей, причалов и лампа маяка
  const glow = (gx, gy, r, a) => {
    const g = dctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = g;
    dctx.fillRect(gx - r, gy - r, r * 2, r * 2);
  };
  for (const s of ships) if (s.state === 'sail' || s.state === 'lost') glow(s.x, s.y, s.r + 14, 0.75);
  glow(x, y, 70, 1);
  glow(LAYOUT.lighthouse.x + LAYOUT.lighthouse.w / 2, 600, 150, 0.8);
  glow(14, 600, 40, 0.8);
  glow(346, 600, 40, 0.8);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(dark, 0, 0);
  ctx.restore();

  // тёплое свечение
  ctx.save();
  const lg = ctx.createRadialGradient(x, y, 8, x, y, len);
  lg.addColorStop(0, 'rgba(255,210,122,0.42)');
  lg.addColorStop(0.5, 'rgba(255,210,122,0.18)');
  lg.addColorStop(1, 'rgba(255,210,122,0)');
  ctx.fillStyle = lg;
  beamPath(ctx, angle, halfWidth, len);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  const flick = 0.85 + Math.sin(time * 7) * 0.08;
  const lamp = ctx.createRadialGradient(x, y, 0, x, y, 26);
  lamp.addColorStop(0, `rgba(255,230,170,${flick})`);
  lamp.addColorStop(1, 'rgba(255,210,122,0)');
  ctx.fillStyle = lamp;
  ctx.fillRect(x - 26, y - 26, 52, 52);
  ctx.restore();
}
