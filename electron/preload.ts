import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getIdentity: () => ipcRenderer.invoke("get-identity"),

  setDisplayName: (name: string) => ipcRenderer.invoke("set-display-name", name),

  registerPttKey: (key: string) => ipcRenderer.invoke("register-ptt-key", key),

  onPttDown: (callback: () => void) => {
    ipcRenderer.on("ptt-down", callback);
  },

  onPttUp: (callback: () => void) => {
    ipcRenderer.on("ptt-up", callback);
  },

  removePttListeners: () => {
    ipcRenderer.removeAllListeners("ptt-down");
    ipcRenderer.removeAllListeners("ptt-up");
  },

  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),

  setMicState: (active: boolean) => ipcRenderer.send("mic-state", active),

  copyToClipboard: (text: string) => ipcRenderer.invoke("copy-to-clipboard", text),
});
