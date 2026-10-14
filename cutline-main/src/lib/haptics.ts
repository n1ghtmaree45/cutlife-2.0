let enabled = true;
export const setHapticsEnabled = (v: boolean) => { enabled = v; };
/** Short vibration on key taps (Android Chrome). Silently does nothing where unsupported or switched off. */
export function haptic(ms: number | number[] = 12) {
  try { if (enabled && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(ms); } catch { /* unsupported */ }
}
