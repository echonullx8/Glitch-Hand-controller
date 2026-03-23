import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useFBO } from '@react-three/drei';
import { useAppStore, getMetricValue } from '../../../store/useAppStore';
import * as THREE from 'three';

const AnalogMaterial = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAmount: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAmount;
    varying vec2 vUv;

    float rand(vec2 co){
        return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      float strength = uAmount;
      
      if (strength <= 0.01) {
         vec4 c = texture2D(tDiffuse, uv);
         c.rgb = pow(c.rgb, vec3(1.0 / 2.2)); 
         gl_FragColor = c;
         return;
      }

      float stripCount = 5.0 + (strength * 3.0);
      float strip = floor(uv.y * stripCount);
      float stripRand = rand(vec2(strip, floor(uTime * 15.0)));
      float xOffset = 0.0;
      if (stripRand < strength * 0.5) xOffset = (rand(vec2(uTime, strip)) - 0.5) * 0.1 * strength;
      if (rand(vec2(uTime, uv.y)) < strength * 0.3) xOffset += (rand(vec2(uTime)) - 0.5) * 0.05 * strength;

      vec2 finalUV = vec2(uv.x + xOffset, uv.y);
      float r = texture2D(tDiffuse, finalUV + vec2(0.01 * strength, 0.0)).r;
      float g = texture2D(tDiffuse, finalUV).g;
      float b = texture2D(tDiffuse, finalUV - vec2(0.01 * strength, 0.0)).b;
      vec3 color = vec3(r, g, b);
      
      float scanline = sin(uv.y * 800.0) * 0.1 * strength;
      color -= scanline;
      float noise = rand(vec2(floor(uv.x * 250.0), floor(uv.y * 250.0)) + uTime);
      if (noise < strength * 0.3) color += vec3(0.1);

      color = pow(color, vec3(1.0 / 2.2));

      gl_FragColor = vec4(color, 1.0);
    }
  `
};

// 【关键】接收 params
export const AnalogGlitch: React.FC<{ params: any }> = ({ params }) => {
  const { gl, scene, camera } = useThree();
  const { handDataRef } = useAppStore();

  const renderTarget = useFBO({
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
  });

  const hudScene = useMemo(() => new THREE.Scene(), []);
  const hudCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const customTimeRef = useRef(0);

  const shaderArgs = useMemo(() => ({
    uniforms: THREE.UniformsUtils.clone(AnalogMaterial.uniforms),
    vertexShader: AnalogMaterial.vertexShader,
    fragmentShader: AnalogMaterial.fragmentShader
  }), []);

  const quad = useMemo(() => {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
      hudScene.add(q);
      return q;
  }, [hudScene]);

  useFrame((state, delta) => {
    if (!materialRef.current) return;
    
    const data = handDataRef.current;
    
    // 【关键】使用 params
    const p = params || { amountSource: 'None', speedSource: 'None' };
    const amt = getMetricValue(p.amountSource, data, p.amountInvert);
    const spdVal = getMetricValue(p.speedSource, data, p.speedInvert);
    
    const speedMultiplier = p.speedSource === 'None' ? 0.2 : (0.2 + spdVal * 5.0);
    customTimeRef.current += delta * speedMultiplier;

    gl.setRenderTarget(renderTarget);
    gl.clear();
    gl.render(scene, camera);
    
    gl.setRenderTarget(null);
    quad.material = materialRef.current;
    materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
    materialRef.current.uniforms.uTime.value = customTimeRef.current;
    materialRef.current.uniforms.uAmount.value = amt;
    gl.render(hudScene, hudCamera);

  }, 1);

  return (
    <shaderMaterial ref={materialRef} args={[shaderArgs]} toneMapped={false} />
  );
};
