import { Hands } from '@mediapipe/hands';
import { FaceMesh } from '@mediapipe/face_mesh';

// 全局单例
let handsInstance: Hands | null = null;
let faceMeshInstance: FaceMesh | null = null;

// 【核心】智能路由函数
// 不管是谁调用的，只要文件名包含 hands 就去 hands CDN，包含 face_mesh 就去 face_mesh CDN
const smartLocateFile = (file: string) => {
    // 1. 处理空格问题 (防 404)
    const fixedFile = file.replace(/ /g, '_');
    
    // 2. 智能分流
    if (fixedFile.includes('hands')) {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${fixedFile}`;
    }
    else if (fixedFile.includes('face_mesh')) {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${fixedFile}`;
    }
    
    // 3. 兜底 (默认去 Hands，或者报错)
    console.warn(`Unknown MediaPipe file request: ${file}`);
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${fixedFile}`;
};

export const getHandsInstance = () => {
    if (!handsInstance) {
        console.log("MediaPipeService: Creating Hands Instance");
        handsInstance = new Hands({
            locateFile: smartLocateFile, // 使用智能路由
        });
        handsInstance.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });
    }
    return handsInstance;
};

export const getFaceMeshInstance = () => {
    if (!faceMeshInstance) {
        console.log("MediaPipeService: Creating FaceMesh Instance");
        faceMeshInstance = new FaceMesh({
            locateFile: smartLocateFile, // 使用智能路由
        });
        faceMeshInstance.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });
    }
    return faceMeshInstance;
};
