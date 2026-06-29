let sharedStream: MediaStream | null = null;
let sharedVideo: HTMLVideoElement | null = null;
let activeDeviceId = '';

const getCameraConstraints = (deviceId = '', exactDevice = true): MediaStreamConstraints => ({
  audio: false,
  video: {
    ...(deviceId ? { deviceId: exactDevice ? { exact: deviceId } : { ideal: deviceId } } : {}),
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 60, max: 60 }
  }
});

const requestCameraStream = async (deviceId = ''): Promise<MediaStream> => {
  try {
    return await navigator.mediaDevices.getUserMedia(getCameraConstraints(deviceId, true));
  } catch (exactError) {
    if (!deviceId) {
      return navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    }

    try {
      return await navigator.mediaDevices.getUserMedia(getCameraConstraints(deviceId, false));
    } catch (idealError) {
      console.warn('Camera device constraints failed.', exactError, idealError);
      throw idealError;
    }
  }
};

export const getSharedCameraStream = async (deviceId = activeDeviceId): Promise<MediaStream> => {
  if (sharedStream && deviceId === activeDeviceId) return sharedStream;

  const nextStream = await requestCameraStream(deviceId);
  sharedStream?.getTracks().forEach(track => track.stop());
  sharedStream = nextStream;
  activeDeviceId = deviceId;

  if (sharedVideo) {
    sharedVideo.srcObject = sharedStream;
    await sharedVideo.play();
  }

  return sharedStream;
};

export const getSharedCameraVideo = async (): Promise<HTMLVideoElement> => {
  if (sharedVideo) return sharedVideo;

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.crossOrigin = 'Anonymous';
  video.srcObject = await getSharedCameraStream();
  await video.play();

  sharedVideo = video;
  return sharedVideo;
};

export const switchSharedCamera = async (deviceId: string): Promise<HTMLVideoElement> => {
  await getSharedCameraStream(deviceId);
  return getSharedCameraVideo();
};
