import React from 'react';
import { Canvas } from '@react-three/fiber';
import { Background } from './Background';
import { HandSkeleton } from './modules/HandSkeleton';
import { CyberSeal } from './modules/CyberSeal';
import { SimpleGlitch } from './modules/SimpleGlitch'; // <--- 引入这个新组件
import * as THREE from 'three';

export const Scene: React.FC = () => {
  return (
    <div className="absolute inset-0 w-full h-full z-0">
      <Canvas
        camera={{ position: [0, 0, 5], fov: 75 }}
        gl={{
          antialias: true,
          alpha: false,
          toneMapping: THREE.ACESFilmicToneMapping,
        }}
        dpr={[1, 1.5]}
      >
        <Background />

        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={2} color="#ffffff" />
        <pointLight position={[0, 0, 2]} intensity={5} color="#00FF7F" distance={5} />

        <HandSkeleton />
        <CyberSeal />

        {/* 只有这一个特效组件，绝对稳定 */}
        <SimpleGlitch />

      </Canvas>
    </div>
  );
};
