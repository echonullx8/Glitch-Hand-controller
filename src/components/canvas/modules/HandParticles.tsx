import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppStore, getMetricValue } from '../../../store/useAppStore';

const MAX_COUNT = 4000;
const TIPS_INDICES = [4, 8, 12, 16, 20];
const DEFAULT_PARTICLE_COLOR = '#67E8F9';

class ParticleSystemCPU {
  count: number; pointer: number;
  x: Float32Array; y: Float32Array; z: Float32Array;
  vx: Float32Array; vy: Float32Array; vz: Float32Array;
  life: Float32Array; size: Float32Array;

  constructor(count: number) {
    this.count = count; this.pointer = 0;
    this.x = new Float32Array(count); this.y = new Float32Array(count); this.z = new Float32Array(count);
    this.vx = new Float32Array(count); this.vy = new Float32Array(count); this.vz = new Float32Array(count);
    this.life = new Float32Array(count); this.size = new Float32Array(count);
    for(let i=0; i<count; i++) this.life[i] = 0;
  }

  spawn(x: number, y: number, intensity: number, scale: number) {
    const i = this.pointer;
    const spread = 4.0 * scale;
    this.x[i] = x + (Math.random() - 0.5) * spread;
    this.y[i] = y + (Math.random() - 0.5) * spread;
    this.z[i] = (Math.random() - 0.5) * spread;
    
    const speedScale = scale * 0.4;
    this.vx[i] = (Math.random() - 0.5) * 2.0 * intensity * speedScale;
    this.vy[i] = (Math.random() * 2.0 + 0.2) * intensity * speedScale;
    this.vz[i] = (Math.random() - 0.5) * 2.0 * intensity * speedScale;
    
    this.life[i] = 1.0;
    // 【修改】粒子更小
    this.size[i] = (0.5 + Math.random() * 2.0);
    this.pointer = (this.pointer + 1) % this.count;
  }

  update() {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.vx[i] += (Math.random() - 0.5) * 0.002;
      this.vy[i] += (Math.random() - 0.5) * 0.002;
      this.vz[i] += (Math.random() - 0.5) * 0.002;
      this.x[i] += this.vx[i]; this.y[i] += this.vy[i]; this.z[i] += this.vz[i];
      this.vx[i] *= 0.85; this.vy[i] *= 0.85; this.vz[i] *= 0.85;
      this.life[i] -= 0.008;
    }
  }
}

const SingleHandParticles = ({ side, color, sizeScale, params }: { side: 'left' | 'right', color: string, sizeScale: number, params: any }) => {
  const { handDataRef, isSwapped, visualConfig } = useAppStore();
  const { viewport } = useThree();
  const system = useMemo(() => new ParticleSystemCPU(MAX_COUNT), []);
  const pointsRef = useRef<THREE.Points>(null);
  const positions = useMemo(() => new Float32Array(MAX_COUNT * 3), []);
  const sizes = useMemo(() => new Float32Array(MAX_COUNT), []);
  const opacities = useMemo(() => new Float32Array(MAX_COUNT), []);

  useEffect(() => {
    const material = pointsRef.current?.material as THREE.ShaderMaterial | undefined;
    if (!material) return;
    material.uniforms.uColor.value.set(color || DEFAULT_PARTICLE_COLOR);
    material.uniformsNeedUpdate = true;
  }, [color]);

  useEffect(() => {
    const material = pointsRef.current?.material as THREE.ShaderMaterial | undefined;
    if (!material) return;
    material.uniforms.uSizeScale.value = sizeScale || 1.0;
    material.uniformsNeedUpdate = true;
  }, [sizeScale]);

  useFrame(() => {
    if (!pointsRef.current) return;

    const data = handDataRef.current;
    const p = params || { amountSource: 'None' };
    const intensity = getMetricValue(p.amountSource, data, p.amountInvert);
    let handData;
    if (isSwapped) { handData = side === 'left' ? data.right : data.left; }
    else { handData = side === 'left' ? data.left : data.right; }

    const w = viewport.width;
    const h = viewport.height;
    const isMirrored = visualConfig.mirrorSkeleton;

    if (handData && handData.rawLandmarks && intensity > 0.05) {
        for(let tipIdx of TIPS_INDICES) {
            if (Math.random() < (intensity * 2.0)) {
                const lm = handData.rawLandmarks[tipIdx];
                let xRaw = lm.x;
                if (isMirrored) xRaw = 1 - xRaw;
                const x = (0.5 - xRaw) * w;
                const y = (0.5 - lm.y) * h;
                system.spawn(x, y, intensity, w * 0.005);
            }
        }
    }
    system.update();
    for (let i = 0; i < MAX_COUNT; i++) {
        if (system.life[i] > 0) {
            positions[i * 3] = system.x[i]; positions[i * 3 + 1] = system.y[i]; positions[i * 3 + 2] = system.z[i];
            sizes[i] = system.size[i] * system.life[i]; opacities[i] = system.life[i] * 0.8;
        } else {
            positions[i * 3] = 99999; sizes[i] = 0; opacities[i] = 0;
        }
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
    pointsRef.current.geometry.attributes.size.needsUpdate = true;
    pointsRef.current.geometry.attributes.opacity.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} renderOrder={999} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={MAX_COUNT} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-size" count={MAX_COUNT} array={sizes} itemSize={1} />
        <bufferAttribute attach="attributes-opacity" count={MAX_COUNT} array={opacities} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial
        key={`${color || DEFAULT_PARTICLE_COLOR}-${sizeScale || 1.0}`}
        transparent depthWrite={false} depthTest={false} blending={THREE.NormalBlending}
        uniforms={{
          uColor: { value: new THREE.Color(color || DEFAULT_PARTICLE_COLOR) },
          uSizeScale: { value: sizeScale || 1.0 }
        }}
        vertexShader={`
          uniform float uSizeScale; attribute float size; attribute float opacity; varying float vOpacity;
          void main() { 
            vOpacity = opacity; 
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            float distScale = 10.0 / -mvPosition.z; 
            // 【修改】倍率调小
            gl_PointSize = size * 3.0 * uSizeScale * distScale; 
            gl_Position = projectionMatrix * mvPosition; 
          }
        `}
        fragmentShader={`
          uniform vec3 uColor; varying float vOpacity;
          void main() { 
            if (vOpacity <= 0.01) discard;
            vec2 coord = abs(gl_PointCoord - vec2(0.5));
            float dist = max(coord.x, coord.y);
            float glow = 1.0 - smoothstep(0.2, 0.5, dist);
            float core = 1.0 - smoothstep(0.0, 0.3, dist);
            vec3 finalColor = mix(uColor, vec3(1.0), core * 0.22);
            gl_FragColor = vec4(finalColor, vOpacity * glow); 
          }
        `}
        toneMapped={false}
      />
    </points>
  );
};

export const HandParticles: React.FC<{ params: any }> = ({ params }) => {
  const particleColor = useAppStore(state => state.visualConfig.particleColor || DEFAULT_PARTICLE_COLOR);
  const particleSize = useAppStore(state => state.visualConfig.particleSize || 1.0);

  return (
    <>
      <SingleHandParticles side="left" color={particleColor} sizeScale={particleSize} params={params} />
      <SingleHandParticles side="right" color={particleColor} sizeScale={particleSize} params={params} />
    </>
  );
};
