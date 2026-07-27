export function slugify(input) {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-") // works for Hindi/devanagari category names too
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || `cat-${Date.now()}`;
}
