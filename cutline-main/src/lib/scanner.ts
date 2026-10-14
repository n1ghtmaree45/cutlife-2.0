// Barcode scanning: native BarcodeDetector when present (Chrome/Samsung Android), ZXing-js otherwise.
// The camera stream is only ever attached to a <video>; frames are never stored or uploaded.
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

export const hasNativeDetector = () => typeof (globalThis as any).BarcodeDetector === 'function';
export const looksLikeBarcode = (s: string) => /^\d{8,14}$/.test(s.trim());

export type ScanError = 'denied' | 'no_camera' | 'unsupported' | 'failed';
export class ScanFail extends Error { constructor(public kind: ScanError, msg?: string) { super(msg ?? kind); } }

/** Starts scanning into `video`. Calls onCode once per distinct code. Returns a stop() function. Throws ScanFail. */
export async function startScanner(video: HTMLVideoElement, onCode: (code: string) => void): Promise<() => void> {
  if (!navigator.mediaDevices?.getUserMedia) throw new ScanFail('unsupported');
  let stopped = false; let last = '';
  const emit = (c: string) => { if (!stopped && c !== last) { last = c; onCode(c); } };

  if (hasNativeDetector()) {
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); }
    catch (e) { throw mapMediaError(e); }
    video.srcObject = stream; video.setAttribute('playsinline', 'true'); await video.play().catch(() => {});
    const det = new (globalThis as any).BarcodeDetector({ formats: FORMATS });
    let raf = 0;
    const tick = async () => {
      if (stopped) return;
      try { if (video.readyState >= 2) { const r = await det.detect(video); if (r[0]?.rawValue) emit(r[0].rawValue); } } catch { /* frame not ready */ }
      raf = window.setTimeout(tick, 250);
    };
    tick();
    return () => { stopped = true; clearTimeout(raf); stream.getTracks().forEach(t => t.stop()); video.srcObject = null; };
  }

  // Fallback: ZXing-js, loaded on demand so it costs nothing unless the browser lacks BarcodeDetector.
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const reader = new BrowserMultiFormatReader();
  try {
    const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, video, res => { if (res) emit(res.getText()); });
    return () => { stopped = true; controls.stop(); };
  } catch (e) { throw mapMediaError(e); }
}

function mapMediaError(e: unknown): ScanFail {
  const n = (e as DOMException)?.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return new ScanFail('denied');
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return new ScanFail('no_camera');
  return new ScanFail('failed', (e as Error)?.message);
}
