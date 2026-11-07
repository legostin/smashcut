import cvModule from '@techstark/opencv-js';
const t0 = Date.now();
const cv = await (cvModule instanceof Promise ? cvModule : new Promise((r) => { if (cvModule.Mat) r(cvModule); else cvModule.onRuntimeInitialized = () => r(cvModule); }));
console.log('ready', Date.now() - t0, 'ms');
for (const f of ['goodFeaturesToTrack', 'calcOpticalFlowPyrLK', 'findHomography', 'estimateAffinePartial2D', 'warpPerspective', 'perspectiveTransform', 'solvePnP', 'findEssentialMat', 'recoverPose']) console.log(f, typeof cv[f]);
