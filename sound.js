// Модуль процедурного синтеза звуков на Web Audio API для викторины «Основы права»
const STORAGE_KEY_MUTED = 'osnovy-prava.sound.muted';

let audioCtx = null;
let isMuted = false;

try {
  isMuted = localStorage.getItem(STORAGE_KEY_MUTED) === 'true';
} catch {
  isMuted = false;
}

function getAudioContext() {
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      audioCtx = new AudioCtx();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Разблокировка контекста при первом действии пользователя
if (typeof window !== 'undefined') {
  const unlock = () => {
    getAudioContext();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true, passive: true });
}

function playTone({
  freq = 440,
  type = 'sine',
  duration = 0.2,
  startTime = 0,
  startVol = 0.25,
  endFreq = null,
  decay = 'exp'
}) {
  if (isMuted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime + startTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(20, freq), now);
  if (endFreq !== null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
  }

  gain.gain.setValueAtTime(Math.max(0.0001, startVol), now);
  if (decay === 'exp') {
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  } else {
    gain.gain.linearRampToValueAtTime(0.0001, now + duration);
  }

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + duration + 0.05);
}

export const sound = {
  get muted() {
    return isMuted;
  },

  setMuted(muted) {
    isMuted = Boolean(muted);
    try {
      localStorage.setItem(STORAGE_KEY_MUTED, String(isMuted));
    } catch {}
    return isMuted;
  },

  toggleMute() {
    const next = !isMuted;
    this.setMuted(next);
    if (!next) {
      this.click();
    }
    return next;
  },

  // Отсчёт перед началом викторины (3, 2, 1)
  countdownTick(value) {
    if (isMuted) return;
    const notes = { 3: 523.25, 2: 659.25, 1: 783.99 }; // C5, E5, G5
    const freq = notes[value] || 523.25;

    // Перкуссионный деревянный/колокольный щелчок
    playTone({ freq: freq * 2, type: 'triangle', duration: 0.06, startVol: 0.18, decay: 'exp' });
    playTone({ freq, type: 'sine', duration: 0.18, startVol: 0.22, decay: 'exp' });
  },

  // Звон старта после завершения 3-2-1
  countdownStart() {
    if (isMuted) return;
    // Аккорд старта (C5 + G5 + C6)
    [523.25, 783.99, 1046.5].forEach((freq, i) => {
      playTone({
        freq,
        type: 'sine',
        duration: 0.75,
        startTime: i * 0.02,
        startVol: 0.2,
        decay: 'exp'
      });
      playTone({
        freq: freq * 1.5,
        type: 'triangle',
        duration: 0.35,
        startTime: i * 0.02,
        startVol: 0.08,
        decay: 'exp'
      });
    });
  },

  // Правильный ответ (+1 балл)
  correct() {
    if (isMuted) return;
    // Мелодичный кристальный мажорный перезвон (E5 -> G#5 -> B5 -> E6)
    const arpeggio = [659.25, 830.61, 987.77, 1318.51];
    arpeggio.forEach((freq, idx) => {
      playTone({
        freq,
        type: 'sine',
        duration: 0.55 - idx * 0.05,
        startTime: idx * 0.07,
        startVol: 0.24,
        decay: 'exp'
      });
      // Тёплый обертон
      playTone({
        freq: freq * 2,
        type: 'triangle',
        duration: 0.35,
        startTime: idx * 0.07,
        startVol: 0.07,
        decay: 'exp'
      });
    });
  },

  // Неверный ответ (0 баллов)
  wrong() {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    // Мягкий, нераздражающий нисходящий двухтональный сигнал с фильтром низких частот
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, now);
    filter.frequency.exponentialRampToValueAtTime(150, now + 0.38);

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(196, now); // G3
    osc1.frequency.exponentialRampToValueAtTime(130.81, now + 0.35); // C3

    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(185, now);
    osc2.frequency.exponentialRampToValueAtTime(123.47, now + 0.35);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.45);
    osc2.stop(now + 0.45);
  },

  // Открытие ответа устного вопроса
  reveal() {
    if (isMuted) return;
    // Мягкий взмах/шелест карточки (высокочастотный свип с колокольчиком)
    playTone({
      freq: 440,
      endFreq: 987.77,
      type: 'sine',
      duration: 0.22,
      startVol: 0.16,
      decay: 'exp'
    });
    playTone({
      freq: 880,
      endFreq: 1760,
      type: 'triangle',
      duration: 0.18,
      startVol: 0.09,
      decay: 'exp'
    });
  },

  // Завершение викторины / экран результатов (торжественный финальный аккорд)
  finish() {
    if (isMuted) return;
    // Последовательность аккордов: F-мажор -> G-мажор -> C-мажор
    const chords = [
      { delay: 0.0, freqs: [349.23, 440.0, 523.25], dur: 0.35 }, // F4, A4, C5
      { delay: 0.28, freqs: [392.0, 493.88, 587.33], dur: 0.38 }, // G4, B4, D5
      { delay: 0.6, freqs: [523.25, 659.25, 783.99, 1046.5], dur: 1.1 } // C5, E5, G5, C6
    ];

    chords.forEach(({ delay, freqs, dur }) => {
      freqs.forEach(freq => {
        playTone({
          freq,
          type: 'sine',
          duration: dur,
          startTime: delay,
          startVol: 0.18,
          decay: 'exp'
        });
        playTone({
          freq: freq * 2,
          type: 'triangle',
          duration: dur * 0.6,
          startTime: delay,
          startVol: 0.06,
          decay: 'exp'
        });
      });
    });
  },

  // Лёгкий тактильный клик по кнопкам интерфейса
  click() {
    if (isMuted) return;
    playTone({
      freq: 900,
      endFreq: 400,
      type: 'sine',
      duration: 0.035,
      startVol: 0.1,
      decay: 'exp'
    });
  }
};
