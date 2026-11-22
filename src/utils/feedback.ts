import type { SoundProfile, VibrationPattern } from '../types/dhikr';

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function playTapSound(profile: SoundProfile): void {
  if (profile === 'off') return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (profile === 'soft-click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.045);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.055);
    } else if (profile === 'wood-bead') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(760, now);
      osc.frequency.exponentialRampToValueAtTime(340, now + 0.032);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);
      osc.start(now);
      osc.stop(now + 0.042);
    } else if (profile === 'gentle-chime') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.09);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.15);
    }
  } catch {
    // Audio playback failed silently when blocked by autoplay policy
  }
}

export function playCompletionChime(profile: SoundProfile): void {
  if (profile === 'off') return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      gain.gain.setValueAtTime(0.07, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.34);
    });
  } catch {
    // Silent fallback
  }
}

export function triggerHaptic(pattern: VibrationPattern, isCompletion = false): void {
  if (pattern === 'off') return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;

  try {
    if (isCompletion) {
      navigator.vibrate([45, 40, 75]);
      return;
    }
    if (pattern === 'subtle') {
      navigator.vibrate(12);
    } else if (pattern === 'bead') {
      navigator.vibrate(24);
    } else if (pattern === 'double') {
      navigator.vibrate([15, 25, 15]);
    }
  } catch {
    // Vibration not supported or blocked
  }
}
