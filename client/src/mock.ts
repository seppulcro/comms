// Browser test mode: load with ?mock to inject electronAPI stub
// Usage: open app.html?mock in a browser (no Electron needed)
if (new URLSearchParams(location.search).has('mock')) {
  const id = 'test-' + Math.random().toString(36).slice(2, 8)
  ;(window as any).electronAPI = {
    getIdentity: async () => ({ peer_id: id, display_name: 'TestUser' }),
    setDisplayName: async () => {},
    registerPttKey: async () => {},
    onPttDown: () => {},
    onPttUp: () => {},
    removePttListeners: () => {},
    checkForUpdates: async () => null,
    setMicState: () => {},
    copyToClipboard: (text: string) => navigator.clipboard.writeText(text),
  }
  console.log('[mock] electronAPI injected — browser test mode')
}
