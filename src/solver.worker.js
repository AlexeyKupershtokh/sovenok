import { findBoardChoices, solveBoard } from "../solver.js";

self.onmessage = ({ data }) => {
  try {
    self.postMessage(
      data.type === "choices"
        ? { type: "choices", ...findBoardChoices(data.ratio) }
        : solveBoard(data.columns, data.rows, { ratio: data.ratio }),
    );
  } catch (error) {
    self.postMessage({ status: "error", message: error.message });
  }
};
