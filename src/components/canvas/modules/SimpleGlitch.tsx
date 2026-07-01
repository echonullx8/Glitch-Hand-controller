import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useFBO } from '@react-three/drei';
import { useAppStore, getMetricValue } from '../../../store/useAppStore';
import * as THREE from 'three';

export const SimpleGlitchMaterial = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAmount: { value: 0 },
    uSpeed: { value: 0 },
    uApplyGamma: { value: 1 }
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
    uniform float uSpeed;
    uniform float uApplyGamma;
    varying vec2 vUv;

    float rand(vec2 co){
        return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
    }

    vec3 applyGamma(vec3 color) {
        if (uApplyGamma > 0.5) return pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
        return color;
    }

    void main() {
      vec2 uv = vUv;
      vec4 base = texture2D(tDiffuse, uv);
      
      if (uAmount <= 0.01) {
        base.rgb = applyGamma(base.rgb);
        gl_FragColor = base;
        return;
      }

      // 1. 触发逻辑 (60fps check)
      float timeStep = floor(uTime * 60.0); 
      float triggerRandom = rand(vec2(timeStep, 1.0));
      float threshold = 1.0 - (uSpeed * 0.9 + 0.05); 
      
      if (triggerRandom < threshold) {
          base.rgb = applyGamma(base.rgb);
          gl_FragColor = base;
          return;
      }

      // 2. 动态块大小 (Dynamic Block Size) - 【大块版】
      // 每一帧随机改变网格密度 (1 ~ 10)
      float densityX = 1.0 + rand(vec2(timeStep, 10.0)) * 10.0;
      float densityY = 3.0 + rand(vec2(timeStep, 20.0)) * 10.0;
      
      vec2 blockUV = vec2(floor(uv.x * densityX), floor(uv.y * densityY));
      float blockRand = rand(blockUV + timeStep);

      // 3. 错位逻辑
      vec2 offset = vec2(0.0);
      float isGlitched = 0.0;

      if (blockRand < uAmount) {
          // 随机方向错位
          offset.x = (rand(vec2(timeStep, blockUV.y)) - 0.5) * uAmount * 0.1;
          offset.y = (rand(vec2(timeStep, blockUV.x)) - 0.5) * uAmount * 0.1;
          isGlitched = 1.0;
      }

      vec4 glitchColor = texture2D(tDiffuse, uv + offset);
      vec3 finalColor = glitchColor.rgb;

      // 4. 颜色叠加 (Cyan + White Flash)
      if (isGlitched > 0.5) {
          // 再次随机，决定这个块是变色还是只是错位
          float colorRand = rand(blockUV * 2.0 + timeStep);
          
          if (colorRand > 0.4) { // 60% 概率变色
              vec4 ghostColor = texture2D(tDiffuse, uv - offset * 0.5);
              
              // 弱青色 (Low Saturation Cyan)
              vec3 cyan = vec3(0.5, 0.9, 1.0); 
              
              // 混合：叠加残影 + 青色滤镜
              finalColor += ghostColor.rgb * cyan * uAmount * 0.4; // 强度减弱到 0.4
              
              // 白色闪烁 (Highlight)
              // 随机某些块特别亮
              if (colorRand > 0.8) {
                  finalColor += vec3(0.15 * uAmount); // 整体提亮
              }
          }
      }

      // 5. 色彩修正
      finalColor.r *= 0.95; 
      finalColor.b *= 1.05;
      finalColor = applyGamma(finalColor);

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `
};

// 【关键】接收 params 和 overlayScene
export const SimpleGlitch: React.FC<{ params: any, overlayScene?: THREE.Scene }> = ({ params, overlayScene }) => {
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
    uniforms: THREE.UniformsUtils.clone(SimpleGlitchMaterial.uniforms),
    vertexShader: SimpleGlitchMaterial.vertexShader,
    fragmentShader: SimpleGlitchMaterial.fragmentShader
  }), []);

  const quad = useMemo(() => {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
      hudScene.add(q);
      return q;
  }, [hudScene]);

  useFrame((state, delta) => {
    if (!materialRef.current) return;
    
    const data = handDataRef.current;
    
    // 【关键】使用 params 中的配置
    const p = params || { amountSource: 'None', speedSource: 'None' };

    const amt = getMetricValue(p.amountSource, data, p.amountInvert);
    const spdVal = getMetricValue(p.speedSource, data, p.speedInvert);
    
    const speedParam = p.speedSource === 'None' ? 0.1 : (0.1 + spdVal * 0.9);
    const timeMultiplier = 1.0 + (spdVal * 2.0);
    customTimeRef.current += delta * timeMultiplier;

    gl.setRenderTarget(renderTarget);
    gl.clear();
    gl.render(scene, camera);
    
    gl.setRenderTarget(null);
    quad.material = materialRef.current;
    materialRef.current.uniforms.tDiffuse.value = renderTarget.texture;
    materialRef.current.uniforms.uTime.value = customTimeRef.current;
    materialRef.current.uniforms.uAmount.value = amt;
    materialRef.current.uniforms.uSpeed.value = speedParam;
    
    gl.render(hudScene, hudCamera);

    if (overlayScene) {
        gl.clearDepth();
        gl.render(overlayScene, camera);
    }

  }, 1);

  return (
    <shaderMaterial ref={materialRef} args={[shaderArgs]} toneMapped={false} />
  );
};
