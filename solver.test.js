import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RATIO,
  MAX_SIDE,
  findBoardChoices,
  solveBoard,
  validateDimensions,
  validateRatio,
  verifyRoute,
} from "./solver.js";

const deltasFor = {
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
  VDVH: [
    [0, 1],
    [1, -1],
    [0, 1],
    [1, 0],
  ],
  HDHH: [
    [1, 0],
    [-1, 1],
    [1, 0],
    [1, 0],
  ],
};

function assertGrammar(columns, rows, result) {
  const { path, segments, transposed } = result;
  if (columns === 1 || rows === 1) {
    assert.equal(segments[0].kind, "straight");
    return;
  }
  const width = transposed ? rows : columns,
    height = transposed ? columns : rows;
  const virtual = path.map(({ x, y }) =>
    transposed ? { x: y, y: x } : { x, y },
  );
  let previousEnd = -1,
    reachedReturn = false,
    reachedVDVD = false;
  for (const segment of segments) {
    assert.equal(segment.fromIndex, previousEnd + 1);
    if (previousEnd >= 0) {
      const from = virtual[previousEnd],
        to = virtual[segment.fromIndex];
      assert.deepEqual([to.x - from.x, to.y - from.y], [1, 0]);
    }
    previousEnd = segment.toIndex;
    if (segment.kind !== "strip") {
      assert.equal(width % 2, 1);
      assert.equal(segment.kind, transposed ? "final-row" : "final-column");
      assert.deepEqual(
        virtual.slice(segment.fromIndex),
        Array.from({ length: height }, (_, y) => ({ x: width - 1, y })),
      );
      continue;
    }
    const cells = virtual.slice(segment.fromIndex, segment.toIndex + 1);
    assert.equal(cells.length, 2 * height);
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
      const diagonal = word.match(/^D*/)[0].length,
        vertical = height - 1 - diagonal;
      assert.equal(
        word,
        "D".repeat(diagonal) +
          "V".repeat(vertical) +
          "H" +
          "V".repeat(vertical) +
          "D".repeat(diagonal),
      );
      assert.ok(deltas.slice(0, height - 1).every(([, dy]) => dy === 1));
      assert.ok(deltas.slice(height).every(([, dy]) => dy === -1));
      assert.deepEqual(segment.patterns, [word]);
    } else {
      assert.equal(reachedReturn, false, "ordinary strips must precede lacing");
      const blockCount = Math.floor((height - 1) / 2);
      assert.equal(segment.patterns.length, blockCount);
      for (let block = 0; block < blockCount; block++) {
        const name = word.slice(block * 4, block * 4 + 4);
        assert.ok(["HVHV", "HDHD", "VDVD"].includes(name), name);
        assert.deepEqual(
          deltas.slice(block * 4, block * 4 + 4),
          deltasFor[name],
        );
        assert.equal(segment.patterns[block], name);
        if (name === "VDVD") reachedVDVD = true;
        else assert.equal(reachedVDVD, false, "spend surplus H before VDVD");
      }
      if (height % 2) assert.deepEqual(deltas.slice(blockCount * 4), [[1, 0]]);
      else {
        assert.ok(["VDVH", "HDHH"].includes(segment.exitPattern));
        assert.deepEqual(
          deltas.slice(blockCount * 4),
          deltasFor[segment.exitPattern].slice(0, 3),
        );
      }
    }
  }
  assert.equal(previousEnd, path.length - 1);
}

// Independent exhaustive oracle for tiny boards, without the block constructor.
function exactQuotas(columns, rows) {
  const size = columns * rows,
    seen = new Uint8Array(size),
    result = new Set(),
    counts = { H: 0, D: 0, V: 0 };
  seen[0] = 1;
  function visit(cell, depth) {
    if (cell === size - 1) {
      if (depth === size) result.add(`${counts.H},${counts.D},${counts.V}`);
      return;
    }
    const x = cell % columns,
      y = Math.floor(cell / columns);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx,
          ny = y + dy;
        if ((!dx && !dy) || nx < 0 || nx >= columns || ny < 0 || ny >= rows)
          continue;
        const next = ny * columns + nx;
        if (seen[next]) continue;
        const kind = dx && dy ? "D" : dx ? "H" : "V";
        seen[next] = 1;
        counts[kind]++;
        visit(next, depth + 1);
        counts[kind]--;
        seen[next] = 0;
      }
  }
  visit(0, 1);
  return result;
}

test("ratios accept zeros, reject invalid coefficients, and require a positive multiplier", () => {
  assert.equal(validateRatio({ H: 0, D: 0, V: 1 }).valid, true);
  for (const ratio of [
    { H: 0, D: 0, V: 0 },
    { H: -1, D: 2, V: 3 },
    { H: 1.5, D: 1, V: 1 },
    { H: NaN, D: 1, V: 1 },
    { H: Infinity, D: 1, V: 1 },
  ])
    assert.equal(validateRatio(ratio).valid, false);
  assert.equal(validateDimensions(1, 1).valid, false);
  for (const [m, n] of [
    [0, 5],
    [3.5, 5],
    [3, 3],
    [5, 3],
  ])
    assert.equal(validateDimensions(m, n).valid, false);
  assert.equal(validateDimensions(2, 11).valid, true);
  assert.deepEqual(validateDimensions(3, 5).quota, { H: 2, D: 4, V: 8 });
  assert.equal(
    validateDimensions(2, 2, { H: 1, D: 1, V: 1 }).valid,
    false,
    "a=2 requires odd H+D",
  );
  assert.equal(validateDimensions(2, 2, { H: 0, D: 1, V: 2 }).valid, true);
});

test("necessary arithmetic conditions never reject a route found by exhaustive search", () => {
  for (const [m, n] of [
    [1, 2],
    [2, 1],
    [2, 2],
    [2, 3],
    [3, 2],
    [2, 4],
    [3, 3],
  ]) {
    const possible = exactQuotas(m, n);
    for (const key of possible) {
      const [H, D, V] = key.split(",").map(Number);
      assert.equal(
        validateDimensions(m, n, { H, D, V }).valid,
        true,
        `${m}x${n}: ${key}`,
      );
    }
    for (let H = 0; H < m * n; H++)
      for (let D = 0; D < m * n - H; D++) {
        const V = m * n - 1 - H - D,
          ratio = { H, D, V };
        const solved = solveBoard(m, n, { ratio });
        if (solved.status === "solved")
          assert.ok(possible.has(`${H},${D},${V}`));
      }
  }
  assert.equal(validateDimensions(3, 3, { H: 1, D: 0, V: 1 }).valid, true);
  assert.equal(
    exactQuotas(3, 3).has("4,0,4"),
    false,
    "necessary conditions are not sufficient",
  );
});

test("all supported default-ratio candidates retain exact quotas and approved grammar", () => {
  let checked = 0;
  for (let m = 1; m <= MAX_SIDE; m++)
    for (let n = 1; n <= MAX_SIDE; n++) {
      const validation = validateDimensions(m, n);
      if (!validation.valid) continue;
      const result = solveBoard(m, n);
      assert.equal(result.status, "solved", `${m}x${n}`);
      assert.equal(verifyRoute(m, n, result.path, result.quota).valid, true);
      assert.deepEqual(result.counts, validation.quota);
      assertGrammar(m, n, result);
      checked++;
    }
  assert.ok(checked > 48);
});

test("even sides and arbitrary ratios use only approved blocks", () => {
  for (let H = 0; H <= 3; H++)
    for (let D = 0; D <= 3; D++)
      for (let V = 0; V <= 3; V++) {
        if (H + D + V === 0) continue;
        const ratio = { H, D, V };
        for (let m = 1; m <= 9; m++)
          for (let n = 1; n <= 9; n++) {
            const result = solveBoard(m, n, { ratio });
            if (result.status !== "solved") continue;
            assert.equal(
              verifyRoute(m, n, result.path, result.quota).valid,
              true,
              JSON.stringify({ m, n, ratio }),
            );
            assertGrammar(m, n, result);
          }
      }
  for (const ratio of [
    { H: 0, D: 1, V: 2 },
    { H: 2, D: 1, V: 0 },
  ])
    assert.equal(solveBoard(2, 2, { ratio }).status, "solved");
  const square = solveBoard(4, 4, { ratio: { H: 2, D: 1, V: 2 } });
  assert.equal(square.status, "solved");
  assert.equal(square.transposed, false);
  assert.deepEqual(square.counts, { H: 6, V: 6, D: 3 });
});

test("choices are verified, sorted by area then smallest side, and respect zero coefficients", () => {
  const result = findBoardChoices({ H: 2, D: 1, V: 2 });
  assert.deepEqual(result.boards[0], { columns: 2, rows: 8 });
  for (let i = 0; i < result.boards.length; i++) {
    const board = result.boards[i];
    assert.equal(
      solveBoard(board.columns, board.rows, { ratio: { H: 2, D: 1, V: 2 } })
        .status,
      "solved",
    );
    if (i)
      assert.ok(
        result.boards[i - 1].columns * result.boards[i - 1].rows <=
          board.columns * board.rows,
      );
  }
  assert.deepEqual(findBoardChoices(DEFAULT_RATIO).boards[0], {
    columns: 3,
    rows: 5,
  });
  assert.deepEqual(findBoardChoices({ H: 0, D: 0, V: 1 }).boards[0], {
    columns: 1,
    rows: 2,
  });
  assert.deepEqual(findBoardChoices({ H: 1, D: 0, V: 0 }).boards[0], {
    columns: 2,
    rows: 1,
  });
  assert.deepEqual(findBoardChoices({ H: 0, D: 1, V: 0 }).boards, []);
  const incomplete = findBoardChoices({ H: 1, D: 0, V: 1 });
  assert.deepEqual(incomplete.minimumByConditions, { columns: 3, rows: 3 });
  assert.ok(incomplete.unresolved > 0);
});

test("transposition preserves physical quotas; unresolved construction stays honest", () => {
  for (const [m, n] of [
    [3, 5],
    [3, 19],
    [5, 17],
    [9, 11],
    [2, 11],
  ]) {
    const result = solveBoard(m, n);
    assert.equal(result.status, "solved");
    assert.deepEqual(result.counts, validateDimensions(m, n).quota);
  }
  for (const result of [
    solveBoard(MAX_SIDE + 1, 1, { ratio: { H: 1, D: 0, V: 0 } }),
    solveBoard(9, 11, { timeLimitMs: 0 }),
  ])
    assert.equal(result.status, "not-found");
  assert.equal(
    solveBoard(3, 3, { ratio: { H: 1, D: 0, V: 1 } }).status,
    "not-found",
  );
});

test("route verification rejects repeats, long moves, endpoints and incorrect quotas", () => {
  const { path, quota } = solveBoard(3, 5);
  const duplicate = path.map((cell) => ({ ...cell }));
  duplicate[2] = duplicate[1];
  assert.equal(verifyRoute(3, 5, duplicate, quota).valid, false);
  const jump = path.map((cell) => ({ ...cell }));
  [jump[1], jump[10]] = [jump[10], jump[1]];
  assert.equal(verifyRoute(3, 5, jump, quota).valid, false);
  assert.equal(verifyRoute(3, 5, path.slice(1), quota).valid, false);
  assert.equal(verifyRoute(3, 5, path, { H: 4, V: 8, D: 2 }).valid, false);
});

test("the 50 by 50 boundary works in both the solver and the size picker", () => {
  assert.equal(MAX_SIDE, 50);
  const ratio = { H: 2, D: 3, V: 2 };
  const result = solveBoard(50, 50, { ratio });
  assert.equal(result.status, "solved");
  assert.equal(result.path.length, 2500);
  assert.deepEqual(result.counts, { H: 714, V: 714, D: 1071 });
  assert.equal(verifyRoute(50, 50, result.path, result.quota).valid, true);
  assertGrammar(50, 50, result);
  assert.ok(
    findBoardChoices(ratio).boards.some(
      (board) => board.columns === 50 && board.rows === 50,
    ),
  );
  assert.equal(
    solveBoard(1, 50, { ratio: { H: 0, D: 0, V: 1 } }).status,
    "solved",
  );
  assert.equal(
    solveBoard(50, 1, { ratio: { H: 1, D: 0, V: 0 } }).status,
    "solved",
  );
});
