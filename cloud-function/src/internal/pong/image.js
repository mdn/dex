/**
 * @param {string} src
 * @returns {Promise<{status: number, buf: ArrayBuffer, contentType: string | null}>}
 */
export async function fetchImage(src) {
  return fetchUpstream(
    src,
    { source: "advertising", operation: "image" },
    async (res) => ({
      status: res.status,
      buf: await res.arrayBuffer(),
      contentType: res.headers.get("content-type"),
    })
  );
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
import { fetchUpstream } from "../../logging.js";
