// Все константы баланса и раскладки поля. Менять только после прогона sim.js (см. CLAUDE.md).

export const FIELD = { w: 360, h: 640 };

export const LAYOUT = {
  lamp: { x: 180, y: 462 },        // точка, из которой выходит луч
  lighthouse: { x: 140, y: 440, w: 80, h: 160 },
  harborY: 604,                     // корабль дошёл сюда — спасён
  safeY: 520,                       // ниже этой линии курс не убывает (гавань рядом)
  spawnY: -40,
  spawnX: [30, 330],
  lanes: [[40, 118], [242, 320]],   // куда в гавани причаливают корабли (слева и справа от маяка)
  rocks: [
    { x: 26, y: 130, img: 'rock-1' },
    { x: 336, y: 190, img: 'rock-2' },
    { x: 24, y: 300, img: 'rock-2' },
    { x: 334, y: 360, img: 'rock-1' },
    { x: 40, y: 470, img: 'rock-1' },
    { x: 322, y: 500, img: 'rock-2' },
  ],
};

export const BALANCE = {
  lives: 3,
  spawn: { start: 3.4, min: 1.2, perSecond: 0.010 },  // интервал сокращается со временем ночи
  drainGrowth: 0.003,               // убывание курса: 1 + drainGrowth * секунды ночи
  maxShips: 9,                      // одновременно на воде
  ships: {
    boat:     { speed: 45, course: 8, coins: 1, from: 0,  weight: 1.0, r: 14 },
    schooner: { speed: 34, course: 10, coins: 2, from: 10, weight: 0.6, r: 18 },
    steamer:  { speed: 26, course: 12, coins: 3, from: 20, weight: 0.4, r: 22 },
  },
  lostSpeedMul: 1.4,                // сбившийся корабль идёт к скале быстрее
  wreckDist: 14,
  beam: {
    length: 560,
    minAngle: -172,                 // градусы, 0 — вправо, -90 — вверх
    maxAngle: -8,
  },
  fog: { fromSaved: 40, max: 2, interval: 12, r: 64, speed: 12, refillMul: 0.5 },
  tutorialShips: 1,                 // пока идёт обучение, на воде не больше одного корабля
  stars: [25, 50, 100],
};

// Улучшения: значение = base + perLevel * уровень.
export const UPGRADES = {
  lens: { base: 18, perLevel: 3.2 },   // ширина луча, градусы
  lamp: { base: 3, perLevel: 0.5 },    // восполнение курса в луче, курс/с
  gear: { base: 150, perLevel: 30 },   // скорость поворота луча, °/с
  maxLevel: 5,
  costs: [15, 35, 70, 120, 180],
};

export const ADS = {
  interstitialFromNight: 2,         // interstitial между ночами, начиная со 2-й ночи сессии
};
