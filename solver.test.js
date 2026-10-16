import assert from "node:assert/strict";
import test from "node:test";
import { solveBoard, validateDimensions, verifyRoute } from "./solver.js";

test("dimensions use the number of moves and reject impossible quotas", () => {
  assert.equal(validateDimensions(3, 5).valid, true);
  assert.deepEqual(validateDimensions(3, 5).quota, { H: 2, V: 8, D: 4 });
  for (const [columns, rows] of [
    [0, 5],
    [2, 5],
    [3.5, 5],
    [3, 3],
    [5, 3],
    [15, 1],
    [1, 15],
  ]) {
    assert.equal(
      validateDimensions(columns, rows).valid,
      false,
      `${columns} × ${rows}`,
    );
  }
  assert.equal(solveBoard(5, 3).status, "invalid");
});

function assertPatternGrammar(columns, rows, result) {
  const { path, segments, transposed } = result;
  if (columns === 1 && rows === 1) {
    assert.deepEqual(segments, []);
    return;
  }
  const virtualColumns = transposed ? rows : columns;
  const virtualRows = transposed ? columns : rows;
  const virtualPath = path.map(({ x, y }) =>
    transposed ? { x: y, y: x } : { x, y },
  );
  let reachedReturn = false;
  let reachedVDVD = false;
  let previousEnd = -1;
  for (const [index, segment] of segments.entries()) {
    assert.equal(segment.fromIndex, previousEnd + 1);
    if (index > 0) {
      const before = virtualPath[previousEnd];
      const after = virtualPath[segment.fromIndex];
      assert.deepEqual([after.x - before.x, after.y - before.y], [1, 0]);
    }
    previousEnd = segment.toIndex;
    if (index === segments.length - 1) {
      assert.equal(segment.kind, transposed ? "final-row" : "final-column");
      assert.deepEqual(
        virtualPath.slice(segment.fromIndex),
        Array.from({ length: virtualRows }, (_, y) => ({
          x: virtualColumns - 1,
          y,
        })),
      );
      continue;
    }
    assert.equal(segment.kind, "strip");
    const cells = virtualPath.slice(segment.fromIndex, segment.toIndex + 1);
    assert.equal(cells.length, 2 * virtualRows);
    const deltas = cells
      .slice(1)
      .map((cell, i) => [
        cell.x - cells[i].x,
        cells[0].y === 0 ? cell.y - cells[i].y : cells[i].y - cell.y,
      ]);
    const word = deltas
      .map(([dx, dy]) => (dx && dy ? "D" : dx ? "H" : "V"))
      .join("");
    if (segment.direction === "return") {
      reachedReturn = true;
      const diagonals = word.match(/^D*/)[0].length;
      const verticals = virtualRows - 1 - diagonals;
      assert.equal(
        word,
        "D".repeat(diagonals) +
          "V".repeat(verticals) +
          "H" +
          "V".repeat(verticals) +
          "D".repeat(diagonals),
      );
      assert.ok(deltas.slice(0, virtualRows - 1).every(([, dy]) => dy === 1));
      assert.ok(deltas.slice(virtualRows).every(([, dy]) => dy === -1));
      assert.deepEqual(segment.patterns, [word]);
    } else {
      assert.equal(reachedReturn, false, "Ordinary strips must precede lacing");
      assert.deepEqual(deltas.at(-1), [1, 0]);
      const blocks = [];
      for (let offset = 0; offset < word.length - 1; offset += 4) {
        const block = word.slice(offset, offset + 4);
        blocks.push(block);
        const allowed = {
          HVHV: [
            [1, 0],
            [0, 1],
            [-1, 0],
            [0, 1],
          ],
          HDHD: [
            [1, 0],
            [-1, 1],
            [1, 0],
            [-1, 1],
          ],
          VDVD: [
            [0, 1],
            [1, -1],
            [0, 1],
            [-1, 1],
          ],
        };
        assert.ok(block in allowed, `Unexpected block ${block}`);
        assert.deepEqual(deltas.slice(offset, offset + 4), allowed[block]);
        if (block === "VDVD") reachedVDVD = true;
        else assert.equal(reachedVDVD, false, "Spend surplus H before VDVD");
      }
      assert.deepEqual(segment.patterns, blocks);
    }
  }
  assert.equal(previousEnd, path.length - 1);
}

test("all supported valid boards keep exact quotas and the allowed pattern order", () => {
  let checked = 0;
  for (let columns = 1; columns <= 31; columns += 2) {
    for (let rows = 1; rows <= 31; rows += 2) {
      const validation = validateDimensions(columns, rows);
      if (!validation.valid) continue;
      const result = solveBoard(columns, rows);
      assert.equal(
        result.status,
        "solved",
        `${columns} × ${rows}: ${result.message}`,
      );
      assert.equal(verifyRoute(columns, rows, result.path).valid, true);
      assert.equal(result.path.length, columns * rows);
      assert.deepEqual(result.counts, validation.quota);
      assertPatternGrammar(columns, rows, result);
      checked++;
    }
  }
  assert.equal(checked, 25);
});

test("tall boards transpose virtually and keep physical H/V quotas", () => {
  for (const [columns, rows, transposed] of [
    [3, 5, true],
    [5, 17, true],
    [3, 19, true],
    [9, 11, false],
    [15, 15, false],
    [11, 9, false],
  ]) {
    const result = solveBoard(columns, rows);
    assert.equal(result.status, "solved");
    assert.equal(result.transposed, transposed, `${columns} × ${rows}`);
    assert.deepEqual(result.counts, validateDimensions(columns, rows).quota);
    if (transposed) {
      assert.deepEqual(
        result.path.slice(-columns),
        Array.from({ length: columns }, (_, x) => ({ x, y: rows - 1 })),
      );
    }
  }
});

test("unresolved construction is never described as mathematical impossibility", () => {
  for (const result of [
    solveBoard(33, 17),
    solveBoard(9, 11, { timeLimitMs: 0 }),
  ]) {
    assert.equal(result.status, "not-found");
    assert.match(result.message, /не доказывает/);
  }
});

test("independent route validation rejects repeats, long moves and wrong quotas", () => {
  const { path } = solveBoard(3, 5);
  const duplicate = path.map((cell) => ({ ...cell }));
  duplicate[2] = duplicate[1];
  assert.equal(verifyRoute(3, 5, duplicate).valid, false);
  const jump = path.map((cell) => ({ ...cell }));
  [jump[1], jump[10]] = [jump[10], jump[1]];
  assert.equal(verifyRoute(3, 5, jump).valid, false);
  assert.equal(verifyRoute(3, 5, path.slice(1)).valid, false);
  assert.equal(verifyRoute(3, 5, path, { H: 4, V: 8, D: 2 }).valid, false);
});
