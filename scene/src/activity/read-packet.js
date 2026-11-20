// Verify the published bytes before displaying recorded or fitted values.
export async function readPacket(file, expectedHash) {
  const response = await fetch(new URL(file, import.meta.url));
  if (!response.ok) throw new Error('Recording unavailable');
  const bytes = await response.arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== expectedHash) throw new Error('Recording changed');
  return JSON.parse(new TextDecoder().decode(bytes));
}
