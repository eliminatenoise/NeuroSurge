// Classic worker because the official WASM loader uses importScripts.
let detector;
let rightArmJoints;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const { FilesetResolver, PoseLandmarker } = await import('./vendor/vision_bundle.mjs');
      ({ rightArmJoints } = await import('./right-arm.mjs'));
      const asset = path => new URL(path, self.location.href).href;
      const fileset = await FilesetResolver.forVisionTasks(asset('vendor/wasm'));
      detector = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: asset('vendor/pose_landmarker_lite.task'), delegate: 'CPU' },
        runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: false,
        minPoseDetectionConfidence: 0.6, minPosePresenceConfidence: 0.6, minTrackingConfidence: 0.6
      });
      self.postMessage({type: 'ready'});
    } else if (data.type === 'frame') {
      const {frame, timestamp} = data;
      try {
        const pose = detector.detectForVideo(frame, timestamp);
        const joints = rightArmJoints(pose.landmarks[0], frame.width, frame.height);
        self.postMessage({type: 'pose', joints});
      } finally {
        frame.close();
      }
    }
  } catch (error) {
    self.postMessage({type: 'error', message: String(error.message || error)});
  }
};
