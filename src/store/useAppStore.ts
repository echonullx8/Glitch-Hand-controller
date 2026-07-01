// src/store/useAppStore.ts
// 【清理版】移除了 Swap, Seal Image Upload, Presets

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as THREE from 'three';

// --- 类型定义 (保持不变) ---
export interface VideoClip { id: string; url: string; name: string; }

export interface HandMetrics {
  distance: number; rotation: number; spread: number;
  gap1: number; gap2: number; gap3: number;
  wrist: { x: number; y: number; z: number };
  indexTip: { x: number; y: number };
  thumbTip: { x: number; y: number };
  rawLandmarks: Array<{x: number, y: number, z: number}>;
}

export interface FaceMetrics {
  rawLandmarks: Array<{x: number, y: number, z: number}>;
}

export interface HandData {
  left: HandMetrics | null; right: HandMetrics | null;
  face: FaceMetrics | null;
  sealActive: boolean; sealSize: number; thumbsDist: number; indexDist: number;
  leftPresent: number;
  rightPresent: number;
  bothPresent: number;
  lastUpdated: number;
  diagnostics: {
    cameraWidth: number;
    cameraHeight: number;
    cameraFps: number;
    detectionFps: number;
    detectionMs: number;
    loopMode: string;
    lastFrameAt: number;
  };
}

export type EffectType = 'None' | 'SimpleGlitch' | 'AnalogGlitch' | 'Particles' | 'Flash' | 'Ascii';

export interface EffectParams {
  amountSource: string; amountInvert: boolean;
  speedSource: string; speedInvert: boolean;
}

export interface EffectSlot {
  id: string; type: EffectType; params: EffectParams; active: boolean;
}

export interface VisualConfig {
  videoOpacity: number; mirrorVideo: boolean; mirrorSkeleton: boolean;
  skeletonOpacity: number;
  particleColor: string;
  slots: [EffectSlot, EffectSlot, EffectSlot, EffectSlot];
}

// --- 默认值 (保持不变) ---
const DEFAULT_PARAMS: EffectParams = {
  amountSource: 'None', amountInvert: false,
  speedSource: 'None', speedInvert: false
};

const DEFAULT_SLOTS: [EffectSlot, EffectSlot, EffectSlot, EffectSlot] = [
  { id: 'slot-0', type: 'SimpleGlitch', params: DEFAULT_PARAMS, active: true },
  { id: 'slot-1', type: 'None', params: DEFAULT_PARAMS, active: false },
  { id: 'slot-2', type: 'None', params: DEFAULT_PARAMS, active: false },
  { id: 'slot-3', type: 'None', params: DEFAULT_PARAMS, active: false },
];

const DEFAULT_VISUAL_CONFIG: VisualConfig = {
  videoOpacity: 1.0, mirrorVideo: true, mirrorSkeleton: true, skeletonOpacity: 1.0,
  particleColor: '#67E8F9',
  slots: DEFAULT_SLOTS
};

interface AppState {
  mode: 'LIVE_AR' | 'VJ_MODE';
  setMode: (mode: 'LIVE_AR' | 'VJ_MODE') => void;

  videoClips: VideoClip[];
  activeClipId: string | null;
  addVideoClip: (file: File) => void;
  selectVideoClip: (id: string) => void;
  removeVideoClip: (id: string) => void;
  videoTexture: THREE.VideoTexture | null;
  setVideoTexture: (t: THREE.VideoTexture) => void;

  visualConfig: VisualConfig;
  setVisualConfig: (update: Partial<VisualConfig>) => void;
  
  updateSlot: (index: number, update: Partial<EffectSlot>) => void;
  updateSlotParams: (index: number, update: Partial<EffectParams>) => void;
  
  // 【移除】Presets 相关方法
  // presets: VisualConfig[];
  // loadPreset: (index: number) => void;
  // savePreset: (index: number) => void;

  activeSlotIndex: number;
  setActiveSlotIndex: (index: number) => void;

  // 【移除】Swap 相关方法
  // isSwapped: boolean;
  // toggleSwap: () => void;

  handDataRef: { current: HandData };
  
  // 【移除】Mask Texture 相关方法
  // maskTexture: THREE.CanvasTexture | null;
  // setMaskTexture: (texture: THREE.CanvasTexture) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      mode: 'LIVE_AR',
      setMode: (mode) => set({ mode }),

      videoClips: [],
      activeClipId: null,
      videoTexture: null,
      vjVideoUrl: null,
      setVideoTexture: (t) => set({ videoTexture: t }),

      addVideoClip: (file) => {
        const url = URL.createObjectURL(file);
        const newClip = { id: crypto.randomUUID(), url, name: file.name };
        set((state) => ({
          videoClips: [...state.videoClips, newClip],
          activeClipId: state.videoClips.length === 0 ? newClip.id : state.activeClipId
        }));
      },

      selectVideoClip: (id) => set({ activeClipId: id }),

      removeVideoClip: (id) => set((state) => {
          const newClips = state.videoClips.filter(c => c.id !== id);
          const newActive = state.activeClipId === id
            ? (newClips.length > 0 ? newClips[0].id : null)
            : state.activeClipId;
          return { videoClips: newClips, activeClipId: newActive };
      }),

      visualConfig: DEFAULT_VISUAL_CONFIG,
      setVisualConfig: (update) => set((state) => ({
        visualConfig: { ...state.visualConfig, ...update }
      })),

      updateSlot: (index, update) => set((state) => {
          const newSlots = [...state.visualConfig.slots] as [EffectSlot, EffectSlot, EffectSlot, EffectSlot];
          newSlots[index] = { ...newSlots[index], ...update };
          return { visualConfig: { ...state.visualConfig, slots: newSlots } };
      }),

      updateSlotParams: (index, update) => set((state) => {
          const newSlots = [...state.visualConfig.slots] as [EffectSlot, EffectSlot, EffectSlot, EffectSlot];
          newSlots[index] = {
              ...newSlots[index],
              params: { ...newSlots[index].params, ...update }
          };
          return { visualConfig: { ...state.visualConfig, slots: newSlots } };
      }),

      // 【移除】Presets 初始化
      // presets: [DEFAULT_VISUAL_CONFIG, DEFAULT_VISUAL_CONFIG, DEFAULT_VISUAL_CONFIG, DEFAULT_VISUAL_CONFIG],
      
      // 【移除】loadPreset 实现
      // loadPreset: (index) => set((state) => ({
      //     visualConfig: JSON.parse(JSON.stringify(state.presets[index]))
      // })),
      
      // 【移除】savePreset 实现
      // savePreset: (index) => set((state) => {
      //     const newPresets = [...state.presets];
      //     newPresets[index] = JSON.parse(JSON.stringify(state.visualConfig));
      //     return { presets: newPresets };
      // }),

      activeSlotIndex: 0,
      setActiveSlotIndex: (index) => set({ activeSlotIndex: index }),

      // 【移除】Swap 初始化
      // isSwapped: false,
      // toggleSwap: () => set((state) => ({ isSwapped: !state.isSwapped })),

      handDataRef: {
        current: {
          left: null, right: null, face: null,
          sealActive: false, sealSize: 0, thumbsDist: 1, indexDist: 1,
          leftPresent: 0, rightPresent: 0, bothPresent: 0,
          lastUpdated: 0,
          diagnostics: {
            cameraWidth: 0,
            cameraHeight: 0,
            cameraFps: 0,
            detectionFps: 0,
            detectionMs: 0,
            loopMode: 'idle',
            lastFrameAt: 0
          }
        }
      },

      // 【移除】Mask Texture 初始化
      // maskTexture: null,
      // setMaskTexture: (texture) => set({ maskTexture: texture }),
    }),
    {
      name: 'hand-osc-settings-v3', // 更新版本号以清除旧缓存
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        visualConfig: state.visualConfig,
        // 【移除】presets 和 isSwapped 的持久化
        // presets: state.presets,
        // isSwapped: state.isSwapped,
      }),
      merge: (persistedState, currentState) => {
          const persisted = persistedState as Partial<AppState> | undefined;
          return {
            ...currentState,
            ...persisted,
            visualConfig: {
              ...currentState.visualConfig,
              ...(persisted?.visualConfig || {})
            }
          };
      }
    }
  )
);

// 【getMetricValue 函数保持不变，直接复制你原来的即可】
export const getMetricValue = (source: string | undefined, data: HandData, inverted: boolean): number => {
    if (!source || source === 'None') return 0;
    
    let handStr: 'Left' | 'Right' | 'Global' | null = null;
    let param = '';

    if (source.startsWith('G-')) {
        handStr = 'Global';
        if (source === 'G-T.Dist') param = 'thumbsDist';
        if (source === 'G-I.Dist') param = 'indexDist';
        if (source === 'G-Seal') param = 'sealSize';
        // 【新增】
        if (source === 'G-L.Pres') param = 'leftPresent';
        if (source === 'G-R.Pres') param = 'rightPresent';
        if (source === 'G-Both') param = 'bothPresent';
    } else if (source.startsWith('L-')) {
        handStr = 'Left';
        param = source.substring(2).toLowerCase();
    } else if (source.startsWith('R-')) {
        handStr = 'Right';
        param = source.substring(2).toLowerCase();
    }

    const mapParam = (p: string) => {
        if (p === 'dist') return 'distance';
        if (p === 'rot') return 'rotation';
        if (p === 'sprd') return 'spread';
        if (p === 'g1') return 'gap1';
        if (p === 'g2') return 'gap2';
        if (p === 'g3') return 'gap3';
        return p;
    };

    let val = 0;
    if (handStr === 'Global') {
        // @ts-ignore
        val = data[param] || 0;
    } else if (handStr) {
        const handData = handStr === 'Left' ? data.left : data.right;
        if (handData) {
            const key = mapParam(param);
            // @ts-ignore
            val = handData[key] || 0;
        }
    }

    return inverted ? 1 - val : val;
};
