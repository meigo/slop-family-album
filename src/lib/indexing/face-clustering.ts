import {
  listFacesByProject, setFaceCluster, clearPersonClusters, insertPersonCluster,
} from '$lib/db';

// Pass 1: face-to-centroid match threshold. Lower = more permissive joining.
const INITIAL_THRESHOLD = 0.30;

// Pass 2: cluster-centroid pairwise merge threshold. Higher than INITIAL_THRESHOLD
// because cluster centroids (averages over N faces) are more stable than
// individual face embeddings — stricter is safe and avoids false merges.
const MERGE_THRESHOLD = 0.36;

// Minimum face quality to seed a new cluster. Low-quality faces can still join
// existing clusters but won't create new ones.
const SEED_QUALITY_FLOOR = 0.1;

function decodeEmbedding(blob: Uint8Array): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;  // both are L2-normalized → dot product is cosine
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
}

function weightedMergeCentroid(a: InMemoryCluster, b: InMemoryCluster): Float32Array {
  const na = a.memberFaceIds.length;
  const nb = b.memberFaceIds.length;
  const out = new Float32Array(a.centroid.length);
  for (let k = 0; k < out.length; k++) {
    out[k] = (a.centroid[k] * na + b.centroid[k] * nb) / (na + nb);
  }
  normalize(out);
  return out;
}

export async function clusterFaces(projectId: number): Promise<void> {
  const faces = await listFacesByProject(projectId);
  if (faces.length === 0) {
    await clearPersonClusters(projectId);
    return;
  }

  const decoded = faces.map((f) => ({
    face: f,
    vec: decodeEmbedding(new Uint8Array(f.embedding)),
  }));

  // Sort by descending quality so high-quality faces seed clusters first.
  decoded.sort((a, b) => (b.face.quality ?? 0) - (a.face.quality ?? 0));

  // ---- Pass 1: greedy assignment ----
  const clusters: InMemoryCluster[] = [];
  for (const { face, vec } of decoded) {
    let joined: InMemoryCluster | null = null;
    for (const c of clusters) {
      if (cosine(vec, c.centroid) >= INITIAL_THRESHOLD) {
        joined = c;
        break;
      }
    }
    if (joined) {
      joined.memberFaceIds.push(face.id);
      const n = joined.memberFaceIds.length;
      const newCentroid = new Float32Array(joined.centroid.length);
      for (let i = 0; i < joined.centroid.length; i++) {
        newCentroid[i] = (joined.centroid[i] * (n - 1) + vec[i]) / n;
      }
      normalize(newCentroid);
      joined.centroid = newCentroid;
    } else {
      if ((face.quality ?? 0) < SEED_QUALITY_FLOOR) continue;
      clusters.push({
        centroid: new Float32Array(vec),
        memberFaceIds: [face.id],
      });
    }
  }

  // ---- Pass 2: centroid merge ----
  // Repeatedly find the most similar pair of clusters; if their centroid
  // similarity is at least MERGE_THRESHOLD, merge them. Stop when the best
  // pair falls below the threshold.
  let merged = true;
  while (merged && clusters.length > 1) {
    merged = false;
    let bestI = -1, bestJ = -1, bestSim = MERGE_THRESHOLD;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const sim = cosine(clusters[i].centroid, clusters[j].centroid);
        if (sim > bestSim) {
          bestSim = sim;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestI >= 0) {
      const newCentroid = weightedMergeCentroid(clusters[bestI], clusters[bestJ]);
      const newMembers = [...clusters[bestI].memberFaceIds, ...clusters[bestJ].memberFaceIds];
      clusters[bestI] = { centroid: newCentroid, memberFaceIds: newMembers };
      clusters.splice(bestJ, 1);
      merged = true;
    }
  }

  // ---- Pass 3: persist ----
  await clearPersonClusters(projectId);
  for (const c of clusters) {
    const dbId = await insertPersonCluster(projectId);
    for (const fid of c.memberFaceIds) {
      await setFaceCluster(fid, dbId);
    }
  }
}
