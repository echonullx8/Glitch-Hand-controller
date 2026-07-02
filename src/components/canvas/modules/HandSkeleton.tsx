import React, { useState, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { useAppStore } from '../../../store/useAppStore';
import * as THREE from 'three';

const BONE_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17]
];

const TIPS = [4, 8, 12, 16, 20];

const Hand = ({ side }: { side: 'left' | 'right' }) => {
  const { handDataRef, isSwapped, visualConfig } = useAppStore();
  const { viewport } = useThree();
  
  const baseColorHex = visualConfig.skeletonColor || '#67E8F9';
    const color = useMemo(() => {
          const c = new THREE.Color(baseColorHex);
          // 【关键修复】手动提亮颜色，抵消 Linear 空间的暗沉
          c.multiplyScalar(1.5);
          return c;
      }, [baseColorHex]);
    const highlightColor = useMemo(() => new THREE.Color('#FFFFFF').multiplyScalar(2.0), []);

  const [joints, setJoints] = useState<THREE.Vector3[]>([]);
  const [gapCurves, setGapCurves] = useState<THREE.Vector3[][]>([]);

  useFrame(() => {
    const data = handDataRef.current;
    
    let handData;
    if (isSwapped) {
        handData = side === 'left' ? data.right : data.left;
    } else {
        handData = side === 'left' ? data.left : data.right;
    }

    if (!handData || !handData.rawLandmarks) {
        if (joints.length > 0) { setJoints([]); setGapCurves([]); }
        return;
    }

    const w = viewport.width;
    const h = viewport.height;
    const isMirrored = visualConfig.mirrorSkeleton;

    // 1. Calculate Joints
    const newJoints = handData.rawLandmarks.map(lm => {
        let xRaw = lm.x;
        if (isMirrored) xRaw = 1 - xRaw;
        
        return new THREE.Vector3(
            (0.5 - xRaw) * w,
            (0.5 - lm.y) * h,
            0
        );
    });
    setJoints(newJoints);

    // 2. Calculate Gap Curves (Droop)
    const curves: THREE.Vector3[][] = [];
    for (let i = 0; i < TIPS.length - 1; i++) {
        const p1 = newJoints[TIPS[i]];
        const p2 = newJoints[TIPS[i+1]];

        const dist = p1.distanceTo(p2);
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        // 【微调】Droop 拉紧：1.5 -> 0.8
        const droop = dist * 0.8;
        const cp = new THREE.Vector3(midX, midY - droop, 0);

        const curve = new THREE.QuadraticBezierCurve3(p1, cp, p2);
        curves.push(curve.getPoints(20));
    }
    setGapCurves(curves);
  });

  // 透明度为 0 时不渲染
  if (joints.length === 0 || visualConfig.skeletonOpacity <= 0.01) return null;

  return (
    <group renderOrder={1}>
      {/* A. 骨骼线 (Base Glow) */}
      {BONE_CONNECTIONS.map((pair, i) => (
        <React.Fragment key={`bone-${i}`}>
            {/* 底层颜色线 */}
            <Line
              points={[joints[pair[0]], joints[pair[1]]]}
              color={color}
              lineWidth={2.0} // 【微调】变细：3 -> 2
              transparent
              // 应用透明度
              opacity={0.8 * visualConfig.skeletonOpacity}
              toneMapped={false}
              depthTest={false}
              blending={THREE.AdditiveBlending}
            />
            {/* 顶层高光线 (Core) */}
            <Line
              points={[joints[pair[0]], joints[pair[1]]]}
              color={highlightColor}
              lineWidth={1.0} // 极细高光
              transparent
              // 应用透明度
              opacity={0.4 * visualConfig.skeletonOpacity}
              toneMapped={false}
              depthTest={false}
              blending={THREE.AdditiveBlending}
            />
        </React.Fragment>
      ))}

      {/* B. 指缝线 (Gap Lines) */}
      {gapCurves.map((points, i) => (
        <Line
          key={`gap-${i}`}
          points={points}
          color={color}
          lineWidth={1.0} // 【微调】变细：1.5 -> 1.0
          transparent
          // 应用透明度
          opacity={0.5 * visualConfig.skeletonOpacity}
          toneMapped={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
        />
      ))}

      {/* C. 关节节点 */}
      {joints.map((pos, i) => (
        <mesh key={`joint-${i}`} position={pos}>
            {/* 稍微小一点，实心一点 */}
            <circleGeometry args={[0.04, 16]} />
            <meshBasicMaterial
                color={color}
                toneMapped={false}
                transparent
                // 应用透明度
                opacity={0.9 * visualConfig.skeletonOpacity}
                depthTest={false}
                blending={THREE.AdditiveBlending}
            />
        </mesh>
      ))}
    </group>
  );
};

export const HandSkeleton: React.FC = () => {
  return (
    <>
      <Hand side="left" />
      <Hand side="right" />
    </>
  );
};
