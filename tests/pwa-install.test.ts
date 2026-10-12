import { test } from "node:test";
import assert from "node:assert/strict";
import { PLATFORM_SRC, installScript } from "../lib/pages/pwa-install.ts";
import { pwaFiles } from "../lib/pages/pwa.ts";

const egsPlatform = new Function(`return (${PLATFORM_SRC})`)() as (ua: string, platform?: string, touch?: number) => string;

test("install: the device decides the help", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
  assert.equal(egsPlatform(iphone), "ios-safari");
  assert.equal(egsPlatform(iphone.replace("Version/17.4", "CriOS/124.0")), "ios-other");
  assert.equal(egsPlatform(iphone + " Line/14.5.0"), "ios-inapp");
  assert.equal(egsPlatform(iphone + " [FBAN/FBIOS;FBAV/450.0]"), "ios-inapp");
  // iPadOS asks for the desktop site: a Mac with a touch screen
  assert.equal(egsPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15", "MacIntel", 5), "ios-safari");
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
  assert.equal(egsPlatform(android), "android");
  assert.equal(egsPlatform(android + " Line/14.5.0"), "android-inapp");
  assert.equal(egsPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36"), "android-inapp");
  assert.equal(egsPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36", "Win32", 0), "desktop");
  assert.equal(egsPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", "MacIntel", 0), "desktop");
});

test("install: the script parses, carries the app's name safely and is linked from the page", () => {
  const src = installScript('ร้าน</script><b>"x"', "#be185d");
  assert.doesNotThrow(() => new Function(src));
  assert.ok(!src.includes("</script>"));
  assert.match(src, /data-egs-install/);
  assert.match(src, /beforeinstallprompt/);
  assert.match(src, /display-mode: standalone/);
  const { files, head } = pwaFiles({ name: "ร้านกาแฟ", color: "#be185d" });
  assert.ok(files.some((f) => f.path === "install.js"));
  assert.ok(head.some((h) => h.includes('src="install.js"')));
});
