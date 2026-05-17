import { readFile, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { exiftool } from "exiftool-vendored";
import { AlbumManifest, type PhotoEntry } from "./manifest.ts";

const { values } = parseArgs({
  options: {
    manifest: { type: "string" },
    album: { type: "string" },
  },
});

if (!values.manifest) throw new Error("--manifest is required");
if (!values.album) throw new Error("--album is required");

const manifest = AlbumManifest.parse(JSON.parse(await readFile(resolve(values.manifest), "utf8")));
const albumDir = resolve(values.album);

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function pathFor(photo: PhotoEntry): string {
  const monthFolder = photo.date.slice(0, 7).replace(":", "/");
  return join(albumDir, monthFolder, photo.filename);
}

async function writeExif(photo: PhotoEntry): Promise<void> {
  const path = pathFor(photo);
  if (!(await exists(path))) {
    console.warn(`[skip] missing ${path}`);
    return;
  }

  if (photo.quality.includes("no_exif") || photo.quality.includes("screenshot")) {
    await exiftool.deleteAllTags(path);
    return;
  }

  const date = photo.quality.includes("wrong_date")
    ? photo.date.replace(/^(\d{4})/, (y) => String(Number(y) - 1))
    : photo.date;

  const tags: Record<string, unknown> = {
    DateTimeOriginal: date,
    CreateDate: date,
    ModifyDate: date,
    OffsetTime: photo.timezone,
    OffsetTimeOriginal: photo.timezone,
    OffsetTimeDigitized: photo.timezone,
    Make: photo.camera.make,
    Model: photo.camera.model,
    Software: "slop-family-album fixtures",
    ImageDescription: `Synthetic ${photo.style} fixture: ${photo.event}`,
  };
  if (photo.camera.lensModel) tags.LensModel = photo.camera.lensModel;
  if (photo.gps) {
    const [lat, lon] = photo.gps;
    tags.GPSLatitude = Math.abs(lat);
    tags.GPSLatitudeRef = lat >= 0 ? "N" : "S";
    tags.GPSLongitude = Math.abs(lon);
    tags.GPSLongitudeRef = lon >= 0 ? "E" : "W";
  }

  await exiftool.write(path, tags, { writeArgs: ["-overwrite_original"] });
}

try {
  let ok = 0;
  for (const photo of manifest.photos) {
    await writeExif(photo);
    ok += 1;
  }
  console.log(`EXIF written for ${ok}/${manifest.photos.length} photos.`);
} finally {
  await exiftool.end();
}
