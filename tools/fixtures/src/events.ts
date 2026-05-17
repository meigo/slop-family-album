import type { Camera } from "./manifest.ts";

export type EventTemplate = {
  key: string;
  monthWindow: [number, number];
  hourWindow: [number, number];
  weight: number;
  peopleRange: [number, number];
  promptVariants: readonly string[];
  locations: readonly { label: string; gps: [number, number] }[];
};

const ESTONIA_LOCATIONS = [
  { label: "Tallinn, Estonia", gps: [59.437, 24.7536] as [number, number] },
  { label: "Tartu, Estonia", gps: [58.3776, 26.729] as [number, number] },
  { label: "Pärnu, Estonia", gps: [58.3859, 24.4971] as [number, number] },
  { label: "Otepää, Estonia", gps: [58.0588, 26.4969] as [number, number] },
];

export const EVENTS: readonly EventTemplate[] = [
  {
    key: "winter_walk",
    monthWindow: [1, 2],
    hourWindow: [11, 15],
    weight: 8,
    peopleRange: [2, 4],
    promptVariants: [
      "candid smartphone photo, winter walk with family, snowy park in Estonia, children wearing winter jackets, grey sky, ordinary family album snapshot, realistic phone image, slight motion blur",
      "casual phone photo of a family walking through a snowy forest path, late morning light, imperfect framing, realistic phone camera",
    ],
    locations: ESTONIA_LOCATIONS,
  },
  {
    key: "birthday_party",
    monthWindow: [1, 12],
    hourWindow: [14, 19],
    weight: 4,
    peopleRange: [3, 6],
    promptVariants: [
      "candid smartphone family photo, child's birthday party in a small home kitchen, cake on table, wrapping paper, ordinary family snapshot, slightly cluttered background, realistic phone camera, imperfect framing",
    ],
    locations: ESTONIA_LOCATIONS,
  },
  {
    key: "summer_trip",
    monthWindow: [6, 8],
    hourWindow: [10, 19],
    weight: 12,
    peopleRange: [2, 5],
    promptVariants: [
      "candid smartphone photo of a family on a summer trip in Estonia, near a river, casual framing, natural light, realistic phone photo",
      "phone snapshot of children playing outside, summer day, slightly imperfect composition, realistic phone camera",
    ],
    locations: ESTONIA_LOCATIONS,
  },
  {
    key: "beach_day",
    monthWindow: [6, 8],
    hourWindow: [11, 17],
    weight: 6,
    peopleRange: [2, 5],
    promptVariants: [
      "candid family beach photo on the Baltic coast, bright sunlight, children with sand toys, slightly overexposed, realistic phone camera",
    ],
    locations: [{ label: "Pärnu beach, Estonia", gps: [58.3796, 24.5043] }],
  },
  {
    key: "christmas_evening",
    monthWindow: [12, 12],
    hourWindow: [17, 22],
    weight: 5,
    peopleRange: [3, 7],
    promptVariants: [
      "casual indoor family photo, Christmas evening, warm room, tree lights in background, relatives sitting around table, realistic smartphone photo, imperfect composition, not professional",
    ],
    locations: ESTONIA_LOCATIONS,
  },
  {
    key: "school_morning",
    monthWindow: [1, 5],
    hourWindow: [7, 9],
    weight: 5,
    peopleRange: [1, 3],
    promptVariants: [
      "phone photo of a child with a backpack ready for school, hallway light, hurried framing, realistic phone camera",
    ],
    locations: ESTONIA_LOCATIONS,
  },
  {
    key: "playground",
    monthWindow: [4, 10],
    hourWindow: [11, 18],
    weight: 7,
    peopleRange: [1, 4],
    promptVariants: [
      "candid phone photo of children on a playground, swings and slides, casual framing, natural daylight, realistic phone camera",
    ],
    locations: ESTONIA_LOCATIONS,
  },
  {
    key: "pet_photo",
    monthWindow: [1, 12],
    hourWindow: [8, 22],
    weight: 4,
    peopleRange: [0, 2],
    promptVariants: [
      "phone photo of a family cat on a couch, indoor light, slightly blurry, realistic phone camera",
      "phone photo of a small dog in a kitchen, soft focus, candid moment",
    ],
    locations: ESTONIA_LOCATIONS,
  },
  {
    key: "family_dinner",
    monthWindow: [1, 12],
    hourWindow: [18, 21],
    weight: 5,
    peopleRange: [3, 6],
    promptVariants: [
      "candid family dinner phone photo, warm kitchen light, food on plates, casual framing, realistic phone camera",
    ],
    locations: ESTONIA_LOCATIONS,
  },
  {
    key: "messy_kitchen",
    monthWindow: [1, 12],
    hourWindow: [8, 21],
    weight: 2,
    peopleRange: [0, 3],
    promptVariants: [
      "phone photo of a slightly messy kitchen, dishes in sink, ordinary family moment, realistic phone camera",
    ],
    locations: ESTONIA_LOCATIONS,
  },
];

export const NEGATIVE_PROMPT =
  "studio portrait, fashion shoot, cinematic lighting, perfect skin, airbrushed, stock photo, advertisement, surreal, extra fingers, distorted face, watermark, text";

export const CAMERA_PROFILES: readonly { camera: Camera; weight: number }[] = [
  { camera: { make: "Apple", model: "iPhone 13", lensModel: "iPhone 13 back dual wide camera" }, weight: 5 },
  { camera: { make: "Apple", model: "iPhone 14 Pro", lensModel: "iPhone 14 Pro back triple camera" }, weight: 3 },
  { camera: { make: "samsung", model: "SM-S911B" }, weight: 3 },
  { camera: { make: "Google", model: "Pixel 7" }, weight: 2 },
];
