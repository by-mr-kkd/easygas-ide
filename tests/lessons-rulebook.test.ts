import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findRuleRef, isRuleRef, rulesOfPack, similarRule } from "../lib/lessons-rulebook.ts";

const pack = JSON.parse(readFileSync(new URL("../rulebook/pack.json", import.meta.url), "utf8"));
const rules = rulesOfPack(pack);

test("rulesOfPack: every card's numbered rules", () => {
  assert.ok(rules.length > 50);
  const r = rules.find((x) => x.card === "data-integrity" && x.n === 1);
  assert.ok(r && r.text.includes("rev"));
  assert.ok(r.cardTitle.length > 0);
});

test("findRuleRef: a real card#n only", () => {
  assert.equal(findRuleRef("data-integrity#1", rules)?.n, 1);
  assert.equal(findRuleRef(" Data-Integrity#1 ", rules)?.card, "data-integrity");
  assert.equal(findRuleRef("data-integrity#99", rules), null);
  assert.equal(findRuleRef("no-such-card#1", rules), null);
  assert.equal(findRuleRef("--flag#1", rules), null);
  assert.equal(findRuleRef(42, rules), null);
  assert.ok(isRuleRef("lock-service#3"));
  assert.ok(!isRuleRef("L-0003"));
});

test("similarRule: a restated rule is noticed; a related but different lesson is not", () => {
  const rev =
    "ฟังก์ชันที่เขียนทับข้อมูลหลายแถวจากฟอร์มในหน้าเว็บ ต้องให้หน้าเว็บส่งเลขเวอร์ชันข้อมูล (rev) มาทุกครั้ง และเซิร์ฟเวอร์ต้องปฏิเสธเมื่อไม่ส่งหรือไม่ตรง แล้วส่งข้อมูลล่าสุดกลับไปให้";
  const hit = similarRule(rev, "data-integrity", rules);
  assert.equal(hit && `${hit.card}#${hit.n}`, "data-integrity#1");
  assert.equal(similarRule("ทุก include('X') ต้องมีไฟล์ X.html อยู่จริงก่อนจบงาน", "htmlservice-frontend", rules), null);
  assert.equal(similarRule("แม้เป็นเดโมหน้าจอ ห้ามฝังชื่อผู้ใช้/รหัสผ่านไว้ในหน้าเว็บ", "security", rules), null);
  // another card's rule is not compared unless the lesson is "general"
  assert.equal(similarRule(rev, "lock-service", rules), null);
});
