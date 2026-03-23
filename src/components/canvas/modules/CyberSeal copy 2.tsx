import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useAppStore } from '../../../store/useAppStore';
import * as THREE from 'three';

// 1. 水晶外壳 (Darker, More Transparent)
const GlassMaterial = {
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#E0FFFF') },
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewPosition = -mvPosition.xyz;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uColor;
    varying vec3 vNormal;
    varying vec3 vViewPosition;

    void main() {
      vec3 viewDir = normalize(vViewPosition);
      vec3 normal = normalize(vNormal);
      
      float fresnel = dot(viewDir, normal);
      fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
      float rim = pow(fresnel, 3.0); 

      float inner = pow(fresnel, 1.0) * 0.1; // 减弱内部微光

      float flow = sin(normal.y * 10.0 + uTime * 2.0 + normal.x * 5.0);
      flow = smoothstep(0.0, 1.0, flow) * 0.15; // 减弱流光
      
      float alpha = rim * 0.8 + inner + flow + 0.02; // 降低整体 Alpha
      
      // 颜色调暗，偏深蓝，凸显内部亮度
      vec3 finalColor = mix(vec3(0.0, 0.1, 0.3), uColor * 0.5, rim);
      
      gl_FragColor = vec4(finalColor, alpha);
    }
  `
};

// 2. 流光线框 (Brighter)
const WireframeMaterial = {
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#00FFFF') },
    uOpacity: { value: 1.0 },
    uBrightness: { value: 1.0 }
  },
  vertexShader: `
    varying vec3 vPos;
    void main() {
      vPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uColor;
    uniform float uOpacity;
    uniform float uBrightness;
    varying vec3 vPos;
    void main() {
      float flow = sin(vPos.y * 8.0 + vPos.z * 4.0 + uTime * 6.0);
      flow = smoothstep(0.5, 1.0, flow); 
      vec3 finalColor = mix(uColor, vec3(1.0), flow * 0.8); 
      
      // 【关键】亮度倍增
      finalColor *= uBrightness; 
      
      gl_FragColor = vec4(finalColor, uOpacity * (0.6 + 0.4 * flow));
    }
  `
};

// ... (CoreGlowMaterial, ShockwaveMaterial 保持不变)
const CoreGlowMaterial = {
  uniforms: { uColor: { value: new THREE.Color('#FFFFFF') } },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv * 2.0 - 1.0;
      float dist = length(uv);
      float glow = 1.0 - smoothstep(0.0, 0.4, dist);
      glow = pow(glow, 2.0);
      if (glow < 0.01) discard;
      gl_FragColor = vec4(uColor * 2.0, glow);
    }
  `
};

const ShockwaveMaterial = {
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#00FFFF') },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uColor;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv * 2.0 - 1.0;
      float dist = length(uv);
      if (dist > 1.0) discard;
      float wave = fract(uTime * 1.5 - dist * 1.0);
      float ring = smoothstep(0.0, 0.1, wave) * smoothstep(0.4, 0.0, wave);
      ring *= (1.0 - dist);
      gl_FragColor = vec4(uColor, ring * 0.4);
    }
  `
};

export const CyberSeal: React.FC = () => {
  const { handDataRef, visualConfig } = useAppStore();
  const { viewport } = useThree();
  
  const groupRef = useRef<THREE.Group>(null);
  const outerRef = useRef<THREE.Mesh>(null);
  const midRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const waveRef = useRef<THREE.Mesh>(null);
  const shellRef = useRef<THREE.Mesh>(null);

  const matWire = useMemo(() => new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(WireframeMaterial.uniforms),
      vertexShader: WireframeMaterial.vertexShader,
      fragmentShader: WireframeMaterial.fragmentShader,
      transparent: true, wireframe: true, blending: THREE.AdditiveBlending, depthTest: false,
  }), []);
  // 【关键】大幅提高内部亮度
  matWire.uniforms.uBrightness.value = 3.0;

  const matMid = useMemo(() => {
      const m = matWire.clone();
      m.uniforms = THREE.UniformsUtils.clone(WireframeMaterial.uniforms);
      m.uniforms.uBrightness.value = 6.0;
      return m;
  }, [matWire]);

  const matInner = useMemo(() => {
      const m = matWire.clone();
      m.uniforms = THREE.UniformsUtils.clone(WireframeMaterial.uniforms);
      m.uniforms.uBrightness.value = 10.0;
      return m;
  }, [matWire]);

  const matCore = useMemo(() => new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(CoreGlowMaterial.uniforms),
      vertexShader: CoreGlowMaterial.vertexShader,
      fragmentShader: CoreGlowMaterial.fragmentShader,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  }), []);

  const matWave = useMemo(() => new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(ShockwaveMaterial.uniforms),
      vertexShader: ShockwaveMaterial.vertexShader,
      fragmentShader: ShockwaveMaterial.fragmentShader,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  }), []);

  const matGlass = useMemo(() => new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(GlassMaterial.uniforms),
      vertexShader: GlassMaterial.vertexShader,
      fragmentShader: GlassMaterial.fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide,
  }), []);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const data = handDataRef.current;
    const active = data.sealActive && data.sealSize > 0.01;
    groupRef.current.visible = active;
    
    if (!active || !data.left || !data.right) return;

    const speed = 2.0 + data.sealSize * 20.0;
    const t = state.clock.elapsedTime;

    matWire.uniforms.uTime.value = t;
    matMid.uniforms.uTime.value = t;
    matInner.uniforms.uTime.value = t;
    matWave.uniforms.uTime.value = t;
    matGlass.uniforms.uTime.value = t;

    if (outerRef.current) {
        outerRef.current.rotation.z -= delta * speed * 0.2;
        outerRef.current.rotation.y += delta * 0.1;
    }
    if (midRef.current) {
        midRef.current.rotation.x += delta * speed * 0.5;
        midRef.current.rotation.y += delta * speed * 0.3;
    }
    if (innerRef.current) {
        innerRef.current.rotation.x -= delta * speed * 1.0;
        innerRef.current.rotation.z += delta * speed * 0.8;
    }
    // 【关键】水晶球也旋转
    if (shellRef.current) {
        shellRef.current.rotation.y += delta * 0.9;
        shellRef.current.rotation.z -= delta * 0.8;
    }
    
    if (coreRef.current) coreRef.current.lookAt(state.camera.position);
    if (waveRef.current) waveRef.current.lookAt(state.camera.position);

    const w = viewport.width;
    const h = viewport.height;
    let cx = (data.left.indexTip.x + data.right.indexTip.x) / 2;
    const cy = (data.left.indexTip.y + data.right.indexTip.y) / 2;
    if (visualConfig.mirrorSkeleton) cx = 1 - cx;
    groupRef.current.position.set((0.5 - cx) * w, (0.5 - cy) * h, 0);
    
    const s = data.sealSize * 4.0;
    groupRef.current.scale.setScalar(s);
  });

  return (
    <group ref={groupRef}>
      <mesh ref={waveRef} material={matWave}>
          <planeGeometry args={[3.0, 3.0]} />
      </mesh>
      
      <mesh ref={shellRef} material={matGlass}>
          <sphereGeometry args={[1.05, 64, 64]} />
      </mesh>

      <mesh ref={coreRef} material={matCore}>
          <planeGeometry args={[0.8, 0.8]} />
      </mesh>
      <mesh ref={outerRef} material={matWire}>
        <icosahedronGeometry args={[1.0, 0]} />
      </mesh>
      <mesh ref={midRef} material={matWire}>
        <boxGeometry args={[1.1, 1.1, 1.1]} />
      </mesh>
      <mesh ref={innerRef} material={matInner}>
        <octahedronGeometry args={[0.5, 0]} />
      </mesh>
    </group>
  );
};
