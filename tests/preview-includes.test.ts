import { strict as assert } from "node:assert";
import { test } from "node:test";
import { assemblePreview, resolveIncludes } from "../lib/preview-includes.ts";

const files = {
  "Index.html": { content: "<html><head><?!= include('Stylesheet'); ?></head><body><p>hi</p><?!= include('JavaScript') ?></body></html>" },
  "Stylesheet.html": { content: "<style>p{color:red}</style>" },
  "JavaScript.html": { content: "<script>var a=1</script>" },
};

test("resolveIncludes: the include() helper, with or without the trailing ;", () => {
  const out = assemblePreview(files)!;
  assert.ok(out.includes("<style>p{color:red}</style>"));
  assert.ok(out.includes("<script>var a=1</script>"));
  assert.ok(!out.includes("<?"));
});

test("resolveIncludes: HtmlService.createHtmlOutputFromFile(...).getContent() inlines the same file", () => {
  const html =
    "<?!= HtmlService.createHtmlOutputFromFile('Stylesheet').getContent(); ?>" +
    "<?!= HtmlService.createTemplateFromFile(\"JavaScript\").evaluate().getContent() ?>";
  const out = resolveIncludes(html, files);
  assert.equal(out, "<style>p{color:red}</style><script>var a=1</script>");
});

test("resolveIncludes: a partial that includes another partial is followed; a missing one becomes empty", () => {
  const nested = {
    "Index.html": { content: "<?!= include('Head') ?>" },
    "Head.html": { content: "<?!= HtmlService.createHtmlOutputFromFile('Stylesheet').getContent() ?><?!= include('Nope') ?>" },
    "Stylesheet.html": { content: "<style>x</style>" },
  };
  assert.equal(assemblePreview(nested), "<style>x</style>");
});

test("assemblePreview: other scriptlets are dropped, and no Index.html = null", () => {
  assert.equal(assemblePreview({ "Index.html": { content: "<p><?= user.name ?></p><? if (x) { ?>y<? } ?>" } }), "<p></p>y");
  assert.equal(assemblePreview({ "Code.gs": { content: "" } }), null);
  // a lower-case index.html is found too
  assert.equal(assemblePreview({ "index.html": { content: "<b>a</b>" } }), "<b>a</b>");
});
