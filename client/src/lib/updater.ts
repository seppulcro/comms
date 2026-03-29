export async function checkForUpdates() {
  try {
    if (typeof window !== 'undefined' && 'electronAPI' in window) {
      await window.electronAPI.checkForUpdates()
    }
  } catch (e) {
    console.error('Update check failed:', e)
  }
}
