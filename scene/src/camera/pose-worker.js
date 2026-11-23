// Classic worker because the official WASM loader uses importScripts.
let detector;
let poseForSelection, observedWrists, observedArmGeometry, observedLimbPaths, limbVisible;
let runningMode = 'VIDEO';
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const { FilesetResolver, PoseLandmarker } = await import('./vendor/vision_bundle.mjs');
      ({ poseForSelection, observedWrists, observedArmGeometry, observedLimbPaths } = await import('./limb-pose.mjs'));
      const {createLimbEvidence} = await import('./limb-evidence.mjs');
      limbVisible = createLimbEvidence();
      const asset = path => new URL(path, self.location.href).href;
      const fileset = await FilesetResolver.forVisionTasks(asset('vendor/wasm'));
      detector = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: asset('vendor/pose_landmarker_lite.task'), delegate: 'CPU' },
        runningMode, numPoses: 1, outputSegmentationMasks: false,
        minPoseDetectionConfidence: 0.6, minPosePresenceConfidence: 0.6, minTrackingConfidence: 0.6
      });
      self.postMessage({type: 'ready'});
    } else if (data.type === 'frame') {
      const {frame, timestamp, limb, selection} = data;
      try {
        // An occluded knee can inherit the other shin's position from VIDEO
        // tracking across frames. Identify the two knees anew in each image.
        const checkBothFeet = limb === 'bothKnees' || limb === 'armsAndKnees';
        const mode = checkBothFeet || data.independent ? 'IMAGE' : 'VIDEO';
        if (runningMode !== mode) {
          await detector.setOptions({runningMode: mode});
          runningMode = mode;
        }
        const pose = runningMode === 'IMAGE' ? detector.detect(frame) : detector.detectForVideo(frame, timestamp);
        const points = pose.landmarks[0];
        const result = poseForSelection(points, frame.width, frame.height, limb,
          side => limbVisible(frame, points, side, checkBothFeet && (side === 'leftLeg' || side === 'rightLeg')));
        const message = {type: 'pose', result, selection, timestamp};
        if (data.limbPaths === true && result) message.limbPaths = observedLimbPaths(points, result);
        if (data.jointPoints === true) {
          const xy = Array(33).fill(null);
          for (let i = 0; i < xy.length; i++) {
            const p = points?.[i];
            if (p && p.visibility >= .65 && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) {
              xy[i] = [p.x * frame.width, p.y * frame.height];
            }
          }
          // Reject wrists that fail the existing side-specific geometry and local image evidence.
          if (!result?.leftArm) xy[15] = null;
          if (!Number.isFinite(result?.joints?.r_elbow_flex)) xy[16] = null;
          message.xy = xy;
        }
        if (data.captureWrists === true && (result?.leftArm || Number.isFinite(result?.joints?.r_elbow_flex))) {
          message.wrists = observedWrists(points, frame.width, frame.height, result);
          message.armGeometry = observedArmGeometry(points, frame.width, frame.height, result);
        }
        self.postMessage(message);
      } finally {
        frame.close();
      }
    }
  } catch (error) {
    self.postMessage({type: 'error', message: String(error.message || error)});
  }
};
