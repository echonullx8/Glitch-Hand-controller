let sharedStream: MediaStream | null = null;
let sharedVideo: HTMLVideoElement | null = null;

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 60, max: 60 }
  }
};

export const getSharedCameraStream = async (): Promise<MediaStream> => {
  if (sharedStream) return sharedStream;

  sharedStream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
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
