import { useEffect, useRef, useState } from "react";
import * as ort from "onnxruntime-web";

const FAST_MODEL = "/models/v1.onnx";
const DEEP_MODEL = "/models/v4_2.onnx";
const LOW_SCORE_THRESHOLD = 0.5; // if fast model < this, run deep model

export function useModel() {
  const fastRef = useRef(null);
  const deepRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        fastRef.current = await ort.InferenceSession.create(FAST_MODEL);
        deepRef.current = await ort.InferenceSession.create(DEEP_MODEL);
        setReady(true);
      } catch (e) {
        console.error("Failed to load ONNX models", e);
      }
    })();
  }, []);

  // frames: array of 100 Float32Array(478*3)
  const runInference = async (frames) => {
    if (!ready) return null;

    // build [1, 100, 478, 3] tensor
    const flat = new Float32Array(100 * 478 * 3);
    for (let i = 0; i < 100; i++) {
      flat.set(frames[i], i * 478 * 3);
    }

    const runModel = async (session) => {
      const inputName = session.inputNames[0];
      const tensor = new ort.Tensor("float32", flat, [1, 100, 478, 3]);
      const output = await session.run({ [inputName]: tensor });
      return parseFloat(output[session.outputNames[0]].data[0]);
    };

    // fast model first
    const fastScore = await runModel(fastRef.current);

    // if low → run deep model
    if (fastScore < LOW_SCORE_THRESHOLD) {
      const deepScore = await runModel(deepRef.current);
      return deepScore;
    }

    return fastScore;
  };

  return { ready, runInference };
}
