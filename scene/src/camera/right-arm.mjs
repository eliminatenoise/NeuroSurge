import {poseForLimb} from './limb-pose.mjs';

// Preserve the original right-arm utility's return shape for existing callers.
export function rightArmJoints(points, width, height) {
  return poseForLimb(points, width, height, 'rightArm')?.joints ?? null;
}
