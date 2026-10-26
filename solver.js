export const DEFAULT_RATIO = { H: 1, D: 2, V: 4 };
export const MAX_SIDE = 50;
const MOVE_NAMES = ["H", "D", "V"];

export function validateRatio(ratio) {
  if (
    !ratio ||
    MOVE_NAMES.some(
      (kind) => !Number.isSafeInteger(ratio[kind]) || ratio[kind] < 0,
    )
  ) {
    return {
      valid: false,
      message: "Введите три неотрицательных целых числа.",
    };
  }
  const sum = ratio.H + ratio.D + ratio.V;
  if (!Number.isSafeInteger(sum) || sum === 0) {
    return {
      valid: false,
      message:
        "Сумма коэффициентов должна быть положительным безопасным целым числом.",
    };
  }
  return { valid: true, sum };
}

export function validateDimensions(columns, rows, ratio = DEFAULT_RATIO) {
  const checkedRatio = validateRatio(ratio);
  if (!checkedRatio.valid) return checkedRatio;
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
  const moves = columns * rows - 1;
  if (
    !Number.isSafeInteger(moves) ||
    moves < 1 ||
    moves % checkedRatio.sum !== 0
  ) {
    return {
      valid: false,
      message: `Число ходов a × b − 1 должно быть положительным и делиться на ${checkedRatio.sum}.`,
    };
  }
  const multiplier = moves / checkedRatio.sum;
  const quota = Object.fromEntries(
    MOVE_NAMES.map((kind) => [kind, ratio[kind] * multiplier]),
  );
  const fail = (message) => ({
    valid: false,
    message,
    quota,
    moves,
    multiplier,
  });
  if ((quota.H + quota.D) % 2 !== (columns - 1) % 2) {
    return fail("Чётность H + D должна совпадать с чётностью a − 1.");
  }
  if ((quota.V + quota.D) % 2 !== (rows - 1) % 2) {
    return fail("Чётность V + D должна совпадать с чётностью b − 1.");
  }
  const sameColor = (columns + rows) % 2 === 0;
  if ((quota.H + quota.V) % 2 !== (sameColor ? 0 : 1)) {
    return fail("Чётность H + V должна соответствовать цветам углов.");
  }
  if (quota.H + quota.D < columns - 1 || quota.V + quota.D < rows - 1) {
    return fail(
      "Ходов недостаточно, чтобы добраться до противоположного угла.",
    );
  }
  // Alternating row/column colors give these bounds only for an odd side.
  if (rows % 2 && quota.H < columns - 1)
    return fail("При нечётном b необходимо H ≥ a − 1.");
  if (columns % 2 && quota.V < rows - 1)
    return fail("При нечётном a необходимо V ≥ b − 1.");
  if (
    quota.H > (columns - 1) * rows ||
    quota.V > columns * (rows - 1) ||
    quota.D > 2 * (columns - 1) * (rows - 1)
  ) {
    return fail(
      "На доске недостаточно различных соседних пар для заданного количества ходов.",
    );
  }
  if (quota.H + quota.V < (sameColor ? 2 : 1)) {
    return fail(
      "Для посещения клеток обоих цветов нужны горизонтальные или вертикальные ходы.",
    );
  }
  return { valid: true, moves, multiplier, quota, sameColor };
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
  )
    return fail("Неверные начало или конец маршрута.");
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
    const dx = Math.abs(x - path[i - 1].x),
      dy = Math.abs(y - path[i - 1].y);
    if (dx > 1 || dy > 1 || dx + dy === 0)
      return fail("Ход должен вести в соседнюю клетку.");
    counts[dx && dy ? "D" : dx ? "H" : "V"]++;
  }
  if (!quota || MOVE_NAMES.some((kind) => counts[kind] !== quota[kind]))
    return fail("Количество ходов не совпадает с заданным соотношением.");
  return { valid: true, counts };
}

export const PATTERNS = {
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

function constructStrips(columns, rows, quota, deadline) {
  if (performance.now() >= deadline) return null;
  const stripCount = Math.floor(columns / 2),
    tail = columns % 2;
  if (!stripCount || rows < 2) return null;
  const evenRows = rows % 2 === 0;
  const blocksPerStrip = Math.floor((rows - 1) / 2);
  const bridges = stripCount - 1 + tail;
  let allocation;
  for (let through = stripCount; through >= 0 && !allocation; through--) {
    if (through % 2 !== 1 - tail) continue;
    const returns = stripCount - through;
    for (let hdCaps = evenRows ? through : 0; hdCaps >= 0; hdCaps--) {
      const baseH = returns + bridges + (evenRows ? 2 * hdCaps : through);
      const horizontalBlocks = (quota.H - baseH) / 2;
      const vd = through * blocksPerStrip - horizontalBlocks;
      const diagonalPairs = (quota.D - (evenRows ? through : 0)) / 2 - vd;
      const minHd = Math.max(0, diagonalPairs - returns * (rows - 1));
      const maxHd = Math.min(horizontalBlocks, diagonalPairs);
      if (
        !Number.isInteger(horizontalBlocks) ||
        !Number.isInteger(diagonalPairs) ||
        horizontalBlocks < 0 ||
        vd < 0 ||
        minHd > maxHd
      )
        continue;
      const hd = quota.V >= quota.D ? minHd : maxHd;
      allocation = {
        through,
        hdCaps,
        HVHV: horizontalBlocks - hd,
        HDHD: hd,
        VDVD: vd,
        laceDiagonals: diagonalPairs - hd,
      };
      break;
    }
  }
  if (!allocation) return null;
  const path = [],
    segments = [],
    remaining = { ...quota };
  let flipped = false;
  for (let strip = 0; strip < stripCount; strip++) {
    const fromIndex = path.length;
    const cells = [{ x: 0, y: 0 }];
    const add = (dx, dy) => {
      const previous = cells.at(-1);
      cells.push({ x: previous.x + dx, y: previous.y + dy });
      remaining[dx && dy ? "D" : dx ? "H" : "V"]--;
    };
    const isThrough = strip < allocation.through,
      patterns = [];
    let exitPattern;
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
      if (evenRows) {
        exitPattern = allocation.hdCaps > 0 ? "HDHH" : "VDVH";
        if (allocation.hdCaps > 0) allocation.hdCaps--;
        for (const [dx, dy] of PATTERNS[exitPattern].slice(0, 3)) add(dx, dy);
      } else {
        add(1, 0);
        exitPattern = "HH";
      }
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
      exitPattern,
    });
    if (isThrough) flipped = !flipped;
    if (strip < bridges) remaining.H--;
  }
  if (tail) {
    const fromIndex = path.length;
    for (let y = 0; y < rows; y++) path.push({ x: columns - 1, y });
    segments.push({
      kind: "final-column",
      fromIndex,
      toIndex: path.length - 1,
      direction: "up",
    });
  }
  return { path, segments };
}

export function solveBoard(
  columns,
  rows,
  { ratio = DEFAULT_RATIO, timeLimitMs = 2500 } = {},
) {
  const validation = validateDimensions(columns, rows, ratio);
  if (!validation.valid) return { status: "invalid", ...validation };
  const { quota } = validation;
  if (columns > MAX_SIDE || rows > MAX_SIDE)
    return {
      status: "not-found",
      quota,
      message: `Локальная версия ограничена сторонами до ${MAX_SIDE}.`,
    };
  if (columns === 1 || rows === 1) {
    const path = Array.from({ length: columns * rows }, (_, i) => ({
      x: columns === 1 ? 0 : i,
      y: rows === 1 ? 0 : i,
    }));
    const checked = verifyRoute(columns, rows, path, quota);
    if (!checked.valid) throw new Error(checked.message);
    return {
      status: "solved",
      path,
      quota,
      counts: checked.counts,
      segments: [{ kind: "straight", fromIndex: 0, toIndex: path.length - 1 }],
      transposed: false,
    };
  }
  const deadline = performance.now() + timeLimitMs;
  // shortcut: these explicit block families are incomplete; a failed construction
  // is not impossibility, and wider families are needed for unresolved sizes.
  for (const transposed of rows > columns ? [true, false] : [false, true]) {
    const construction = transposed
      ? constructStrips(
          rows,
          columns,
          { H: quota.V, V: quota.H, D: quota.D },
          deadline,
        )
      : constructStrips(columns, rows, quota, deadline);
    if (!construction) continue;
    if (transposed) {
      construction.path = construction.path.map(({ x, y }) => ({ x: y, y: x }));
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
    const checked = verifyRoute(columns, rows, construction.path, quota);
    if (!checked.valid) throw new Error(checked.message);
    return {
      status: "solved",
      ...construction,
      quota,
      counts: checked.counts,
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

export function findBoardChoices(ratio, maxSide = MAX_SIDE) {
  const checkedRatio = validateRatio(ratio);
  if (!checkedRatio.valid) return { ...checkedRatio, boards: [] };
  const boards = [],
    candidates = [];
  for (let columns = 1; columns <= Math.min(maxSide, MAX_SIDE); columns++) {
    for (let rows = 1; rows <= Math.min(maxSide, MAX_SIDE); rows++) {
      if (!validateDimensions(columns, rows, ratio).valid) continue;
      const board = { columns, rows };
      candidates.push(board);
      if (solveBoard(columns, rows, { ratio }).status === "solved")
        boards.push(board);
    }
  }
  const compare = (a, b) =>
    a.columns * a.rows - b.columns * b.rows ||
    Math.min(a.columns, a.rows) - Math.min(b.columns, b.rows) ||
    a.columns - b.columns;
  boards.sort(compare);
  candidates.sort(compare);
  return {
    valid: true,
    boards,
    unresolved: candidates.length - boards.length,
    minimumByConditions: candidates[0] ?? null,
  };
}
