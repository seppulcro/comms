import { cp, mkdir, watch } from "node:fs/promises";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

const outdir = "./client/dist";

await mkdir(outdir, { recursive: true });

async function buildFrontend() {
  const result = await Bun.build({
    entrypoints: ["./client/src/app.tsx"],
    outdir,
    target: "browser",
    minify: false,
    naming: "[name].js",
    external: [],
  });

  if (!result.success) {
    console.error("Frontend build failed:");
    for (const log of result.logs) console.error(log);
    return false;
  }

  const cssCopies = [
    { src: "node_modules/@webtui/css/dist/full.css", dest: join(outdir, "webtui.css") },
    { src: "node_modules/@webtui/theme-catppuccin/dist/index.css", dest: join(outdir, "catppuccin.css") },
    { src: "node_modules/@webtui/plugin-nf/dist/index.css", dest: join(outdir, "nerdfonts.css") },
  ];
  for (const { src, dest } of cssCopies) await cp(src, dest);

  console.log(`[dev] frontend rebuilt at ${new Date().toLocaleTimeString()}`);
  return true;
}

async function buildElectron() {
  const result = await Bun.build({
    entrypoints: ["./electron/main.ts", "./electron/preload.ts"],
    outdir: "./electron",
    target: "node",
    format: "cjs",
    naming: "[name].js",
    external: ["electron"],
  });

  if (!result.success) {
    console.error("Electron build failed:");
    for (const log of result.logs) console.error(log);
    return false;
  }

  console.log(`[dev] electron rebuilt at ${new Date().toLocaleTimeString()}`);
  return true;
}

// Initial builds
await buildFrontend();
await buildElectron();

// Electron process management
let electronProcess: ChildProcess | null = null;

// Forward CLI args after "--" to Electron (e.g. bun run dev -- --private)
const extraArgs = process.argv.slice(2);

function startElectron() {
  if (electronProcess) {
    electronProcess.kill();
    electronProcess = null;
  }

  electronProcess = spawn("./node_modules/.bin/electron", [".", ...extraArgs], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "development" },
  });

  electronProcess.on("close", (code) => {
    if (code !== null) {
      console.log(`[dev] electron exited with code ${code}`);
      process.exit(0);
    }
  });

  console.log("[dev] electron started");
}

startElectron();

// Watch frontend sources
const frontendWatcher = watch("./client/src", { recursive: true });
let frontendBuilding = false;

// Watch electron sources (only .ts files, ignore compiled .js)
const electronWatcher = watch("./electron", { recursive: true });
let electronBuilding = false;

async function watchFrontend() {
  for await (const _event of frontendWatcher) {
    if (!frontendBuilding) {
      frontendBuilding = true;
      setTimeout(async () => {
        await buildFrontend();
        frontendBuilding = false;
      }, 100);
    }
  }
}

async function watchElectronSrc() {
  for await (const event of electronWatcher) {
    if (event.filename && !event.filename.endsWith(".ts")) continue;
    if (!electronBuilding) {
      electronBuilding = true;
      setTimeout(async () => {
        const ok = await buildElectron();
        if (ok) startElectron();
        electronBuilding = false;
      }, 100);
    }
  }
}

watchFrontend();
watchElectronSrc();
