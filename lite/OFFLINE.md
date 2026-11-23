# Play NeuroSurge Lite offline

NeuroSurge is a browser game. Move the virtual body and watch the mirror body repeat the movement. This download includes the same brain, bodies and controls as the browser edition of Lite.

1. Extract the ZIP. On Windows, right-click it and choose **Extract All**. On macOS or Linux, open it with your archive tool and extract the **NeuroSurge Lite** folder.
2. Install Node.js 18 or later if it is missing. Node.js serves the game to your browser on your computer. Once you have Node.js and the game files, you can play offline.
3. Open the extracted folder and find **lite**. On Windows, open **Play NeuroSurge Lite on Windows.cmd**. On macOS, open **Play NeuroSurge Lite on macOS.command**. On Linux, open a terminal in **lite** and run `sh "Play NeuroSurge Lite on Linux.sh"`.
4. Choose **Play Lite**. If the browser does not open by itself, copy the local address printed in the terminal. Leave that window open during play. Press **Ctrl+C** in the same window to close the local server.

Use a desktop browser with WebGL, a keyboard and a mouse or trackpad. Press **F** for the Command box or **C** to open the Movement mirror. Choose **Recorded video** under **Source** to play a file that stays on your device. For live capture, choose **Start camera** and grant permission. The camera estimates visible movement. The game simulates the electrical activity.

After showing a movement, choose **Save take**. Choose **Open Command box**, or press **F** after closing the mirror, and type **replay my take**. The take keeps up to eight seconds of tracked joint movement in this browser tab.

To use still pictures, choose **Timestamped stills** in the Movement mirror. Add at least two local pictures, give each a time in seconds and choose **Track keyframes**. **Save take** keeps the tracked poses for the same replay command. The first and last pictures can be up to eight seconds apart.

NeuroTranslate forecasts where the point you select will be 0.12 seconds later. The point forecast runs in the browser using the weights included here. For the separate fingertip study, extract the NeuroTranslate model beside the game folder and use **Play fingertip touch** with Python 3.10 or later and NumPy. The game download supplies its own examples.

The archive omits the Full edition's pack files, original meshes already covered by Lite's packs, and development checks. Licences, other game assets and the shared game are included. The file named `SHA256SUMS` lists a digital fingerprint for each included file. It can help you check that the files survived the download and extraction. The source repository provides the original meshes and build tools. The Technical guide explains how to make the ZIP from the source. That separate build uses Python to turn the player guides into pages with clickable links. [NeuroSurge source](https://github.com/eliminatenoise/NeuroSurge)
