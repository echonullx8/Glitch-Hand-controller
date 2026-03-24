import { Hands } from '@mediapipe/hands';

console.log("MediaPipeService Module Loaded.");

// 1. 在模块作用域内直接创建实例，绝不重复创建
let handsInstance: Hands | null = null;
let isInitializing = false;

export const getHandsInstance = async (): Promise<Hands> => {
    // 如果已经有了，直接返回
    if (handsInstance) {
        return handsInstance;
    }

    // 如果正在初始化，等待它完成（简单的轮询等待）
    if (isInitializing) {
        console.log("Waiting for Hands to initialize...");
        while (!handsInstance) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        return handsInstance;
    }

    isInitializing = true;
    console.log("Initializing Hands Instance for the first time...");

    try {
        const hands = new Hands({
            locateFile: (file) => {
                        // 【关键】必须是绝对的本地路径，指向 public 文件夹
                        return `/models/${file}`;
                      },
        });

        hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        // 初始化完成后赋值给单例
        handsInstance = hands;
        isInitializing = false;
        console.log("Hands Instance Initialization Complete.");
        return handsInstance;
    } catch (error) {
        console.error("Failed to initialize Hands:", error);
        isInitializing = false;
        throw error; // 抛出错误让调用方知道
    }
};
