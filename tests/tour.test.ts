import { strict as assert } from "node:assert";
import { test } from "node:test";
import { TOURS, bubblePosition, presentSteps, spotlightRect, tourSeenKey } from "../lib/tour.ts";

const vp = { width: 1000, height: 800 };
const bubble = { width: 320, height: 150 };

test("tours: every step has a target, Thai title and body; no target repeats within a tour", () => {
  for (const [id, steps] of Object.entries(TOURS)) {
    assert.ok(steps.length >= 4, `${id} has steps`);
    const targets = new Set<string>();
    for (const s of steps) {
      assert.match(s.target, /^[a-z-]+$/, `${id}:${s.target} is a data-tour value`);
      assert.ok(/[฀-๿]/.test(s.title) && /[฀-๿]/.test(s.body), `${id}:${s.target} is in Thai`);
      assert.ok(!targets.has(s.target), `${id}:${s.target} appears once`);
      targets.add(s.target);
    }
  }
  assert.equal(tourSeenKey("home"), "tour_seen_home");
});

test("presentSteps: keeps order and drops steps whose element is not on the screen", () => {
  const on = new Set(["composer", "projects", "settings"]);
  assert.deepEqual(
    presentSteps(TOURS.home, (t) => on.has(t)).map((s) => s.target),
    ["composer", "projects", "settings"],
  );
  assert.deepEqual(presentSteps(TOURS.ide, () => false), []);
});

test("spotlightRect: pads the element and never leaves the window", () => {
  assert.deepEqual(spotlightRect({ top: 100, left: 100, width: 200, height: 50 }, vp), { top: 94, left: 94, width: 212, height: 62 });
  // flush with the top-left corner: no negative coordinates
  assert.deepEqual(spotlightRect({ top: 2, left: 0, width: 50, height: 20 }, vp), { top: 0, left: 0, width: 56, height: 28 });
  // sticking out at the bottom-right: cut at the window edge
  assert.deepEqual(spotlightRect({ top: 780, left: 900, width: 200, height: 100 }, vp), { top: 774, left: 894, width: 106, height: 26 });
});

test("bubblePosition: sits under the element when there is room, centred on it", () => {
  const spot = { top: 100, left: 300, width: 200, height: 40 };
  assert.deepEqual(bubblePosition(spot, bubble, vp, "bottom"), { side: "bottom", top: 152, left: 240 });
  assert.deepEqual(bubblePosition(spot, bubble, vp, "right"), { side: "right", top: 45, left: 512 });
});

test("bubblePosition: flips to the side with the most room when the preferred side is full", () => {
  // element at the very bottom: "bottom" has no room, so it goes above
  const low = { top: 720, left: 300, width: 200, height: 60 };
  assert.equal(bubblePosition(low, bubble, vp, "bottom").side, "top");
  assert.equal(bubblePosition(low, bubble, vp, "bottom").top, 720 - 12 - 150);
  // a tall pane on the right edge wants the bubble to its left; with no room there, it drops below
  const pane = { top: 60, left: 20, width: 950, height: 500 };
  const p = bubblePosition(pane, bubble, vp, "left");
  assert.equal(p.side, "bottom");
});

test("bubblePosition: is slid back inside the window instead of overflowing", () => {
  const edge = { top: 100, left: 950, width: 40, height: 40 };
  const p = bubblePosition(edge, bubble, vp, "bottom");
  assert.ok(p.left + bubble.width <= vp.width - 12);
  assert.ok(p.left >= 12);
  // a window smaller than the bubble: never negative
  const tiny = bubblePosition({ top: 10, left: 10, width: 20, height: 20 }, bubble, { width: 300, height: 200 }, "bottom");
  assert.equal(tiny.left, 12);
  assert.equal(tiny.top, 200 - 150 - 12);
});
