let sharedStream: MediaStream | null = null;
let sharedVideo: HTMLVideoElement | null = null;
let activeDeviceId = '';
let sharedVideoRequest: Promise<HTMLVideoElement> | null = null;
const cameraChangeListeners = new Set<() => void>();

const hasLiveVideoTrack = (stream: MediaStream | null) => {
  return !!stream?.getVideoTracks().some(track => track.readyState === 'live');
};

const getCameraConstraints = (deviceId = '', exactDevice = true): MediaStreamConstraints => ({
  audio: false,
  video: {
    ...(deviceId ? { deviceId: exactDevice ? { exact: deviceId } : { ideal: deviceId } } : {}),
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 }
  }
});

const requestCameraStream = async (deviceId = ''): Promise<MediaStream> => {
  try {
    return await navigator.mediaDevices.getUserMedia(getCameraConstraints(deviceId, true));
  } catch (exactError) {
    if (!deviceId) {
      return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    }

    console.warn('Selected camera device failed.', exactError);
    throw exactError;
  }
};

const waitForVideoReady = async (video: HTMLVideoElement) => {
  await video.play().catch(() => {});

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Camera video did not become ready.'));
    }, 3000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onError);
    };

    const onReady = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error('Camera video failed to play.'));
    };

    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('canplay', onReady);
    video.addEventListener('error', onError);
  });
};

export const stopSharedCamera = () => {
  sharedStream?.getTracks().forEach(track => track.stop());
  sharedStream = null;
  activeDeviceId = '';
  sharedVideoRequest = null;

  if (sharedVideo) {
    sharedVideo.pause();
    sharedVideo.srcObject = null;
    sharedVideo.remove();
    sharedVideo = null;
  }
};

const createVideoForStream = async (stream: MediaStream): Promise<HTMLVideoElement> => {
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.crossOrigin = 'Anonymous';
  video.srcObject = stream;
  await waitForVideoReady(video);
  return video;
};

export const getSharedCameraStream = async (deviceId = activeDeviceId): Promise<MediaStream> => {
  if (hasLiveVideoTrack(sharedStream) && deviceId === activeDeviceId) return sharedStream as MediaStream;

  const nextStream = await requestCameraStream(deviceId);
  sharedStream?.getTracks().forEach(track => track.stop());
  sharedStream = nextStream;
  activeDeviceId = deviceId;

  if (sharedVideo) {
    sharedVideo.srcObject = sharedStream;
    await waitForVideoReady(sharedVideo);
  }

  return sharedStream;
};

export const getSharedCameraVideo = async (deviceId = activeDeviceId): Promise<HTMLVideoElement> => {
  if (sharedVideoRequest) return sharedVideoRequest;

  if (sharedVideo && hasLiveVideoTrack(sharedVideo.srcObject as MediaStream | null)) {
    try {
      await waitForVideoReady(sharedVideo);
      return sharedVideo;
    } catch {
      stopSharedCamera();
    }
  }

  if (sharedVideo) {
    sharedVideo.pause();
    sharedVideo.srcObject = null;
    sharedVideo.remove();
    sharedVideo = null;
  }

  sharedVideoRequest = (async () => {
    const stream = await getSharedCameraStream(deviceId);
    sharedVideo = await createVideoForStream(stream);
    return sharedVideo;
  })();

  try {
    return await sharedVideoRequest;
  } finally {
    sharedVideoRequest = null;
  }
};

export const switchSharedCamera = async (deviceId: string): Promise<HTMLVideoElement> => {
  try {
    sharedVideoRequest = null;
    const nextStream = await requestCameraStream(deviceId);
    const nextVideo = await createVideoForStream(nextStream);

    sharedStream?.getTracks().forEach(track => track.stop());
    sharedVideo?.pause();
    sharedVideo?.remove();

    sharedStream = nextStream;
    sharedVideo = nextVideo;
    activeDeviceId = deviceId;

    cameraChangeListeners.forEach(listener => listener());
    return nextVideo;
  } catch (error) {
    throw error;
  }
};

export const subscribeSharedCameraChange = (listener: () => void) => {
  cameraChangeListeners.add(listener);
  return () => cameraChangeListeners.delete(listener);
};
