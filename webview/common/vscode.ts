export type VscodeApi = {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

declare const acquireVsCodeApi: () => VscodeApi;

export function acquireVscodeApi(): VscodeApi {
  return acquireVsCodeApi();
}
