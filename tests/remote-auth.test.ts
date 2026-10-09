import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  LOCK_AFTER_FAILS,
  LOCK_MS,
  Lockout,
  PAIR_CODE_MAX_FAILS,
  PAIR_CODE_TTL_MS,
  checkPairingCode,
  deviceFromCookie,
  deviceName,
  hashPin,
  hashToken,
  lanAddresses,
  newPairingCode,
  parseCookies,
  safeNext,
  serializeCookie,
  stripCookies,
  validPin,
  verifyPin,
  weakPin,
} from "../lib/remote/auth.ts";

test("pairing code: 6 digits, one right answer, expires, dies after too many wrong tries", () => {
  const p = newPairingCode(1000);
  assert.match(p.code, /^\d{6}$/);
  assert.equal(p.expiresAt, 1000 + PAIR_CODE_TTL_MS);
  const wrong = p.code === "000000" ? "111111" : "000000";
  assert.equal(checkPairingCode(p, wrong, 2000), "wrong");
  assert.equal(p.fails, 1);
  assert.equal(checkPairingCode(p, ` ${p.code} `, 2000), "ok");
  assert.equal(checkPairingCode(p, p.code, p.expiresAt + 1), "expired");
  assert.equal(checkPairingCode(null, p.code, 2000), "none");
  const q = newPairingCode(0);
  q.fails = PAIR_CODE_MAX_FAILS;
  assert.equal(checkPairingCode(q, q.code, 1), "expired", "the right code no longer works once guessing ran out");
});

test("device cookie: matches only the stored hash of that device's token", () => {
  const devices = [
    { id: "aaaa", tokenHash: hashToken("tok-a"), name: "A" },
    { id: "bbbb", tokenHash: hashToken("tok-b"), name: "B" },
  ];
  assert.equal(deviceFromCookie("aaaa.tok-a", devices)?.name, "A");
  assert.equal(deviceFromCookie("bbbb.tok-b", devices)?.name, "B");
  assert.equal(deviceFromCookie("aaaa.tok-b", devices), null, "another device's token");
  assert.equal(deviceFromCookie("cccc.tok-a", devices), null);
  assert.equal(deviceFromCookie("aaaa.", devices), null);
  assert.equal(deviceFromCookie(".tok-a", devices), null);
  assert.equal(deviceFromCookie(undefined, devices), null);
  assert.equal(deviceFromCookie(`aaaa.${hashToken("tok-a")}`, devices), null, "the stored hash itself is not a key");
});

test("PIN: 6 digits, weak ones spotted, hash verifies only the same PIN", () => {
  assert.ok(validPin("482913"));
  assert.ok(!validPin("12345"));
  assert.ok(!validPin("12345a"));
  for (const w of ["000000", "123456", "654321", "999999", "456789"]) assert.ok(weakPin(w), w);
  assert.ok(!weakPin("482913"));
  const h = hashPin("482913");
  assert.ok(verifyPin("482913", h));
  assert.ok(!verifyPin("482914", h));
  assert.notEqual(hashPin("482913").salt, h.salt, "a new salt every time");
});

test("lockout: the fifth wrong try locks for LOCK_MS, then it opens again", () => {
  const l = new Lockout();
  for (let i = 1; i < LOCK_AFTER_FAILS; i++) assert.equal(l.fail("k", i), false);
  assert.equal(l.fail("k", 10), true);
  assert.ok(l.lockedFor("k", 11) > 0);
  assert.equal(l.lockedFor("other", 11), 0);
  assert.equal(l.lockedFor("k", 10 + LOCK_MS + 1), 0);
  l.clear("k");
  assert.equal(l.lockedFor("k", 12), 0);
});

test("cookies: parse, strip ours, serialize with the safe flags", () => {
  assert.deepEqual(parseCookies("a=1; egs_dev=x.y; b=%20z"), { a: "1", egs_dev: "x.y", b: " z" });
  assert.equal(stripCookies("a=1; egs_dev=x.y; egs_pin=s; b=2", ["egs_dev", "egs_pin"]), "a=1; b=2");
  assert.equal(stripCookies("egs_dev=x", ["egs_dev"]), undefined);
  const c = serializeCookie("egs_dev", "id.tok", { maxAgeS: 60, secure: true });
  assert.match(c, /^egs_dev=id\.tok; Path=\/; Max-Age=60; HttpOnly; SameSite=Lax; Secure$/);
  assert.doesNotMatch(serializeCookie("x", "1", { maxAgeS: 1, secure: false }), /Secure/);
});

test("deviceName: short names from common phones", () => {
  assert.equal(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), "iPhone");
  assert.equal(deviceName("Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A) AppleWebKit"), "Android (SM-S918B)");
  assert.equal(deviceName("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36"), "Android");
  assert.equal(deviceName(undefined), "อุปกรณ์");
});

test("lanAddresses: private IPv4 on real adapters, Wi-Fi first", () => {
  const nics = {
    "vEthernet (WSL)": [{ address: "172.20.0.1", family: "IPv4", internal: false }],
    Ethernet: [{ address: "10.0.0.5", family: "IPv4", internal: false }],
    "Wi-Fi": [
      { address: "fe80::1", family: "IPv6", internal: false },
      { address: "192.168.1.23", family: "IPv4", internal: false },
    ],
    "Loopback Pseudo-Interface 1": [{ address: "127.0.0.1", family: "IPv4", internal: true }],
    Public: [{ address: "203.0.113.9", family: "IPv4", internal: false }],
  };
  assert.deepEqual(lanAddresses(nics), ["192.168.1.23", "10.0.0.5"]);
});

test("safeNext: same-site paths only", () => {
  assert.equal(safeNext("/projects/abc?x=1"), "/projects/abc?x=1");
  for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "/__egs/pin", "", null, undefined, "/\t/evil.com", "/\n/evil.com", "/%2F%2Fevil.com/../__egs/pin", "/./__egs/x"]) {
    assert.equal(safeNext(bad), "/", JSON.stringify(bad));
  }
  assert.equal(safeNext("/%2F%2Fevil.com"), "/%2F%2Fevil.com", "an encoded slash stays a path on this site");
});

test("lockout: a flood of new keys never wipes an existing lock", () => {
  const l = new Lockout();
  for (let i = 0; i < LOCK_AFTER_FAILS; i++) l.fail("pin:phone", 1);
  assert.ok(l.lockedFor("pin:phone", 2) > 0);
  for (let i = 0; i < 6000; i++) l.fail(`resume:ip${i}`, 3);
  assert.ok(l.lockedFor("pin:phone", 4) > 0, "still locked");
  assert.ok(l.size <= 5000);
});
