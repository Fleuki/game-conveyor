// Прогресс игрока: облако SDK + localStorage как резерв. Берётся более свежая копия.
import { loadCloud, saveCloud } from './ya.js';

const KEY = 'lighthouse-keeper-save';

function defaults() {
  return {
    coins: 0,
    up: { lens: 0, lamp: 0, gear: 0 },
    best: 0,
    stars: 0,        // сколько целей из BALANCE.stars достигнуто
    total: 0,        // всего спасено кораблей
    sound: true,
    tutorial: true,  // обучение ещё не пройдено
    ts: 0,
  };
}

function normalize(d) {
  const base = defaults();
  if (!d || typeof d !== 'object') return base;
  return { ...base, ...d, up: { ...base.up, ...(d.up || {}) } };
}

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch (e) {
    return null;
  }
}

export const save = {
  data: defaults(),

  async load() {
    const local = readLocal();
    const cloud = await loadCloud();
    const pick = cloud && cloud.ts && (!local || cloud.ts >= (local.ts || 0)) ? cloud : local;
    this.data = normalize(pick);
  },

  write() {
    this.data.ts = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) { /* приватный режим — живём без localStorage */ }
    saveCloud(this.data);
  },
};
