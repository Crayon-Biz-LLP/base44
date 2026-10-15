// Branding sanitizer — flash-lite cannot reliably satisfy character-count
// constraints (it emitted a 10-char logoText against a .max(3) schema rule,
// killing every retry roll with NoObjectGeneratedError). Doctrine: the model
// suggests, code derives. Schemas stay permissive; this clamps deterministically.
export function logoOf(productName: string, logoText: string): string {
  const initials = productName.split(/\s+/).map(w => w[0] || "").join("");
  const trimmed = logoText.trim();
  const raw = trimmed.length >= 1 && trimmed.length <= 3 ? trimmed : initials;
  return (raw || initials).toUpperCase().slice(0, 3) || "OP";
}
