import assert from "node:assert/strict";
import { it } from "node:test";
import { expressionValueAt } from "../../src/lib/editor/expression.ts";

await it("maps vertical bar position to the expression range and clamps captured pointers", () => {
  assert.equal(expressionValueAt(25, 100, 200), 150);
  assert.equal(expressionValueAt(75, 100, 200), 50);
  assert.equal(expressionValueAt(-20, 100, 127), 127);
  assert.equal(expressionValueAt(120, 100, 127), 0);
  assert.equal(expressionValueAt(50, 100, 127), 64);
  assert.equal(expressionValueAt(0, 0, 200), 0);
});
