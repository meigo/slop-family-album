import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { AlbumManifest, type PhotoEntry, type PhotoStyle } from "./manifest.ts";
import { EVENTS, NEGATIVE_PROMPT, CAMERA_PROFILES } from "./events.ts";
import { makeRng, pick, pickWeighted, randInt, randSeed } from "./rng.ts";

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pad(n: number, width = 2): string {
  return n.toString().padStart(width, "0");
}

function formatExifDate(year: number, month: number, day: number, hour: number, minute: number, second: number): string {
  return `${year}:${pad(month)}:${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

function formatFilename(year: number, month: number, day: number, hour: number, minute: number, second: number): string {
  return `IMG_${year}${pad(month)}${pad(day)}_${pad(hour)}${pad(minute)}${pad(second)}.jpg`;
}

const { values } = parseArgs({
  options: {
    year: { type: "string", default: String(new Date().getFullYear()) },
    count: { type: "string", default: "300" },
    seed: { type: "string", default: "1" },
    style: { type: "string", default: "realistic" },
    name: { type: "string" },
    out: { type: "string" },
  },
});

const year = Number(values.year);
const count = Number(values.count);
const seed = Number(values.seed);
const style = values.style as PhotoStyle;
const name = values.name ?? `family-${year}`;
const out = resolve(values.out ?? `manifests/${name}.json`);

const rng = makeRng(seed);
const photos: PhotoEntry[] = [];

for (let i = 0; i < count; i++) {
  const event = pickWeighted(rng, EVENTS.map((e) => ({ value: e, weight: e.weight })));
  const camera = pickWeighted(rng, CAMERA_PROFILES.map((c) => ({ value: c.camera, weight: c.weight })));
  const location = pick(rng, event.locations);

  const month = randInt(rng, event.monthWindow[0], event.monthWindow[1]);
  const day = randInt(rng, 1, daysInMonth(year, month));
  const hour = randInt(rng, event.hourWindow[0], event.hourWindow[1]);
  const minute = randInt(rng, 0, 59);
  const second = randInt(rng, 0, 59);

  const peopleCount = randInt(rng, event.peopleRange[0], event.peopleRange[1]);
  const prompt = pick(rng, event.promptVariants);
  const filename = formatFilename(year, month, day, hour, minute, second);

  photos.push({
    id: `${year}_${event.key}_${pad(i, 4)}`,
    filename,
    date: formatExifDate(year, month, day, hour, minute, second),
    timezone: "+03:00",
    gps: location.gps,
    locationLabel: location.label,
    event: event.key,
    peopleCount,
    camera,
    style,
    quality: ["good"],
    prompt,
    negativePrompt: NEGATIVE_PROMPT,
    width: 1216,
    height: 832,
    seed: randSeed(rng),
  });
}

photos.sort((a, b) => a.date.localeCompare(b.date));

const manifest = AlbumManifest.parse({
  schemaVersion: 1,
  name,
  year,
  generatedAt: new Date().toISOString(),
  generatorSeed: seed,
  defaults: {
    timezone: "+03:00",
    camera: CAMERA_PROFILES[0].camera,
  },
  photos,
});

await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`Wrote ${photos.length} entries → ${out}`);
