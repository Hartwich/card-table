import assert from "node:assert/strict";
import test from "node:test";
import { symboljagdLayout } from "../dist/cards/symboljagdLayout.js";
import { cardFaceHtml } from "../dist/host/cardHtml.js";

test("Symboljagd compositions stay stable, varied, inside cards and free of overlapping targets", () => {
  for (const count of [8, 9, 10]) {
    const compositions = new Set();
    for (let card = 0; card < 91; card++) {
      const id = `symbols-${card}#1`;
      const spots = symboljagdLayout(id, count);
      assert.deepEqual(spots, symboljagdLayout(id, count));
      assert.equal(spots.length, count);
      compositions.add(JSON.stringify([...spots].sort((a, b) => a[0] - b[0] || a[1] - b[1])));
      for (const [width, height] of [[600, 600], [360, 660], [660, 240], [280, 280]]) {
        const boxes = spots.map(([x, y, size]) => {
          const edge = size * Math.min(width, height) / 100;
          return { x: x * width / 100, y: y * height / 100, edge };
        });
        for (const [index, box] of boxes.entries()) {
          assert.ok(box.x - box.edge / 2 >= 0 && box.x + box.edge / 2 <= width);
          assert.ok(box.y - box.edge / 2 >= 0 && box.y + box.edge / 2 <= height);
          for (const other of boxes.slice(index + 1)) {
            const distance = (box.edge + other.edge) / 2;
            assert.ok(Math.abs(box.x - other.x) + 0.001 >= distance || Math.abs(box.y - other.y) + 0.001 >= distance, `${id}/${count}: overlapping targets ${JSON.stringify([box, other])}`);
          }
        }
      }
    }
    assert.equal(compositions.size, 4);
  }
});

test("only Symboljagd host card faces become square", () => {
  const card = { cardId: "symbols-1#1", rankLabel: "1", suitId: "symbols", suitSymbol: "", suitLabel: "Symbols", color: "neutral" };
  assert.match(cardFaceHtml({ ...card, symbols: Array.from({ length: 10 }, (_, i) => String(i)) }, 600), /width:600px;height:600px/);
  assert.match(cardFaceHtml(card, 200), /width:200px;height:280px/);
});
