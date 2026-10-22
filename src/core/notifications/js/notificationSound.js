/**
 * Короткий сигнал в приложении при новом уведомлении.
 * Тумблер — «Звуковой сигнал» в настройках уведомлений браузера.
 *
 * AudioContext создаётся и продолжается только после жеста пользователя —
 * иначе браузер блокирует автозапуск.
 */

import { BROWSER_NOTIFICATION_PREFS, readBrowserNotificationPref } from './browserNotificationPrefs.js'

const SOUND_COOLDOWN_MS = 800
const PEAK_GAIN = 0.08

const TONES = [
  { frequency: 880, duration: 0.09, offset: 0 },
  { frequency: 1174.7, duration: 0.14, offset: 0.08 },
]

let audioContext = null
let lastPlayedAt = 0
let unlockBound = false
let userGestureSeen = false

function soundPrefEnabled() {
  if (typeof window === 'undefined') {
    return false
  }
  return readBrowserNotificationPref(BROWSER_NOTIFICATION_PREFS.sound, true)
}

function audioContextConstructor() {
  if (typeof window === 'undefined') {
    return null
  }
  return window.AudioContext || window.webkitAudioContext || null
}

function getOrCreateContext() {
  if (!userGestureSeen) {
    return null
  }
  const Ctor = audioContextConstructor()
  if (!Ctor) {
    return null
  }
  if (!audioContext) {
    try {
      audioContext = new Ctor()
    } catch {
      return null
    }
  }
  return audioContext
}

async function resumeContext() {
  const ctx = getOrCreateContext()
  if (!ctx) {
    return null
  }
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      return null
    }
  }
  return ctx.state === 'closed' ? null : ctx
}

function ensureUnlockListeners() {
  if (unlockBound || typeof document === 'undefined') {
    return
  }
  unlockBound = true
  const unlock = () => {
    userGestureSeen = true
    void resumeContext()
  }
  document.addEventListener('pointerdown', unlock, { capture: true })
  document.addEventListener('keydown', unlock, { capture: true })
}

function scheduleTone(ctx, tone, now) {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(tone.frequency, now)
  const start = now + tone.offset
  const end = start + tone.duration
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, end)
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(end + 0.02)
}

function playTones(ctx) {
  const now = ctx.currentTime
  for (const tone of TONES) {
    scheduleTone(ctx, tone, now)
  }
}

function tryPlay(ctx) {
  try {
    playTones(ctx)
  } catch {
    // Сигнал — best effort, как toast.
  }
}

export function playNotificationSound() {
  if (!soundPrefEnabled()) {
    return
  }
  ensureUnlockListeners()
  if (!userGestureSeen) {
    return
  }
  const now = Date.now()
  if (now - lastPlayedAt < SOUND_COOLDOWN_MS) {
    return
  }
  lastPlayedAt = now
  try {
    const ctx = getOrCreateContext()
    if (!ctx) {
      return
    }
    if (ctx.state === 'suspended') {
      void resumeContext().then((ready) => {
        if (ready) {
          tryPlay(ready)
        }
      })
      return
    }
    tryPlay(ctx)
  } catch {
    // Сигнал — best effort, как toast.
  }
}

if (typeof document !== 'undefined') {
  ensureUnlockListeners()
}
