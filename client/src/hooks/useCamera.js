import { useEffect, useRef, useState, useCallback } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const FRAME_RATE = 10; // frames per second

export function useCamera() {
  const videoRef = useRef(null);
  const landmarkerRef = useRef(null);
  const intervalRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(false);
  const [facesDetected, setFacesDetected] = useState(false);
  const [error, setError] = useState("");

  const frameBufferRef = useRef([]); // stores landmark arrays
  const onFrameCallback = useRef(null); // called every 100 frames

  // load mediapipe
  useEffect(() => {
    (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
        );
        landmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
        });
        setReady(true);
      } catch (e) {
        setError("Failed to load MediaPipe");
      }
    })();

    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = useCallback(async (onWindow) => {
    if (!ready) return;
    onFrameCallback.current = onWindow;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setActive(true);
      startProcessing();
    } catch {
      setError("Camera access denied");
    }
  }, [ready]);

  const stopCamera = useCallback(() => {
    clearInterval(intervalRef.current);
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setActive(false);
    frameBufferRef.current = [];
  }, []);

  const startProcessing = () => {
    intervalRef.current = setInterval(() => {
      if (!videoRef.current || !landmarkerRef.current) return;
      const video = videoRef.current;
      if (video.readyState < 2) return;

      const result = landmarkerRef.current.detectForVideo(video, performance.now());
      const landmarks = result.faceLandmarks?.[0];

      if (!landmarks || landmarks.length === 0) {
        setFacesDetected(false);
        return;
      }

      setFacesDetected(true);

      // flatten [478, 3]
      const flat = new Float32Array(478 * 3);
      for (let i = 0; i < 478; i++) {
        flat[i * 3] = landmarks[i].x;
        flat[i * 3 + 1] = landmarks[i].y;
        flat[i * 3 + 2] = landmarks[i].z;
      }

      frameBufferRef.current.push(flat);

      // when we have 100 frames → send window
      if (frameBufferRef.current.length >= 100) {
        const window = frameBufferRef.current.splice(0, 100);
        onFrameCallback.current?.(window);
      }
    }, 1000 / FRAME_RATE);
  };

  return { videoRef, ready, active, facesDetected, error, startCamera, stopCamera };
}
