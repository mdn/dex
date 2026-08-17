/**
 * @param {string} src
 * @returns {Promise<{status: number, buf: ArrayBuffer, contentType: string | null}>}
 */
export async function fetchImage(src) {
  const res = await fetch(src);
  const status = res.status;
  const buf = await res.arrayBuffer();
  const contentType = res.headers.get("content-type");
  return { status, buf, contentType };
}

/**
 * @param {string | null} contentType
 */
export function imageContentType(contentType) {
  const type = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (type.startsWith("image/") && !type.startsWith("image/svg")) {
    return type;
  }
  return;
}
