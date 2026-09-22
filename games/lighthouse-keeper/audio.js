// Звук только через Web Audio API. Эффекты синтезируются, музыка — .wav-петли из assets/music/.
// Никаких <audio>/<video> и navigator.mediaSession.

const AudioCtx = window.AudioContext || window.webkitAudioContext;
const actx = new AudioCtx();
const master = actx.createGain();
master.connect(actx.destination);
const sfxBus = actx.createGain();
sfxBus.gain.value = 0.7;
sfxBus.connect(master);
const musicBus = actx.createGain();
musicBus.gain.value = 0.45;
musicBus.connect(master);

// Дорожки из заказа handoff/gpt/requests/lighthouse-keeper-music.md: menu, night, storm.
// Список пуст, пока файлов нет в assets/music/ — иначе запросы дают 404 в консоли.
const MUSIC_FILES = [];
const music = {};          // имя → AudioBuffer
let playing = null;        // { name, src, gain }
let wanted = null;
let noiseBuf = null;
let blocked = new Set();   // причины, по которым звук остановлен (hidden, blur, ad)

function unlock() {
  if (blocked.size === 0 && actx.state === 'suspended') actx.resume();
}
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

export const audio = {
  setMuted(muted) {
    master.gain.setTargetAtTime(muted ? 0 : 1, actx.currentTime, 0.02);
  },

  setBlocked(reason, on) {
    if (on) blocked.add(reason); else blocked.delete(reason);
    if (blocked.size > 0) actx.suspend();
    else actx.resume();
  },

  async loadMusic() {
    await Promise.all(MUSIC_FILES.map(async name => {
      try {
        const res = await fetch(`assets/music/${name}.wav`);
        if (!res.ok) return;
        music[name] = await actx.decodeAudioData(await res.arrayBuffer());
      } catch (e) { /* нет файла — играем без этой дорожки */ }
    }));
  },

  // Плавная смена дорожки за 2 с. name = null — тишина.
  music(name) {
    if (wanted === name) return;
    wanted = name;
    const now = actx.currentTime;
    if (playing) {
      const old = playing;
      old.gain.gain.setTargetAtTime(0, now, 0.5);
      old.src.stop(now + 2.5);
      playing = null;
    }
    const buf = name && music[name];
    if (!buf) return;
    const src = actx.createBufferSource();
    const gain = actx.createGain();
    src.buffer = buf;
    src.loop = true;
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, now, 0.5);
    src.connect(gain).connect(musicBus);
    src.start();
    playing = { name, src, gain };
  },

  play(name) {
    if (actx.state !== 'running') return;
    const fx = SFX[name];
    if (fx) fx(actx.currentTime);
  },
};

// ——— синтез ———

function env(gainNode, t, attack, peak, decay) {
  const g = gainNode.gain;
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(peak, t + attack);
  g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(t, { type = 'sine', freq, to = null, attack = 0.005, peak = 0.3, decay = 0.3, dest = sfxBus }) {
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
  env(g, t, attack, peak, decay);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

function noise(t, { attack = 0.005, peak = 0.4, decay = 0.4, filter = 'lowpass', freq = 1200, q = 0.7 }) {
  if (!noiseBuf) {
    noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = actx.createBufferSource();
  src.buffer = noiseBuf;
  const f = actx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = actx.createGain();
  env(g, t, attack, peak, decay);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t);
  src.stop(t + attack + decay + 0.05);
}

const SFX = {
  click(t) {
    tone(t, { type: 'triangle', freq: 880, to: 660, peak: 0.18, decay: 0.07 });
  },
  // рында: основной тон + негармонические обертоны колокола
  bell(t) {
    tone(t, { freq: 784, peak: 0.22, decay: 1.4 });
    tone(t, { freq: 784 * 2.76, peak: 0.07, decay: 0.8 });
    tone(t, { freq: 784 * 5.4, peak: 0.03, decay: 0.4 });
  },
  // треск дерева и глухой удар о скалу
  wreck(t) {
    noise(t, { peak: 0.5, decay: 0.35, filter: 'bandpass', freq: 900, q: 1.2 });
    noise(t + 0.06, { peak: 0.3, decay: 0.25, filter: 'bandpass', freq: 2200, q: 2 });
    tone(t, { freq: 120, to: 45, peak: 0.45, decay: 0.45 });
  },
  horn(t) {
    tone(t, { type: 'sawtooth', freq: 98, attack: 0.08, peak: 0.07, decay: 0.9 });
    tone(t, { type: 'sawtooth', freq: 147, attack: 0.08, peak: 0.05, decay: 0.9 });
  },
  coin(t) {
    tone(t, { type: 'square', freq: 988, peak: 0.07, decay: 0.08 });
    tone(t + 0.07, { type: 'square', freq: 1319, peak: 0.07, decay: 0.25 });
  },
  record(t) {
    [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.11, { freq: f, peak: 0.16, decay: 0.7 }));
  },
  over(t) {
    tone(t, { freq: 90, to: 50, attack: 0.01, peak: 0.5, decay: 0.9 });
    noise(t, { peak: 0.15, decay: 0.6, freq: 300 });
  },
  lost(t) {
    tone(t, { type: 'triangle', freq: 440, to: 330, peak: 0.12, decay: 0.3 });
  },
};
