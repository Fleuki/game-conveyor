// Обёртка над Yandex Games SDK. Вне Яндекса (локальный запуск) — заглушка:
// язык берётся из ?lang=, реклама сразу закрывается, сохранение — только localStorage.

let ysdk = null;
let player = null;

export async function initSdk() {
  if (typeof window.YaGames === 'undefined') return false;
  try {
    ysdk = await window.YaGames.init();
    return true;
  } catch (e) {
    console.warn('SDK init failed', e);
    ysdk = null;
    return false;
  }
}

export function sdkLang() {
  if (ysdk) return ysdk.environment.i18n.lang;
  return new URLSearchParams(location.search).get('lang') || 'ru';   // только для локальной разработки
}

export function loadingReady() {
  ysdk?.features?.LoadingAPI?.ready();
}

export function gameplayStart() {
  ysdk?.features?.GameplayAPI?.start();
}

export function gameplayStop() {
  ysdk?.features?.GameplayAPI?.stop();
}

// callbacks: { onOpen, onClose } — вызывается ровно один onClose при любом исходе
export function showInterstitial({ onOpen, onClose }) {
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    onClose();
  };
  if (!ysdk) { finish(); return; }
  onOpen();
  ysdk.adv.showFullscreenAdv({ callbacks: { onClose: finish, onError: finish } });
}

// Награда выдаётся только в onRewarded, ровно один раз.
export function showRewarded({ onOpen, onReward, onClose }) {
  let rewarded = false;
  let settled = false;
  const grant = () => {
    if (rewarded) return;
    rewarded = true;
    onReward();
  };
  const finish = () => {
    if (settled) return;
    settled = true;
    onClose();
  };
  if (!ysdk) {
    // локально: считаем, что ролик досмотрен
    onOpen();
    setTimeout(() => { grant(); finish(); }, 300);
    return;
  }
  onOpen();
  ysdk.adv.showRewardedVideo({ callbacks: { onRewarded: grant, onClose: finish, onError: finish } });
}

async function getPlayer() {
  if (!ysdk) return null;
  if (player) return player;
  try {
    player = await ysdk.getPlayer({ scopes: false });
  } catch (e) {
    player = null;
  }
  return player;
}

export async function loadCloud() {
  const p = await getPlayer();
  if (!p) return null;
  try {
    return await p.getData();
  } catch (e) {
    return null;
  }
}

export async function saveCloud(data) {
  const p = await getPlayer();
  if (!p) return;
  try {
    await p.setData(data, true);
  } catch (e) {
    console.warn('setData failed', e);
  }
}
