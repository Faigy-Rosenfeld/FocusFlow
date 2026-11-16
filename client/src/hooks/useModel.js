import { useEffect, useRef, useState } from "react";
import * as ort from "onnxruntime-web";

ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/";
ort.env.wasm.numThreads = 1;

const FAST_MODEL = "/models/v1.onnx";
const DEEP_MODEL = "/models/v4_2.onnx";
const LOW_SCORE_THRESHOLD = 0.5;

export function useModel() {
  const fastRef = useRef(null);
  const deepRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        fastRef.current = await ort.InferenceSession.create(FAST_MODEL, {
          executionProviders: ["wasm"],
        });
        deepRef.current = await ort.InferenceSession.create(DEEP_MODEL, {
          executionProviders: ["wasm"],
        });
        setReady(true);
      } catch (e) {
        setError("טעינת מודל הקשב נכשלה. רענן את הדף.");
      }
    })();
  }, []);

  const runInference = async (frames) => {
    if (!ready) return null;

    try {
      const flat = new Float32Array(100 * 478 * 3);
      for (let i = 0; i < 100; i++) {
        flat.set(frames[i], i * 478 * 3);
      }

      const runModel = async (session) => {
        const inputName = session.inputNames[0];
        const tensor = new ort.Tensor("float32", flat, [1, 100, 478, 3]);
        const output = await session.run({ [inputName]: tensor });
        const outData = output[session.outputNames[0]].data;
        const val = parseFloat(outData[0]);
        if (Number.isNaN(val)) {
          return null;
        }
        return val;
      };

      const fastScore = await runModel(fastRef.current);
      if (fastScore === null) return null;

      if (fastScore < LOW_SCORE_THRESHOLD) {
        const deepScore = await runModel(deepRef.current);
        return deepScore ?? fastScore;
      }

      return fastScore;
    } catch (e) {
      return null;
    }
  };

  return { ready, error, runInference };
}
