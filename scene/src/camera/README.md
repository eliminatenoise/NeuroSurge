# Move an arm or knee with your camera

Press **C** or click **Use camera** in the game. Allow video, then choose an arm or knee under **Follow**. The preview shows a mirror image. Select the side of your own body. If your virtual camera already flips its outgoing video, disable that setting so the tracker receives the original view. If the mouse is captured, the usual limb keys also switch the camera. **1** selects your left arm, **2** your left knee, **3** your right knee and **4** your right arm.

| Choose | What to show the lens | What moves on the avatar |
| --- | --- | --- |
| Right arm | Face the lens. Keep both shoulders, your right elbow and wrist in sight. Lift the arm out to the side and bend it across the picture. | The shoulder lifts sideways and the elbow bends. |
| Left arm | Face the lens and repeat with your left arm. | The hand reaches in the direction of your wrist from your shoulder. The game bends the elbow to fit that reach. |
| Left or right knee | Keep your shoulders, hips, selected knee and ankle in sight. Turn partway sideways so the thigh and shin make a visible angle. Bend once to start, then straighten and bend again. | The selected knee bends and straightens within its game limits. You can leave the other leg in place. |

The camera estimates points in a flat picture. A knee bent towards the lens can look straight. An ankle hidden behind the other leg can disappear. If the tracker loses the limb, updates stop and the ordinary controls remain available. For a knee, show a clear bend again. Stop with **C** or **Stop camera**. Closing or hiding the game also releases the video track.

The angle between the thigh and shin drives a simulated knee. Before updating it, the tracker asks for two successive views with at least 45 degrees of *visible* bend. It drops reversed hip order, short or foreshortened segments, and points whose visibility is low. The tracker also checks the knee and ankle for visible detail. A dark cover across the lower picture can hide the ankle even when the model supplies a confident estimate. These checks cannot recover depth or identify every poor view. The arm controls use the shoulder line to allow for a camera tilted slightly to one side. The left arm uses the game's own arm lengths and reach limits. Finger gestures, wrist rotation, hip swing, muscle force and nerve activity are outside this camera control.

Frames pass one at a time to a worker in the browser. Only the selected movement comes back. Nothing records or uploads the video. The model, JavaScript and WebAssembly are bundled locally and load after opt-in. Use the localhost launcher or a secure HTTPS origin that permits camera access. The tracker needs video capture, Web Workers, OffscreenCanvas, ImageBitmap, WebAssembly and WebGL.

## Sources and licences

- **Model weights.** Google’s float16 **MediaPipe Pose Landmarker Lite v1** bundle includes the person detector and pose landmark estimator. SHA-256 `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`. The BlazePose GHUM model card specifies Apache License 2.0. [Model bundle](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task) · [Google model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf)
- **Runtime.** The unmodified ESM bundle and SIMD and non-SIMD WebAssembly loaders and binaries come from Google's `@mediapipe/tasks-vision` 0.10.21, Apache License 2.0. The npm tarball was verified against registry SHA-512 `TuhKH+credq4zLksGbYrnvJ1aLIWMc5r0UHwzxzql4BHECJwIAoBR61ZrqwGOW6ZmSBIzU1t4VtKj8hbxFaKeA==`. The original MediaPipe license and included notices are in `vendor/LICENSE`. [Upstream source and notices](https://github.com/google-ai-edge/mediapipe/blob/v0.10.21/LICENSE) · [Exact package](https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.21.tgz)
- **Test images.** The three JPEGs in `tests/` come from *Conditioning Drill 1 – Power Jump*, Army Combat Fitness Test, 17 October 2018, a U.S. Army work in the U.S. public domain. The checked original video has SHA-256 `013893481ec1d78068fb05c9b44c858924f282a97d82e8be937046a2dc4f97f1`. At 1, 4 and 20 seconds the source frames were center-cropped to 1,080 pixels square, resized to 480 pixels and exported without audio. They appear only in automated tests. [Source and rights](https://commons.wikimedia.org/wiki/File:Conditioning_Drill_1-_Power_Jump.webm)

Two additional films were used locally to check which side moves. In *Walking Lunge with Side Reach*, the person raises the left arm at 27.5 seconds and the right at 32.7 seconds. Two frames from *Butt-Kickers*, at 15.8 and 16.0 seconds, show the more strongly bent knee changing sides. Capt. Matthew Holfinger, U.S. Marine Corps Training and Education Command, is credited for both films. DVIDS lists them as public domain and sets terms for identifiable people and endorsement. The game contains neither film nor its stills. [Walking Lunge with Side Reach](https://www.dvidshub.net/video/551860/walking-lunge-with-side-reach) · [Butt-Kickers](https://www.dvidshub.net/video/558559/butt-kickers) · [DVIDS usage terms](https://www.dvidshub.net/about/copyright)

## Verification

From the game directory, run `node --test scene/src/camera/tests/rig.test.mjs`. The browser check requires Chromium, Playwright and FFmpeg. Run `node scene/src/camera/tests/browser.mjs`. To use existing installations, set `NS_PLAYWRIGHT_MODULE` to the Playwright module path, `NS_CHROMIUM` to the Chromium executable and optionally `NS_ANGLE` to a supported graphics backend.

The browser test uses Chromium’s virtual video device with exercise frames and an empty frame. It checks the local model response, tracking loss, permission denial, a late permission grant after cancellation, unsupported-browser handling and track cleanup. It then opens the regular game launcher, presses C and samples the angles actually drawn by the game. It also checks that the feature made only same-origin GET requests. The runner never opens a physical camera.

The worker uses CPU inference on one frame at a time, at most 640 pixels along the longer dimension. There is a 90 ms minimum gap between an inference result and the next frame. Inference and temporary buffers are kept off the game's main thread. Chromium and the MediaPipe runtime control thread placement, WebGL texture handling and SIMD selection. This implementation has no measured inference-speed advantage over another backend. Native camera performance, other operating systems and other browsers still need testing.

To repeat the four-choice browser check, use the 1024 × 576 player copies of the two DVIDS films. The SHA-256 of the lunge copy is `35fd76c28865657d518fd5d0781cec702c70b57b4e1674cbb8d2c4d6c30c0a4c`. The second is `37bcb2ef79ec9fb630e45f3efa52e3850f9fc248e27a1990fda9b73c38672393`. Keep the extracted JPEGs in a local test directory outside the game. For each row below, use the indicated time and crop in this command.

```sh
ffmpeg -nostdin -threads 2 -ss TIME -i SOURCE.mp4 -an -vf 'crop=576:576:X:0,scale=480:480' -frames:v 1 -threads 1 -q:v 2 FRAME.jpg
```

| Film | Time (s) | Crop x (pixels) | Frame |
| --- | ---: | ---: | --- |
| Lunge | 24 | 448 | standing.jpg |
| Lunge | 27.5 | 300 | lunge-left-arm.jpg |
| Lunge | 32.7 | 87 | lunge-right-arm.jpg |
| Butt-Kickers | 15.8 | 320 | kick-1580.jpg |
| Butt-Kickers | 16.0 | 288 | kick-1600.jpg |

Set `NS_CAMERA_REFERENCE_DIR` to that directory and run `node scene/src/camera/tests/selected-limb-browser.mjs`. The runner sends those pictures to the bundled tracker through a video-only canvas stream. It waits for each new pose to hold on screen, checks the opposite side, and covers the lower half of one picture to test loss and reacquisition. The output angles and hand heights describe the drawn avatar. The footage supplies no independent three-dimensional joint-angle measurements.
