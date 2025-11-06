import sanitizeFilename from "sanitize-filename";

/**
 * @param {string} slug
 * @param {string} [joiner="/"]
 * @returns {string}
 */
export function slugToFolder(slug, joiner = "/") {
  return (
    slug
      // We have slugs with these special characters that would be
      // removed by the sanitizeFilename() function. What might then
      // happen is that it leads to two *different slugs* becoming
      // *same* folder name.
      .replace(/\*/g, "_star_")
      .replace(/::/g, "_doublecolon_")
      .replace(/:/g, "_colon_")
      .replace(/\?/g, "_question_")

      .toLowerCase()
      .split("/")
      .map((input) => sanitizeFilename(input))
      .join(joiner)
  );
}

/**
 * @param {string} path
 * @returns {string}
 */
export function decodePath(path) {
  const decoded = path.split("/").map((element) => decodeURIComponent(element)).join("/");
  return decoded;
}

/**
 * @param {string} path
 * @returns {string}
 */
export function encodePath(path) {
  const decoded = path.split("/").map((element) => encodeURIComponent(element)).join("/");
  return decoded;
}
