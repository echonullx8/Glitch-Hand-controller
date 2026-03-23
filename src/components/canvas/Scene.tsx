import React, { useEffect, useMemo } from 'react';
import { Canvas, useThree, createPortal } from '@react-three/fiber';
import { Background } from './Background';
import { HandSkeleton } from './modules/HandSkeleton';
import { CyberSeal } from './modules/CyberSeal';
import { SimpleGlitch } from './modules/SimpleGlitch';
import { AnalogGlitch } from './modules/AnalogGlitch';
import { HandParticles } from './modules/HandParticles';
import { FlashEffect } from './modules/FlashEffect';
import { FaceParticles } from './modules/FaceParticles';
import { HandTracker } from '../logic/HandTracker';
import { useAppStore } from '../../store/useAppStore';
import * as THREE from 'three';

// 本地定义类型
interface EffectSlot {
  id: string;
  type: 'None' | 'SimpleGlitch' | 'AnalogGlitch' | 'Particles' | 'Flash' | 'FaceParticles';
  params: any;
  active: boolean;
}

const EffectRenderer = ({ slot, overlayScene }: { slot: EffectSlot, overlayScene?: THREE.Scene }) => {
    if (!slot.active) return null;
    switch (slot.type) {
        case 'SimpleGlitch': return <SimpleGlitch params={slot.params} overlayScene={overlayScene} />;
        case 'AnalogGlitch': return <AnalogGlitch params={slot.params} />;
        case 'Particles': return <HandParticles params={slot.params} />;
        case 'FaceParticles': return <FaceParticles params={slot.params} />;
        case 'Flash': return <FlashEffect params={slot.params} />;
        default: return null;
    }
};

const SceneContent: React.FC = () => {
  const { gl } = useThree();
  const visualConfig = useAppStore(state => state.visualConfig);
  
  const sealScene = useMemo(() => new THREE.Scene(), []);

  useEffect(() => {
    gl.setClearColor(new THREE.Color('#000000'), 1);
    gl.autoClear = false;
  }, [gl]);

  const hasAnalog = visualConfig.slots.some((s: any) => s.active && s.type === 'AnalogGlitch');
  const hasSimple = visualConfig.slots.some((s: any) => s.active && s.type === 'SimpleGlitch');
  const hasAscii = visualConfig.slots.some((s: any) => s.active && s.type === 'FaceParticles');

  return (
    <>
      <HandTracker />

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

      {visualConfig.slots.map((slot: any) => {
          if (slot.type === 'SimpleGlitch') {
              return <EffectRenderer key={slot.id} slot={slot} overlayScene={sealScene} />;
          }
          if (slot.type === 'AnalogGlitch') {
              return <EffectRenderer key={slot.id} slot={slot} />;
          }
          return null;
      })}
    </>
  );
};

export const Scene: React.FC = () => {
  return (
    <div className="absolute inset-0 w-full h-full bg-black">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 75 }}
        gl={{
          antialias: false,
          alpha: false,
          depth: false,
          stencil: false,
          powerPreference: "high-performance",
          toneMapping: THREE.NoToneMapping,
          outputColorSpace: THREE.SRGBColorSpace
        }}
        dpr={1}
      >
        <SceneContent />
      </Canvas>
    </div>
  );
};
