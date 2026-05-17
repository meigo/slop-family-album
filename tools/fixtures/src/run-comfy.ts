// ComfyUI client — submits per-photo prompts to a local ComfyUI instance and
// downloads the generated PNGs. Mirrors the workflow-template + node_overrides
// pattern used in slop-opera-factory's ComfyUIClient (verified against
// ComfyUI server source 2026-05-04):
//   1. POST {host}/prompt   body: {"prompt": <workflow>, "client_id": <uuid>}
//        → {"prompt_id": "...", "node_errors": {}}
//        node_errors non-empty means rejected before queueing — checked.
//   2. GET  {host}/history/{prompt_id}   (poll)
//        → {} while queued/running; {<prompt_id>: {outputs: {...}}} when done.
//   3. GET  {host}/view?filename=...&subfolder=...&type=output → bytes.
//
// The workflow JSON is the raw API-format export from ComfyUI ("Save (API
// Format)"). A sibling overrides JSON maps {kind → node-id} for the nodes
// whose inputs we override per photo: prompt, negative, seed, width, height.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { request } from "undici";
import { AlbumManifest, type PhotoEntry } from "./manifest.ts";

type OverrideKind = "prompt" | "negative" | "seed" | "width" | "height";
type Overrides = Partial<Record<OverrideKind, string>>;
type Workflow = Record<string, { inputs?: Record<string, unknown>; class_type?: string }>;

const { values } = parseArgs({
  options: {
    manifest: { type: "string" },
    workflow: { type: "string", default: "workflow.json" },
    overrides: { type: "string", default: "workflow.overrides.json" },
    out: { type: "string" },
    host: { type: "string", default: "http://127.0.0.1:8188" },
    concurrency: { type: "string", default: "1" },
    timeoutMs: { type: "string", default: String(5 * 60_000) },
  },
});

if (!values.manifest) throw new Error("--manifest is required");
if (!values.out) throw new Error("--out is required");

const manifestPath = resolve(values.manifest);
const workflowPath = resolve(values.workflow!);
const overridesPath = resolve(values.overrides!);
const outDir = resolve(values.out);
const host = values.host!.replace(/\/$/, "");
const timeoutMs = Number(values.timeoutMs);
const clientId = randomUUID();

const manifest = AlbumManifest.parse(JSON.parse(await readFile(manifestPath, "utf8")));
const workflowTemplate: Workflow = JSON.parse(await readFile(workflowPath, "utf8"));
const overrides: Overrides = JSON.parse(await readFile(overridesPath, "utf8"));

for (const [kind, nodeId] of Object.entries(overrides)) {
  if (!nodeId) continue;
  if (!(nodeId in workflowTemplate)) {
    throw new Error(`overrides.${kind} points at node ${JSON.stringify(nodeId)} which is not in ${workflowPath}`);
  }
}

await mkdir(outDir, { recursive: true });

function applyOverrides(photo: PhotoEntry): Workflow {
  const workflow: Workflow = JSON.parse(JSON.stringify(workflowTemplate));
  const assign = (kind: OverrideKind, apply: (inputs: Record<string, unknown>) => void) => {
    const nodeId = overrides[kind];
    if (!nodeId) return;
    const inputs = (workflow[nodeId].inputs ??= {});
    apply(inputs);
  };
  assign("prompt", (inputs) => { inputs.text = photo.prompt; });
  assign("negative", (inputs) => { inputs.text = photo.negativePrompt ?? ""; });
  // Some samplers expose `seed`, others `noise_seed` — set both, the
  // irrelevant one is ignored.
  assign("seed", (inputs) => { inputs.seed = photo.seed; inputs.noise_seed = photo.seed; });
  assign("width", (inputs) => { inputs.width = photo.width; });
  assign("height", (inputs) => { inputs.height = photo.height; });
  return workflow;
}

async function submitPrompt(workflow: Workflow): Promise<string> {
  const res = await request(`${host}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  const text = await res.body.text();
  if (res.statusCode >= 400) {
    throw new Error(`ComfyUI /prompt HTTP ${res.statusCode}. Body:\n${text}`);
  }
  const body = JSON.parse(text) as { prompt_id?: string; node_errors?: unknown };
  if (body.node_errors && Object.keys(body.node_errors as object).length > 0) {
    throw new Error(`ComfyUI rejected workflow:\n${JSON.stringify(body.node_errors, null, 2)}`);
  }
  if (!body.prompt_id) throw new Error(`ComfyUI /prompt missing prompt_id. Body: ${text}`);
  return body.prompt_id;
}

type HistoryEntry = { outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }> };

async function waitForHistory(promptId: string): Promise<HistoryEntry> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request(`${host}/history/${promptId}`);
    const body = (await res.body.json()) as Record<string, HistoryEntry>;
    if (body[promptId]) return body[promptId];
    await sleep(1000);
  }
  throw new Error(`ComfyUI history timeout for ${promptId} after ${timeoutMs}ms`);
}

async function downloadFirstImage(entry: HistoryEntry, destPath: string): Promise<void> {
  const outputs = entry.outputs ?? {};
  for (const node of Object.values(outputs)) {
    const img = node.images?.[0];
    if (!img) continue;
    const url = `${host}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}`;
    const res = await request(url);
    if (res.statusCode >= 300) throw new Error(`ComfyUI /view ${res.statusCode}`);
    await writeFile(destPath, Buffer.from(await res.body.arrayBuffer()));
    return;
  }
  throw new Error("ComfyUI history complete but no images in outputs");
}

const concurrency = Math.max(1, Number(values.concurrency));
const queue = [...manifest.photos];
let done = 0;
let failed = 0;

async function worker() {
  while (queue.length) {
    const photo = queue.shift();
    if (!photo) return;
    const dest = join(outDir, `${photo.id}.png`);
    try {
      const promptId = await submitPrompt(applyOverrides(photo));
      const entry = await waitForHistory(promptId);
      await downloadFirstImage(entry, dest);
      done += 1;
      console.log(`[${done + failed}/${manifest.photos.length}] ${photo.id} → ${dest}`);
    } catch (err) {
      failed += 1;
      console.error(`[fail ${photo.id}]`, err instanceof Error ? err.message : err);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
console.log(`Done. ${done} succeeded, ${failed} failed, ${manifest.photos.length - done - failed} skipped.`);
