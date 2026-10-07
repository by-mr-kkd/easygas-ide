import { strict as assert } from "node:assert";
import { test } from "node:test";
import { backendNoticeHtml, withBackendNotice } from "../lib/pages/backend-page.ts";

const files = [
  { path: "Code.gs", content: "function doGet(){ return HtmlService.createTemplateFromFile('Index').evaluate(); }" },
  { path: "Index.html", content: "<html><body><?!= include('Client'); ?></body></html>" },
  { path: "Client.html", content: "<script>navigator.mediaDevices.getUserMedia({video:true})</script>" },
];

test("withBackendNotice swaps only the entry page and leaves the input alone", () => {
  const out = withBackendNotice(files, "https://me.github.io/easygas-app/", "แอปสแกน");
  assert.equal(out.length, 3);
  const index = out.find((f) => f.path === "Index.html")!;
  assert.match(index.content, /https:\/\/me\.github\.io\/easygas-app\//);
  assert.doesNotMatch(index.content, /<\?/); // no scriptlets: any doGet that serves Index still renders
  assert.equal(out.find((f) => f.path === "Client.html")!.content, files[2].content);
  assert.equal(files[1].content, "<html><body><?!= include('Client'); ?></body></html>");
});

test("withBackendNotice without an entry page changes nothing", () => {
  const noIndex = files.filter((f) => f.path !== "Index.html");
  assert.deepEqual(withBackendNotice(noIndex, "https://me.github.io/x/", "x"), noIndex);
});

test("backendNoticeHtml escapes the name and the url and opens the app at the top level", () => {
  const html = backendNoticeHtml('https://me.github.io/a/?q="x"', '<b>"ร้าน"</b>');
  assert.doesNotMatch(html, /<b>"ร้าน"<\/b>/);
  assert.match(html, /&lt;b&gt;&quot;ร้าน&quot;&lt;\/b&gt;/);
  assert.match(html, /href="https:\/\/me\.github\.io\/a\/\?q=&quot;x&quot;"/);
  assert.match(html, /<base target="_top">/);
});
