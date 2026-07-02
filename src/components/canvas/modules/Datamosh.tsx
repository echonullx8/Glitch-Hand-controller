import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useFBO } from '@react-three/drei';
import { useAppStore, getMetricValue } from '../../../store/useAppStore';
import * as THREE from 'three';

const DatamoshMaterial = {
  uniforms: {
    tCurrent: { value: null },
    tHistory: { value: null },
    uTime: { value: 0 },
    uAmount: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tCurrent;
    uniform sampler2D tHistory;
    uniform float uTime;
    uniform float uAmount;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      float amount = smoothstep(0.02, 1.0, uAmount);
      vec2 block = floor(uv * vec2(22.0, 14.0));
      float blockNoise = rand(block + floor(uTime * (2.0 + amount * 8.0)));
      float tear = step(0.58, blockNoise) * amount;
      vec2 blockShift = vec2(
        rand(block + vec2(3.1, uTime)) - 0.5,
        rand(block + vec2(uTime, 9.7)) - 0.5
      ) * tear * vec2(0.16, 0.05);
      float lineNoise = rand(vec2(floor(uv.y * 80.0), floor(uTime * 12.0)));
      vec2 lineShift = vec2((lineNoise - 0.5) * amount * 0.035, 0.0);
      vec2 historyUv = clamp(uv + blockShift + lineShift, 0.001, 0.999);
      vec2 currentUv = clamp(uv - blockShift * 0.3, 0.001, 0.999);
      vec3 currentColor = texture2D(tCurrent, currentUv).rgb;
      vec3 historyColor = texture2D(tHistory, historyUv).rgb;
      float hold = amount * (0.62 + blockNoise * 0.28);
      vec3 color = mix(currentColor, historyColor, hold);
      float chroma = amount * 0.012;
      color.r = mix(color.r, texture2D(tHistory, clamp(historyUv + vec2(chroma, 0.0), 0.001, 0.999)).r, amount);
      color.b = mix(color.b, texture2D(tHistory, clamp(historyUv - vec2(chroma, 0.0), 0.001, 0.999)).b, amount);
      gl_FragColor = vec4(color, 1.0);
    }
  `
};

export const Datamosh: React.FC<{ params: any }> = ({ params }) => {
  const { gl, scene, camera } = useThree();
  const { handDataRef } = useAppStore();
  const sourceTarget = useFBO({ minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
  const historyA = useFBO({ minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
  const historyB = useFBO({ minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
  const hudScene = useMemo(() => new THREE.Scene(), []);
  const hudCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const copyMaterial = useMemo(() => new THREE.MeshBasicMaterial({ map: historyA.texture, toneMapped: false }), [historyA.texture]);
  const readTargetRef = useRef(historyA);
  const writeTargetRef = useRef(historyB);
  const timeRef = useRef(0);
  const initializedRef = useRef(false);

  const shaderArgs = useMemo(() => ({
    uniforms: THREE.UniformsUtils.clone(DatamoshMaterial.uniforms),
    vertexShader: DatamoshMaterial.vertexShader,
    fragmentShader: DatamoshMaterial.fragmentShader
  }), []);

  const quad = useMemo(() => {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
    hudScene.add(q);
    return q;
  }, [hudScene]);

  useFrame((_, delta) => {
    if (!materialRef.current) return;

    const data = handDataRef.current;
    const p = params || { amountSource: 'None', speedSource: 'None' };
    const amt = getMetricValue(p.amountSource, data, p.amountInvert);
    const spdVal = getMetricValue(p.speedSource, data, p.speedInvert);
    const speedMultiplier = p.speedSource === 'None' ? 0.35 : (0.35 + spdVal * 8.0);
    timeRef.current += delta * speedMultiplier;

    gl.setRenderTarget(sourceTarget);
    gl.clear();
    gl.render(scene, camera);

    const readTarget = readTargetRef.current;
    const writeTarget = writeTargetRef.current;
    const historyTexture = initializedRef.current ? readTarget.texture : sourceTarget.texture;
    quad.material = materialRef.current;
    materialRef.current.uniforms.tCurrent.value = sourceTarget.texture;
    materialRef.current.uniforms.tHistory.value = historyTexture;
    materialRef.current.uniforms.uTime.value = timeRef.current;
    materialRef.current.uniforms.uAmount.value = amt;

    gl.setRenderTarget(writeTarget);
    gl.clear();
    gl.render(hudScene, hudCamera);

    copyMaterial.map = writeTarget.texture;
    copyMaterial.needsUpdate = true;
    quad.material = copyMaterial;
    gl.setRenderTarget(null);
    gl.render(hudScene, hudCamera);

    readTargetRef.current = writeTarget;
    writeTargetRef.current = readTarget;
    initializedRef.current = true;
  }, 1);

  return <shaderMaterial ref={materialRef} args={[shaderArgs]} toneMapped={false} />;
};
