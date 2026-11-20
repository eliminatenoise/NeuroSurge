// Classic worker because the official WASM loader uses importScripts.
let detector;
let poseForLimb, createLegEvidence, legVisible;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const { FilesetResolver, PoseLandmarker } = await import('./vendor/vision_bundle.mjs');
      ({ poseForLimb } = await import('./limb-pose.mjs'));
      ({ createLegEvidence } = await import('./leg-evidence.mjs'));
      const asset = path => new URL(path, self.location.href).href;
      const fileset = await FilesetResolver.forVisionTasks(asset('vendor/wasm'));
      detector = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: asset('vendor/pose_landmarker_lite.task'), delegate: 'CPU' },
        runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: false,
        minPoseDetectionConfidence: 0.6, minPosePresenceConfidence: 0.6, minTrackingConfidence: 0.6
      });
      self.postMessage({type: 'ready'});
    } else if (data.type === 'frame') {
      const {frame, timestamp, limb, selection} = data;
      try {
        const pose = detector.detectForVideo(frame, timestamp);
        const points = pose.landmarks[0];
        let result = poseForLimb(points, frame.width, frame.height, limb);
        if (result && (limb === 'leftLeg' || limb === 'rightLeg')) {
          legVisible ??= createLegEvidence();
          if (!legVisible(frame, points, limb)) result = null;
        }
        self.postMessage({type: 'pose', result, selection});
      } finally {
        frame.close();
      }
    }
  } catch (error) {
    self.postMessage({type: 'error', message: String(error.message || error)});
  }
};
