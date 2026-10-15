// Output-escaping for assembler interpolation. Owner nouns and model nouns are
// DATA; these two functions are the only sanctioned way either reaches console
// bytes:
//   esc()  — into markup (text nodes, attribute-safe: escapes quotes too)
//   jstr() — into the console's <script> seed (JSON that cannot break out:
//            <, >, &, and line separators are \u-escaped, so "</script>"
//            inside a name stays a string instead of closing the block)
// Every other interpolation path (raw JSON.stringify, raw template holes) is
// a defect waiting for the first hostile or merely unlucky noun.
const ESC_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape a value for interpolation into HTML text or a double/single-quoted attribute. */
export function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

const SHORT_ESCAPES: Record<string, string> = {
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

/**
 * JSON for embedding inside a <script> block: identical to JSON.stringify for
 * every honest input, but `<`, `>`, `&` and U+2028/2029 are \u-escaped so the
 * emitted text can never contain `</script>`, comment tokens, or entity
 * breakpoints — the seed stays a string no matter what the noun contains.
 */
export function jstr(v: unknown): string {
  return JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/[\u2028\u2029]/g, (c) => SHORT_ESCAPES[c]);
}
