const MOVE_NAMES = ["H", "V", "D"];

export function validateDimensions(columns, rows) {
  if (
    !Number.isSafeInteger(columns) ||
    !Number.isSafeInteger(rows) ||
    columns < 1 ||
    rows < 1
  ) {
    return {
      valid: false,
      message: "Размеры должны быть положительными целыми числами.",
    };
  }
  if (columns % 2 === 0 || rows % 2 === 0) {
    return { valid: false, message: "Пока доступны только нечётные размеры." };
  }
  const moves = columns * rows - 1;
  if (!Number.isSafeInteger(moves) || moves % 7 !== 0) {
    return {
      valid: false,
      message: "Число ходов M × N − 1 должно делиться на 7.",
    };
  }
  const x = moves / 7;
  const quota = { H: x, V: 4 * x, D: 2 * x };
  const sameColor = (columns + rows) % 2 === 0;
  if ((quota.H + quota.V) % 2 !== (sameColor ? 0 : 1)) {
    return {
      valid: false,
      message: "Количество ходов H + V не соответствует цветам углов.",
    };
  }
  if (quota.H + quota.D < columns - 1 || quota.V + quota.D < rows - 1) {
    return {
      valid: false,
      message: "Ходов недостаточно, чтобы добраться до противоположного угла.",
    };
  }
  // Alternating row colors give H_even − H_odd = columns − 1;
  // alternating column colors give the same identity for V and rows − 1.
  if (quota.H < columns - 1 || quota.V < rows - 1) {
    return {
      valid: false,
      quota,
      moves,
      message: `Необходимо H ≥ M − 1 и V ≥ N − 1. Здесь H = ${quota.H}, V = ${quota.V}.`,
    };
  }
  return { valid: true, moves, quota, sameColor };
}

export function verifyRoute(
  columns,
  rows,
  path,
  quota = validateDimensions(columns, rows).quota,
) {
  const counts = { H: 0, V: 0, D: 0 };
  const fail = (message) => ({ valid: false, counts, message });
  if (!Array.isArray(path) || path.length !== columns * rows)
    return fail("Посещены не все клетки.");
  if (
    path[0]?.x !== 0 ||
    path[0]?.y !== 0 ||
    path.at(-1)?.x !== columns - 1 ||
    path.at(-1)?.y !== rows - 1
  ) {
    return fail("Неверные начало или конец маршрута.");
  }
  const seen = new Set();
  for (let i = 0; i < path.length; i++) {
    const { x, y } = path[i];
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      x >= columns ||
      y < 0 ||
      y >= rows
    )
      return fail("Маршрут выходит за границы поля.");
    const cell = y * columns + x;
    if (seen.has(cell))
      return fail("В маршруте есть повторное посещение клетки.");
    seen.add(cell);
    if (i === 0) continue;
    const dx = Math.abs(x - path[i - 1].x);
    const dy = Math.abs(y - path[i - 1].y);
    if (dx > 1 || dy > 1 || dx + dy === 0)
      return fail("Ход должен вести в соседнюю клетку.");
    counts[dx && dy ? "D" : dx ? "H" : "V"]++;
  }
  if (!quota || MOVE_NAMES.some((kind) => counts[kind] !== quota[kind]))
    return fail("Количество ходов не совпадает с пропорцией 1 : 4 : 2.");
  return { valid: true, counts };
}

const PATTERNS = {
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

function constructStrips(columns, rows, quota, deadline) {
  if (performance.now() >= deadline) return null;
  const stripCount = (columns - 1) / 2;
  const blocksPerStrip = (rows - 1) / 2;
  const horizontalBlocks = (quota.H - (columns - 1)) / 2;
  if (horizontalBlocks < 0 || !stripCount || !blocksPerStrip) return null;

  // Every normal block uses two moves of each of two types; a return strip
  // contributes one H and splits its other moves between paired V and D.
  let allocation;
  for (
    let through = stripCount - (stripCount % 2);
    through >= 0;
    through -= 2
  ) {
    const vd = through * blocksPerStrip - horizontalBlocks;
    const diagonalPairs = quota.D / 2 - vd;
    const laceCapacity = (stripCount - through) * (rows - 1);
    const minHd = Math.max(0, diagonalPairs - laceCapacity);
    const maxHd = Math.min(horizontalBlocks, diagonalPairs);
    if (vd < 0 || minHd > maxHd) continue;
    const hd = quota.V >= quota.D ? minHd : maxHd;
    allocation = {
      through,
      HVHV: horizontalBlocks - hd,
      HDHD: hd,
      VDVD: vd,
      laceDiagonals: diagonalPairs - hd,
    };
    break;
  }
  if (!allocation) return null;

  const path = [],
    segments = [];
  const remaining = { ...quota };
  let flipped = false;
  for (let strip = 0; strip < stripCount; strip++) {
    const fromIndex = path.length;
    const cells = [{ x: 0, y: 0 }];
    const add = (dx, dy) => {
      const previous = cells.at(-1);
      cells.push({ x: previous.x + dx, y: previous.y + dy });
      remaining[dx && dy ? "D" : dx ? "H" : "V"]--;
    };
    const isThrough = strip < allocation.through;
    const patterns = [];
    if (isThrough) {
      for (let block = 0; block < blocksPerStrip; block++) {
        const pattern =
          allocation.HVHV + allocation.HDHD > 0
            ? allocation.HVHV > 0 &&
              (remaining.V >= remaining.D || allocation.HDHD === 0)
              ? "HVHV"
              : "HDHD"
            : "VDVD";
        patterns.push(pattern);
        allocation[pattern]--;
        for (const [dx, dy] of PATTERNS[pattern]) add(dx, dy);
      }
      add(1, 0);
    } else {
      const diagonals = Math.min(rows - 1, allocation.laceDiagonals);
      allocation.laceDiagonals -= diagonals;
      const verticals = rows - 1 - diagonals;
      for (let i = 0; i < diagonals; i++) add(cells.at(-1).x === 0 ? 1 : -1, 1);
      for (let i = 0; i < verticals; i++) add(0, 1);
      add(cells.at(-1).x === 0 ? 1 : -1, 0);
      for (let i = 0; i < verticals; i++) add(0, -1);
      for (let i = 0; i < diagonals; i++)
        add(cells.at(-1).x === 0 ? 1 : -1, -1);
      patterns.push(
        "D".repeat(diagonals) +
          "V".repeat(verticals) +
          "H" +
          "V".repeat(verticals) +
          "D".repeat(diagonals),
      );
    }
    path.push(
      ...cells.map(({ x, y }) => ({
        x: strip * 2 + x,
        y: flipped ? rows - 1 - y : y,
      })),
    );
    segments.push({
      kind: "strip",
      fromIndex,
      toIndex: path.length - 1,
      direction: isThrough ? (flipped ? "down" : "up") : "return",
      patterns,
    });
    if (isThrough) flipped = !flipped;
    remaining.H--;
  }
  const fromIndex = path.length;
  for (let y = 0; y < rows; y++) path.push({ x: columns - 1, y });
  segments.push({
    kind: "final-column",
    fromIndex,
    toIndex: path.length - 1,
    direction: "up",
  });
  return { path, segments };
}

export function solveBoard(columns, rows, { timeLimitMs = 2500 } = {}) {
  const validation = validateDimensions(columns, rows);
  if (!validation.valid) return { status: "invalid", ...validation };
  const { quota } = validation;
  if (columns === 1 && rows === 1)
    return {
      status: "solved",
      path: [{ x: 0, y: 0 }],
      counts: quota,
      quota,
      segments: [],
      transposed: false,
    };
  const deadline = performance.now() + timeLimitMs;
  // shortcut: the allowed strip families are incomplete; report unresolved
  // cases without claiming impossibility until a wider construction is needed.
  let construction = null;
  let transposed = false;
  if (columns <= 31 && rows <= 31) {
    if (rows > columns) {
      construction = constructStrips(
        rows,
        columns,
        { H: quota.V, V: quota.H, D: quota.D },
        deadline,
      );
      transposed = !!construction;
      if (construction) {
        construction.path = construction.path.map(({ x, y }) => ({
          x: y,
          y: x,
        }));
        construction.segments = construction.segments.map((segment) => ({
          ...segment,
          kind: segment.kind === "final-column" ? "final-row" : segment.kind,
          direction:
            segment.direction === "up"
              ? "right"
              : segment.direction === "down"
                ? "left"
                : segment.direction,
        }));
      }
    }
    construction ??= constructStrips(columns, rows, quota, deadline);
  }
  if (construction) {
    const checked = verifyRoute(columns, rows, construction.path, quota);
    if (!checked.valid) throw new Error(checked.message);
    return {
      status: "solved",
      ...construction,
      counts: checked.counts,
      quota,
      method: "strips",
      transposed,
    };
  }
  return {
    status: "not-found",
    quota,
    message:
      "Разрешённые паттерны не дали маршрут. Это не доказывает, что решения нет.",
  };
}
