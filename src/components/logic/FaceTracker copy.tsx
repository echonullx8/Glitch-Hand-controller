import React, { useEffect, useRef } from 'react';
import { Results } from '@mediapipe/face_mesh';
import { useAppStore } from '../../store/useAppStore';
import { getFaceMeshInstance } from '../../utils/mediaPipeService';

export const FaceTracker: React.FC = () => {
  const { mode, activeClipId, videoClips, handDataRef } = useAppStore();
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const requestRef = useRef<number>(0);
  const isMounted = useRef(true);
  const isProcessing = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    
    // 延迟启动，依然保留，防止视频流抢占
    const initTimer = setTimeout(() => {
        if (!isMounted.current) return;
        console.log("FaceTracker: Mount");

        const faceMesh = getFaceMeshInstance();
        faceMesh.onResults(onResults);

        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.crossOrigin = 'Anonymous';
        videoElementRef.current = video;

        startStream();
    }, 1000);

    return () => {
        clearTimeout(initTimer);
        console.log("FaceTracker: Unmount");
        isMounted.current = false;
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        if (videoElementRef.current && videoElementRef.current.srcObject) {
            const tracks = (videoElementRef.current.srcObject as MediaStream).getTracks();
            tracks.forEach(t => t.stop());
        }
        // 不销毁 faceMesh
    };
  }, [mode, activeClipId]);

  const startStream = async () => {
      const video = videoElementRef.current;
      if (!video) return;
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
      const mesh = getFaceMeshInstance();

      if (video && mesh && video.readyState >= 2 && !isProcessing.current) {
          isProcessing.current = true;
          try {
              await mesh.send({ image: video });
              isProcessing.current = false;
              requestAnimationFrame(processFrame);
          } catch (e) {
              isProcessing.current = false;
              setTimeout(() => {
                  if (isMounted.current) requestAnimationFrame(processFrame);
              }, 500);
          }
      } else {
          requestAnimationFrame(processFrame);
      }
  };

  const onResults = (results: Results) => {
    if (!isMounted.current) return;
    const currentData = handDataRef.current;

    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        currentData.face = null;
        return;
    }
    currentData.face = { rawLandmarks: results.multiFaceLandmarks[0] };
  };

  return null;
};
