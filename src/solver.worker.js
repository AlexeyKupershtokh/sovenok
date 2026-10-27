import { findBoardChoices, findFinishChoices, solveBoard } from "../solver.js";

self.onmessage = ({ data }) => {
  try {
    self.postMessage(
      data.type === "choices"
        ? { type: "choices", ...findBoardChoices(data.ratio) }
        : data.type === "finishes"
          ? findFinishChoices(data.columns, data.rows, { ratio: data.ratio })
          : solveBoard(data.columns, data.rows, { ratio: data.ratio, finish: data.finish }),
    );
  } catch (error) {
    self.postMessage({ status: "error", message: error.message });
  }
};
