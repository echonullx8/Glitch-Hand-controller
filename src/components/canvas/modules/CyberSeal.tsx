import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useAppStore } from '../../../store/useAppStore';
import * as THREE from 'three';

// ... (保留之前的 Shader Materials 定义: GlassMaterial, WireframeMaterial, CoreGlowMaterial, ShockwaveMaterial)
// 请务必保留这些定义，不要删掉！
// 为了节省篇幅，这里简写了，请确保你文件里有它们。
const GlassMaterial = {
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#E0FFFF') }, uOpacity: { value: 1.0 } },
  vertexShader: `varying vec3 vNormal; varying vec3 vViewPosition; void main() { vNormal = normalize(normalMatrix * normal); vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); vViewPosition = -mvPosition.xyz; gl_Position = projectionMatrix * mvPosition; }`,
  fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uOpacity; varying vec3 vNormal; varying vec3 vViewPosition; void main() { vec3 viewDir = normalize(vViewPosition); vec3 normal = normalize(vNormal); float fresnel = dot(viewDir, normal); fresnel = clamp(1.0 - fresnel, 0.0, 1.0); float rim = pow(fresnel, 3.0); float inner = pow(fresnel, 1.0) * 0.1; float flow = sin(normal.y * 10.0 + uTime * 2.0 + normal.x * 5.0); flow = smoothstep(0.0, 1.0, flow) * 0.15; float alpha = rim * 0.8 + inner + flow + 0.02; vec3 finalColor = mix(vec3(0.0, 0.1, 0.3), uColor * 0.5, rim); gl_FragColor = vec4(finalColor, alpha * uOpacity); }`
};
const WireframeMaterial = {
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#00FFFF') }, uOpacity: { value: 1.0 }, uBrightness: { value: 1.0 } },
  vertexShader: `varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uOpacity; uniform float uBrightness; varying vec3 vPos; void main() { float flow = sin(vPos.y * 8.0 + vPos.z * 4.0 + uTime * 6.0); flow = smoothstep(0.5, 1.0, flow); vec3 finalColor = mix(uColor, vec3(1.0), flow * 0.8); finalColor *= uBrightness; gl_FragColor = vec4(finalColor, uOpacity * (0.6 + 0.4 * flow)); }`
};
const CoreGlowMaterial = {
  uniforms: { uColor: { value: new THREE.Color('#FFFFFF') }, uOpacity: { value: 1.0 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; void main() { vec2 uv = vUv * 2.0 - 1.0; float dist = length(uv); float glow = 1.0 - smoothstep(0.0, 0.4, dist); glow = pow(glow, 2.0); if (glow < 0.01) discard; gl_FragColor = vec4(uColor * 2.0, glow * uOpacity); }`
};
const ShockwaveMaterial = {
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#00FFFF') }, uOpacity: { value: 1.0 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; void main() { vec2 uv = vUv * 2.0 - 1.0; float dist = length(uv); if (dist > 1.0) discard; float wave = fract(uTime * 1.5 - dist * 1.0); float ring = smoothstep(0.0, 0.1, wave) * smoothstep(0.4, 0.0, wave); ring *= (1.0 - dist); gl_FragColor = vec4(uColor, ring * 0.4 * uOpacity); }`
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const OuroborosSeal: React.FC<{ color: string; opacity: number }> = ({ color, opacity }) => {
  const groupRef = useRef<THREE.Group>(null);
  const { curve, ribs, head, tail } = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 96; i += 1) {
      const t = (i / 96) * Math.PI * 2;
      points.push(new THREE.Vector3(
        Math.sin(t) * 1.05,
        Math.sin(t * 2) * 0.46,
        Math.cos(t) * 0.08
      ));
    }

    const snakeCurve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.45);
    const ribData = Array.from({ length: 42 }, (_, index) => {
      const amount = index / 42;
      const point = snakeCurve.getPointAt(amount);
      const tangent = snakeCurve.getTangentAt(amount);
      return {
        point,
        rotation: [0, 0, Math.atan2(tangent.y, tangent.x) + Math.PI / 2] as [number, number, number],
        scale: 0.65 + Math.sin(amount * Math.PI * 2) * 0.25,
      };
    });

    const headPoint = snakeCurve.getPointAt(0.03);
    const headTangent = snakeCurve.getTangentAt(0.03);
    const tailPoint = snakeCurve.getPointAt(0.97);
    const tailTangent = snakeCurve.getTangentAt(0.97);

    return {
      curve: snakeCurve,
      ribs: ribData,
      head: {
        point: headPoint,
        rotation: [0, 0, Math.atan2(headTangent.y, headTangent.x) - Math.PI / 2] as [number, number, number],
      },
      tail: {
        point: tailPoint,
        rotation: [0, 0, Math.atan2(tailTangent.y, tailTangent.x) + Math.PI / 2] as [number, number, number],
      },
    };
  }, []);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.z -= delta * 0.38;
    groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.7) * 0.12;
  });

  const safeOpacity = clamp01(opacity);

  return (
    <group ref={groupRef}>
      <mesh>
        <tubeGeometry args={[curve, 180, 0.045, 10, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.42 * safeOpacity} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
      </mesh>
      <mesh>
        <tubeGeometry args={[curve, 180, 0.018, 8, true]} />
        <meshBasicMaterial color="#f8fbff" transparent opacity={0.8 * safeOpacity} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
      </mesh>
      {ribs.map((rib, index) => (
        <mesh key={index} position={rib.point} rotation={rib.rotation}>
          <boxGeometry args={[0.16 * rib.scale, 0.014, 0.014]} />
          <meshBasicMaterial color="#f8fbff" transparent opacity={0.64 * safeOpacity} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
        </mesh>
      ))}
      <mesh position={head.point} rotation={head.rotation}>
        <coneGeometry args={[0.13, 0.26, 4]} />
        <meshBasicMaterial color={color} transparent opacity={0.9 * safeOpacity} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
      </mesh>
      <mesh position={tail.point} rotation={tail.rotation}>
        <coneGeometry args={[0.055, 0.26, 8]} />
        <meshBasicMaterial color="#f8fbff" transparent opacity={0.72 * safeOpacity} blending={THREE.AdditiveBlending} depthWrite={false} depthTest={false} />
      </mesh>
    </group>
  );
};

export const CyberSeal: React.FC = () => {
  const { handDataRef, visualConfig, sealImage } = useAppStore();
  const { viewport } = useThree();
  
  const groupRef = useRef<THREE.Group>(null);
  
  // 3D Refs
  const outerRef = useRef<THREE.Mesh>(null);
  const midRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const waveRef = useRef<THREE.Mesh>(null);
  const shellRef = useRef<THREE.Mesh>(null);
  
  // Image Ref
  const imagePlaneRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  // Load Image
  useEffect(() => {
    if (sealImage) {
        console.log("CyberSeal: Loading image...", sealImage);
        const loader = new THREE.TextureLoader();
        loader.load(
            sealImage,
            (tex) => {
                console.log("CyberSeal: Image Loaded");
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                tex.colorSpace = THREE.SRGBColorSpace; // 关键：修正颜色
                setTexture(tex);
            },
            undefined,
            (err) => console.error("CyberSeal: Load Error", err)
        );
    } else {
        setTexture(null);
    }
    
    return () => {
        if (texture) texture.dispose();
    };
  }, [sealImage]);

  // Materials
  const matWire = useMemo(() => new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(WireframeMaterial.uniforms),
      vertexShader: WireframeMaterial.vertexShader,
      fragmentShader: WireframeMaterial.fragmentShader,
      transparent: true, wireframe: true, blending: THREE.AdditiveBlending, depthTest: false,
  }), []);
  matWire.uniforms.uBrightness.value = 1.5;

  const matMid = useMemo(() => {
      const m = matWire.clone();
      m.uniforms = THREE.UniformsUtils.clone(WireframeMaterial.uniforms);
      m.uniforms.uBrightness.value = 3.0;
      return m;
  }, [matWire]);

  const matInner = useMemo(() => {
      const m = matWire.clone();
      m.uniforms = THREE.UniformsUtils.clone(WireframeMaterial.uniforms);
      m.uniforms.uBrightness.value = 5.0;
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
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
  }), []);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const data = handDataRef.current;
    const sealColor = visualConfig.sealColor || '#67E8F9';
    const sealOpacity = clamp01(visualConfig.sealOpacity ?? 1);
    
    // 激活逻辑
    const active = data.sealActive && data.sealSize > 0.01;
    groupRef.current.visible = active;
    
    // 调试：如果 active 为 false，控制台不会一直打印，只有状态改变时才重要
    // if (active) console.log("Seal Active, Size:", data.sealSize);
    
    if (!active) return;

    const speed = 2.0 + data.sealSize * 4.0;
    const t = state.clock.elapsedTime;
    const showOuroboros = visualConfig.sealStyle === 'Ouroboros';

    [matWire, matMid, matInner].forEach((mat, index) => {
        mat.uniforms.uColor.value.set(sealColor);
        mat.uniforms.uOpacity.value = sealOpacity * (index === 0 ? 0.72 : 0.95);
    });
    matWave.uniforms.uColor.value.set(sealColor);
    matWave.uniforms.uOpacity.value = sealOpacity;
    matGlass.uniforms.uColor.value.set(sealColor);
    matGlass.uniforms.uOpacity.value = sealOpacity;
    matCore.uniforms.uColor.value.set(sealColor);
    matCore.uniforms.uOpacity.value = sealOpacity;

    // 如果有图片，只旋转图片
    if (texture && imagePlaneRef.current && !showOuroboros) {
        imagePlaneRef.current.rotation.z -= delta * speed * 0.5;
    }
    // 如果没有图片，执行 3D 动画
    else {
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
        if (shellRef.current) {
            shellRef.current.rotation.y += delta * 0.9;
            shellRef.current.rotation.z -= delta * 0.8;
        }
        
        if (coreRef.current) coreRef.current.lookAt(state.camera.position);
        if (waveRef.current) waveRef.current.lookAt(state.camera.position);
    }

    // 位置跟随
    if (data.left && data.right) {
        const w = viewport.width;
        const h = viewport.height;
        let cx = (data.left.indexTip.x + data.right.indexTip.x) / 2;
        const cy = (data.left.indexTip.y + data.right.indexTip.y) / 2;
        if (visualConfig.mirrorSkeleton) cx = 1 - cx;
        groupRef.current.position.set((0.5 - cx) * w, (0.5 - cy) * h, 0);
        
        const s = data.sealSize * 4.0;
        groupRef.current.scale.setScalar(s);
    }
  });

  return (
    <group ref={groupRef}>
      {visualConfig.sealStyle === 'Ouroboros' ? (
          <OuroborosSeal color={visualConfig.sealColor || '#67E8F9'} opacity={visualConfig.sealOpacity ?? 1} />
      ) : texture ? (
          // 方案 A: 自定义图片
          <mesh ref={imagePlaneRef}>
              <planeGeometry args={[2.0, 2.0]} />
              <meshBasicMaterial
                map={texture}
                transparent
                side={THREE.DoubleSide}
                depthWrite={false}
                toneMapped={false}
                // 使用 NormalBlending 保证图片颜色正常显示
                // 如果图片是黑底光效，可以用 AdditiveBlending
                blending={THREE.AdditiveBlending}
                opacity={clamp01(visualConfig.sealOpacity ?? 1)}
              />
          </mesh>
      ) : (
          // 方案 B: 3D 几何体
          <>
              <mesh ref={waveRef} material={matWave}><planeGeometry args={[3.0, 3.0]} /></mesh>
              <mesh ref={shellRef} material={matGlass}><sphereGeometry args={[1.05, 64, 64]} /></mesh>
              <mesh ref={coreRef} material={matCore}><planeGeometry args={[0.8, 0.8]} /></mesh>
              <mesh ref={outerRef} material={matWire}><icosahedronGeometry args={[1.0, 0]} /></mesh>
              <mesh ref={midRef} material={matWire}><boxGeometry args={[1.1, 1.1, 1.1]} /></mesh>
              <mesh ref={innerRef} material={matInner}><octahedronGeometry args={[0.5, 0]} /></mesh>
          </>
      )}
    </group>
  );
};
