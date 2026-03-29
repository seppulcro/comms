export interface ElectronAPI {
  getIdentity(): Promise<{ peer_id: string; display_name: string }>;
  setDisplayName(name: string): Promise<void>;
  registerPttKey(key: string): Promise<void>;
  onPttDown(callback: () => void): void;
  onPttUp(callback: () => void): void;
  removePttListeners(): void;
  checkForUpdates(): Promise<void>;
  setMicState(active: boolean): void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
