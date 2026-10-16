import { solveBoard } from "../solver.js";

self.onmessage = ({ data: { columns, rows } }) => {
  try {
    self.postMessage(solveBoard(columns, rows));
  } catch (error) {
    self.postMessage({ status: "error", message: error.message });
  }
};
