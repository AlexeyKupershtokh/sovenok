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

export function validateDimensions(
  columns,
  rows,
  ratio = DEFAULT_RATIO,
  finish = { x: columns - 1, y: rows - 1 },
) {
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
  if (
    !finish || !Number.isInteger(finish.x) || !Number.isInteger(finish.y) ||
    finish.x < 0 || finish.x >= columns || finish.y < 0 || finish.y >= rows ||
    (finish.x !== 0 && finish.x !== columns - 1 && finish.y !== 0 && finish.y !== rows - 1)
  ) return fail("Выберите финиш на границе доски.");
  if (finish.x === 0 && finish.y === 0)
    return fail("Это клетка старта. Финиш здесь потребовал бы повторного посещения клетки.");
  const parity = (value) => value % 2 ? "нечётное" : "чётное";
  if ((quota.H + quota.D) % 2 !== finish.x % 2) {
    return fail(`H + D = ${quota.H + quota.D} — ${parity(quota.H + quota.D)} число, а расстояние до этой клетки по горизонтали равно ${finish.x} — ${parity(finish.x)}. Чётность должна совпадать.`);
  }
  if ((quota.V + quota.D) % 2 !== finish.y % 2) {
    return fail(`V + D = ${quota.V + quota.D} — ${parity(quota.V + quota.D)} число, а расстояние до этой клетки по вертикали равно ${finish.y} — ${parity(finish.y)}. Чётность должна совпадать.`);
  }
  const sameColor = (finish.x + finish.y) % 2 === 0;
  if ((quota.H + quota.V) % 2 !== (sameColor ? 0 : 1)) {
    return fail("Чётность H + V должна соответствовать цветам углов.");
  }
  if (quota.H + quota.D < finish.x)
    return fail(`По горизонтали нужно пройти ${finish.x} клеток, но H + D = ${quota.H + quota.D}: ходов недостаточно.`);
  if (quota.V + quota.D < finish.y)
    return fail(`По вертикали нужно пройти ${finish.y} клеток, но V + D = ${quota.V + quota.D}: ходов недостаточно.`);
  // Alternating row/column degree sums include both endpoint colors.
  const minH = Math.abs(columns * (rows % 2) - Number(finish.y % 2 === 0));
  const minV = Math.abs(rows * (columns % 2) - Number(finish.x % 2 === 0));
  if (quota.H < minH) return fail(`Для этого финиша необходимо H ≥ ${minH}. Задано H = ${quota.H}.`);
  if (quota.V < minV) return fail(`Для этого финиша необходимо V ≥ ${minV}. Задано V = ${quota.V}.`);
  if (finish.x === columns - 1 && finish.y === rows - 1) {
    if (quota.H === 0 && quota.D < (columns - 1) * rows / 2)
      return fail(`При H = 0 для финиша в верхнем правом углу необходимо D ≥ (a − 1) × b / 2 = ${(columns - 1) * rows / 2}.`);
    if (quota.V === 0 && quota.D < (rows - 1) * columns / 2)
      return fail(`При V = 0 для финиша в верхнем правом углу необходимо D ≥ (b − 1) × a / 2 = ${(rows - 1) * columns / 2}.`);
  }
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

export function getFinishCells(columns, rows, ratio, finishes = []) {
  if (!Number.isSafeInteger(columns) || !Number.isSafeInteger(rows) ||
    columns < 1 || rows < 1 || columns > MAX_SIDE || rows > MAX_SIDE) return [];
  const available = new Set(finishes.map(({ finish }) => `${finish.x},${finish.y}`));
  const cells = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    if (x !== 0 && x !== columns - 1 && y !== 0 && y !== rows - 1) continue;
    const solved = available.has(`${x},${y}`);
    const checked = validateDimensions(columns, rows, ratio, { x, y });
    cells.push({ x, y, available: solved, reason: solved ? "Есть проверенный маршрут." :
      checked.valid ? "маршрут пока не найден; это не доказательство невозможности" : checked.message });
  }
  return cells;
}

export function verifyRoute(
  columns,
  rows,
  path,
  quota = validateDimensions(columns, rows).quota,
  finish = { x: columns - 1, y: rows - 1 },
) {
  const counts = { H: 0, V: 0, D: 0 };
  const fail = (message) => ({ valid: false, counts, message });
  if (!Array.isArray(path) || path.length !== columns * rows)
    return fail("Посещены не все клетки.");
  if (
    path[0]?.x !== 0 ||
    path[0]?.y !== 0 ||
    path.at(-1)?.x !== finish.x ||
    path.at(-1)?.y !== finish.y
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
  VHVH: [[0, 1], [1, 0], [0, -1], [1, 0]],
  VHVV: [[0, 1], [1, 0], [0, -1], [0, -1]],
  VHVD: [[0, 1], [1, 0], [0, -1], [1, -1]],
  DHDH: [[1, 1], [-1, 0], [1, -1], [1, 0]],
  DHDV: [[1, 1], [-1, 0], [1, -1], [0, -1]],
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
  { ratio = DEFAULT_RATIO, timeLimitMs = 2500, finish } = {},
) {
  const validation = validateDimensions(columns, rows, ratio, finish);
  if (!validation.valid) return { status: "invalid", ...validation };
  const { quota } = validation;
  if (columns > MAX_SIDE || rows > MAX_SIDE)
    return {
      status: "not-found",
      quota,
      message: `Локальная версия ограничена сторонами до ${MAX_SIDE}.`,
    };
  if (finish && (finish.x !== columns - 1 || finish.y !== rows - 1)) {
    const choices = findFinishChoices(columns, rows, { ratio, timeLimitMs });
    return choices.finishes.find((route) => route.finish.x === finish.x && route.finish.y === finish.y) ?? {
      status: "not-found", quota,
      message: "Для этого финиша маршрут пока не найден.",
    };
  }
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
      "Разрешённые паттерны пока не дали маршрут.",
  };
}

const moveKind = (a, b) => a.x === b.x ? "V" : a.y === b.y ? "H" : "D";

// Each completed tile is a 2×2 pattern, or a straight piece on an odd border.
function searchBlockFinishes(columns, rows, quota, deadline, onRoute, offsetX, offsetY) {
  if (performance.now() >= deadline) return;
  const tiles = [], tileAt = new Uint16Array(columns * rows);
  const intervals = (length, offset) => {
    const result = [];
    for (let start = 0; start < length;) {
      const width = start === 0 && offset ? 1 : Math.min(2, length - start);
      result.push([start, width]); start += width;
    }
    return result;
  };
  for (const [y, height] of intervals(rows, offsetY))
    for (const [x, width] of intervals(columns, offsetX)) {
      const cells = [];
      for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
        const cell = { x: x + dx, y: y + dy };
        tileAt[cell.y * columns + cell.x] = tiles.length;
        cells.push(cell);
      }
      tiles.push({ cells, routes: new Map(), neighbors: new Set() });
    }
  const inside = ({ x, y }) => x >= 0 && x < columns && y >= 0 && y < rows;
  const id = ({ x, y }) => y * columns + x;
  for (const [index, tile] of tiles.entries()) {
    const own = new Set(tile.cells.map(id));
    for (const entry of tile.cells) {
      const routes = [], seen = new Set();
      const add = (body, pattern, exit) => {
        if (new Set(body.map(id)).size !== tile.cells.length || body.some((p) => !inside(p) || !own.has(id(p)))) return;
        const key = body.map(id).join(",") + ":" + (exit ? id(exit) : "end");
        if (seen.has(key) || (exit && (!inside(exit) || own.has(id(exit))))) return;
        seen.add(key);
        const cost = { H: 0, D: 0, V: 0 };
        for (let i = 1; i < body.length; i++) cost[moveKind(body[i - 1], body[i])]++;
        const next = exit ? tileAt[id(exit)] : -1;
        if (exit) tile.neighbors.add(next);
        routes.push({ body, pattern, cost, exit, next });
      };
      if (tile.cells.length === 4) {
        for (const [name, deltas] of Object.entries(PATTERNS)) {
          const variants = name === "VHVD" ? [deltas, [...deltas.slice(0, 3), [1, 1]]] : [deltas];
          for (const variant of variants) for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
            const body = [entry];
            for (const [dx, dy] of variant.slice(0, 3)) {
              const previous = body.at(-1);
              body.push({ x: previous.x + sx * dx, y: previous.y + sy * dy });
            }
            const last = body.at(-1), [dx, dy] = variant[3];
            add(body, name, null);
            add(body, name, { x: last.x + sx * dx, y: last.y + sy * dy });
          }
        }
      } else {
        const body = [entry, ...tile.cells.filter((p) => id(p) !== id(entry))];
        add(body, null, null);
        const last = body.at(-1);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
          if (dx || dy) add(body, null, { x: last.x + dx, y: last.y + dy });
      }
      tile.routes.set(id(entry), routes);
    }
    tile.neighbors.delete(index);
  }
  const visited = new Uint8Array(tiles.length), path = [], segments = [], remaining = { ...quota };
  let nodes = 0, done = false;
  function visit(entry, depth) {
    if (done || performance.now() >= deadline) return;
    nodes++;
    const tileIndex = tileAt[id(entry)], tile = tiles[tileIndex];
    visited[tileIndex] = 1;
    const options = tile.routes.get(id(entry)).filter((route) => {
      if (depth === tiles.length) return !route.exit;
      return route.exit && !visited[route.next];
    });
    const degree = (next) => [...tiles[next].neighbors].filter((i) => !visited[i]).length;
    options.sort((a, b) => (a.next < 0 ? 0 : degree(a.next)) - (b.next < 0 ? 0 : degree(b.next)));
    for (const route of options) {
      const cost = { ...route.cost };
      if (route.exit) cost[moveKind(route.body.at(-1), route.exit)]++;
      if (MOVE_NAMES.some((kind) => cost[kind] > remaining[kind])) continue;
      for (const kind of MOVE_NAMES) remaining[kind] -= cost[kind];
      const fromIndex = path.length;
      path.push(...route.body);
      segments.push({ kind: route.pattern ? "block" : "straight", pattern: route.pattern, fromIndex, toIndex: path.length - 1 });
      if (!route.exit) {
        const finish = path.at(-1);
        if (MOVE_NAMES.every((kind) => remaining[kind] === 0) &&
          (finish.x === 0 || finish.x === columns - 1 || finish.y === 0 || finish.y === rows - 1))
          done = onRoute(path.slice(), segments.slice());
      } else {
        // A detached unvisited tile can never be reached later.
        const connected = nodes % 32 !== 0 || tiles.every((t, i) => visited[i] || i === route.next || [...t.neighbors].some((j) => !visited[j]));
        if (connected) visit(route.exit, depth + 1);
      }
      segments.pop(); path.length = fromIndex;
      for (const kind of MOVE_NAMES) remaining[kind] += cost[kind];
      if (done || performance.now() >= deadline) break;
    }
    visited[tileIndex] = 0;
  }
  visit({ x: 0, y: 0 }, 1);
}

export function findFinishChoices(columns, rows, { ratio = DEFAULT_RATIO, timeLimitMs = 1500 } = {}) {
  if (!validateRatio(ratio).valid || !Number.isInteger(columns) || !Number.isInteger(rows) ||
    columns < 1 || rows < 1 || columns > MAX_SIDE || rows > MAX_SIDE)
    return { type: "finishes", finishes: [], unresolved: 0 };
  const candidates = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    if (x !== 0 && x !== columns - 1 && y !== 0 && y !== rows - 1) continue;
    if (validateDimensions(columns, rows, ratio, { x, y }).valid) candidates.push({ x, y });
  }
  const finishes = new Map();
  if (!candidates.length || columns > MAX_SIDE || rows > MAX_SIDE)
    return { type: "finishes", finishes: [], unresolved: candidates.length };
  const { quota } = validateDimensions(columns, rows, ratio, candidates[0]);
  const accept = (path, segments, transposed = false) => {
    const finish = path.at(-1), key = finish.x + "," + finish.y;
    if (finishes.has(key) || !validateDimensions(columns, rows, ratio, finish).valid) return finishes.size === candidates.length;
    const checked = verifyRoute(columns, rows, path, quota, finish);
    if (!checked.valid) throw new Error(checked.message);
    finishes.set(key, { status: "solved", path, segments, quota, counts: checked.counts, finish, transposed, method: "blocks" });
    return finishes.size === candidates.length;
  };
  const base = solveBoard(columns, rows, { ratio });
  if (base.status === "solved") {
    const finish = base.path.at(-1);
    finishes.set(finish.x + "," + finish.y, { ...base, finish });
  }
  // shortcut: search approved block tilings within a time budget; missing finishes
  // remain unresolved, never classified as mathematically impossible.
  const layouts = [];
  for (const transposed of [false, true]) {
    const width = transposed ? rows : columns, height = transposed ? columns : rows;
    for (const ox of width % 2 && width > 1 ? [false, true] : [false])
      for (const oy of height % 2 && height > 1 ? [false, true] : [false])
        layouts.push({ transposed, width, height, ox, oy });
  }
  const started = performance.now(), budget = Number.isFinite(timeLimitMs) ? Math.max(0, timeLimitMs) : 1500;
  for (const [i, layout] of layouts.entries()) {
    if (finishes.size === candidates.length) break;
    const { transposed, width, height, ox, oy } = layout;
    searchBlockFinishes(width, height,
      transposed ? { H: quota.V, D: quota.D, V: quota.H } : quota,
      started + budget * (i + 1) / layouts.length,
      (path, segments) => accept(transposed ? path.map(({ x, y }) => ({ x: y, y: x })) : path, segments, transposed), ox, oy);
  }
  return { type: "finishes", finishes: [...finishes.values()], unresolved: candidates.length - finishes.size };
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
