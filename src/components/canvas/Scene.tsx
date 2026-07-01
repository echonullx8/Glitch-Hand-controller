import React, { useEffect, useMemo } from 'react';
import { Canvas, useThree, createPortal, useFrame } from '@react-three/fiber';
import { Background } from './Background';
import { HandSkeleton } from './modules/HandSkeleton';
import { CyberSeal } from './modules/CyberSeal';
import { SimpleGlitchMaterial } from './modules/SimpleGlitch';
import { AnalogGlitchMaterial } from './modules/AnalogGlitch';
import { HandParticles } from './modules/HandParticles';
import { FlashEffect } from './modules/FlashEffect';
import { FaceParticles } from './modules/FaceParticles';
import { useAppStore, getMetricValue } from '../../store/useAppStore';
import { getSharedCameraStream } from '../../utils/cameraService';
import * as THREE from 'three';
import { useFBO } from '@react-three/drei';

// 本地定义类型
interface EffectSlot {
  id: string;
  type: 'None' | 'SimpleGlitch' | 'AnalogGlitch' | 'Particles' | 'Flash' | 'FaceParticles';
  params: any;
  active: boolean;
}

const EffectRenderer = ({ slot }: { slot: EffectSlot }) => {
    if (!slot.active) return null;
    switch (slot.type) {
        case 'Particles': return <HandParticles params={slot.params} />;
        case 'FaceParticles': return <FaceParticles params={slot.params} />;
        case 'Flash': return <FlashEffect params={slot.params} />;
        default: return null;
    }
};

const GlitchStack = ({ slots, overlayScene }: { slots: any[], overlayScene?: THREE.Scene }) => {
  const { gl, scene, camera } = useThree();
  const { handDataRef } = useAppStore();

  const readTarget = useFBO({ minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
  const writeTarget = useFBO({ minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
  const hudScene = useMemo(() => new THREE.Scene(), []);
  const hudCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
  const timeRef = React.useRef<Record<string, number>>({});

  const materials = useMemo(() => ({
    SimpleGlitch: new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(SimpleGlitchMaterial.uniforms),
      vertexShader: SimpleGlitchMaterial.vertexShader,
      fragmentShader: SimpleGlitchMaterial.fragmentShader,
      toneMapped: false
    }),
    AnalogGlitch: new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(AnalogGlitchMaterial.uniforms),
      vertexShader: AnalogGlitchMaterial.vertexShader,
      fragmentShader: AnalogGlitchMaterial.fragmentShader,
      toneMapped: false
    })
  }), []);

  const quad = useMemo(() => {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), materials.SimpleGlitch);
    hudScene.add(q);
    return q;
  }, [hudScene, materials.SimpleGlitch]);

  useEffect(() => () => {
    materials.SimpleGlitch.dispose();
    materials.AnalogGlitch.dispose();
  }, [materials]);

  useFrame((_, delta) => {
    const activeGlitches = slots.filter(slot =>
      slot.active && (slot.type === 'SimpleGlitch' || slot.type === 'AnalogGlitch')
    );
    if (activeGlitches.length === 0) return;

    gl.setRenderTarget(readTarget);
    gl.clear();
    gl.render(scene, camera);

    let inputTarget = readTarget;
    let outputTarget = writeTarget;
    const data = handDataRef.current;

    activeGlitches.forEach((slot, index) => {
      const p = slot.params || { amountSource: 'None', speedSource: 'None' };
      const amt = getMetricValue(p.amountSource, data, p.amountInvert);
      const spdVal = getMetricValue(p.speedSource, data, p.speedInvert);
      const id = slot.id || `${slot.type}-${index}`;
      const isLast = index === activeGlitches.length - 1;

      if (slot.type === 'SimpleGlitch') {
        const material = materials.SimpleGlitch;
        const speedParam = p.speedSource === 'None' ? 0.1 : (0.1 + spdVal * 0.9);
        const timeMultiplier = 1.0 + (spdVal * 2.0);
        timeRef.current[id] = (timeRef.current[id] || 0) + delta * timeMultiplier;
        material.uniforms.tDiffuse.value = inputTarget.texture;
        material.uniforms.uTime.value = timeRef.current[id];
        material.uniforms.uAmount.value = amt;
        material.uniforms.uSpeed.value = speedParam;
        quad.material = material;
      } else {
        const material = materials.AnalogGlitch;
        const speedMultiplier = p.speedSource === 'None' ? 0.2 : (0.2 + spdVal * 7.0);
        timeRef.current[id] = (timeRef.current[id] || 0) + delta * speedMultiplier;
        material.uniforms.tDiffuse.value = inputTarget.texture;
        material.uniforms.uTime.value = timeRef.current[id];
        material.uniforms.uAmount.value = amt;
        quad.material = material;
      }

      gl.setRenderTarget(isLast ? null : outputTarget);
      gl.clear();
      gl.render(hudScene, hudCamera);

      if (!isLast) {
        const nextInput = outputTarget;
        outputTarget = inputTarget;
        inputTarget = nextInput;
      }
    });

    if (overlayScene) {
      gl.clearDepth();
      gl.render(overlayScene, camera);
    }
  }, 1);

  return null;
};

const SceneContent: React.FC = () => {
  const { gl } = useThree();
  const visualConfig = useAppStore(state => state.visualConfig);
  
  const sealScene = useMemo(() => new THREE.Scene(), []);

  useEffect(() => {
    gl.setClearColor(new THREE.Color('#000000'), 1);
    gl.autoClear = false;
  }, [gl]);

  const hasSimple = visualConfig.slots.some((s: any) => s.active && s.type === 'SimpleGlitch');
  const glitchSlots = visualConfig.slots.filter((s: any) => s.active && (s.type === 'SimpleGlitch' || s.type === 'AnalogGlitch'));

  return (
    <>
      <group>
        <Background />
        <HandSkeleton />
        
        {visualConfig.slots.map((slot: any) => {
            if (slot.type === 'Particles' || slot.type === 'Flash' || slot.type === 'FaceParticles') {
                return <EffectRenderer key={slot.id} slot={slot} />;
            }
            return null;
        })}
        
        {!hasSimple && <CyberSeal />}
      </group>

      {hasSimple && createPortal(<CyberSeal />, sealScene)}

      <GlitchStack slots={glitchSlots} overlayScene={hasSimple ? sealScene : undefined} />
    </>
  );
};

export const Scene: React.FC = () => {
    const vjVideoUrl = useAppStore(state => state.vjVideoUrl);
    const mode = useAppStore(state => state.mode);
    const videoRef = React.useRef<HTMLVideoElement>(null);
    
    React.useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (mode === 'VJ_MODE' && !video.srcObject) {
            getSharedCameraStream()
                .then(stream => video.srcObject = stream)
                .catch(console.error);
        }

        if (mode !== 'VJ_MODE' && video.srcObject) {
            video.srcObject = null;
        }
      }, [mode]);
    const previewClass = mode === 'VJ_MODE'
        ? 'fixed bottom-8 right-8 w-32 h-24 z-50 pointer-events-none scale-x-[-1]'
        : 'hidden';  // 🎯 CSS隐藏，不销毁DOM
    
    return (
       <div className="absolute inset-0 w-full h-full bg-black relative">
         {/* 🎬 VJ主视频背景 */}
         {vjVideoUrl && (
           <video
             src={vjVideoUrl}
             className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
             autoPlay
             loop
             muted
             playsInline
           />
         )}
         
         {/* Three.js Canvas（effect层） */}
         <Canvas
           camera={{ position: [0, 0, 5], fov: 75 }}
           gl={{
             antialias: false,
             alpha: false,
             depth: false,
             stencil: false,
             powerPreference: 'high-performance',
             toneMapping: THREE.NoToneMapping,
             outputColorSpace: THREE.SRGBColorSpace
           }}
           dpr={1}
      >
        <SceneContent />
      </Canvas>
      {/* 📹 右下角摄像头小预览（始终显示） */}
            <div className={previewClass}>
                    <video
                      ref={videoRef}
                      className="w-full h-full rounded-lg shadow-2xl border-4 border-white/20 bg-black"
                      autoPlay muted playsInline
                    />
                  </div>
                </div>
              );
            };
