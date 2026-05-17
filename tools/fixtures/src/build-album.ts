import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { resolve } from "node:path";

const { values } = parseArgs({
  options: {
    manifest: { type: "string" },
    workflow: { type: "string", default: "workflow.json" },
    overrides: { type: "string", default: "workflow.overrides.json" },
    out: { type: "string" },
    host: { type: "string", default: "http://127.0.0.1:8188" },
    concurrency: { type: "string", default: "1" },
    skipComfy: { type: "boolean", default: false },
  },
});

if (!values.manifest) throw new Error("--manifest is required");
if (!values.out) throw new Error("--out is required");

const manifest = resolve(values.manifest);
const outDir = resolve(values.out);
const rawDir = `${outDir}/raw`;

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
    child.on("exit", (code) => (code === 0 ? resolveP() : rejectP(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });
}

const tsx = ["npx", "tsx"];

if (!values.skipComfy) {
  await run(tsx[0], [
    tsx[1],
    "src/run-comfy.ts",
    "--manifest", manifest,
    "--workflow", values.workflow!,
    "--overrides", values.overrides!,
    "--out", rawDir,
    "--host", values.host!,
    "--concurrency", values.concurrency!,
  ]);
}

await run(tsx[0], [tsx[1], "src/postprocess.ts", "--manifest", manifest, "--raw", rawDir, "--out", outDir]);
await run(tsx[0], [tsx[1], "src/write-exif.ts", "--manifest", manifest, "--album", outDir]);

console.log(`Album built at ${outDir}`);
