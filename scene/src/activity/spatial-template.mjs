// Shared by the game dialog and the standalone viewer. All recording text is set via textContent.
export const markup = `
<h2>Watch the markers move</h2>
    <p>Cameras tracked small markers attached to a person moving in a lab. Turn the view to follow their paths. The archive includes processed marker positions.</p>
    <label class="spatial-select">Recording <select data-motion-clip aria-label="Recording" disabled></select></label>
    <p data-motion-status role="status">Opening the recordings…</p>
    <button type="button" data-motion-retry hidden>Try again</button>
    <div data-motion-body hidden>
      <p class="activity-note" data-motion-info></p>
      <figure class="spatial-figure">
        <canvas data-motion-canvas role="img" aria-label="Rotatable three-dimensional view of recorded body markers. The controls below give the lab coordinates of each marker."></canvas>
        <figcaption><span class="spatial-key left">Left</span><span class="spatial-key right">Right</span><span class="spatial-key mid">Other markers</span><span data-motion-count></span></figcaption>
      </figure>
      <div class="spatial-transport">
        <button type="button" data-motion-play>Play movement</button>
        <label>Time in recording <input type="range" data-motion-time min="0" step="1"></label>
        <output data-motion-clock aria-live="off"></output>
      </div>
      <div class="spatial-options">
        <label><input type="checkbox" data-motion-lines checked> Connect nearby markers</label>
        <label><input type="checkbox" data-motion-follow> Follow the waist</label>
      </div>
      <p class="activity-note" data-motion-view></p>
      <div class="spatial-orbit">
        <label>Turn <input type="range" data-motion-yaw min="-180" max="180" step="1" value="28"></label>
        <label>Tilt <input type="range" data-motion-pitch min="-75" max="75" step="1" value="12"></label>
        <button type="button" data-motion-reset>Recenter view</button>
      </div>
      <details>
        <summary>Read a marker’s position</summary>
        <label class="spatial-select">Marker <select data-motion-marker aria-label="Marker"></select></label>
        <p><output data-motion-coordinates aria-live="off"></output></p>
        <p class="activity-note">X and Y run along the lab floor. Z measures height. Turning the view or following the person leaves these lab coordinates unchanged. A missing marker leaves a gap.</p>
      </details>
      <details>
        <summary>How was this movement recorded?</summary>
        <p>Infrared cameras saw each marker from several angles. The capture system combined those views to locate it in three dimensions. Lines between markers help you see the pose. These trials supply no measurements of nerve signals, muscle activity or force.</p>
        <p class="activity-note" data-motion-quality></p>
        <p class="activity-note">Motion capture from the Carnegie Mellon University Graphics Lab, funded by NSF EIA-0196217. <a href="https://mocap.cs.cmu.edu/" target="_blank" rel="noopener">CMU motion capture database</a> · <a href="https://mocap.cs.cmu.edu/faqs.php" target="_blank" rel="noopener">Data use terms</a></p>
      </details>
    </div>
`;
