import React, { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { useAppStore } from '../../store/useAppStore';

export const Background: React.FC = () => {
  const { viewport, camera } = useThree();
  const {
      videoClips, activeClipId, mode, visualConfig,
      setVideoTexture: setGlobalVideoTexture,
      setVideoScale
  } = useAppStore();
  
  const [videoTexture, setVideoTexture] = useState<THREE.VideoTexture | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  const bgDistance = 15;
  const vFov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
  const visibleHeight = 2 * Math.tan(vFov / 2) * bgDistance;
  const visibleWidth = visibleHeight * viewport.aspect;

  useEffect(() => {
    let video = document.createElement('video');
    video.crossOrigin = 'Anonymous';
    video.loop = true;
    video.playsInline = true;
    
    // 【关键修改】根据模式决定是否静音
    if (mode === 'VJ_MODE') {
        video.muted = false; // VJ 模式开启声音
    } else {
        video.muted = true;  // AR 模式静音
    }
    
    video.autoplay = true;
    videoRef.current = video;

    const setupVideo = async () => {
      if (mode === 'VJ_MODE' && activeClipId) {
        const clip = videoClips.find(c => c.id === activeClipId);
        if (clip) video.src = clip.url;
      } else {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } }
          });
          video.srcObject = stream;
        } catch (e) { console.error(e); }
      }
      
      video.play().catch(() => {});
      
      const texture = new THREE.VideoTexture(video);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      
      setVideoTexture(texture);
      setGlobalVideoTexture(texture);
    };

    setupVideo();

    return () => {
      video.pause();
      if (video.srcObject) {
          const tracks = (video.srcObject as MediaStream).getTracks();
          tracks.forEach(t => t.stop());
      }
      video.remove();
    };
  }, [mode, activeClipId, setGlobalVideoTexture]);

  // 【暴力修正】每帧直接修改 Mesh Scale (保持不变)
  useFrame(() => {
      if (!meshRef.current || !videoRef.current) return;
      const video = videoRef.current;
      
      let aspect = 1.77;
      if (video.videoWidth && video.videoHeight) {
          aspect = video.videoWidth / video.videoHeight;
      }

      let scaleX = visibleWidth;
      let scaleY = visibleHeight;

      if (mode === 'VJ_MODE') {
          const screenAspect = visibleWidth / visibleHeight;
          if (screenAspect > aspect) {
              scaleY = visibleHeight;
              scaleX = visibleHeight * aspect;
          } else {
              scaleX = visibleWidth;
              scaleY = visibleWidth / aspect;
          }
      } else {
          const screenAspect = visibleWidth / visibleHeight;
          if (screenAspect > aspect) {
              scaleX = visibleWidth;
              scaleY = visibleWidth / aspect;
          } else {
              scaleY = visibleHeight;
              scaleX = visibleHeight * aspect;
          }
      }
      
      if (visualConfig.mirrorVideo) scaleX *= -1;

      meshRef.current.scale.set(scaleX, scaleY, 1);
  });

  if (!videoTexture) return null;

  return (
    <mesh ref={meshRef} position={[0, 0, -10]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={videoTexture}
        color="white"
        toneMapped={false}
        transparent
        opacity={visualConfig.videoOpacity}
        side={THREE.DoubleSide}
        depthTest={false}
      />
    </mesh>
  );
};
