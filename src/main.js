import "./style.css";
import { validateDimensions } from "../solver.js";

const $ = (id) => document.getElementById(id);
const form = $("board-form");
const columnsInput = $("columns");
const rowsInput = $("rows");
const timeline = $("timeline");
const colors = { H: "#c17a48", V: "#3d7766", D: "#6a85b4" };
let columns = 9;
let rows = 11;
let solution = null;
let worker = null;
let step = 0;
let timer = null;
let busy = false;

const moveType = (a, b) => (a.x === b.x ? "V" : a.y === b.y ? "H" : "D");
const playIcon =
  '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="m6 3 11 7-11 7Z" fill="currentColor"/></svg>';
const pauseIcon =
  '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 3h4v14H5zm7 0h4v14h-4z" fill="currentColor"/></svg>';

function checkInputs() {
  const m = columnsInput.valueAsNumber;
  const n = rowsInput.valueAsNumber;
  const validation =
    m > 31 || n > 31
      ? {
          valid: false,
          message: "Для этой версии выберите размеры не больше 31 × 31.",
        }
      : validateDimensions(m, n);
  $("validation").textContent = validation.valid
    ? "Размеры прошли предварительную проверку"
    : validation.message;
  $("validation").classList.toggle("error", !validation.valid);
  columnsInput.setAttribute("aria-invalid", String(!validation.valid));
  rowsInput.setAttribute("aria-invalid", String(!validation.valid));
  $("build").disabled = !validation.valid || busy;
  const quota = validation.quota;
  for (const kind of ["H", "V", "D"])
    $("quota-" + kind.toLowerCase()).textContent = quota?.[kind] ?? "—";
  $("quota-total").textContent = validation.moves ?? "—";
  document.querySelectorAll("[data-size]").forEach((button) => {
    button.classList.toggle("active", button.dataset.size === `${m},${n}`);
  });
  return validation;
}

function stopPlayback() {
  clearInterval(timer);
  timer = null;
  $("play").innerHTML = playIcon;
  $("play").setAttribute("aria-label", "Воспроизвести маршрут");
  $("play").title = "Воспроизвести";
}

function updateControls() {
  const disabled = !solution || busy;
  for (const id of ["rewind", "play", "next", "timeline", "show-all"])
    $(id).disabled = disabled;
  if (!disabled) {
    $("next").disabled = step === solution.path.length - 1;
    $("rewind").disabled = step === 0;
    $("play").disabled = solution.path.length === 1;
  }
}

function showMessage(title, description) {
  $("board-message").hidden = false;
  $("message-title").textContent = title;
  $("message-description").textContent = description;
}

function drawBoard() {
  const path = solution?.path ?? [];
  const order = new Map(
    path.map((cell, index) => [`${cell.x},${cell.y}`, index + 1]),
  );
  let cells = "";
  let labels = "";
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const screenY = rows - 1 - y;
      cells += `<rect x="${x}" y="${screenY}" width="1" height="1" class="${(x + y) % 2 ? "cell-dark" : "cell-light"}"/>`;
      const number = order.get(`${x},${y}`);
      if (number)
        labels += `<text x="${x + 0.79}" y="${screenY + 0.83}" text-anchor="end" class="cell-number" data-order="${number}">${number}</text>`;
    }
  }
  const edges = path
    .slice(1)
    .map((point, index) => {
      const previous = path[index];
      const type = moveType(previous, point);
      return `<line class="route-edge route-${type.toLowerCase()}" data-edge="${index + 1}" x1="${previous.x + 0.5}" y1="${rows - previous.y - 0.5}" x2="${point.x + 0.5}" y2="${rows - point.y - 0.5}"/>`;
    })
    .join("");
  const dots = path
    .slice(1, -1)
    .map(
      (point, index) =>
        `<circle class="route-node" data-node="${index + 1}" cx="${point.x + 0.5}" cy="${rows - point.y - 0.5}" r=".065"/>`,
    )
    .join("");
  const xAxis = Array.from(
    { length: columns },
    (_, x) =>
      `<text class="axis-label" x="${x + 0.5}" y="${rows + 0.37}" text-anchor="middle">${x + 1}</text>`,
  ).join("");
  const yAxis = Array.from(
    { length: rows },
    (_, y) =>
      `<text class="axis-label" x="-.24" y="${rows - y - 0.44}" text-anchor="end">${y + 1}</text>`,
  ).join("");
  $("board-wrap").innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-.65 -.25 ${columns + 1} ${rows + 0.9}" class="board-svg ${$("show-numbers").checked ? "" : "hide-numbers"}" role="img" aria-label="Шахматная доска: ${columns} столбцов, ${rows} строк. Старт снизу слева, финиш сверху справа."><title>Маршрут по клеткам доски ${columns} × ${rows}</title>${cells}<rect x="0" y="0" width="${columns}" height="${rows}" class="grid-frame"/>${edges}${dots}${labels}<circle cx=".5" cy="${rows - 0.5}" r=".23" class="endpoint"/><text x=".5" y="${rows - 0.5}" class="endpoint-label">С</text>${columns * rows > 1 ? `<circle cx="${columns - 0.5}" cy=".5" r=".23" class="endpoint finish"/><text x="${columns - 0.5}" y=".5" class="endpoint-label">Ф</text>` : ""}<circle id="current-node" r=".13" class="current-node" hidden/>${xAxis}${yAxis}</svg>`;
  $("board-title").textContent = `Доска ${columns} × ${rows}`;
  $("board-subtitle").textContent =
    `${columns * rows} клеток · ${columns * rows - 1} переходов${solution && rows > columns ? (solution.transposed ? " · транспонировано" : " · исходная ориентация") : ""}`;
}

function setStep(value) {
  if (!solution) return;
  step = Math.max(0, Math.min(solution.path.length - 1, Number(value)));
  timeline.value = step;
  timeline.style.setProperty(
    "--progress",
    `${solution.path.length > 1 ? (step / (solution.path.length - 1)) * 100 : 100}%`,
  );
  $("step-value").textContent = step;
  $("visited-count").textContent =
    `Посещено ${step + 1} из ${columns * rows} клеток`;
  document.querySelectorAll("[data-edge]").forEach((edge) => {
    edge.style.display = Number(edge.dataset.edge) <= step ? "" : "none";
  });
  document.querySelectorAll("[data-node]").forEach((node) => {
    node.style.display = Number(node.dataset.node) <= step ? "" : "none";
  });
  document.querySelectorAll("[data-order]").forEach((label) => {
    label.style.opacity = Number(label.dataset.order) <= step + 1 ? "1" : ".25";
  });
  const point = solution.path[step];
  const marker = $("current-node");
  marker.setAttribute("cx", point.x + 0.5);
  marker.setAttribute("cy", rows - point.y - 0.5);
  marker.style.display =
    step > 0 && step < solution.path.length - 1 ? "" : "none";
  marker.removeAttribute("hidden");
  const counts = { H: 0, V: 0, D: 0 };
  for (let i = 1; i <= step; i++)
    counts[moveType(solution.path[i - 1], solution.path[i])]++;
  for (const type of ["H", "V", "D"])
    $("used-" + type.toLowerCase()).textContent =
      `${counts[type]}/${solution.quota[type]}`;
  if (step === solution.path.length - 1) stopPlayback();
  updateControls();
}

function startPlayback() {
  if (!solution || solution.path.length < 2) return;
  if (timer) {
    stopPlayback();
    return;
  }
  if (step === solution.path.length - 1) setStep(0);
  $("play").innerHTML = pauseIcon;
  $("play").setAttribute("aria-label", "Приостановить маршрут");
  $("play").title = "Приостановить";
  timer = setInterval(() => setStep(step + 1), Number($("speed").value));
}

function buildRoute() {
  if (!checkInputs().valid) return;
  worker?.terminate();
  stopPlayback();
  columns = columnsInput.valueAsNumber;
  rows = rowsInput.valueAsNumber;
  solution = null;
  busy = true;
  step = 0;
  $("build").querySelector("span").textContent = "Подбираем маршрут…";
  $("route-status").textContent =
    rows > columns
      ? "Транспонируем доску и собираем полосы…"
      : "Собираем двухколоночные полосы…";
  $("route-status").classList.remove("error");
  $("step-total").textContent = columns * rows - 1;
  $("step-value").textContent = "0";
  $("visited-count").textContent = "Проверяем все клетки и квоты ходов";
  timeline.max = columns * rows - 1;
  timeline.value = "0";
  timeline.style.setProperty("--progress", "0%");
  for (const kind of ["h", "v", "d"]) $("used-" + kind).textContent = "—";
  drawBoard();
  showMessage(
    "Ищем непрерывный путь",
    "Собираем полосы, подбираем баланс ходов и проверяем каждую клетку.",
  );
  updateControls();
  checkInputs();
  worker = new Worker(new URL("./solver.worker.js", import.meta.url), {
    type: "module",
  });
  const finish = () => {
    busy = false;
    worker?.terminate();
    worker = null;
    $("build").querySelector("span").textContent = "Построить маршрут";
    checkInputs();
    updateControls();
  };
  worker.onmessage = ({ data }) => {
    if (data.status === "solved") {
      solution = data;
      $("board-message").hidden = true;
      $("route-status").textContent =
        `Маршрут проверен · ${columns * rows} клеток без повторов`;
      $("route-status").classList.remove("error");
      drawBoard();
      finish();
      setStep(data.path.length - 1);
    } else {
      const title =
        data.status === "impossible" || data.status === "invalid"
          ? "Для этих условий пути нет"
          : data.status === "error"
            ? "Не удалось выполнить расчёт"
            : "Маршрут пока не найден";
      showMessage(title, data.message);
      $("route-status").textContent =
        data.status === "not-found"
          ? "Построение не завершилось решением"
          : title;
      $("route-status").classList.add("error");
      $("visited-count").textContent = "Измените размеры и попробуйте снова";
      finish();
    }
  };
  worker.onerror = () => {
    showMessage(
      "Не удалось выполнить расчёт",
      "Попробуйте построить маршрут ещё раз или выберите другой размер.",
    );
    $("route-status").textContent = "Ошибка расчёта";
    $("route-status").classList.add("error");
    finish();
  };
  worker.postMessage({ columns, rows });
}

const patterns = [
  {
    name: "HVHV",
    subtitle: "Подъём с горизонталями",
    points: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 2],
    ],
    width: 2,
    height: 3,
  },
  {
    name: "HDHD",
    subtitle: "Подъём по диагонали",
    points: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
    ],
    width: 2,
    height: 3,
  },
  {
    name: "VDVD",
    subtitle: "Экономим горизонтали",
    points: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [0, 2],
    ],
    width: 2,
    height: 3,
  },
  {
    name: "HH",
    subtitle: "Переход в новую полосу",
    points: [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    width: 3,
    height: 1,
  },
  {
    name: "DDVVHVVDDH",
    subtitle: "Шнуровка и возврат",
    points: [
      [0, 0],
      [1, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [1, 4],
      [1, 3],
      [1, 2],
      [0, 1],
      [1, 0],
      [2, 0],
    ],
    width: 3,
    height: 5,
  },
  {
    name: "VV",
    subtitle: "Завершающий проход",
    points: [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
    width: 1,
    height: 3,
  },
];
$("pattern-grid").innerHTML = patterns
  .map((pattern, index) => {
    const scale = Math.min(20, 56 / pattern.height);
    const offsetX = (110 - pattern.width * scale) / 2;
    const offsetY = (63 - pattern.height * scale) / 2;
    const position = ([x, y]) => [
      offsetX + (x + 0.5) * scale,
      offsetY + (pattern.height - y - 0.5) * scale,
    ];
    let grid = "";
    for (let y = 0; y < pattern.height; y++)
      for (let x = 0; x < pattern.width; x++)
        grid += `<rect x="${offsetX + x * scale}" y="${offsetY + y * scale}" width="${scale}" height="${scale}" fill="${(x + y) % 2 ? "#e0e6d4" : "#fafbf5"}"/>`;
    const lines = pattern.points
      .slice(1)
      .map((point, i) => {
        const a = position(pattern.points[i]),
          b = position(point);
        const kind = moveType(
          { x: pattern.points[i][0], y: pattern.points[i][1] },
          { x: point[0], y: point[1] },
        );
        return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${colors[kind]}" stroke-width="1.5" stroke-linecap="round"/>`;
      })
      .join("");
    const start = position(pattern.points[0]);
    const end = position(pattern.points.at(-1));
    return `<article class="pattern-card"><div class="pattern-art"><svg viewBox="0 0 110 63" aria-hidden="true">${grid}${lines}<circle cx="${start[0]}" cy="${start[1]}" r="2.2" fill="#28574a"/><circle cx="${end[0]}" cy="${end[1]}" r="2" fill="#fcfcf8" stroke="#8b9b7b" stroke-width="1"/></svg></div><div class="pattern-description"><h3>${pattern.name}<span>0${index + 1}</span></h3><p>${pattern.subtitle}</p></div></article>`;
  })
  .join("");

// Show exact progress alongside the three move colors.
for (const type of ["h", "v", "d"]) {
  const label = document.querySelector(`.legend .${type}-bg`).parentElement;
  label.insertAdjacentHTML("beforeend", ` <span id="used-${type}">—</span>`);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  buildRoute();
});
for (const input of [columnsInput, rowsInput])
  input.addEventListener("input", checkInputs);
document.querySelectorAll("[data-size]").forEach((button) =>
  button.addEventListener("click", () => {
    const [m, n] = button.dataset.size.split(",");
    columnsInput.value = m;
    rowsInput.value = n;
    if (busy) {
      worker?.terminate();
      busy = false;
    }
    buildRoute();
  }),
);
$("show-numbers").addEventListener("change", () =>
  document
    .querySelector(".board-svg")
    ?.classList.toggle("hide-numbers", !$("show-numbers").checked),
);
$("play").addEventListener("click", startPlayback);
$("rewind").addEventListener("click", () => {
  stopPlayback();
  setStep(0);
});
$("next").addEventListener("click", () => {
  stopPlayback();
  setStep(step + 1);
});
$("show-all").addEventListener("click", () => {
  stopPlayback();
  setStep(solution.path.length - 1);
});
timeline.addEventListener("input", () => {
  stopPlayback();
  setStep(timeline.value);
});
$("speed").addEventListener("change", () => {
  if (timer) {
    stopPlayback();
    startPlayback();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopPlayback();
});
buildRoute();
