// Точка входа: загрузка в порядке SDK, экраны, ввод, пауза, реклама.
import { FIELD, LAYOUT, BALANCE, UPGRADES, ADS } from './config.js';
import { Night, upgradeCost } from './game.js';
import { initSdk, sdkLang, loadingReady, gameplayStart, gameplayStop, showInterstitial, showRewarded } from './ya.js';
import { setLanguage, t } from './i18n.js';
import { audio } from './audio.js';
import { save } from './save.js';
import {
  COLORS, FONT, TITLE_FONT, images, loadImages,
  drawSea, drawRocks, drawHarbor, drawShips, drawWrecks, drawFog, drawLight,
} from './render.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let state = 'loading';     // loading | menu | playing | pause | over
let inputEnabled = false;
let night = null;
let nightsThisSession = 0;
let overInfo = null;        // итоги ночи для экрана проигрыша
let overT = 0;
let banner = null;          // { text, t } — короткая надпись по центру
let fx = [];                // всплывающие «+N»
let time = 0;
let menuBeam = -90;
let adBusy = false;

// ——— масштаб: логическое поле 360×640, вписывается целиком (contain) ———
const view = { s: 1, ox: 0, oy: 0, dpr: 1, x0: 0, y0: 0, x1: FIELD.w, y1: FIELD.h };

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const s = Math.min(w / FIELD.w, h / FIELD.h);
  Object.assign(view, {
    s, dpr,
    ox: (w - FIELD.w * s) / 2,
    oy: (h - FIELD.h * s) / 2,
  });
  view.x0 = -view.ox / s;
  view.y0 = -view.oy / s;
  view.x1 = (w - view.ox) / s;
  view.y1 = (h - view.oy) / s;
}
window.addEventListener('resize', resize);
resize();

function transform() {
  const k = view.dpr * view.s;
  return [k, 0, 0, k, view.dpr * view.ox, view.dpr * view.oy];
}

function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left - view.ox) / view.s, y: (e.clientY - r.top - view.oy) / view.s };
}

// ——— пауза: причины hidden / blur / ad останавливают звук; геймплей идёт только в state=playing без причин ———
const pauseReasons = new Set();
let runtimeRunning = false;

function syncRuntime() {
  const run = state === 'playing' && pauseReasons.size === 0;
  if (run === runtimeRunning) return;
  runtimeRunning = run;
  if (run) gameplayStart(); else gameplayStop();
}

function setPauseReason(reason, on) {
  if (on) pauseReasons.add(reason); else pauseReasons.delete(reason);
  audio.setBlocked(reason, on);
  syncRuntime();
}

function setState(next) {
  state = next;
  syncRuntime();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') setState('pause');
  setPauseReason('hidden', document.hidden);
});
window.addEventListener('blur', () => setPauseReason('blur', true));
window.addEventListener('focus', () => setPauseReason('blur', false));

// ——— кнопки: пересобираются каждый кадр при отрисовке экрана ———
let buttons = [];
let pressed = null;
let dragging = false;

function button(id, x, y, w, h, label, onClick, opts = {}) {
  const b = { id, x, y, w, h, label, onClick, ...opts };
  buttons.push(b);
  const active = b.enabled !== false;
  const isPressed = pressed === id;
  ctx.save();
  roundRect(x, y, w, h, 12);
  if (b.style === 'primary') {
    ctx.fillStyle = active ? COLORS.light : 'rgba(255,210,122,0.35)';
  } else if (b.style === 'reward') {
    ctx.fillStyle = 'rgba(242,158,76,0.18)';
  } else {
    ctx.fillStyle = 'rgba(232,241,242,0.10)';
  }
  ctx.fill();
  if (b.style !== 'primary') {
    ctx.lineWidth = 2;
    ctx.strokeStyle = b.style === 'reward' ? COLORS.lantern : 'rgba(232,241,242,0.35)';
    ctx.stroke();
  }
  if (isPressed && active) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    roundRect(x, y, w, h, 12);
    ctx.fill();
  }
  ctx.fillStyle = b.style === 'primary' ? COLORS.night : (active ? COLORS.foam : 'rgba(232,241,242,0.4)');
  ctx.font = `600 ${b.size || 17}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (b.icon) {
    const tw = ctx.measureText(label).width;
    const total = tw + 22;
    drawIcon(b.icon, x + w / 2 - total / 2 + 9, y + h / 2, 18, active ? 1 : 0.4);
    ctx.fillText(label, x + w / 2 + 11, y + h / 2 + 1);
  } else {
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  }
  ctx.restore();
}

function hit(p) {
  for (let i = buttons.length - 1; i >= 0; i--) {
    const b = buttons[i];
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
  }
  return null;
}

canvas.addEventListener('pointerdown', e => {
  if (!inputEnabled) return;
  const p = toLogical(e);
  const b = hit(p);
  if (b && b.enabled !== false) {
    pressed = b.id;
    return;
  }
  if (state === 'playing') {
    dragging = true;
    night.aimAt(p.x, p.y);
  }
});

canvas.addEventListener('pointermove', e => {
  if (!inputEnabled || state !== 'playing') return;
  if (dragging || e.pointerType === 'mouse') {
    const p = toLogical(e);
    night.aimAt(p.x, p.y);
  }
});

function pointerEnd(e) {
  dragging = false;
  if (!inputEnabled || !pressed) return;
  const b = hit(toLogical(e));
  const id = pressed;
  pressed = null;
  if (b && b.id === id && b.enabled !== false) {
    audio.play('click');
    b.onClick();
  }
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', () => { pressed = null; dragging = false; });

window.addEventListener('keydown', e => {
  if (!inputEnabled) return;
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (state === 'playing') setState('pause');
    else if (state === 'pause') setState('playing');
  }
});

// ——— игровой процесс ———
function startNight() {
  night = new Night(save.data.up, Math.random, { tutorial: save.data.tutorial });
  night.banked = 0;
  night.bankedSaved = 0;
  night.doubled = false;
  night.recordPlayed = false;
  nightsThisSession++;
  fx = [];
  banner = null;
  audio.music('night');
  setState('playing');
}

function bankNight() {
  const d = save.data;
  d.coins += night.coins - night.banked;
  d.total += night.saved - night.bankedSaved;
  night.banked = night.coins;
  night.bankedSaved = night.saved;
  const newRecord = night.saved > d.best;
  if (newRecord) d.best = night.saved;
  d.stars = Math.max(d.stars, BALANCE.stars.filter(s => night.saved >= s).length);
  save.write();
  return newRecord;
}

function endNight() {
  const newRecord = bankNight();
  overInfo = { newRecord: newRecord || (overInfo?.newRecord && night.revived) };
  overT = 0;
  audio.play('over');
  if (newRecord && !night.recordPlayed) {
    night.recordPlayed = true;
    setTimeout(() => audio.play('record'), 700);
  }
  audio.music('menu');
  setState('over');
}

function handleEvents() {
  for (const ev of night.events) {
    if (ev.type === 'saved') {
      audio.play('bell');
      fx.push({ x: ev.ship.x, y: ev.ship.y - 20, t: 0, text: `+${ev.coins}` });
      if (save.data.tutorial) {
        save.data.tutorial = false;
        save.write();
      }
    } else if (ev.type === 'spawn' && ev.ship.type === 'steamer') {
      audio.play('horn');
    } else if (ev.type === 'lost') {
      audio.play('lost');
    } else if (ev.type === 'wreck') {
      audio.play('wreck');
    } else if (ev.type === 'storm') {
      banner = { text: t('storm'), t: 0 };
      audio.music('storm');
    } else if (ev.type === 'over') {
      endNight();
    }
  }
  night.events.length = 0;
}

// ——— реклама ———
function withInterstitial(then) {
  if (nightsThisSession < ADS.interstitialFromNight || adBusy) { then(); return; }
  adBusy = true;
  showInterstitial({
    onOpen: () => setPauseReason('ad', true),
    onClose: () => { adBusy = false; setPauseReason('ad', false); then(); },
  });
}

function rewarded(onReward) {
  if (adBusy) return;
  adBusy = true;
  showRewarded({
    onOpen: () => setPauseReason('ad', true),
    onReward,
    onClose: () => { adBusy = false; setPauseReason('ad', false); },
  });
}

function revive() {
  rewarded(() => {
    night.revive();
    audio.music(night.stormStarted ? 'storm' : 'night');
    setState('playing');
  });
}

function doubleCoins() {
  rewarded(() => {
    save.data.coins += night.coins;
    night.doubled = true;
    save.write();
    audio.play('coin');
  });
}

function buy(key) {
  const lvl = save.data.up[key];
  const cost = upgradeCost(lvl);
  if (cost === null || save.data.coins < cost) return;
  save.data.coins -= cost;
  save.data.up[key] = lvl + 1;
  save.write();
  audio.play('coin');
}

function toggleSound() {
  save.data.sound = !save.data.sound;
  audio.setMuted(!save.data.sound);
  save.write();
}

function goMenu() {
  night = null;
  audio.music('menu');
  setState('menu');
}

// ——— отрисовка ———
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawIcon(name, cx, cy, size, alpha = 1) {
  const img = images[name];
  if (!img) return;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
  ctx.globalAlpha = 1;
}

function text(str, x, y, { size = 16, weight = 400, color = COLORS.foam, align = 'center', font = FONT, alpha = 1 } = {}) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  str.split('\n').forEach((line, i) => ctx.fillText(line, x, y + i * size * 1.3));
  ctx.globalAlpha = 1;
}

function panel(x, y, w, h) {
  ctx.fillStyle = 'rgba(11,27,43,0.86)';
  roundRect(x, y, w, h, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,210,122,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function stars(cx, cy, count) {
  for (let i = 0; i < 3; i++) {
    const x = cx + (i - 1) * 18;
    ctx.fillStyle = i < count ? COLORS.light : 'rgba(232,241,242,0.2)';
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 3.2 : 7.5;
      const a = -Math.PI / 2 + k * Math.PI / 5;
      ctx.lineTo(x + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
}

function soundIcon(x, y, on) {
  ctx.save();
  ctx.strokeStyle = COLORS.foam;
  ctx.fillStyle = COLORS.foam;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 6, y + 12); ctx.lineTo(x + 11, y + 12); ctx.lineTo(x + 17, y + 7);
  ctx.lineTo(x + 17, y + 25); ctx.lineTo(x + 11, y + 20); ctx.lineTo(x + 6, y + 20);
  ctx.closePath();
  ctx.fill();
  if (on) {
    ctx.beginPath(); ctx.arc(x + 18, y + 16, 5, -0.9, 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 18, y + 16, 10, -0.9, 0.9); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(x + 21, y + 11); ctx.lineTo(x + 29, y + 21);
    ctx.moveTo(x + 29, y + 11); ctx.lineTo(x + 21, y + 21); ctx.stroke();
  }
  ctx.restore();
}

function iconButton(id, x, y, onClick, draw) {
  buttons.push({ id, x, y, w: 36, h: 36, onClick });
  ctx.fillStyle = 'rgba(11,27,43,0.6)';
  roundRect(x, y, 36, 36, 10);
  ctx.fill();
  draw(x + 2, y + 2);
}

function drawWorld(dt) {
  drawSea(ctx, view, time);
  drawRocks(ctx);
  let angle = menuBeam * Math.PI / 180;
  let half = 9 * Math.PI / 180;
  let ships = [];
  if (night) {
    drawWrecks(ctx, night.wrecks);
    drawShips(ctx, night.ships, time);
    angle = night.beam;
    half = night.halfWidth;
    ships = night.ships;
  }
  drawHarbor(ctx);
  drawLight(ctx, canvas, transform(), view, angle, half, ships, time);
  if (night) drawFog(ctx, night.fogs);
}

function drawHUD(dt) {
  for (let i = 0; i < BALANCE.lives; i++) drawIcon('lantern-life', 26 + i * 28, 32, 26, i < night.lives ? 1 : 0.25);
  text(String(night.saved), 180, 34, { size: 32, weight: 700 });
  drawIcon('coin', 236, 32, 20);
  text(String(night.coins), 250, 33, { size: 17, weight: 600, align: 'left' });
  iconButton('pause', 312, 14, () => setState('pause'), (x, y) => {
    ctx.fillStyle = COLORS.foam;
    ctx.fillRect(x + 10, y + 9, 5, 16);
    ctx.fillRect(x + 19, y + 9, 5, 16);
  });

  for (const f of fx) {
    f.t += dt;
    text(f.text, f.x, f.y - f.t * 30, { size: 16, weight: 700, color: COLORS.light, alpha: Math.max(0, 1 - f.t) });
  }
  fx = fx.filter(f => f.t < 1);

  if (night.tutorial) {
    const s = night.sailing()[0];
    if (s && s.y > 0) {
      const pulse = 1 + Math.sin(time * 5) * 0.15;
      ctx.strokeStyle = COLORS.light;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(LAYOUT.lamp.x, LAYOUT.lamp.y - 20);
      ctx.lineTo(s.x, s.y + s.r + 10);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, (s.r + 14) * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    text(t('tutorial'), 180, 92, { size: 18, weight: 600, color: COLORS.light });
  }

  if (banner) {
    banner.t += dt;
    text(banner.text, 180, 110, { size: 20, weight: 600, color: COLORS.foam, alpha: Math.max(0, Math.min(1, 2.5 - banner.t)) });
    if (banner.t > 2.5) banner = null;
  }
}

function drawMenu() {
  const d = save.data;
  const glow = 0.6 + Math.sin(time * 1.5) * 0.2;
  ctx.save();
  ctx.shadowColor = `rgba(255,210,122,${glow})`;
  ctx.shadowBlur = 18;
  text(t('title'), 180, 86, { size: 34, weight: 700, color: COLORS.light, font: TITLE_FONT });
  ctx.restore();
  text(t('hint'), 180, 130, { size: 14, alpha: 0.85 });

  panel(16, 172, 328, 222);
  const bestLabel = `${t('best')}: ${d.best}`;
  text(bestLabel, 34, 198, { size: 16, weight: 600, align: 'left' });
  stars(34 + ctx.measureText(bestLabel).width + 32, 197, d.stars);
  drawIcon('coin', 262, 198, 22);
  text(String(d.coins), 278, 199, { size: 18, weight: 700, align: 'left', color: COLORS.light });

  ctx.fillStyle = 'rgba(232,241,242,0.15)';
  ctx.fillRect(30, 220, 300, 1);
  text(t('upgrades'), 180, 238, { size: 13, weight: 600, alpha: 0.7 });

  ['lens', 'lamp', 'gear'].forEach((key, i) => {
    const y = 256 + i * 44;
    const lvl = d.up[key];
    text(t(key), 34, y + 11, { size: 16, weight: 600, align: 'left' });
    text(t(`${key}Desc`), 34, y + 29, { size: 11, align: 'left', alpha: 0.65 });
    for (let k = 0; k < UPGRADES.maxLevel; k++) {
      ctx.fillStyle = k < lvl ? COLORS.light : 'rgba(232,241,242,0.2)';
      ctx.beginPath();
      ctx.arc(170 + k * 13, y + 20, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const cost = upgradeCost(lvl);
    if (cost === null) {
      text(t('max'), 290, y + 20, { size: 14, weight: 600, alpha: 0.6 });
    } else {
      button(`up-${key}`, 244, y + 3, 92, 34, String(cost), () => buy(key),
        { enabled: d.coins >= cost, icon: 'coin', size: 15 });
    }
  });

  button('play', 90, 404, 180, 52, t('play'), startNight, { style: 'primary', size: 21 });
  iconButton('sound', 312, 14, toggleSound, (x, y) => soundIcon(x, y, d.sound));
}

function drawPause() {
  ctx.fillStyle = 'rgba(3,10,18,0.5)';
  ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  panel(60, 170, 240, 272);
  text(t('pause'), 180, 204, { size: 24, weight: 700, color: COLORS.light, font: TITLE_FONT });
  button('resume', 80, 234, 200, 46, t('resume'), () => setState('playing'), { style: 'primary' });
  button('restart', 80, 290, 200, 42, t('restart'), startNight);
  button('pmenu', 80, 340, 200, 42, t('menu'), goMenu);
  button('psound', 80, 390, 200, 42, save.data.sound ? t('soundOn') : t('soundOff'), toggleSound);
}

function drawOver(dt) {
  overT += dt;
  const a = Math.min(1, overT / 0.6);
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(3,10,18,0.55)';
  ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  ctx.globalAlpha = 1;
  if (overT < 0.6) return;

  const canRevive = !night.revived && !night.doubled;
  const canDouble = !night.doubled && night.coins > 0;
  const extra = (canRevive ? 50 : 0) + (canDouble ? 50 : 0);
  const h = 356 + extra;
  const top = Math.round((FIELD.h - h) / 2) - 10;
  panel(40, top, 280, h);
  text(t('nightOver'), 180, top + 34, { size: 24, weight: 700, color: COLORS.light, font: TITLE_FONT });
  text(t('saved'), 180, top + 70, { size: 14, alpha: 0.75 });
  text(String(night.saved), 180, top + 104, { size: 44, weight: 700 });
  if (overInfo.newRecord) text(t('newRecord'), 180, top + 140, { size: 16, weight: 700, color: COLORS.light });
  else text(`${t('best')}: ${save.data.best}`, 180, top + 140, { size: 15, alpha: 0.75 });
  stars(180, top + 166, BALANCE.stars.filter(s => night.saved >= s).length);
  const coins = night.coins * (night.doubled ? 2 : 1);
  text(t('coinsEarned'), 180, top + 194, { size: 13, alpha: 0.7 });
  drawIcon('coin', 164, top + 218, 20);
  text(String(coins), 178, top + 219, { size: 20, weight: 700, align: 'left', color: COLORS.light });

  let y = top + 246;
  if (canRevive) {
    button('revive', 60, y, 240, 42, t('reviveAd'), revive, { style: 'reward', size: 14 });
    y += 50;
  }
  if (canDouble) {
    button('double', 60, y, 240, 42, t('doubleAd'), doubleCoins, { style: 'reward', size: 14 });
    y += 50;
  }
  button('again', 60, y, 240, 46, t('again'), () => withInterstitial(startNight), { style: 'primary' });
  button('omenu', 60, y + 54, 240, 40, t('menu'), () => withInterstitial(goMenu));
}

function drawLoading() {
  ctx.fillStyle = COLORS.night;
  ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  text(t('title'), 180, 300, { size: 30, weight: 700, color: COLORS.light, font: TITLE_FONT });
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = 0.3 + 0.7 * Math.max(0, Math.sin(time * 4 - i * 0.8));
    ctx.fillStyle = COLORS.light;
    ctx.beginPath();
    ctx.arc(164 + i * 16, 346, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;

  if (state === 'playing' && runtimeRunning) {
    night.update(dt);
    handleEvents();
  }
  if (state === 'menu') menuBeam = -90 + Math.sin(time * 0.5) * 55;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLORS.night;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(...transform());
  buttons = [];

  if (state === 'loading') {
    drawLoading();
  } else {
    drawWorld(dt);
    if (state === 'menu') drawMenu();
    else {
      drawHUD(state === 'playing' && runtimeRunning ? dt : 0);
      if (state === 'pause') drawPause();
      if (state === 'over') drawOver(dt);
    }
  }
  requestAnimationFrame(frame);
}

// ——— запуск: init → язык из SDK → загрузка → ready() → ввод ———
async function boot() {
  await initSdk();
  setLanguage(sdkLang());
  requestAnimationFrame(frame);
  await Promise.all([
    loadImages(['lighthouse', 'pier', 'rock-1', 'rock-2', 'ship-boat', 'ship-schooner', 'ship-steamer',
      'ship-wreck', 'fog', 'coin', 'lantern-life']),
    audio.loadMusic(),
    save.load(),
  ]);
  audio.setMuted(!save.data.sound);
  loadingReady();
  inputEnabled = true;
  audio.music('menu');
  setState('menu');
}

// Только для автотестов: /index.html?debug открывает состояние игры.
if (new URLSearchParams(location.search).has('debug')) {
  window.__game = { get state() { return state; }, get night() { return night; }, get buttons() { return buttons; }, save };
}

boot().catch(e => console.error(e));
