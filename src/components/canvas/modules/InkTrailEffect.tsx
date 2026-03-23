import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useFBO } from '@react-three/drei';
import { useAppStore } from '../../../store/useAppStore';
import * as THREE from 'three';

const InkMaterial = {
  uniforms: {
    tDiffuse: { value: null },
    tPrev: { value: null },
    uResolution: { value: new THREE.Vector2() },
    uThreshold: { value: 0.2 }, // 提高阈值
    uTrail: { value: 0.96 }
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
    uniform sampler2D tPrev;
    uniform vec2 uResolution;
    uniform float uThreshold;
    uniform float uTrail;
    varying vec2 vUv;

    void main() {
        // 0. 检查输入
        vec4 vid = texture2D(tDiffuse, vUv);
        // 如果视频是空的(透明)，输出黑
        if (vid.a < 0.1) {
            gl_FragColor = vec4(0.0);
            return;
        }

        vec2 texel = 1.0 / uResolution;
        
        // 1. Sobel 边缘检测
        // 使用亮度 (Luminance)
        float center = dot(vid.rgb, vec3(0.299, 0.587, 0.114));
        float right = dot(texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
        float up = dot(texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb, vec3(0.299, 0.587, 0.114));
        
        // 计算梯度
        float dX = center - right;
        float dY = center - up;
        float grad = sqrt(dX*dX + dY*dY);
        
        // 放大梯度，应用阈值
        // 之前 * 15.0 太大了，改小点
        float edge = smoothstep(uThreshold, uThreshold + 0.3, grad * 8.0);

        // 边缘是亮的 (White)
        vec3 edgeColor = vec3(edge);
        
        // 2. 残影
        vec4 prevColor = texture2D(tPrev, vUv);
        
        // 3. 混合
        // max 混合保留亮部
        vec3 finalColor = max(edgeColor, prevColor.rgb * uTrail);
        if (length(finalColor) < 0.05) finalColor = vec3(0.0);
        // 输出：背景黑，线条亮
        gl_FragColor = vec4(finalColor, 1.0);
    }
  `
};

export const InkTrailEffect: React.FC = () => {
  const { videoTexture } = useAppStore();
  const { gl, size, viewport, camera } = useThree();
  
  const bgDistance = 15;
  const vFov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
  const height = 2 * Math.tan(vFov / 2) * bgDistance;
  const width = height * viewport.aspect;

  // 确保 FBO 清空
  const targetA = useFBO({ minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, stencilBuffer: false, depthBuffer: false });
  const targetB = useFBO({ minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, stencilBuffer: false, depthBuffer: false });
  
  const pingPongRef = useRef(0);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const displayMeshRef = useRef<THREE.Mesh>(null);

  const scene = useMemo(() => new THREE.Scene(), []);
  const orthoCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
  
  const quad = useMemo(() => {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
      scene.add(q);
      return q;
  }, [scene]);

  const shaderArgs = useMemo(() => ({
    uniforms: THREE.UniformsUtils.clone(InkMaterial.uniforms),
    vertexShader: InkMaterial.vertexShader,
    fragmentShader: InkMaterial.fragmentShader
  }), []);

  useFrame(() => {
    if (!materialRef.current || !videoTexture) return;

    materialRef.current.uniforms.tDiffuse.value = videoTexture;
    materialRef.current.uniforms.uResolution.value.set(size.width, size.height);
    
    const readTarget = pingPongRef.current === 0 ? targetB : targetA;
    const writeTarget = pingPongRef.current === 0 ? targetA : targetB;
    
    materialRef.current.uniforms.tPrev.value = readTarget.texture;
    
    // 渲染到 FBO
    gl.setRenderTarget(writeTarget);
    quad.material = materialRef.current;
    gl.render(scene, orthoCamera);
    gl.setRenderTarget(null);
    
    // 显示
    if (displayMeshRef.current) {
        (displayMeshRef.current.material as THREE.MeshBasicMaterial).map = writeTarget.texture;
        // 确保材质更新
        (displayMeshRef.current.material as THREE.MeshBasicMaterial).needsUpdate = true;
    }
    
    pingPongRef.current = 1 - pingPongRef.current;
  });

  return (
    <>
      <shaderMaterial ref={materialRef} args={[shaderArgs]} visible={false} />
      
      <mesh
        ref={displayMeshRef}
        position={[0, 0, -10]}
        scale={[width, height, 1]}
      >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial toneMapped={false} />
      </mesh>
    </>
  );
};
