import { runSynthesisStress } from "./synthesisStress";
self.onmessage = (event: MessageEvent<number>) => {
  const count = Math.max(64, Math.min(2048, Math.round(event.data)));
  self.postMessage({
    report: runSynthesisStress(count, (done) =>
      self.postMessage({ done, count }),
    ),
  });
};
