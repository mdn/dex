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
  // `Headers.get` joins duplicates with ", ", so a comma means ambiguity.
  if (!contentType || contentType.includes(",")) {
    return;
  }
  // SVG is excluded as it can carry JavaScript.
  const type = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return type && /^image\/(apng|avif|gif|jpeg|png|webp)$/.test(type)
    ? type
    : undefined;
}
