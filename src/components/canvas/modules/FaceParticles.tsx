import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useAppStore, getMetricValue } from '../../../store/useAppStore';

const AsciiMaterial = {
  uniforms: {
    uTime: { value: 0 },
    uMap: { value: null },
    uCharMap: { value: null },
    uAmount: { value: 0 },
    uGridSize: { value: 150.0 },
    uMirror: { value: 0.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uAmount;
    uniform float uGridSize;
    uniform float uMirror;
    uniform sampler2D uMap;
    uniform sampler2D uCharMap;
    varying vec2 vUv;

    float rand(vec2 co){
        return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
    }

    void main() {
        if (uAmount < 0.001) discard;

        vec2 screenUV = vUv;
        if (uMirror > 0.5) screenUV.x = 1.0 - screenUV.x;

        vec2 gridUV = floor(screenUV * uGridSize) / uGridSize;
        vec4 color = texture2D(uMap, gridUV);
        
        color.rgb = color.rgb * 1.2; 
        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        float contrastGray = pow(gray, 1.5);
        
        float bgAlpha = smoothstep(0.0, 1.0, uAmount); 
        
        // 阈值放宽到 10.0
        bool isOverload = uGridSize < 10.0;
        
        if (!isOverload) {
            if (contrastGray < 0.05) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, bgAlpha);
                return;
            }
        }

        float noise = rand(gridUV + vec2(0.0, floor(uTime * 10.0)));
        float charIndex = floor(noise * 26.0); 
        
        float cols = 8.0; float rows = 4.0;
        float col = mod(charIndex, cols);
        float row = floor(charIndex / cols);
        
        vec2 cellUV = fract(screenUV * uGridSize);
        vec2 atlasUV = (vec2(col, row) + cellUV) / vec2(cols, rows);
        
        vec4 charColor = texture2D(uCharMap, atlasUV);
        
        if (charColor.r < 0.5) {
             gl_FragColor = vec4(0.0, 0.0, 0.0, bgAlpha);
             return;
        }

        float brightness = isOverload ? 1.0 : (contrastGray + 0.1);
        float charAlpha = smoothstep(0.0, 0.5, 1.0);
        vec3 matrixGreen = vec3(0.0, 1.0, 0.5);

        gl_FragColor = vec4(matrixGreen * brightness, charAlpha);
    }
  `
};

export const FaceParticles: React.FC<{ params: any }> = ({ params }) => {
  const { handDataRef, visualConfig, videoTexture,videoScale } = useAppStore();
  const { viewport } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  
  const customTimeRef = useRef(0);

  const charTexture = useMemo(() => {
      const canvas = document.createElement('canvas');
      const size = 512; canvas.width = size; canvas.height = 256;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'black'; ctx.fillRect(0, 0, size, 256);
      ctx.fillStyle = 'white';
      ctx.font = '900 52px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const cols = 8; const cellW = size / cols; const cellH = 64;
      for(let i=0; i<chars.length; i++) {
          const col = i % cols; const row = Math.floor(i / cols);
          const x = col * cellW + cellW/2; const y = row * cellH + cellH/2;
          ctx.fillText(chars[i], x, y + 4);
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.NearestFilter; tex.magFilter = THREE.NearestFilter;
      return tex;
  }, []);

  const shaderArgs = useMemo(() => ({
    uniforms: THREE.UniformsUtils.clone(AsciiMaterial.uniforms),
    vertexShader: AsciiMaterial.vertexShader,
    fragmentShader: AsciiMaterial.fragmentShader
  }), []);

  useFrame((state, delta) => {
    if (!meshRef.current || !materialRef.current) return;
    const data = handDataRef.current;

    const p = params || { amountSource: 'None', speedSource: 'None' };
    const intensity = getMetricValue(p.amountSource, data, p.amountInvert);
    const speedVal = getMetricValue(p.speedSource, data, p.speedInvert);
    
    const timeMultiplier = 0.2 + speedVal * 2.8;
    customTimeRef.current += delta * timeMultiplier;
    
    let dist = 0.0;
    if (data.left) dist = data.left.distance;
    
    const t = 1.0 - dist;
    // 【修改】最小 3.0
    let gridSize = 3.0 + (t * t) * 247.0;
    gridSize = Math.max(3.0, gridSize);
    
    materialRef.current.uniforms.uTime.value = customTimeRef.current;
    materialRef.current.uniforms.uAmount.value = intensity;
    materialRef.current.uniforms.uGridSize.value = gridSize;
    materialRef.current.uniforms.uMap.value = videoTexture;
    materialRef.current.uniforms.uCharMap.value = charTexture;
    materialRef.current.uniforms.uMirror.value = visualConfig.mirrorVideo ? 1.0 : 0.0;
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0.5]}>
      <planeGeometry args={[viewport.width, viewport.height]} />
      <shaderMaterial
        ref={materialRef}
        args={[shaderArgs]}
        transparent
        blending={THREE.NormalBlending}
        toneMapped={false}
      />
    </mesh>
  );
};
