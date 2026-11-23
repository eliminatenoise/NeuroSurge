# NeuroSurge player guide (simple)

[Play Full](https://eliminatenoise.github.io/NeuroSurge/scene/example/preview.html) · [Play Lite](https://eliminatenoise.github.io/NeuroSurge/scene/example/preview.html?edition=lite) · [Technical guide](PLAYER-GUIDE-TECHNICAL.md)

## Move a body part from the brain

1. Open either edition in a desktop browser with a keyboard and mouse or trackpad. Press and hold on an empty part of the picture, then drag to look around. Let go to stop turning.
2. Look at a coloured piece of the brain. The coloured pieces show the **motor strip**, a region of the brain that helps control movement. A label near the middle of the screen names the part the game will move. For example, a shoulder area moves the shoulder. Click on the area to repeat the move. Press **Left Arrow** or **Right Arrow** to aim at the next area in that direction.
3. Watch your body and the mirror body. Both make the same movement. The mirror body gives you another view of it. Press **E** to change between the eye view and the outside view. In the eye view, moving the mouse turns the camera from one fixed place. From outside, moving the mouse takes the camera around the body at a steady distance. The game leaves the view where you set it until you move it again.
4. Press **Escape** to open the controls. Open **View tutorial** to follow the steps. The tutorial can mark a visible motor area and the part of the body it controls. You can resume or restart the tutorial in the same menu.

The **Resume** button keeps the pointer free. To turn the view with every mouse movement, choose **Capture mouse** in the controls. Press **Escape** to release it and open the controls again. If capture is unavailable, drag on an empty part of the picture to keep playing.

## Move one limb yourself

During play, press **1** for the left arm, **2** for the left leg, **3** for the right leg or **4** for the right arm. Use **W**, **A**, **S** and **D** to move the selected limb. Release the key when it reaches the position you want.

From the view out of your body, look a little up or down to raise or lower the selected arm at the shoulder or the selected leg at the hip. You can do this without looking straight up or at the floor. After you select a limb, the aiming mark for this control sits about a quarter of the way down from the top of the screen. The mark stays there. The drawn wrist or ankle follows the joint, so it can move away from the mark when the limb reaches the end of its movement or the camera looks elsewhere.

After selecting a limb, try this in the tutorial. Drag up or down on an empty part of the picture. If you chose **Capture mouse**, move the mouse up or down. The game measures from where the virtual wrist or ankle was just before that look. It advances the step when that point moves at least 2.5 cm relative to the shoulder or hip. It gives the virtual body up to 0.35 seconds of game time after the look to move. If you are looking from outside the body, press **E** to return to the eye view first.

Press and drag on a limb to move the joint you pressed on. Press **Space** to grip. Aim at the brain or mirror body and hold Space to carry it, then release to put it down. You can drag the brain or mirror body to turn it. Hold **Shift** on the initial press to reach the item behind the one you would usually select.

## Give the body a movement to make

1. While playing, press **F** to open the **Command box**. Type a direction such as **bend my right elbow**, then press **Move** or **Enter**.
2. Join up to four supported movements with **then**. For example, enter **bend my left knee then bend my right knee**. The game shows which step it is doing. A movement key or a new command gives you control back.
3. Where the browser offers on-device dictation, choose **Use voice**. Check the words that appear in the box before you move the body. You can always type instead.

## Follow a movement or save a take

1. Press **C** to open the recorder in the standalone game. When you play through the local model launcher, **C** opens the **Movement mirror**. To use the recorder there, choose **Record a limb take** in the game toolbar.
2. In the recorder, use **Follow** to choose an arm, a knee, a pair, or both arms and knees. Choose your own left or right. You can make this choice before or during capture. If you are recording, choose **Finish take** before switching limbs to keep the take. Use the arrow keys while **Follow** has focus. Press **Tab** to reach **Start camera** when you are ready.
3. Select **Start camera** and allow video if the browser asks. Video stays on your device. The recorder shows your own image as a mirror. **Following** and a green line show which limbs the recorder can use to move the virtual body. An arm line joins the estimated shoulder, elbow and wrist. A leg line joins the estimated hip, knee and ankle. If you see **Show a bend**, turn partway sideways and bend that knee so the camera can see the angle. If you see **Bring into view**, make room for that arm or leg in the picture and check that its joints are visible.

   In the Movement mirror, step back so your feet fit in the picture. When it asks for a clear bend, turn partway sideways and hold that knee bent briefly. Both live camera views start following a knee when two pictures in a row show a bend of at least 45 degrees. That is half a right angle in the picture. If the camera loses a knee for six tenths of a second, show its bend again when it returns. Visible arms can keep moving while a knee waits. The Movement mirror can still forecast where a visible point will move, using the places and times it saw that point in the pictures.

4. Save any movement you want to keep before stopping capture. In the recorder, choose **Record take** and **Finish take**. In the Movement mirror, choose **Save take**. Open the Command box and enter **replay my take** to move the simulated body through the saved poses.
5. Choose **Stop** in the Movement mirror or **Stop camera** in the recorder when you finish. Use **Close** or **Escape** to return from the Movement mirror. Your own mouse still controls the view of the game while the body follows the camera.

In the Movement mirror, **Body follows** starts with both arms and knees. Choose one arm or knee, a pair, or both arms and knees. Choose **Forecast only** to keep the body under your game controls. A limb you turn off stops following at once. A limb you turn on waits for the next usable picture. If the panel is compact, open **Controls** to switch during playback.

Use **Point to forecast** for a separate choice. The body can follow your right arm while the model forecasts where your left ankle will appear. A change to **Body follows** keeps the point forecast running. A change to **Point to forecast** starts a fresh forecast and keeps the selected limbs following. Pausing, seeking or finishing a video releases the tracked limbs. Timed pictures release them when the sequence ends. The last comparison stays on screen if one is available.

Choose **Save take** once the mirror has tracked the limb you want. It keeps up to eight seconds of recent movement from the camera, video, or timed pictures. For a video you can pause and save movement from just before the current position. For timed pictures, wait until the mirror has read the images. Replay keeps the timing you supplied. The take keeps the estimated joint movements, their times and available arm marker positions in this tab. The camera image or file stays on your device.

Choose **Open Command box** after saving, or return to the game and press **F**. The camera stops when the Command box opens. Type **replay my take** to play back the movement, or use **Named takes** to give it a name. Save before stopping the mirror. Changing the limbs, moving to a new time in a clip, or choosing a different source clears the movement waiting to be saved. A saved take stays available while you use the same tab. Changing the forecast point keeps the movement you can save.

The Movement mirror uses the five most recent pictures to forecast where a point will be 0.12 seconds later. “Forecast from frame 5” means the fifth picture was the last one used for that prediction. The score uses the point found in the image closest to the target time, up to 0.04 seconds either side. It gives the difference in pixels, the small units that make up the picture.

The score says when the tracker finished processing the matching image before the model replied. It still uses the same match. If the tracker finds no matching point, the score says it is unavailable. A virtual movement is scored against a simulated point. Switching points, seeking a clip, or losing track starts a fresh comparison.

The recorder checks one picture at a time. When the browser reports new pictures, the game waits at least one twentieth of a second between grabs. On older browsers it waits about nine hundredths of a second after each check before looking again.

When the browser can tell the game that new pictures have stopped arriving, the green lines disappear after about 1.2 seconds. The recorder says **Camera on. Waiting for video.** You can still move the virtual body with the game controls. The recorder can follow you again when new pictures arrive. It turns off the camera after roughly 15 seconds without a new picture. Select **Start camera** to try again. A motionless arm can keep tracking as long as the camera keeps sending pictures. Some older browsers only report how long the video has played. If their camera picture freezes and the lines stay on, select **Stop camera**, then **Start camera**.

A local model can also forecast a tracked point or answer a supported movement goal. It receives point histories or game inputs from the interface. The movement shown on screen, the points estimated from video, and the model's forecast are three distinct readings.

## Follow a video file

1. In the standalone game, press **C** and choose **Recorded video** under **Source**. Under **Follow**, select the visible arm or knee you want the virtual body to follow. You can also select both arms, both knees, or both pairs.
2. Choose a file under **Local video**, then select **Play video**. Use a file up to about 537 MB. Your browser must be able to play it and tell the game when each new picture appears. The file stays on this device. The game shows the picture as it was saved, so a mirrored recording can reverse left and right.
3. **Following** and a green line show which limbs the game can use. **Waiting for a bend** means the game can see the knee and needs a clearer starting bend. **No usable pose** means the joints in that picture could not be used. Try a part of the video where you can see more of the limb.
4. Pause or move to another time with the video controls. The previous tracking clears. The game also clears a result that falls 1.2 seconds or more behind playback. Choose **Stop video** to stop early or press **F** to stop and open the Command box. You can play the selected file again after it ends or you choose Stop video.
5. Choose **Save video take** while the video plays, after pausing, after stopping or at the end. It keeps tracked movement from up to eight seconds before the current position in the video. The timing follows the source even if you played it slowly. Gaps in tracking still take up time.
6. Press **F** and enter **replay my take**. To keep the take under a name, open **Named takes**, type a name and choose **Save last take**. For a take saved as **side reach**, enter **replay take named side reach**. Named takes and the latest take stay in this tab.

When you seek, change limbs or open a new file, the game starts a fresh window for the next take. Your earlier take stays until you choose **Save video take** again or finish a live take. The game keeps the tracked joint movement in memory. The picture and sound remain in the original file.

To save one limb, it needs to be tracked in at least two pictures. For **Both arms** or **Both knees**, each side needs two. For **Both arms and knees**, one limb appearing in two tracked pictures is enough. The take can include the other limbs when the tracker sees them.

With the local model launcher, choose **Record a limb take** for the recorder controls above. You can also use **Save take** in the Movement mirror while following a saved video or after reading timed pictures.

The tracker estimates joints in the picture. The virtual body moves from those estimates. The game simulates its electrical activity.

## Make a take from timed pictures

1. Press **C** and choose **Timed pictures** under **Source**. In the local model game, use **Record a limb take** to open the recorder. Choose the limb or pair you want the body to follow.
2. Add two to 256 local pictures. Use pictures up to 32 MiB each. Enter one time in seconds per picture in the displayed order. Use zero or positive times. For example, `0, 0.5, 1.25` gives a half-second first step and a longer second step. You can leave the times field blank and use filenames such as `0.jpg`, `0.5.jpg` and `1.25.jpg`. Use different times for each picture and keep the first and last within eight seconds of each other.
3. Choose **Track pictures** and wait for the result. A take needs two tracked pictures for a single limb, two per side for a pair, or two from any one limb in **Both arms and knees**. For knees, start with two pictures that show a clear bend of at least 45 degrees and add another clear view so there are enough poses to save. Use **Save picture take** once it appears.
4. Press **F** and type **replay my take**. Save a name under **Named takes** to call the movement back later in this tab. The virtual body moves between the poses from the pictures. If a timed picture loses a limb, the game releases that limb at that time. Comparisons and forecasts use the tracked pictures at their assigned times.

Changing the pictures, times or selected limb starts a fresh attempt. An earlier saved take stays available until you save another. The pictures stay on your device. The take keeps joint estimates and their times in the browser tab.

## See what moved

Press **R** to show more information about the area you are looking at. Press it again to hide the cards, then once more to return to the short cards.

In the normal view, faint lines of light travel across the brain and through the motor strip. Press **M** for the detailed electrical map and again to return. In the Escape menu, untick **Electrical effects in the normal view** if you want a quieter picture. If you want to return the body or brain to its starting place, use the matching reset button in that menu.

The game generates the brain and muscle activity shown in colour. With camera permission, it estimates where visible joints are in the picture. Those points can move the virtual body. The electrical activity still comes from the simulation.

## Choose a download

Full and Lite have the same controls, body shapes and brain. Lite uses smaller files to deliver the same shapes. The five groups of anatomy files, their contents list and the body rig save 996,262 bytes, or about 1 MB. If your browser needs the 142,385-byte decoder to open them, the total saving is 853,877 bytes, or about 0.85 MB. For a local copy, follow the [launcher instructions](https://eliminatenoise.github.io/NeuroSurge/START.html).
