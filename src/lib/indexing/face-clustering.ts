import {
  listFacesByProject, setFaceCluster, clearPersonClusters, insertPersonCluster,
} from '$lib/db';

// SFace cosine-similarity threshold for "same person". 0.363 is the
// commonly cited cutoff in OpenCV's docs; we use 0.4 (slightly stricter)
// to bias toward fewer false merges. Tune in Phase 2c.
const COSINE_THRESHOLD = 0.4;

function decodeEmbedding(blob: Uint8Array): Float32Array {
  // Embeddings are stored as float32 little-endian
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;  // embeddings are L2-normalized, so dot product == cosine
}

/** Greedy clustering: each face joins the first existing cluster whose
 *  centroid is within COSINE_THRESHOLD. New clusters are seeded with
 *  faces above a minimum quality threshold (avoids tiny / low-quality
 *  faces seeding spurious clusters).
 *
 *  This is intentionally simple — Phase 2c may upgrade to a proper
 *  DBSCAN or HDBSCAN if quality demands.
 */
export async function clusterFaces(projectId: number): Promise<void> {
  // Reset cluster assignments: drop all clusters, ON DELETE SET NULL
  // empties face.cluster_id automatically.
  await clearPersonClusters(projectId);

  const faces = await listFacesByProject(projectId);
  if (faces.length === 0) return;

  // Decode embeddings once.
  const decoded = faces.map((f) => ({
    face: f,
    vec: decodeEmbedding(new Uint8Array(f.embedding)),
  }));

  // Sort by descending quality so high-quality faces seed clusters first.
  decoded.sort((a, b) => (b.face.quality ?? 0) - (a.face.quality ?? 0));

  interface Cluster {
    id: number;            // person_cluster.id
    centroid: Float32Array;
    memberFaceIds: number[];
  }
  const clusters: Cluster[] = [];

  for (const { face, vec } of decoded) {
    let joined: Cluster | null = null;
    for (const c of clusters) {
      if (cosine(vec, c.centroid) >= COSINE_THRESHOLD) {
        joined = c;
        break;
      }
    }
    if (joined) {
      joined.memberFaceIds.push(face.id);
      // Update centroid as running mean
      const n = joined.memberFaceIds.length;
      const newCentroid = new Float32Array(joined.centroid.length);
      for (let i = 0; i < joined.centroid.length; i++) {
        newCentroid[i] = (joined.centroid[i] * (n - 1) + vec[i]) / n;
      }
      // Re-normalize centroid for next cosine comparison
      let norm = 0;
      for (let i = 0; i < newCentroid.length; i++) norm += newCentroid[i] * newCentroid[i];
      norm = Math.sqrt(norm);
      if (norm > 0) for (let i = 0; i < newCentroid.length; i++) newCentroid[i] /= norm;
      joined.centroid = newCentroid;
      await setFaceCluster(face.id, joined.id);
    } else {
      // Skip seeding clusters from low-quality faces; they'll stay unclustered.
      if ((face.quality ?? 0) < 0.1) continue;
      const newId = await insertPersonCluster(projectId);
      clusters.push({
        id: newId,
        centroid: new Float32Array(vec),
        memberFaceIds: [face.id],
      });
      await setFaceCluster(face.id, newId);
    }
  }
}
