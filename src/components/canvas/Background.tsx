import React, { useEffect, useMemo, useState, useRef } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { useAppStore } from '../../store/useAppStore';
import { getSharedCameraVideo, subscribeSharedCameraChange } from '../../utils/cameraService';

export const Background: React.FC = () => {
  const { viewport, camera } = useThree();
  const {
      videoClips, activeClipId, mode, visualConfig,
      setVideoTexture: setGlobalVideoTexture,
      setVideoScale,
      handDataRef
  } = useAppStore();
  
  const [videoTexture, setVideoTexture] = useState<THREE.VideoTexture | null>(null);
  const [cameraRevision, setCameraRevision] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const jellyMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: null },
      uTime: { value: 0 },
      uVideoOpacity: { value: 1 },
      uJellyStrength: { value: 0 },
      uJellyOpacity: { value: 1 },
      uJellyColor: { value: new THREE.Color('#67E8F9') },
      uPoints: {
        value: [
          new THREE.Vector2(0.5, 0.5),
          new THREE.Vector2(0.5, 0.5),
          new THREE.Vector2(0.5, 0.5),
          new THREE.Vector2(0.5, 0.5),
        ]
      }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uTime;
      uniform float uVideoOpacity;
      uniform float uJellyStrength;
      uniform float uJellyOpacity;
      uniform vec3 uJellyColor;
      uniform vec2 uPoints[4];
      varying vec2 vUv;

      float cross2(vec2 a, vec2 b) {
        return a.x * b.y - a.y * b.x;
      }

      float sdSegment(vec2 p, vec2 a, vec2 b) {
        vec2 pa = p - a;
        vec2 ba = b - a;
        float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
        return length(pa - ba * h);
      }

      float triangleMask(vec2 p, vec2 a, vec2 b, vec2 c) {
        float c1 = cross2(b - a, p - a);
        float c2 = cross2(c - b, p - b);
        float c3 = cross2(a - c, p - c);
        float hasNeg = step(c1, 0.0) + step(c2, 0.0) + step(c3, 0.0);
        float hasPos = step(0.0, c1) + step(0.0, c2) + step(0.0, c3);
        return 1.0 - step(0.5, min(hasNeg, hasPos));
      }

      void main() {
        vec2 uv = vUv;
        vec2 warp = vec2(0.0);
        float strength = uJellyStrength * uJellyOpacity;
        vec2 leftThumb = uPoints[0];
        vec2 leftIndex = uPoints[1];
        vec2 rightThumb = uPoints[2];
        vec2 rightIndex = uPoints[3];
        vec2 center = (leftThumb + leftIndex + rightThumb + rightIndex) * 0.25;
        vec2 leftCenter = (leftThumb + leftIndex) * 0.5;
        vec2 rightCenter = (rightThumb + rightIndex) * 0.5;
        vec2 pullAxis = normalize(rightCenter - leftCenter + vec2(0.0001));
        vec2 crossAxis = normalize((leftIndex + rightIndex) * 0.5 - (leftThumb + rightThumb) * 0.5 + vec2(0.0001));
        float span = length(rightCenter - leftCenter);
        float membrane = max(
          triangleMask(uv, leftThumb, rightThumb, rightIndex),
          triangleMask(uv, leftThumb, rightIndex, leftIndex)
        );
        float edgeField =
          exp(-sdSegment(uv, leftThumb, rightThumb) * 18.0) +
          exp(-sdSegment(uv, leftIndex, rightIndex) * 18.0) +
          exp(-sdSegment(uv, leftThumb, leftIndex) * 22.0) +
          exp(-sdSegment(uv, rightThumb, rightIndex) * 22.0);
        float centerField = exp(-length(uv - center) * 5.0);
        float membraneMask = clamp(membrane + edgeField * 0.32 + centerField * 0.2, 0.0, 1.0);
        float stretch = strength * smoothstep(0.04, 0.62, span);
        vec2 fromCenter = uv - center;
        warp += pullAxis * dot(fromCenter, pullAxis) * membraneMask * stretch * 0.22;
        warp += crossAxis * dot(fromCenter, crossAxis) * membraneMask * stretch * 0.07;
        float pointGlow = 0.0;

        for (int i = 0; i < 4; i++) {
          vec2 toPixel = uv - uPoints[i];
          float dist = length(toPixel);
          float falloff = exp(-dist * 16.0);
          vec2 dir = normalize(toPixel + vec2(0.0001));
          float ripple = sin(dist * 52.0 - uTime * 9.0) * 0.005;
          warp += dir * falloff * strength * (0.025 + ripple);
          pointGlow += falloff;
        }

        vec2 warpedUv = clamp(uv - warp, 0.001, 0.999);
        vec4 videoColor = texture2D(uMap, warpedUv);
        float sheen = pow(1.0 - abs(dot(normalize(fromCenter + vec2(0.0001)), pullAxis)), 2.0);
        float tintAmount = clamp((membraneMask * 0.13 + edgeField * 0.035 + pointGlow * 0.08) * strength, 0.0, 0.3);
        vec3 finalColor = mix(videoColor.rgb, uJellyColor, tintAmount);
        finalColor += uJellyColor * sheen * membraneMask * strength * 0.16;
        gl_FragColor = vec4(finalColor, videoColor.a * uVideoOpacity);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  }), []);

  const bgDistance = 15;
  const vFov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
  const visibleHeight = 2 * Math.tan(vFov / 2) * bgDistance;
  const visibleWidth = visibleHeight * viewport.aspect;

  useEffect(() => {
    return subscribeSharedCameraChange(() => {
      setCameraRevision(revision => revision + 1);
    });
  }, []);

  useEffect(() => {
    let video: HTMLVideoElement | null = null;
    let isCancelled = false;
    let texture: THREE.VideoTexture | null = null;

    const localVideo = document.createElement('video');
    video = localVideo;
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
      if (!video) return;

      if (mode === 'VJ_MODE' && activeClipId) {
        const clip = videoClips.find(c => c.id === activeClipId);
        if (clip) video.src = clip.url;
      } else {
        try {
          video = await getSharedCameraVideo();
          videoRef.current = video;
        } catch (e) { console.error(e); }
      }
      
      if (isCancelled || !video) return;
      video.play().catch(() => {});
      
      texture = new THREE.VideoTexture(video);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      
      setVideoTexture(previousTexture => {
        previousTexture?.dispose();
        return texture;
      });
      setGlobalVideoTexture(texture);
    };

    setupVideo();

    return () => {
      isCancelled = true;
      if (video === localVideo) {
        video.pause();
        video.remove();
      }
      texture?.dispose();
    };
  }, [mode, activeClipId, cameraRevision, setGlobalVideoTexture]);

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

      const data = handDataRef.current;
      const isJellySeal = visualConfig.sealStyle === 'Jelly' && data.sealActive && data.left && data.right;
      const points = jellyMaterial.uniforms.uPoints.value as THREE.Vector2[];
      const setPoint = (index: number, point: { x: number; y: number }) => {
          points[index].set(point.x, 1 - point.y);
      };

      if (isJellySeal && data.left && data.right) {
          setPoint(0, data.left.thumbTip);
          setPoint(1, data.left.indexTip);
          setPoint(2, data.right.thumbTip);
          setPoint(3, data.right.indexTip);
      }

      jellyMaterial.uniforms.uTime.value += 0.016;
      jellyMaterial.uniforms.uMap.value = videoTexture;
      jellyMaterial.uniforms.uVideoOpacity.value = visualConfig.videoOpacity;
      jellyMaterial.uniforms.uJellyOpacity.value = visualConfig.sealOpacity ?? 1;
      jellyMaterial.uniforms.uJellyColor.value.set(visualConfig.sealColor || '#67E8F9');
      jellyMaterial.uniforms.uJellyStrength.value = isJellySeal ? Math.min(1, Math.max(0, data.sealSize)) : 0;
  });

  if (!videoTexture) return null;

  return (
    <mesh ref={meshRef} position={[0, 0, -10]}>
      <planeGeometry args={[1, 1]} />
      <primitive object={jellyMaterial} attach="material" />
    </mesh>
  );
};
