import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';

// --- 辅助数学计算保持不变 ---
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
  const { mode, activeClipId, videoClips, handDataRef } = useAppStore();
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const isMounted = useRef(true);
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef(-1); // 用于新版API的帧时间戳记录

  useEffect(() => {
    isMounted.current = true;
    console.log("HandTracker (Tasks API): Mount");

    // 1. 初始化新版 MediaPipe
    const initMediaPipe = async () => {
        try {
            // FilesetResolver 自动处理 WASM 的加载，非常稳定
            const vision = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm"
            );
            
            const landmarker = await HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                    // 模型文件路径
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmark/hand_landmark_full/float16/1/hand_landmark_full.task`,
                    delegate: "GPU" // 强制使用 GPU 加速
                },
                runningMode: "VIDEO", // 我们处理的是连续视频流
                numHands: 2,
                minHandDetectionConfidence: 0.5,
                minHandPresenceConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            
            if (!isMounted.current) return;
            handLandmarkerRef.current = landmarker;
            console.log("HandLandmarker Ready.");
        } catch (error) {
            console.error("Failed to initialize MediaPipe Tasks API:", error);
        }
    };

    initMediaPipe();

    // 2. 准备视频元素
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.crossOrigin = 'Anonymous';
    videoElementRef.current = video;

    startStream();

    // 3. 清理逻辑
    return () => {
        console.log("HandTracker (Tasks API): Unmount");
        isMounted.current = false;
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        if (video.srcObject) {
            const tracks = (video.srcObject as MediaStream).getTracks();
            tracks.forEach(t => t.stop());
        }
        // 新版 API 提供了非常安全的 close 方法，可以直接调用释放内存
        if (handLandmarkerRef.current) {
            handLandmarkerRef.current.close();
            handLandmarkerRef.current = null;
        }
    };
  }, [mode, activeClipId]); // 依赖变化时重新初始化

  const startStream = async () => {
      if (!isMounted.current) return;
      const video = videoElementRef.current;
      if (!video) return;

      if (video.srcObject) {
          const tracks = (video.srcObject as MediaStream).getTracks();
          tracks.forEach(t => t.stop());
          video.srcObject = null;
      }

      try {
          if (mode === 'VJ_MODE' && activeClipId) {
              const clip = videoClips.find(c => c.id === activeClipId);
              if (clip) {
                  video.src = clip.url;
                  await video.play();
              }
          } else {
              // 依然建议使用 720p 以平衡性能和延迟
              const stream = await navigator.mediaDevices.getUserMedia({
                  video: { width: 1280, height: 720 }
              });
              video.srcObject = stream;
              await video.play();
          }
          
          // 等待视频元数据加载完毕再开始检测循环
          video.addEventListener('loadeddata', predictWebcam);
      } catch (e) {
          console.error("Stream Error:", e);
      }
  };

  // 核心检测循环
  const predictWebcam = async () => {
      if (!isMounted.current) return;
      
      const video = videoElementRef.current;
      const landmarker = handLandmarkerRef.current;

      // 只有当模型准备好，且视频画面有更新时才进行推理
      if (video && landmarker && video.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = video.currentTime;
          
          // 【核心】新版的同步检测方法，传入当前时间戳
          const startTimeMs = performance.now();
          const results = landmarker.detectForVideo(video, startTimeMs);
          
          processResults(results);
      }

      if (isMounted.current) {
          requestRef.current = requestAnimationFrame(predictWebcam);
      }
  };

  // 这里的逻辑和你之前调教好的 100% 一样，只是适配了新版 results 的数据结构
  const processResults = (results: HandLandmarkerResult) => {
    if (!isMounted.current) return;
    const currentData = handDataRef.current;
    const now = performance.now();
    
    // 如果没检测到手
    if (!results.landmarks || results.landmarks.length === 0) {
        currentData.left = null;
        currentData.right = null;
        currentData.sealActive = false;
        currentData.lastUpdated = now;
        return;
    }

    try {
        let newLeft = null;
        let newRight = null;

        // 遍历检测到的手
        results.landmarks.forEach((lm, i) => {
            // 新版 API 的左右手标签在 handednesses 数组里
            const handedness = results.handednesses[i][0];
            // MediaPipe 默认镜像，我们将 Right 视为 Left
            const label = handedness.categoryName === 'Right' ? 'Left' : 'Right';
            
            if (!lm || lm.length < 21) return;
            const wrist = lm[0];
            const middleMCP = lm[9];
            const indexMCP = lm[5];
            const pinkyMCP = lm[17];
            
            if (!wrist || !middleMCP || !indexMCP || !pinkyMCP) return;

            // 数学计算保持不变
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
                rawLandmarks: lm // 依然保存原始点给骨骼渲染用
            };

            if (label === 'Left') newLeft = metrics;
            else newRight = metrics;
        });

        // 写入 Store
        currentData.left = newLeft;
        currentData.right = newRight;

        // 结印逻辑
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
