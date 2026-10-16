// Debug: find the first divergence between the two behavioral surfaces.
import { assembleConsole } from "../src/lib/consoles/studio-v2";
import { RACKS, KITCHEN } from "../tests/fixtures/console-configs";

function surface(html: string): string {
  const i = html.indexOf("<script>");
  const j = html.lastIndexOf("</script>");
  const s = html.slice(i + 8, j);
  return s.replace(/(['"])(?:\\.|[^\\])*?\1/g, "''").replace(/\b\d+(\.\d+)?\b/g, "N").replace(/\s+/g, "");
}

const sa = surface(assembleConsole(RACKS));
const sb = surface(assembleConsole(KITCHEN));
console.log("len A:", sa.length, "len B:", sb.length);
for (let k = 0; k < Math.max(sa.length, sb.length); k++) {
  if (sa[k] !== sb[k]) {
    console.log("first divergence @", k);
    console.log("A:", JSON.stringify(sa.slice(Math.max(0, k - 100), k + 100)));
    console.log("B:", JSON.stringify(sb.slice(Math.max(0, k - 100), k + 100)));
    break;
  }
}
