import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useAppStore, getMetricValue } from '../../../store/useAppStore';
import * as THREE from 'three';

export const FlashEffect: React.FC<{ params: any }> = ({ params }) => {
  const { handDataRef, visualConfig } = useAppStore();
  const { viewport } = useThree();
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const shaderArgs = useMemo(() => ({
    uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 }
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
      uniform float uIntensity;
      varying vec2 vUv;

      // 伪随机
      float rand(vec2 co){
          return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
      }

      // 噪声函数
      float noise(vec2 p) {
          vec2 ip = floor(p);
          vec2 u = fract(p);
          u = u*u*(3.0-2.0*u);
          float res = mix(
              mix(rand(ip), rand(ip+vec2(1.0,0.0)), u.x),
              mix(rand(ip+vec2(0.0,1.0)), rand(ip+vec2(1.0,1.0)), u.x), u.y);
          return res*res;
      }

      void main() {
        if (uIntensity < 0.01) discard;

        // --- 先锋派 Barcode 逻辑 ---

        // 1. 动态分块 (不均匀的竖条)
        // 随时间快速变化的切分密度
        float density = 10.0 + rand(vec2(floor(uTime * 10.0))) * 20.0;
        float xIndex = floor(vUv.x * density);
        
        // 2. 随机激活
        // 每一条是否显示的概率
        float trigger = rand(vec2(xIndex, floor(uTime * 12.0)));
        
        // 阈值控制：强度越大，条纹越密
        if (trigger > uIntensity * 1.15) discard;

        // 3. 内部数字噪点 (Digital Grit)
        // 让条纹内部不是纯白，而是带有噪点的“脏”反色
        // 这消除了“白边感”，增加了“信号损坏感”
        float grit = rand(vUv * 50.0 + uTime);
        
        // 4. 边缘腐蚀
        // 让条纹边缘不那么整齐
        float edge = abs(fract(vUv.x * density) - 0.5);
        if (edge > 0.4 && rand(vUv + uTime) > 0.5) discard;

        // 输出：
        // 配合 CustomBlending (OneMinusDstColor), 
        // 这里的颜色值决定了反色的程度。
        // 1.0 = 完全反色, 0.0 = 无变化
        float alpha = 0.8 + (grit * 0.2); // 保持高反色度，带一点噪点波动

        gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
      }
    `
  }), []);

  useFrame((state) => {
    if (!materialRef.current) return;

    const data = handDataRef.current;
      // 【关键】使用 params
    const p = params || { amountSource: 'None' };
    const intensity = getMetricValue(p.amountSource, data, p.amountInvert);
    
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    // 增加指数响应，让闪烁更有爆发力
    materialRef.current.uniforms.uIntensity.value = intensity > 0.05 ? Math.pow(intensity, 1.5) : 0;
  });

  return (
    <mesh position={[0, 0, 0.1]}>
      <planeGeometry args={[viewport.width, viewport.height]} />
      <shaderMaterial
        ref={materialRef}
        args={[shaderArgs]}
        transparent
        // 【绝对反色混合模式】
        // Final = 1 * (1 - Dst) + Dst * (1 - 1) = 1 - Dst
        // 无论背景是什么颜色，都会变成它的补色
        blending={THREE.CustomBlending}
        blendEquation={THREE.AddEquation}
        blendSrc={THREE.OneMinusDstColorFactor}
        blendDst={THREE.OneMinusSrcColorFactor}
        toneMapped={false}
        depthTest={false}
      />
    </mesh>
  );
};
