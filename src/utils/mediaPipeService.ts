import { Hands } from '@mediapipe/hands';
import { FaceMesh } from '@mediapipe/face_mesh';

let handsInstance: Hands | null = null;
let faceMeshInstance: FaceMesh | null = null;

export const getHandsInstance = () => {
    if (!handsInstance) {
        console.log("MediaPipeService: Creating Hands Instance");
        handsInstance = new Hands({
            locateFile: (file) => {
                // 强制使用 hands 的 CDN 路径
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`;
            },
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
            locateFile: (file) => {
                // 强制使用 face_mesh 的 CDN 路径
                return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`;
            },
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
