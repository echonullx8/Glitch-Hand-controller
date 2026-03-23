import React, { useEffect, useRef } from 'react';
import { Hands, Results } from '@mediapipe/hands';
import { useAppStore } from '../../store/useAppStore';
import { getHandsInstance } from '../../utils/mediaPipeService';

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
  const requestRef = useRef<number>(0);
  const isMounted = useRef(true);
  const isProcessing = useRef(false);

  // 【新增】防抖时间戳
  const lastSeenLeft = useRef<number>(0);
  const lastSeenRight = useRef<number>(0);

  useEffect(() => {
    isMounted.current = true;
    const hands = getHandsInstance();
    hands.onResults(onResults);

    const video = document.createElement('video');
    video.autoplay = true; video.playsInline = true; video.muted = true; video.crossOrigin = 'Anonymous';
    videoElementRef.current = video;

    startStream();

    return () => {
        isMounted.current = false;
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        if (video.srcObject) {
            const tracks = (video.srcObject as MediaStream).getTracks();
            tracks.forEach(t => t.stop());
        }
    };
  }, [mode, activeClipId]);

  const startStream = async () => {
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
              if (clip) { video.src = clip.url; await video.play(); }
          } else {
              const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
              video.srcObject = stream;
              await video.play();
          }
          processFrame();
      } catch (e) {}
  };

  const processFrame = async () => {
      if (!isMounted.current) return;
      const video = videoElementRef.current;
      const hands = getHandsInstance();
      if (video && hands && video.readyState >= 2 && !isProcessing.current) {
          isProcessing.current = true;
          try {
              await hands.send({ image: video });
              isProcessing.current = false;
              requestAnimationFrame(processFrame);
          } catch (e) {
              isProcessing.current = false;
              setTimeout(() => { if (isMounted.current) requestAnimationFrame(processFrame); }, 500);
          }
      } else {
          requestAnimationFrame(processFrame);
      }
  };

  const onResults = (results: Results) => {
    if (!isMounted.current) return;
    const currentData = handDataRef.current;
    const now = performance.now();

    // 1. 处理手势数据
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        let newLeft = null;
        let newRight = null;

        const hands = results.multiHandLandmarks.map((landmarks, i) => {
            const labelRaw = results.multiHandedness?.[i]?.label;
            const label = labelRaw === 'Right' ? 'Left' : 'Right';
            return { landmarks, label };
        });

        hands.forEach(hand => {
            const lm = hand.landmarks;
            // 简单校验
            if (!lm || lm.length < 21) return;

            // 记录时间戳
            if (hand.label === 'Left') lastSeenLeft.current = now;
            if (hand.label === 'Right') lastSeenRight.current = now;

            // 计算 Metrics (保持不变)
            const wrist = lm[0]; const middleMCP = lm[9];
            const palmSize = Math.sqrt(Math.pow(middleMCP.x - wrist.x, 2) + Math.pow(middleMCP.y - wrist.y, 2));
            const distance = Math.min(1, Math.max(0, (palmSize - 0.1) * 5.0));
            const dx = middleMCP.x - wrist.x; const dy = middleMCP.y - wrist.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 0.0001;
            const unitX = dx / len;
            let rotation = hand.label === 'Left' ? (1 - unitX) / 2 : (unitX + 1) / 2;
            rotation = Math.max(0, Math.min(1, rotation));
            const tips = [4, 8, 12, 16, 20];
            const gaps = [];
            for(let i=0; i<4; i++) {
                const angle = calculateAngle(wrist, lm[tips[i]], lm[tips[i+1]]);
                gaps.push(Math.min(1, Math.max(0, (angle - 0.1) * 2.5)));
            }
            const gapSum = gaps.reduce((a, b) => a + b, 0);
            const spread = Math.min(1, Math.max(0, (gapSum - 0.2) / 1.6));
            const metrics = {
                distance, rotation, spread,
                gap1: gaps[0], gap2: gaps[1], gap3: gaps[2],
                wrist: { x: wrist.x, y: wrist.y, z: wrist.z },
                indexTip: { x: lm[8].x, y: lm[8].y },
                thumbTip: { x: lm[4].x, y: lm[4].y },
                rawLandmarks: lm
            };
            if (hand.label === 'Left') newLeft = metrics;
            else newRight = metrics;
        });

        if (newLeft) currentData.left = newLeft;
        if (newRight) currentData.right = newRight;
    }

    // 2. Presence Logic (防抖)
    // 只有当超过 200ms 没看到手，才置为 0
    if (now - lastSeenLeft.current < 200) {
        currentData.leftPresent = 1;
    } else {
        currentData.leftPresent = 0;
        currentData.left = null; // 清空数据
    }

    if (now - lastSeenRight.current < 200) {
        currentData.rightPresent = 1;
    } else {
        currentData.rightPresent = 0;
        currentData.right = null;
    }

    // 双手同时存在
    currentData.bothPresent = (currentData.leftPresent && currentData.rightPresent) ? 1 : 0;

    // 3. Seal Logic
    if (currentData.bothPresent && currentData.left && currentData.right) {
        const tDist = dist(currentData.left.thumbTip, currentData.right.thumbTip);
        const iDist = dist(currentData.left.indexTip, currentData.right.indexTip);
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
  };

  return null;
};
