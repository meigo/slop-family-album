import {
  listFacesByProject, setFaceCluster, clearPersonClusters, insertPersonCluster,
  listPersonClusters, deletePersonCluster, resetFaceClustersForProject,
} from '$lib/db';

const INITIAL_THRESHOLD = 0.30;
// Centroid-merge cutoff. Tuned for family albums with lookalikes:
// - Within-person mode pairs typically score 0.55-0.75 cosine.
// - Across-person (esp. family members who look alike) score 0.35-0.45.
// 0.50 sits comfortably above the across-family-member band without
// requiring identical modes to merge. Raise toward 0.60 if related
// people are getting merged, lower toward 0.40 if same-person modes
// stay split.
const MERGE_THRESHOLD = 0.50;
const LINKAGE_THRESHOLD = 0.55;
const CLUSTER_MATCH_THRESHOLD = 0.50;   // for matching new clusters to preserved-name/pin existing clusters
const SEED_QUALITY_FLOOR = 0.1;

function decodeEmbedding(b64: string): Float32Array {
  if (!b64 || b64.length === 0) return new Float32Array(0);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

function normalize(v: Float32Array): void {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n);
  if (n > 0) for (let i = 0; i < v.length; i++) v[i] /= n;
}

interface InMemoryCluster {
  centroid: Float32Array;
  memberFaceIds: number[];
  memberVecs: Float32Array[];
}

function mergeClusters(a: InMemoryCluster, b: InMemoryCluster): InMemoryCluster {
  const na = a.memberFaceIds.length;
  const nb = b.memberFaceIds.length;
  const centroid = new Float32Array(a.centroid.length);
  for (let k = 0; k < centroid.length; k++) {
    centroid[k] = (a.centroid[k] * na + b.centroid[k] * nb) / (na + nb);
  }
  normalize(centroid);
  return {
    centroid,
    memberFaceIds: [...a.memberFaceIds, ...b.memberFaceIds],
    memberVecs: [...a.memberVecs, ...b.memberVecs],
  };
}

function maxFacePairCosine(a: InMemoryCluster, b: InMemoryCluster): number {
  let best = -1;
  for (const va of a.memberVecs) {
    for (const vb of b.memberVecs) {
      const s = cosine(va, vb);
      if (s > best) best = s;
    }
  }
  return best;
}

function meanCentroid(vecs: Float32Array[]): Float32Array | null {
  if (vecs.length === 0 || vecs[0].length === 0) return null;
  const out = new Float32Array(vecs[0].length);
  for (const v of vecs) {
    for (let k = 0; k < out.length; k++) out[k] += v[k];
  }
  for (let k = 0; k < out.length; k++) out[k] /= vecs.length;
  normalize(out);
  return out;
}

export async function clusterFaces(projectId: number): Promise<void> {
  const faces = await listFacesByProject(projectId);
  if (faces.length === 0) {
    // No faces — clear all clusters since none have members.
    await clearPersonClusters(projectId);
    return;
  }

  const decoded = faces.map((f) => ({ face: f, vec: decodeEmbedding(f.embedding) }));

  // ---- Compute centroids of existing-preserved clusters (name OR pinned) ----
  const existingClusters = await listPersonClusters(projectId);
  const facesByCluster = new Map<number, Float32Array[]>();
  for (const { face, vec } of decoded) {
    if (face.cluster_id != null && vec.length > 0) {
      const arr = facesByCluster.get(face.cluster_id) ?? [];
      arr.push(vec);
      facesByCluster.set(face.cluster_id, arr);
    }
  }
  interface Preserved {
    id: number;
    centroid: Float32Array;
    name: string | null;
    is_pinned: number;
  }
  const preserved: Preserved[] = [];
  for (const ec of existingClusters) {
    if (ec.name == null && !ec.is_pinned) continue;  // no user investment → don't preserve
    const vecs = facesByCluster.get(ec.id);
    if (!vecs || vecs.length === 0) continue;
    const centroid = meanCentroid(vecs);
    if (!centroid) continue;
    preserved.push({ id: ec.id, centroid, name: ec.name, is_pinned: ec.is_pinned });
  }
  console.log(`[face-clustering] preserving ${preserved.length} named/pinned cluster(s)`);

  // ---- Diagnostic: embedding sanity ----
  for (let i = 0; i < Math.min(3, decoded.length); i++) {
    const v = decoded[i].vec;
    const firstFive = Array.from(v.slice(0, 5)).map((x) => x.toFixed(4)).join(', ');
    let norm = 0;
    for (let k = 0; k < v.length; k++) norm += v[k] * v[k];
    console.log(`[face-clustering] embedding ${i}: length=${v.length}, norm=${Math.sqrt(norm).toFixed(4)}, first 5 values: [${firstFive}]`);
  }

  decoded.sort((a, b) => (b.face.quality ?? 0) - (a.face.quality ?? 0));

  // ---- Pass 1: greedy assignment ----
  const clusters: InMemoryCluster[] = [];
  for (const { face, vec } of decoded) {
    if (vec.length === 0) continue;
    let joined: InMemoryCluster | null = null;
    for (const c of clusters) {
      if (cosine(vec, c.centroid) >= INITIAL_THRESHOLD) { joined = c; break; }
    }
    if (joined) {
      joined.memberFaceIds.push(face.id);
      joined.memberVecs.push(vec);
      const n = joined.memberFaceIds.length;
      const nc = new Float32Array(joined.centroid.length);
      for (let i = 0; i < nc.length; i++) nc[i] = (joined.centroid[i] * (n - 1) + vec[i]) / n;
      normalize(nc);
      joined.centroid = nc;
    } else {
      if ((face.quality ?? 0) < SEED_QUALITY_FLOOR) continue;
      clusters.push({
        centroid: new Float32Array(vec),
        memberFaceIds: [face.id],
        memberVecs: [vec],
      });
    }
  }

  console.log(`[face-clustering] total faces: ${faces.length}`);
  console.log(`[face-clustering] clusters after pass 1: ${clusters.length}`);

  // ---- Pass 2: centroid merge ----
  let merged = true;
  while (merged && clusters.length > 1) {
    merged = false;
    let bestI = -1, bestJ = -1, bestSim = MERGE_THRESHOLD;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const sim = cosine(clusters[i].centroid, clusters[j].centroid);
        if (sim > bestSim) { bestSim = sim; bestI = i; bestJ = j; }
      }
    }
    if (bestI >= 0) {
      clusters[bestI] = mergeClusters(clusters[bestI], clusters[bestJ]);
      clusters.splice(bestJ, 1);
      merged = true;
    }
  }
  console.log(`[face-clustering] clusters after pass 2 (centroid merge): ${clusters.length}`);

  // ---- Pass 3: single-linkage merge ----
  merged = true;
  while (merged && clusters.length > 1) {
    merged = false;
    let bestI = -1, bestJ = -1, bestSim = LINKAGE_THRESHOLD;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const sim = maxFacePairCosine(clusters[i], clusters[j]);
        if (sim > bestSim) { bestSim = sim; bestI = i; bestJ = j; }
      }
    }
    if (bestI >= 0) {
      clusters[bestI] = mergeClusters(clusters[bestI], clusters[bestJ]);
      clusters.splice(bestJ, 1);
      merged = true;
    }
  }
  console.log(`[face-clustering] clusters after pass 3 (linkage merge): ${clusters.length}`);

  // ---- Match new clusters to preserved existing clusters ----
  // Greedy: sort new clusters by size descending; for each, pick the best
  // available preserved match with centroid cosine >= CLUSTER_MATCH_THRESHOLD.
  const newToExistingId = new Map<number, number>();  // index in clusters → existing.id
  const claimedExistingIds = new Set<number>();
  const sortedIdx = clusters.map((_, i) => i).sort((a, b) => clusters[b].memberFaceIds.length - clusters[a].memberFaceIds.length);
  for (const idx of sortedIdx) {
    const nc = clusters[idx];
    let bestId = -1, bestSim = CLUSTER_MATCH_THRESHOLD;
    for (const p of preserved) {
      if (claimedExistingIds.has(p.id)) continue;
      const sim = cosine(nc.centroid, p.centroid);
      if (sim > bestSim) { bestSim = sim; bestId = p.id; }
    }
    if (bestId >= 0) {
      newToExistingId.set(idx, bestId);
      claimedExistingIds.add(bestId);
    }
  }
  console.log(`[face-clustering] matched ${newToExistingId.size} new cluster(s) to preserved existing`);

  // ---- Persist ----
  // 1. Reset all face.cluster_id for the project (clean slate).
  await resetFaceClustersForProject(projectId);
  // 2. Delete all existing clusters that weren't claimed by the new match.
  //    Unclaimed unnamed/unpinned clusters: silently dropped. Unclaimed
  //    named/pinned clusters: deleted too (the user's named person no
  //    longer matches any cluster — could happen if they removed all
  //    photos of that person; deleting is the right behavior).
  for (const ec of existingClusters) {
    if (!claimedExistingIds.has(ec.id)) {
      await deletePersonCluster(ec.id);
    }
  }
  // 3. For each new cluster: use the matched id if available, otherwise
  //    insert a fresh one. Then set all member faces.
  for (let i = 0; i < clusters.length; i++) {
    let clusterId: number;
    const matched = newToExistingId.get(i);
    if (matched !== undefined) {
      clusterId = matched;
    } else {
      clusterId = await insertPersonCluster(projectId);
    }
    for (const fid of clusters[i].memberFaceIds) {
      await setFaceCluster(fid, clusterId);
    }
  }
}
