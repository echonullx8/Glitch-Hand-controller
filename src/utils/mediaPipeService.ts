import { Hands } from '@mediapipe/hands';
import { FaceMesh } from '@mediapipe/face_mesh';

let handsInstance: Hands | null = null;
let faceMeshInstance: FaceMesh | null = null;

export const getHandsInstance = () => {
    if (!handsInstance) {
        console.log("MediaPipeService: Creating Hands Instance");
        handsInstance = new Hands({
            locateFile: (file) => `/models/${file}`,
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
            locateFile: (file) => `/models/${file}`,  // ← 改成本地！
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
