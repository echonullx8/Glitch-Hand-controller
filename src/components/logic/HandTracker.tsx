// src/components/logic/HandTracker.tsx
// 【最终清理版】移除了所有 Swap 相关逻辑和引用

import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'; // 明确标示为类型导入
// 使用别名导入单例服务
import { initializeHands, getHandLandmarkerInstance } from '@/utils/mediaPipeService';
import { getSharedCameraVideo } from '../../utils/cameraService';


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

export const HandTracker: React.FC = () => {
  // 【关键】不再从 store 里解构 isSwapped
  const { mode, activeClipId, videoClips, handDataRef } = useAppStore();
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const detectionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isMounted = useRef(true);
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef(-1);

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
            startStream();
            predictWebcam();

        } catch (error) {
            console.error("Failed to initialize shared MediaPipe service:", error);
        }
    };

    setupMediaPipe();

    return () => {
        console.log("HandTracker: Unmount");
        isMounted.current = false;
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeClipId]);

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

  const predictWebcam = async () => {
      if (!isMounted.current || !videoElementRef.current) return;
      const video = videoElementRef.current;
      const canvas = detectionCanvasRef.current;

      if (video.readyState >= 2 && canvas && video.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = video.currentTime;
          try {
              const ctx = canvas.getContext('2d', { alpha: false });
              if (!ctx) return;
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

              const landmarker = getHandLandmarkerInstance();
              const startTimeMs = performance.now();
              const results = landmarker.detectForVideo(canvas, startTimeMs);
              processResults(results);
          } catch(e) {
              // console.warn("Prediction skipped:", e);
          }
      }
      if (isMounted.current) {
          requestRef.current = requestAnimationFrame(predictWebcam);
      }
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
        currentData.sealActive = false;
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
            } else {
                currentData.sealSize = 0;
            }
        } else {
            currentData.sealActive = false;
            currentData.sealSize = 0;
        }
        
        currentData.lastUpdated = now;

    } catch (e) {
        console.error("Error processing hand landmarks:", e);
    }
  };

  return null;
};
