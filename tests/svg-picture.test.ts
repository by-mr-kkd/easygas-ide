import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSvg, extractSvg, sizeFor, SVG_MAX_BYTES } from "../lib/share/svg-picture.ts";

const COVER = sizeFor("cover");

test("the drawing is pulled out of prose and a code fence, and gets our size and viewBox", () => {
  const text = 'นี่คือรูป:\n```svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450"><rect width="800" height="450" fill="#eef"/><text x="40" y="80" font-family="sans-serif">บันทึกรายจ่าย</text></svg>\n```\nจบ';
  assert.equal(extractSvg(text)?.startsWith("<svg"), true);
  const r = checkSvg(text, COVER);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.match(r.svg, /^<svg [^>]*width="1600" height="900" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice">/);
  assert.equal((r.svg.match(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g) ?? []).length, 1);
  assert.ok(r.svg.endsWith("</svg>"));
});

test("a root without a viewBox gets one of our size", () => {
  const r = checkSvg("<svg><circle cx='10' cy='10' r='5'/></svg>", sizeFor("photo"));
  assert.equal(r.ok, true);
  if (r.ok) assert.match(r.svg, /viewBox="0 0 1600 1200"/);
});

test("scripts, handlers, embedded raster, outside references and entities are refused", () => {
  const bad = [
    ["<svg><script>alert(1)</script></svg>", "banned_tag"],
    ["<svg><rect onclick='x()' width='1' height='1'/></svg>", "event_attr"],
    ["<svg><image href='https://x/y.png'/></svg>", "banned_tag"],
    ["<svg><a href='https://evil'><rect/></a></svg>", "outside_ref"],
    ["<svg><rect fill=\"url(https://x/p.svg#g)\"/></svg>", "outside_ref"],
    ["<svg><foreignObject><div/></foreignObject></svg>", "banned_tag"],
    ["<!DOCTYPE svg [<!ENTITY x 'y'>]><svg>&x;</svg>", "entity"],
    ["<svg><style>@import url(https://x)</style></svg>", "banned_tag"],
    ["ไม่มีรูป", "no_svg"],
  ] as const;
  for (const [svg, reason] of bad) {
    const r = checkSvg(svg, COVER);
    assert.equal(r.ok, false, svg);
    if (!r.ok) assert.equal(r.reason, reason, svg);
  }
  // references inside the document are fine (gradients, clip paths)
  const ok = checkSvg("<svg><defs><linearGradient id='g'/></defs><rect fill='url(#g)' width='1' height='1'/><use href='#g'/></svg>", COVER);
  assert.equal(ok.ok, true);
});

test("an oversized drawing is refused", () => {
  const huge = `<svg>${"<rect width='1' height='1'/>".repeat(SVG_MAX_BYTES / 20)}</svg>`;
  const r = checkSvg(huge, COVER);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "too_big");
});
