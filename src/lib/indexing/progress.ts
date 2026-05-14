import { writable, type Writable } from 'svelte/store';

export interface IndexProgress {
  phase: 'idle' | 'walking' | 'indexing' | 'done' | 'error';
  scanned: number;
  total: number;
  current: string;
  errors: string[];
}

export function createProgressStore(): Writable<IndexProgress> {
  return writable({ phase: 'idle', scanned: 0, total: 0, current: '', errors: [] });
}
