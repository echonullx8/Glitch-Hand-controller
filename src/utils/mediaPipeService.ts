// --- START OF FILE mediaPipeService.ts ---
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'; // 明确标示为类型导入

console.log("MediaPipeService Module Loaded (New API).");

let handLandmarker: HandLandmarker | null = null;
let isInitializing = false;

// 定义一个类型用于回调
type ResultsListener = (result: HandLandmarkerResult) => void;

export const initializeHands = async (): Promise<HandLandmarker> => {
    if (handLandmarker) {
        return handLandmarker;
    }

    if (isInitializing) {
        console.log("Waiting for HandLandmarker to initialize...");
        while (!handLandmarker) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        return handLandmarker;
    }

    isInitializing = true;
    console.log("Initializing HandLandmarker (New API) for the first time...");

    try {
        // 1. 关键点：使用 CDN 加载 WASM 文件，解决部署难题
        const visionGenAI = await FilesetResolver.forVisionTasks(
            // 这里的版本号最好与你 package.json 中的 @mediapipe/tasks-vision 保持大致一致
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
        );

        // 2. 创建手势识别器实例
        // 注意：我们需要加载一个模型文件。官方推荐使用 CDN 链接。
        handLandmarker = await HandLandmarker.createFromOptions(visionGenAI, {
            baseOptions: {
                modelAssetPath: `/models/hand_landmarker.task`,
                delegate: "GPU" // 尝试使用 GPU 加速，如果不支持会自动回退到 CPU
            },
            runningMode: "VIDEO", // 设为 VIDEO 模式用于处理摄像头流
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        isInitializing = false;
        console.log("HandLandmarker Initialization Complete.");
        return handLandmarker;

    } catch (error) {
        console.error("Failed to initialize HandLandmarker:", error);
        isInitializing = false;
        throw error;
    }
};

// 获取实例的辅助函数
export const getHandLandmarkerInstance = () => {
    if (!handLandmarker) {
        throw new Error("HandLandmarker not initialized. Call initializeHands() first.");
    }
    return handLandmarker;
}

// --- 使用方式示例 (在你的 React 组件中) ---
/*
  // 假设你有一个 video 元素引用 videoRef
  import { initializeHands, getHandLandmarkerInstance } from './mediaPipeService';

  // 在 useEffect 中初始化
  useEffect(() => {
    const init = async () => {
        await initializeHands();
        // 初始化完成后开始检测循环
        detectLoop();
    };
    init();
  }, []);

  const detectLoop = () => {
      const landmarker = getHandLandmarkerInstance();
      if (videoRef.current && videoRef.current.currentTime > 0) {
          // 传入当前视频帧的时间戳
          let startTimeMs = performance.now();
          const result = landmarker.detectForVideo(videoRef.current, startTimeMs);
          // 处理结果 result...
      }
      requestAnimationFrame(detectLoop);
  }
*/
