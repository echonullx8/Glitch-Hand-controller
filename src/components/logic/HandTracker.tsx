// src/components/logic/HandTracker.tsx

import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
// 【关键改动】不再直接导入 FilesetResolver 和 HandLandmarker 类，只导入类型
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';
// 【关键改动】导入我们的单例服务
import { initializeHands, getHandLandmarkerInstance } from '../../../utils/mediaPipeService';

// ... 保持不变的辅助函数 ...
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
  // 【关键改动】不再需要局部的 handLandmarkerRef
  // const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const isMounted = useRef(true);
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef(-1);

  useEffect(() => {
    isMounted.current = true;
    console.log("HandTracker: Mount (Using Shared Service)");

    // 【关键改动】使用服务进行初始化
    const setupMediaPipe = async () => {
        try {
            console.log("HandTracker requesting shared Hands initialization...");
            // 这会等待全局单例初始化完成
            await initializeHands();
            
            if (!isMounted.current) return;
            console.log("HandTracker received shared Hands instance. Starting stream...");
            
            // 初始化成功后，创建视频元素并开始流
            createVideoElement();
            startStream();

        } catch (error) {
            console.error("Failed to initialize shared MediaPipe service:", error);
        }
    };

    setupMediaPipe();

    return () => {
        console.log("HandTracker: Unmount");
        isMounted.current = false;
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        const video = videoElementRef.current;
        if (video && video.srcObject) {
            const tracks = (video.srcObject as MediaStream).getTracks();
            tracks.forEach(t => t.stop());
        }
        // 【关键改动】不要在这里关闭全局实例，因为它可能被其他组件共享
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeClipId]);

  // 辅助函数：创建视频元素
  const createVideoElement = () => {
      if (videoElementRef.current) return;
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.crossOrigin = 'Anonymous';
      // 重要：设置视频尺寸，避免 MediaPipe 推理时尺寸不匹配
      video.width = 1280;
      video.height = 720;
      videoElementRef.current = video;
      
      // 等待视频元数据加载完毕再开始检测
      video.addEventListener('loadeddata', predictWebcam);
  }

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
              // 请求分辨率
              const stream = await navigator.mediaDevices.getUserMedia({
                  video: { width: 1280, height: 720 }
              });
              video.srcObject = stream;
              await video.play();
          }
      } catch (e) {
          console.error("Stream Error:", e);
      }
  };

  const predictWebcam = async () => {
      if (!isMounted.current || !videoElementRef.current) return;
      
      const video = videoElementRef.current;

      // 【关键改动】确保视频准备好，且有新的一帧
      if (video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = video.currentTime;
          
          try {
              // 【关键改动】从服务获取全局单例
              const landmarker = getHandLandmarkerInstance();
              
              const startTimeMs = performance.now();
              // 新版推理方法
              const results = landmarker.detectForVideo(video, startTimeMs);
              processResults(results);
          } catch(e) {
              // 忽略偶尔的推理错误，或者处理未初始化的情况
              // console.warn("Prediction skipped:", e);
          }
      }

      if (isMounted.current) {
          requestRef.current = requestAnimationFrame(predictWebcam);
      }
  };

  const processResults = (results: HandLandmarkerResult) => {
    // ... 这里的代码逻辑保持完全不变 ...
    // (为了节省篇幅，我省略了这里的具体实现，请直接复制你原来的 processResults 函数体)
    if (!isMounted.current) return;
    const currentData = handDataRef.current;
    const now = performance.now();
    
    // 如果没检测到手
    if (!results.landmarks || results.landmarks.length === 0) {
        // ... (复制你原来的代码) ...
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

        // 遍历每只手
        results.landmarks.forEach((lm, i) => {
            // 新版的 Handedness 结构：results.handednesses[i][0]
            const handedness = results.handednesses[i][0];
            const label = handedness.categoryName === 'Right' ? 'Left' : 'Right';
            
            if (!lm || lm.length < 21) return;
            // ... (复制你原来的代码) ...
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

            if (label === 'Left') newLeft = metrics;
            else newRight = metrics;
        });

        currentData.left = newLeft;
        currentData.right = newRight;
        currentData.leftPresent = newLeft ? 1 : 0;
        currentData.rightPresent = newRight ? 1 : 0;
        currentData.bothPresent = (newLeft && newRight) ? 1 : 0;

        // 结印
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
