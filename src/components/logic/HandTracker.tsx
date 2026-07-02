// src/components/logic/HandTracker.tsx
// 【最终清理版】移除了所有 Swap 相关逻辑和引用

import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'; // 明确标示为类型导入
// 使用别名导入单例服务
import { initializeHands, getHandLandmarkerInstance } from '@/utils/mediaPipeService';
import { getSharedCameraVideo, subscribeSharedCameraChange } from '../../utils/cameraService';
import { subscribeRealtimeClock } from '../../utils/realtimeClock';


// --- 辅助函数 (保持不变) ---
const calculateAngle = (p1: any, p2: any, p3: any) => {
    if (!p1 || !p2 || !p3) return 0;
    const v1 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
    const v2 = { x: p3.x - p1.x, y: p3.y - p1.y, z: p3.z - p1.z };
    const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);
    return Math.acos(Math.min(1, Math.max(-1, dot / (mag1 * mag2)))) || 0;
};
const dist = (p1: {x:number, y:number}, p2: {x:number, y:number}) => Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
const SEAL_DROP_GRACE_MS = 220;

export const HandTracker: React.FC = () => {
  // 【关键】不再从 store 里解构 isSwapped
  const { mode, activeClipId, videoClips, handDataRef } = useAppStore();
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const detectionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isMounted = useRef(true);
  const requestRef = useRef<number>(0);
  const stopClockRef = useRef<(() => void) | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastDetectAtRef = useRef(0);
  const smoothedDetectionFpsRef = useRef(0);
  const smoothedCameraFpsRef = useRef(0);
  const loopModeRef = useRef('idle');
  const isReadyRef = useRef(false);
  const lastSealAtRef = useRef(0);
  const lastSealSizeRef = useRef(0);

  useEffect(() => {
    isMounted.current = true;
    console.log("HandTracker: Mount (Using Shared Service)");

    const setupMediaPipe = async () => {
        try {
            console.log("HandTracker requesting shared Hands initialization...");
            await initializeHands();
            
            if (!isMounted.current) return;
            console.log("HandTracker received shared Hands instance. Starting stream...");
            
            await createVideoElement();
            isReadyRef.current = true;
            startStream();
            startDetectionLoop();

        } catch (error) {
            console.error("Failed to initialize shared MediaPipe service:", error);
        }
    };

    setupMediaPipe();
    const handleCameraChange = async () => {
        if (!isMounted.current || !isReadyRef.current) return;

        try {
            stopDetectionLoop();
            videoElementRef.current = await getSharedCameraVideo();
            lastVideoTimeRef.current = -1;
            smoothedCameraFpsRef.current = 0;
            smoothedDetectionFpsRef.current = 0;
            startDetectionLoop();
        } catch (error) {
            console.error("HandTracker failed to attach switched camera:", error);
        }
    };

    const unsubscribeCameraChange = subscribeSharedCameraChange(handleCameraChange);
    document.addEventListener('visibilitychange', startDetectionLoop);

    return () => {
        console.log("HandTracker: Unmount");
        isMounted.current = false;
        isReadyRef.current = false;
        unsubscribeCameraChange();
        stopDetectionLoop();
        document.removeEventListener('visibilitychange', startDetectionLoop);
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        stopClockRef.current?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeClipId]);

  const stopDetectionLoop = () => {
      const video = videoElementRef.current as (HTMLVideoElement & {
          cancelVideoFrameCallback?: (id: number) => void;
      }) | null;

      if (requestRef.current) {
          video?.cancelVideoFrameCallback?.(requestRef.current);
          cancelAnimationFrame(requestRef.current);
          requestRef.current = 0;
      }
      stopClockRef.current?.();
      stopClockRef.current = null;
  };

  const startDetectionLoop = () => {
      stopDetectionLoop();

      const video = videoElementRef.current as (HTMLVideoElement & {
          requestVideoFrameCallback?: (callback: () => void) => number;
          cancelVideoFrameCallback?: (id: number) => void;
      }) | null;

      if (document.visibilityState === 'visible' && video?.requestVideoFrameCallback) {
          loopModeRef.current = 'video-frame';
          const onVideoFrame = () => {
              predictWebcam();
              if (isMounted.current) {
                  requestRef.current = video.requestVideoFrameCallback!(onVideoFrame);
              }
          };
          requestRef.current = video.requestVideoFrameCallback(onVideoFrame);
          return;
      }

      loopModeRef.current = 'worker';
      stopClockRef.current = subscribeRealtimeClock(33, predictWebcam);
  };

  const createVideoElement = async () => {
      if (!videoElementRef.current) {
          videoElementRef.current = await getSharedCameraVideo();
      }
      if (!detectionCanvasRef.current) {
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 360;
          detectionCanvasRef.current = canvas;
      }
  }

    const startStream = async () => {
        if (!isMounted.current) return;
        
        try {
            // VJ视频只传store，不影响HandTracker
            if (mode === 'VJ_MODE' && activeClipId) {
                const clip = videoClips.find(c => c.id === activeClipId);
                if (clip) {
                    useAppStore.setState({ vjVideoUrl: clip.url });
                }
            }
        } catch (e) {
            console.error("Stream Error:", e);
        }
    };

  const predictWebcam = () => {
      if (!isMounted.current || !videoElementRef.current) return;
      const video = videoElementRef.current;
      const canvas = detectionCanvasRef.current;

      if (video.readyState >= 2 && canvas && video.currentTime !== lastVideoTimeRef.current) {
          const previousVideoTime = lastVideoTimeRef.current;
          lastVideoTimeRef.current = video.currentTime;
          try {
              const ctx = canvas.getContext('2d', { alpha: false });
              if (!ctx) return;
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

              const landmarker = getHandLandmarkerInstance();
              const startTimeMs = performance.now();
              const results = landmarker.detectForVideo(canvas, startTimeMs);
              const endTimeMs = performance.now();
              updateDiagnostics(video, previousVideoTime, startTimeMs, endTimeMs);
              processResults(results);
          } catch(e) {
              // console.warn("Prediction skipped:", e);
          }
      }
  };

  const updateDiagnostics = (video: HTMLVideoElement, previousVideoTime: number, startTimeMs: number, endTimeMs: number) => {
      const currentData = handDataRef.current;
      const videoDelta = previousVideoTime >= 0 ? video.currentTime - previousVideoTime : 0;
      const cameraFps = videoDelta > 0 ? 1 / videoDelta : smoothedCameraFpsRef.current;
      const detectDelta = lastDetectAtRef.current ? startTimeMs - lastDetectAtRef.current : 0;
      const detectionFps = detectDelta > 0 ? 1000 / detectDelta : smoothedDetectionFpsRef.current;

      smoothedCameraFpsRef.current = smoothedCameraFpsRef.current
          ? (smoothedCameraFpsRef.current * 0.85) + (cameraFps * 0.15)
          : cameraFps;
      smoothedDetectionFpsRef.current = smoothedDetectionFpsRef.current
          ? (smoothedDetectionFpsRef.current * 0.85) + (detectionFps * 0.15)
          : detectionFps;
      lastDetectAtRef.current = startTimeMs;

      currentData.diagnostics.cameraWidth = video.videoWidth || 0;
      currentData.diagnostics.cameraHeight = video.videoHeight || 0;
      currentData.diagnostics.cameraFps = smoothedCameraFpsRef.current || 0;
      currentData.diagnostics.detectionFps = smoothedDetectionFpsRef.current || 0;
      currentData.diagnostics.detectionMs = endTimeMs - startTimeMs;
      currentData.diagnostics.loopMode = loopModeRef.current;
      currentData.diagnostics.lastFrameAt = endTimeMs;
  };

  // --- 完整的 processResults 函数 ---
  const processResults = (results: HandLandmarkerResult) => {
    if (!isMounted.current) return;
    const currentData = handDataRef.current;
    const now = performance.now();
    
    // 如果没检测到手，清空数据
    if (!results.landmarks || results.landmarks.length === 0) {
        currentData.left = null;
        currentData.right = null;
        const keepSeal = currentData.sealActive && now - lastSealAtRef.current < SEAL_DROP_GRACE_MS;
        currentData.sealActive = keepSeal;
        if (!keepSeal) {
            currentData.sealSize = 0;
            currentData.sealLeft = null;
            currentData.sealRight = null;
        } else {
            currentData.sealSize = lastSealSizeRef.current;
        }
        currentData.leftPresent = 0;
        currentData.rightPresent = 0;
        currentData.bothPresent = 0;
        currentData.lastUpdated = now;
        return;
    }

    try {
        let newLeft = null;
        let newRight = null;

        // 遍历每只手进行处理
        results.landmarks.forEach((lm, i) => {
            const handedness = results.handednesses[i][0];
            // 注意：这里MediaPipe识别的Right在镜像后视觉上是Left，反之亦然
            const label = handedness.categoryName;
            
            if (!lm || lm.length < 21) return;
            const wrist = lm[0];
            const middleMCP = lm[9];
            const indexMCP = lm[5];
            const pinkyMCP = lm[17];
            
            if (!wrist || !middleMCP || !indexMCP || !pinkyMCP) return;

            const palmSize = Math.sqrt(Math.pow(middleMCP.x - wrist.x, 2) + Math.pow(middleMCP.y - wrist.y, 2));
            const distance = Math.min(1, Math.max(0, (palmSize - 0.1) * 5.0));

            const dx = middleMCP.x - wrist.x; const dy = middleMCP.y - wrist.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 0.0001;
            const unitX = dx / len;
            let rotation = label === 'Left' ? (1 - unitX) / 2 : (unitX + 1) / 2;
            rotation = Math.max(0, Math.min(1, rotation));

            const tips = [4, 8, 12, 16, 20];
            const gaps = [];
            for(let j=0; j<4; j++) {
                const angle = calculateAngle(wrist, lm[tips[j]], lm[tips[j+1]]);
                gaps.push(Math.min(1, Math.max(0, (angle - 0.1) * 2.5)));
            }
            const gapSum = gaps.reduce((a, b) => a + b, 0);
            const spread = Math.min(1, Math.max(0, (gapSum - 0.2) / 1.6));

            const palmLen = Math.sqrt(Math.pow(middleMCP.x - wrist.x, 2) + Math.pow(middleMCP.y - wrist.y, 2));
            const palmWidth = Math.sqrt(Math.pow(pinkyMCP.x - indexMCP.x, 2) + Math.pow(pinkyMCP.y - indexMCP.y, 2));
            const ratio = palmLen / (palmWidth + 0.001);
            const tilt = Math.min(1, Math.max(0, (ratio - 0.5)));

            const metrics = {
                distance, rotation, spread, tilt,
                gap1: gaps[0], gap2: gaps[1], gap3: gaps[2],
                wrist: { x: wrist.x, y: wrist.y, z: wrist.z },
                indexTip: { x: lm[8].x, y: lm[8].y },
                thumbTip: { x: lm[4].x, y: lm[4].y },
                rawLandmarks: lm
            };

            // 根据计算结果，临时存储到 newLeft 或 newRight
            if (label === 'Left') newLeft = metrics;
            else newRight = metrics;
        });

        // --- 更新 Store 数据 ---

        // 【关键】直接赋值，移除所有 Swap 判断逻辑
        currentData.left = newLeft;
        currentData.right = newRight;

        currentData.leftPresent = newLeft ? 1 : 0;
        currentData.rightPresent = newRight ? 1 : 0;
        currentData.bothPresent = (newLeft && newRight) ? 1 : 0;

        // 结印判定逻辑
        if (newLeft && newRight) {
            const tDist = dist(newLeft.thumbTip, newRight.thumbTip);
            const iDist = dist(newLeft.indexTip, newRight.indexTip);
            
            currentData.thumbsDist = tDist * 4;
            currentData.indexDist = iDist * 4;

            if (!currentData.sealActive) {
                if (tDist < 0.1 && iDist < 0.1) currentData.sealActive = true;
            }
            
            if (currentData.sealActive) {
                currentData.sealSize = Math.min(1.0, (tDist * 2.0) + 0.05);
                currentData.sealLeft = newLeft;
                currentData.sealRight = newRight;
                lastSealAtRef.current = now;
                lastSealSizeRef.current = currentData.sealSize;
            } else {
                currentData.sealSize = 0;
                currentData.sealLeft = null;
                currentData.sealRight = null;
            }
        } else {
            const keepSeal = currentData.sealActive && now - lastSealAtRef.current < SEAL_DROP_GRACE_MS;
            currentData.sealActive = keepSeal;
            if (keepSeal) {
                currentData.sealSize = lastSealSizeRef.current;
            } else {
                currentData.sealSize = 0;
                currentData.sealLeft = null;
                currentData.sealRight = null;
            }
        }
        
        currentData.lastUpdated = now;

    } catch (e) {
        console.error("Error processing hand landmarks:", e);
    }
  };

  return null;
};
