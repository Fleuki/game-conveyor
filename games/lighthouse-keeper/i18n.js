// Строки интерфейса. Язык выбирается по коду из SDK.

const RU_LANGS = ['ru', 'be', 'kk', 'uk', 'uz'];

const STRINGS = {
  ru: {
    title: 'Смотритель маяка',
    hint: 'Веди луч маяка пальцем —\nне дай кораблям сбиться с курса',
    play: 'Играть',
    best: 'Рекорд',
    upgrades: 'Улучшения маяка',
    lens: 'Линза',
    lensDesc: 'шире луч',
    lamp: 'Лампа',
    lampDesc: 'быстрее возвращает курс',
    gear: 'Механизм',
    gearDesc: 'быстрее поворот',
    max: 'Макс.',
    pause: 'Пауза',
    resume: 'Продолжить',
    restart: 'Заново',
    menu: 'В меню',
    soundOn: 'Звук: вкл.',
    soundOff: 'Звук: выкл.',
    nightOver: 'Ночь окончена',
    saved: 'Спасено кораблей',
    newRecord: 'Новый рекорд!',
    coinsEarned: 'Монеты за ночь',
    reviveAd: 'Продолжить — за рекламу',
    doubleAd: '×2 монеты — за рекламу',
    again: 'Ещё ночь',
    tutorial: 'Веди лучом к кораблю',
    storm: 'Туман сгущается',
  },
  en: {
    title: 'Lighthouse Keeper',
    hint: 'Guide the lighthouse beam —\nkeep the ships on course',
    play: 'Play',
    best: 'Best',
    upgrades: 'Lighthouse upgrades',
    lens: 'Lens',
    lensDesc: 'wider beam',
    lamp: 'Lamp',
    lampDesc: 'restores course faster',
    gear: 'Gear',
    gearDesc: 'turns faster',
    max: 'Max',
    pause: 'Paused',
    resume: 'Resume',
    restart: 'Restart',
    menu: 'Menu',
    soundOn: 'Sound: on',
    soundOff: 'Sound: off',
    nightOver: 'The night is over',
    saved: 'Ships saved',
    newRecord: 'New record!',
    coinsEarned: 'Coins this night',
    reviveAd: 'Continue — watch an ad',
    doubleAd: '×2 coins — watch an ad',
    again: 'Next night',
    tutorial: 'Move the beam onto the ship',
    storm: 'The fog is rolling in',
  },
};

let current = STRINGS.ru;
export let lang = 'ru';

export function setLanguage(code) {
  lang = RU_LANGS.includes(code) ? 'ru' : 'en';
  current = STRINGS[lang];
  document.documentElement.lang = lang;
  document.title = current.title;
}

export function t(key) {
  return current[key] ?? key;
}
