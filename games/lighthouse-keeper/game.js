// Логика одной ночи. Без DOM и Canvas — используется и игрой, и симулятором (sim.js).
import { LAYOUT, BALANCE, UPGRADES } from './config.js';

const DEG = Math.PI / 180;

export function upgradeValue(key, level) {
  const u = UPGRADES[key];
  return u.base + u.perLevel * level;
}

export function upgradeCost(level) {
  return level < UPGRADES.maxLevel ? UPGRADES.costs[level] : null;
}

export function spawnInterval(t) {
  const s = BALANCE.spawn;
  return Math.max(s.min, s.start - s.perSecond * t);
}

export function drainRate(t) {
  return 1 + BALANCE.drainGrowth * t;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export function clampBeamAngle(a) {
  return Math.min(BALANCE.beam.maxAngle * DEG, Math.max(BALANCE.beam.minAngle * DEG, a));
}

export class Night {
  // up: { lens, lamp, gear } — уровни улучшений; rng: () => [0, 1)
  constructor(up, rng = Math.random, { tutorial = false } = {}) {
    this.rng = rng;
    this.halfWidth = (upgradeValue('lens', up.lens) / 2) * DEG;
    this.refill = upgradeValue('lamp', up.lamp);
    this.turn = upgradeValue('gear', up.gear) * DEG;
    this.tutorial = tutorial;

    this.t = 0;
    this.saved = 0;
    this.coins = 0;
    this.lives = BALANCE.lives;
    this.over = false;
    this.revived = false;
    this.ships = [];
    this.wrecks = [];
    this.fogs = [];
    this.fogTimer = 0;
    this.spawnTimer = 0.6;
    this.nextId = 1;
    this.beam = -90 * DEG;
    this.target = this.beam;
    this.events = [];
    this.stormStarted = false;
  }

  setTarget(angle) {
    this.target = clampBeamAngle(angle);
  }

  aimAt(x, y) {
    this.setTarget(Math.atan2(y - LAYOUT.lamp.y, x - LAYOUT.lamp.x));
  }

  sailing() {
    return this.ships.filter(s => s.state === 'sail');
  }

  isLit(s) {
    const dx = s.x - LAYOUT.lamp.x;
    const dy = s.y - LAYOUT.lamp.y;
    const dist = Math.hypot(dx, dy);
    if (dist > BALANCE.beam.length) return false;
    const pad = Math.atan2(s.r * 0.7, Math.max(dist, 1));
    return Math.abs(angleDiff(Math.atan2(dy, dx), this.beam)) < this.halfWidth + pad;
  }

  inFog(s) {
    return this.fogs.some(f => Math.hypot(s.x - f.x, s.y - f.y) < f.r);
  }

  pickType() {
    const list = Object.entries(BALANCE.ships).filter(([, v]) => this.saved >= v.from);
    const total = list.reduce((a, [, v]) => a + v.weight, 0);
    let r = this.rng() * total;
    for (const [k, v] of list) {
      r -= v.weight;
      if (r <= 0) return k;
    }
    return list[0][0];
  }

  spawnShip() {
    const type = this.pickType();
    const def = BALANCE.ships[type];
    const [x0, x1] = LAYOUT.spawnX;
    const x = x0 + this.rng() * (x1 - x0);
    const lane = LAYOUT.lanes[x < 180 ? 0 : 1];
    const tx = lane[0] + this.rng() * (lane[1] - lane[0]);
    const ty = LAYOUT.harborY;
    const len = Math.hypot(tx - x, ty - LAYOUT.spawnY);
    const ship = {
      id: this.nextId++, type, x, y: LAYOUT.spawnY, tx, ty,
      vx: (tx - x) / len * def.speed, vy: (ty - LAYOUT.spawnY) / len * def.speed,
      speed: def.speed, r: def.r, max: def.course, course: def.course,
      state: 'sail', lit: false, fog: false, t: 0, rock: null,
    };
    this.ships.push(ship);
    this.events.push({ type: 'spawn', ship });
  }

  update(dt) {
    if (this.over) return;
    this.t += dt;

    // луч поворачивается к цели с ограниченной скоростью
    const d = angleDiff(this.target, this.beam);
    const step = this.turn * dt;
    this.beam = Math.abs(d) <= step ? this.target : this.beam + Math.sign(d) * step;

    // появление кораблей
    this.spawnTimer -= dt;
    const active = this.ships.filter(s => s.state === 'sail' || s.state === 'lost').length;
    const cap = this.tutorial ? BALANCE.tutorialShips : BALANCE.maxShips;
    if (this.spawnTimer <= 0 && active < cap) {
      this.spawnShip();
      this.spawnTimer = spawnInterval(this.t);
    }

    this.updateFog(dt);

    for (const s of this.ships) {
      s.t += dt;
      if (s.state === 'sail') this.updateSailing(s, dt);
      else if (s.state === 'lost') this.updateLost(s, dt);
      else s.fade = (s.fade || 0) + dt;
    }
    this.ships = this.ships.filter(s => s.state === 'sail' || s.state === 'lost' || s.fade < 0.6);
    for (const w of this.wrecks) w.t += dt;
    this.wrecks = this.wrecks.filter(w => w.t < 4);
  }

  updateSailing(s, dt) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.lit = this.isLit(s);
    s.fog = this.inFog(s);
    if (s.y > LAYOUT.safeY) {
      s.course = Math.min(s.max, s.course + (s.lit ? this.refill * dt : 0));
    } else if (s.lit) {
      s.course = Math.min(s.max, s.course + this.refill * (s.fog ? BALANCE.fog.refillMul : 1) * dt);
    } else {
      s.course -= drainRate(this.t) * dt;
    }

    if (s.course <= 0) {
      s.course = 0;
      s.state = 'lost';
      let best = null;
      for (const r of LAYOUT.rocks) {
        const dist = Math.hypot(r.x - s.x, r.y - s.y);
        if (!best || dist < best.dist) best = { r, dist };
      }
      s.rock = best.r;
      this.events.push({ type: 'lost', ship: s });
      return;
    }

    if (s.y >= s.ty) {
      s.state = 'docked';
      s.fade = 0;
      this.saved++;
      const coins = BALANCE.ships[s.type].coins;
      this.coins += coins;
      if (this.tutorial) this.tutorial = false;
      this.events.push({ type: 'saved', ship: s, coins });
    }
  }

  updateLost(s, dt) {
    const dx = s.rock.x - s.x;
    const dy = s.rock.y - s.y;
    const dist = Math.hypot(dx, dy);
    const v = s.speed * BALANCE.lostSpeedMul;
    if (dist < BALANCE.wreckDist) {
      s.state = 'wrecked';
      s.fade = 0;
      this.lives--;
      this.wrecks.push({ x: s.x, y: s.y, t: 0 });
      this.events.push({ type: 'wreck', ship: s });
      if (this.lives <= 0) {
        this.over = true;
        this.events.push({ type: 'over' });
      }
      return;
    }
    // плавный разворот к скале
    const k = Math.min(1, dt * 3);
    s.vx += (dx / dist * v - s.vx) * k;
    s.vy += (dy / dist * v - s.vy) * k;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
  }

  updateFog(dt) {
    const f = BALANCE.fog;
    if (this.saved >= f.fromSaved) {
      if (!this.stormStarted) {
        this.stormStarted = true;
        this.events.push({ type: 'storm' });
      }
      this.fogTimer -= dt;
      if (this.fogTimer <= 0 && this.fogs.length < f.max) {
        const fromLeft = this.rng() < 0.5;
        this.fogs.push({
          x: fromLeft ? -f.r : 360 + f.r,
          y: 110 + this.rng() * 300,
          r: f.r,
          vx: (fromLeft ? 1 : -1) * f.speed * (0.7 + this.rng() * 0.6),
        });
        this.fogTimer = f.interval;
      }
    }
    for (const fog of this.fogs) fog.x += fog.vx * dt;
    this.fogs = this.fogs.filter(fog => fog.x > -fog.r * 1.5 && fog.x < 360 + fog.r * 1.5);
  }

  // Продолжение за рекламу: +1 жизнь, сбившиеся корабли убираются, у остальных полный курс.
  revive() {
    this.over = false;
    this.revived = true;
    this.lives = 1;
    this.ships = this.ships.filter(s => s.state !== 'lost');
    for (const s of this.ships) if (s.state === 'sail') s.course = s.max;
    this.spawnTimer = Math.max(this.spawnTimer, 1.5);
  }
}
