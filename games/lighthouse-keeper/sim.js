// Симулятор баланса. Запуск: node sim.js [ночей=200]
// Бот ведёт луч к кораблю с наименьшим запасом курса, с задержкой реакции и ошибкой прицела.
import { LAYOUT } from './config.js';
import { Night, upgradeCost } from './game.js';
import { UPGRADES } from './config.js';

const DT = 1 / 60;
const MAX_T = 900;
const NIGHTS = Number(process.argv[2]) || 200;

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BOTS = {
  novice:  { react: 0.45, noise: 5,   hold: 0.7 },
  average: { react: 0.30, noise: 3,   hold: 0.85 },
  skilled: { react: 0.20, noise: 1.5, hold: 0.95 },
};

function playNight(up, bot, seed) {
  const rng = mulberry32(seed);
  const botRng = mulberry32(seed ^ 0x9e3779b9);
  const n = new Night(up, rng);
  let target = null;
  let timer = 0;
  while (!n.over && n.t < MAX_T) {
    timer -= DT;
    if (timer <= 0) {
      timer = bot.react;
      const list = n.sailing().filter(s => s.y < LAYOUT.safeY && s.y > -10);
      if (target && (target.state !== 'sail' || target.y >= LAYOUT.safeY || target.course >= bot.hold * target.max)) target = null;
      const worst = list.reduce((a, s) => (!a || s.course < a.course ? s : a), null);
      if (!target || (worst && worst.course < 1.2 && worst.course < target.course - 0.5)) target = worst;
      if (target) {
        const a = Math.atan2(target.y - LAYOUT.lamp.y, target.x - LAYOUT.lamp.x);
        n.setTarget(a + (botRng() * 2 - 1) * bot.noise * Math.PI / 180);
      }
    }
    n.update(DT);
  }
  return { saved: n.saved, t: n.t, coins: n.coins };
}

function stats(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { p25: q(0.25), med: q(0.5), p75: q(0.75), mean: s.reduce((a, b) => a + b, 0) / s.length };
}

const fmt = x => (Math.round(x * 10) / 10).toString();
const fmtT = sec => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

function runSet(label, up, botName) {
  const res = [];
  for (let i = 0; i < NIGHTS; i++) res.push(playNight(up, BOTS[botName], 1000 + i));
  const sv = stats(res.map(r => r.saved));
  const tt = stats(res.map(r => r.t));
  const cc = stats(res.map(r => r.coins));
  console.log(`${label.padEnd(34)} спасено p25/мед/p75 ${sv.p25}/${sv.med}/${sv.p75}  ` +
    `ночь мед ${fmtT(tt.med)} (p25 ${fmtT(tt.p25)}, p75 ${fmtT(tt.p75)})  монет ср ${fmt(cc.mean)}`);
}

// Прогрессия: игрок растёт от новичка к среднему, после каждой ночи покупает самое дешёвое улучшение.
function progression(seedBase) {
  const up = { lens: 0, lamp: 0, gear: 0 };
  let coins = 0;
  for (let night = 1; night <= 80; night++) {
    const bot = night <= 3 ? BOTS.novice : night <= 10 ? BOTS.average : BOTS.skilled;
    coins += playNight(up, bot, seedBase + night).coins;
    for (;;) {
      const key = Object.keys(up).filter(k => up[k] < UPGRADES.maxLevel)
        .sort((a, b) => upgradeCost(up[a]) - upgradeCost(up[b]))[0];
      if (!key || upgradeCost(up[key]) > coins) break;
      coins -= upgradeCost(up[key]);
      up[key]++;
    }
    if (up.lens + up.lamp + up.gear === 3 * UPGRADES.maxLevel) return night;
  }
  return 80;
}

console.log(`Симулятор «Смотритель маяка», ночей на набор: ${NIGHTS}`);
runSet('новичок, улучшения 0/0/0', { lens: 0, lamp: 0, gear: 0 }, 'novice');
runSet('средний, улучшения 0/0/0', { lens: 0, lamp: 0, gear: 0 }, 'average');
runSet('средний, улучшения 3/3/3', { lens: 3, lamp: 3, gear: 3 }, 'average');
runSet('опытный, улучшения 3/3/3', { lens: 3, lamp: 3, gear: 3 }, 'skilled');
runSet('опытный, улучшения 5/5/5', { lens: 5, lamp: 5, gear: 5 }, 'skilled');
const nights = [];
for (let i = 0; i < 40; i++) nights.push(progression(50000 + i * 100));
const ns = stats(nights);
console.log(`ночей до полной прокачки (40 игроков): p25/мед/p75 ${ns.p25}/${ns.med}/${ns.p75}`);
