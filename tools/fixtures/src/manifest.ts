import { z } from "zod";

export const PhotoStyle = z.enum(["realistic", "puppet", "failure"]);
export type PhotoStyle = z.infer<typeof PhotoStyle>;

export const Camera = z.object({
  make: z.string(),
  model: z.string(),
  lensModel: z.string().optional(),
});
export type Camera = z.infer<typeof Camera>;

export const Quality = z.enum([
  "good",
  "blurry",
  "dark",
  "overexposed",
  "duplicate",
  "near_duplicate",
  "screenshot",
  "no_exif",
  "wrong_date",
]);
export type Quality = z.infer<typeof Quality>;

export const PhotoEntry = z.object({
  id: z.string(),
  filename: z.string(),
  date: z.string(),
  timezone: z.string(),
  gps: z.tuple([z.number(), z.number()]).nullable(),
  locationLabel: z.string().optional(),
  event: z.string(),
  peopleCount: z.number().int().min(0),
  camera: Camera,
  style: PhotoStyle,
  quality: z.array(Quality).default(["good"]),
  prompt: z.string(),
  negativePrompt: z.string().optional(),
  width: z.number().int().default(1216),
  height: z.number().int().default(832),
  seed: z.number().int(),
  duplicateOf: z.string().optional(),
});
export type PhotoEntry = z.infer<typeof PhotoEntry>;

export const AlbumManifest = z.object({
  schemaVersion: z.literal(1),
  name: z.string(),
  year: z.number().int(),
  generatedAt: z.string(),
  generatorSeed: z.number().int(),
  defaults: z.object({
    timezone: z.string(),
    camera: Camera,
  }),
  photos: z.array(PhotoEntry),
});
export type AlbumManifest = z.infer<typeof AlbumManifest>;
