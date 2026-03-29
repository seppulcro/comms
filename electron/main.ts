import { app, BrowserWindow, clipboard, ipcMain, globalShortcut, session, Tray, Menu, nativeImage } from "electron";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

// app.getAppPath() resolves correctly at runtime in both dev and packaged builds.
// Do NOT use __dirname — bundlers inline it as a literal build-machine path.
const APP_ROOT = app.getAppPath();
const ELECTRON_DIR = path.join(APP_ROOT, "electron");

// uiohook-napi: optional — gracefully degrade if native module fails to load
let uIOhook: any = null;
let UiohookKey: any = {};
try {
  const mod = require("uiohook-napi");
  uIOhook = mod.uIOhook;
  UiohookKey = mod.UiohookKey;
} catch (e) {
  console.warn("uiohook-napi not available — global PTT disabled:", (e as Error).message);
}

// ---------------------------------------------------------------------------
// Platform flags — must run before app.whenReady()
// ---------------------------------------------------------------------------
if (process.platform === "linux") {
  process.env.ELECTRON_OZONE_PLATFORM_HINT ??= "auto";
  app.commandLine.appendSwitch("enable-features", "WebRTCPipeWireCapturer");
}

// ---------------------------------------------------------------------------
// Private mode: -p or --private → in-memory session (like incognito)
// ---------------------------------------------------------------------------
const isPrivate = process.argv.includes("-p") || process.argv.includes("--private");

// ---------------------------------------------------------------------------
// Identity persistence
// ---------------------------------------------------------------------------
interface Identity {
  peer_id: string;
  display_name: string;
}

function identityPath(): string {
  return path.join(app.getPath("userData"), "identity.json");
}

function loadIdentity(): Identity {
  if (isPrivate) {
    return { peer_id: randomUUID(), display_name: "Anonymous" };
  }
  try {
    return JSON.parse(fs.readFileSync(identityPath(), "utf-8"));
  } catch {
    const id: Identity = { peer_id: randomUUID(), display_name: "Anonymous" };
    fs.mkdirSync(path.dirname(identityPath()), { recursive: true });
    fs.writeFileSync(identityPath(), JSON.stringify(id, null, 2));
    return id;
  }
}

function saveIdentity(id: Identity): void {
  if (isPrivate) return;
  fs.writeFileSync(identityPath(), JSON.stringify(id, null, 2));
}

// ---------------------------------------------------------------------------
// Key-code translation (KeyboardEvent.code → uiohook keycode)
// ---------------------------------------------------------------------------
const DOM_TO_UIOHOOK: Record<string, number> = {
  KeyA: UiohookKey.A, KeyB: UiohookKey.B, KeyC: UiohookKey.C, KeyD: UiohookKey.D,
  KeyE: UiohookKey.E, KeyF: UiohookKey.F, KeyG: UiohookKey.G, KeyH: UiohookKey.H,
  KeyI: UiohookKey.I, KeyJ: UiohookKey.J, KeyK: UiohookKey.K, KeyL: UiohookKey.L,
  KeyM: UiohookKey.M, KeyN: UiohookKey.N, KeyO: UiohookKey.O, KeyP: UiohookKey.P,
  KeyQ: UiohookKey.Q, KeyR: UiohookKey.R, KeyS: UiohookKey.S, KeyT: UiohookKey.T,
  KeyU: UiohookKey.U, KeyV: UiohookKey.V, KeyW: UiohookKey.W, KeyX: UiohookKey.X,
  KeyY: UiohookKey.Y, KeyZ: UiohookKey.Z,
  Digit0: UiohookKey[0], Digit1: UiohookKey[1], Digit2: UiohookKey[2],
  Digit3: UiohookKey[3], Digit4: UiohookKey[4], Digit5: UiohookKey[5],
  Digit6: UiohookKey[6], Digit7: UiohookKey[7], Digit8: UiohookKey[8],
  Digit9: UiohookKey[9],
  Space: UiohookKey.Space, Enter: UiohookKey.Enter, Escape: UiohookKey.Escape,
  Tab: UiohookKey.Tab, Backspace: UiohookKey.Backspace, CapsLock: UiohookKey.CapsLock,
  Delete: UiohookKey.Delete, Insert: UiohookKey.Insert, Home: UiohookKey.Home,
  End: UiohookKey.End, PageUp: UiohookKey.PageUp, PageDown: UiohookKey.PageDown,
  ArrowUp: UiohookKey.ArrowUp, ArrowDown: UiohookKey.ArrowDown,
  ArrowLeft: UiohookKey.ArrowLeft, ArrowRight: UiohookKey.ArrowRight,
};

let pttKeyCode: number = UiohookKey.V;

function translateKeyCode(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const map: Record<string, string> = {
    Space: "Space", Enter: "Return", Escape: "Escape",
    ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
  };
  return map[code] ?? code;
}

// ---------------------------------------------------------------------------
// Window & Tray
// ---------------------------------------------------------------------------
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let identity: Identity;

function trayIconPath(active: boolean): string {
  const name = active ? "tray-active.png" : "tray.png";
  // In packaged app, icons are in extraResources/icons/
  const packed = path.join(process.resourcesPath, "icons", name);
  if (fs.existsSync(packed)) return packed;
  return path.join(ELECTRON_DIR, "icons", name);
}

function createWindow(): void {
  // In-memory partition: no "persist:" prefix = ephemeral (cleared on exit)
  const ses = isPrivate
    ? session.fromPartition(`private-${randomUUID()}`)
    : session.defaultSession;

  // Auto-grant WebRTC permissions (mic, camera, screen share)
  ses.setPermissionRequestHandler((_wc, permission, cb) => {
    const allowed = ["media", "display-capture", "mediaKeySystem"];
    cb(allowed.includes(permission));
  });

  ses.setPermissionCheckHandler((_wc, permission) => {
    const allowed = ["media", "display-capture", "mediaKeySystem"];
    return allowed.includes(permission);
  });

  // Screen capture: use system picker where available, fallback to first screen
  try {
    ses.setDisplayMediaRequestHandler(async (_request, callback) => {
      try {
        const { desktopCapturer } = require("electron");
        const sources = await desktopCapturer.getSources({ types: ["screen", "window"] });
        if (sources.length > 0) {
          callback({ video: sources[0] });
        } else {
          callback({});
        }
      } catch (e) {
        console.error('Screen share failed:', e);
        callback({});
      }
    }, { useSystemPicker: process.platform !== 'win32' });
  } catch {
    // setDisplayMediaRequestHandler not available in this Electron version
  }

  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#1e1e2e",
    title: isPrivate ? "Comms (Private)" : "Comms",
    webPreferences: {
      preload: path.join(ELECTRON_DIR, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      session: ses,
    },
  });

  win.once("ready-to-show", () => {
    win!.show();
    if (process.argv.includes("--devtools")) win!.webContents.openDevTools();
  });
  win.webContents.on("did-fail-load", (_e, code, desc) => {
    console.error(`Failed to load: ${code} ${desc}`);
  });
  if (process.argv.includes("--verbose")) {
    win.webContents.on("console-message", (_e, _level, msg) => {
      console.log(`[renderer] ${msg}`);
    });
  }
  // Prevent broken system context menu on Windows titlebar (known Electron bug:
  // right-click menu appears but items don't work and can't be dismissed).
  if (process.platform === "win32") {
    win.on("system-context-menu", (e) => {
      e.preventDefault();
    });
  }

  win.loadFile(path.join(APP_ROOT, "client", "app.html"));
  win.on("closed", () => { win = null; });
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
function registerIpc(): void {
  ipcMain.handle("get-identity", () => ({
    peer_id: identity.peer_id,
    display_name: identity.display_name,
  }));

  ipcMain.handle("set-display-name", (_e, name: string) => {
    identity.display_name = name;
    saveIdentity(identity);
  });

  ipcMain.handle("register-ptt-key", (_e, keyCode: string) => {
    pttKeyCode = DOM_TO_UIOHOOK[keyCode] ?? UiohookKey.V;
  });

  ipcMain.on("mic-state", (_e, active: boolean) => {
    if (tray) {
      tray.setImage(nativeImage.createFromPath(trayIconPath(active)));
      tray.setToolTip(active ? "Comms — Mic Active" : "Comms");
    }
  });

  ipcMain.handle("check-for-updates", () => {});

  ipcMain.handle("copy-to-clipboard", (_e, text: string) => {
    clipboard.writeText(text);
  });
}

// ---------------------------------------------------------------------------
// Global keyboard hook (uiohook-napi) — works on Wayland + X11
// ---------------------------------------------------------------------------
function startInputHook(): void {
  if (!uIOhook) return;
  uIOhook.on("keydown", (e: any) => {
    if (e.keycode === pttKeyCode) {
      win?.webContents.send("ptt-down");
    }
  });
  uIOhook.on("keyup", (e: any) => {
    if (e.keycode === pttKeyCode) {
      win?.webContents.send("ptt-up");
    }
  });
  uIOhook.start();
}

// ---------------------------------------------------------------------------
// System tray — shows mic activity
// ---------------------------------------------------------------------------
function createTray(): void {
  const icon = nativeImage.createFromPath(trayIconPath(false));
  tray = new Tray(icon);
  tray.setToolTip("Comms");

  const contextMenu = Menu.buildFromTemplate([
    { label: "Show", click: () => win?.show() },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    if (win?.isVisible()) win.focus();
    else win?.show();
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("will-quit", () => {
  if (uIOhook) uIOhook.stop();
  globalShortcut.unregisterAll();
});

app.whenReady().then(() => {
  identity = loadIdentity();
  registerIpc();
  startInputHook();
  createTray();
  createWindow();
});
