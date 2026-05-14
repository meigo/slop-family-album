import { invoke } from '@tauri-apps/api/core';

let _port: number | null = null;

export async function sidecarPort(): Promise<number> {
  if (_port !== null) return _port;
  for (let i = 0; i < 60; i++) {
    const p = await invoke<number | null>('sidecar_port');
    if (p) {
      _port = p;
      return p;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Sidecar did not start within 30s');
}

export async function sidecarFetch<T>(path: string, body?: unknown): Promise<T> {
  const port = await sidecarPort();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Sidecar ${path} failed: ${res.status}`);
  return res.json();
}

export interface SidecarExif {
  taken_at: string | null;
  width: number | null;
  height: number | null;
  orientation: number | null;
  exif_json: string | null;
}

export interface SidecarThumb {
  path: string;
  width: number;
  height: number;
}

export async function readExifViaSidecar(path: string): Promise<SidecarExif> {
  return sidecarFetch<SidecarExif>('/exif', { path });
}

export async function makeThumbViaSidecar(
  source: string,
  outPath: string,
  longestEdge = 256,
): Promise<SidecarThumb> {
  return sidecarFetch<SidecarThumb>('/thumb', { source, outPath, longestEdge });
}
