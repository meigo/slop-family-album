import { readFile, mkdir, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { AlbumManifest, type PhotoEntry } from "./manifest.ts";

const { values } = parseArgs({
  options: {
    manifest: { type: "string" },
    raw: { type: "string" },
    out: { type: "string" },
    quality: { type: "string", default: "88" },
  },
});

if (!values.manifest) throw new Error("--manifest is required");
if (!values.raw) throw new Error("--raw is required");
if (!values.out) throw new Error("--out is required");

const manifest = AlbumManifest.parse(JSON.parse(await readFile(resolve(values.manifest), "utf8")));
const rawDir = resolve(values.raw);
const outDir = resolve(values.out);
const jpegQuality = Number(values.quality);

await mkdir(outDir, { recursive: true });

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function processOne(photo: PhotoEntry): Promise<"ok" | "missing"> {
  const srcCandidates = [
    join(rawDir, `${photo.id}.png`),
    join(rawDir, `${photo.duplicateOf ?? photo.id}.png`),
  ];
  const src = (await Promise.all(srcCandidates.map(async (p) => ((await exists(p)) ? p : null)))).find(Boolean) ?? null;
  if (!src) return "missing";

  let pipeline = sharp(src);
  const quality = photo.quality;

  if (quality.includes("blurry")) pipeline = pipeline.blur(8);
  if (quality.includes("dark")) pipeline = pipeline.linear(0.4, -20);
  if (quality.includes("overexposed")) pipeline = pipeline.linear(1.6, 30);

  const monthFolder = photo.date.slice(0, 7).replace(":", "/");
  const dest = join(outDir, monthFolder, photo.filename);
  await mkdir(resolve(dest, ".."), { recursive: true });
  await pipeline.jpeg({ quality: jpegQuality, mozjpeg: true }).toFile(dest);
  return "ok";
}

let ok = 0;
let missing = 0;
for (const photo of manifest.photos) {
  const result = await processOne(photo);
  if (result === "ok") ok += 1;
  else missing += 1;
}
console.log(`Postprocess: ${ok} written, ${missing} missing raw inputs.`);
