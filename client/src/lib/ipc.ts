export async function getIdentity(): Promise<{ peer_id: string; display_name: string }> {
  return window.electronAPI.getIdentity()
}

export async function setDisplayName(name: string): Promise<void> {
  return window.electronAPI.setDisplayName(name)
}
