/** Base64-encode a zip's raw bytes for POST /skills/import's `content_base64`.
 *  Manual byte-string loop + btoa — no new client dep needed just for base64. */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/** Whether a chosen file looks like a zip archive (by name — the browser's
 *  reported MIME type for .zip is unreliable across OSes). */
export function isZipFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".zip");
}
