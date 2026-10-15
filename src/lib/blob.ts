// Blob <-> base64 helpers that work in browsers and in Node (no FileReader needed).
export async function blobToBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer()); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export const blobToDataUrl = async (b: Blob) => `data:${b.type || 'application/octet-stream'};base64,${await blobToBase64(b)}`;
export function dataUrlToBlob(u: string): Blob {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(u); if (!m) throw new Error('Invalid data URL');
  const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]); const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: m[1] || 'application/octet-stream' });
}
