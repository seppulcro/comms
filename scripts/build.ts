import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { webtuiPlugin } from "./webtui-plugin";

const outdir = "./client/dist";
const isProduction = process.env.NODE_ENV === "production";

await mkdir(outdir, { recursive: true });

// --- Frontend build ---

const result = await Bun.build({
  entrypoints: ["./client/src/app.tsx", "./client/src/mock.ts"],
  outdir,
  target: "browser",
  minify: isProduction,
  naming: "[name].js",
  external: [],
  plugins: [webtuiPlugin],
});

if (!result.success) {
  console.error("Frontend build failed:");
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const cssCopies = [
  {
    src: "node_modules/@webtui/css/dist/full.css",
    dest: join(outdir, "webtui.css"),
  },
  {
    src: "node_modules/@webtui/theme-catppuccin/dist/index.css",
    dest: join(outdir, "catppuccin.css"),
  },
  {
    src: "node_modules/@webtui/plugin-nf/dist/index.css",
    dest: join(outdir, "nerdfonts.css"),
  },
];

for (const { src, dest } of cssCopies) {
  await cp(src, dest);
}

// --- Electron build ---

const electronResult = await Bun.build({
  entrypoints: ["./electron/main.ts", "./electron/preload.ts"],
  outdir: "./electron",
  target: "node",
  format: "cjs",
  minify: isProduction,
  naming: "[name].js",
  external: ["electron", "uiohook-napi"],
});

if (!electronResult.success) {
  console.error("Electron build failed:");
  for (const log of electronResult.logs) console.error(log);
  process.exit(1);
}

// --- Summary ---

console.log("\n  Build complete:\n");
for (const output of result.outputs) {
  const size = (output.size / 1024).toFixed(1);
  console.log(`  ${output.path}  ${size} kB`);
}
for (const { dest } of cssCopies) {
  const file = Bun.file(dest);
  const size = (file.size / 1024).toFixed(1);
  console.log(`  ${dest}  ${size} kB`);
}
for (const output of electronResult.outputs) {
  const size = (output.size / 1024).toFixed(1);
  console.log(`  ${output.path}  ${size} kB`);
}
console.log();
