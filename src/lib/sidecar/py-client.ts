import { invoke } from '@tauri-apps/api/core';

let _port: number | null = null;

export async function pySidecarPort(): Promise<number> {
  if (_port !== null) return _port;
  for (let i = 0; i < 120; i++) {  // 120 × 500ms = 60s
    const p = await invoke<number | null>('py_sidecar_port');
    if (p) { _port = p; return p; }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Python sidecar did not start within 60s');
}

async function pyFetch<T>(path: string, body?: unknown): Promise<T> {
  const port = await pySidecarPort();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Py sidecar ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export interface PyFaceBox { x: number; y: number; w: number; h: number; }

export interface PyFaceWithEmbed extends PyFaceBox {
  embedding_b64: string;
  quality: number;
}

export async function blurViaPy(path: string): Promise<number> {
  const r = await pyFetch<{ blur: number }>('/blur', { path });
  return r.blur;
}

export async function phashViaPy(path: string): Promise<string> {
  const r = await pyFetch<{ phash: string }>('/phash', { path });
  return r.phash;
}

export async function facesViaPy(
  path: string,
  withEmbeddings = false,
): Promise<{ count: number; faces: PyFaceBox[] | PyFaceWithEmbed[] }> {
  return pyFetch<{ count: number; faces: PyFaceBox[] | PyFaceWithEmbed[] }>(
    '/faces',
    { path, with_embeddings: withEmbeddings },
  );
}

export async function embedViaPy(path: string): Promise<{ model: string; vector: Uint8Array }> {
  const r = await pyFetch<{ model: string; vector_b64: string }>('/embed', { path });
  return { model: r.model, vector: base64ToBytes(r.vector_b64) };
}

export async function tagsViaPy(path: string, topK = 5): Promise<Array<{ tag: string; score: number }>> {
  const r = await pyFetch<{ tags: Array<{ tag: string; score: number }> }>('/tags', { path, top_k: topK });
  return r.tags;
}

export async function exposureViaPy(path: string): Promise<number> {
  const r = await pyFetch<{ exposure: number }>('/exposure', { path });
  return r.exposure;
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
