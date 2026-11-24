# Play NeuroSurge Lite offline

NeuroSurge is a browser game. You move a virtual body and watch a second body mirror it. This download includes the Movement mirror preview. You can show the game a movement, save it and play it back later.

## Start the game

1. Extract the ZIP. On Windows, right-click it and choose **Extract All**. On macOS or Linux, open it with your archive tool and extract the **NeuroSurge Lite** folder.
2. Install Node.js 18 or later if it is missing. Node.js serves the game to your browser on your computer. Once you have Node.js and the game files, you can play offline.
3. Open the extracted folder and find **lite**. On Windows, open **Play NeuroSurge Lite on Windows.cmd**. On macOS, open **Play NeuroSurge Lite on macOS.command**. On Linux, open a terminal in **lite** and run `sh "Play NeuroSurge Lite on Linux.sh"`.
4. Choose **Play Lite**. If the browser does not open by itself, copy the local address printed in the terminal. Leave that window open during play. Press **Ctrl+C** in the same window to close the local server.

Use a desktop browser with WebGL for the 3D view, a keyboard and a mouse or trackpad.

## Save a movement

Press **C** to open the Movement mirror. Set **Body follows** to the arm, knee or group of limbs you want the virtual body to follow. Then choose a source.

- **Live camera** begins when you choose **Start camera** and grant permission.
- **Recorded video** lets you open and play a file from your computer.
- **Timestamped stills** uses two or more pictures. Enter their times in seconds and choose **Track keyframes**. The first and last pictures can be up to eight seconds apart.

Choose **Save take** to keep up to eight seconds of visible movement in this tab. To see it again, choose **Open Command box**, or close the mirror and press **F**. Type **replay my take**. The camera estimates movement from images. Electrical activity in the game is simulated.

Choose **Dictate locally** in the Movement mirror to enter a goal by voice. This needs a browser with on-device speech. If you leave the game window or hide the mirror controls, dictation stops and any late words are dropped. The text already in the box stays there. Open the controls and choose **Dictate locally** again to start a new dictation.

## Keep and replay a take

Press **F** to open the Command box and expand **Named takes**. Enter a name and choose **Save last take**. Choose **Download** next to that name to keep a copy as a take file. The file stores the movement readings and their times. Your pictures, video and audio stay out of the file.

To use that take later, choose **Open a take file** under **Named takes** and select the file. Type **replay take named warm up**, using your saved name in place of *warm up*. If a name is already in use, choose whether to keep the earlier take or replace it.

To play two saved movements in order, type **replay take named warm up then replay take named reach**. You can join up to four takes or parts of takes. For a take at least two seconds long, try **replay 1 to 2 seconds of take named warm up**. That step uses readings from the 1-second mark until just before the 2-second mark. The selected part needs at least one visible position. The game checks all the steps before it plays. If two saved names fit, put a comma after the one you want. The camera stays off during replay. Choose **Stop replay** or press **Esc** to end it early.

## Movement forecasts and credits

NeuroTranslate estimates where the point you select will be 0.12 seconds later. Open **Measurements and limits** in the Movement mirror for the recorded-image test. The point forecast runs in the browser using the model included here. For the separate fingertip study, extract the NeuroTranslate model beside the game folder and use **Play fingertip touch** with Python 3.10 or later and NumPy. The game download supplies its own examples.

The archive omits the Full edition's pack files, original meshes already covered by Lite's packs, and development checks. Licences, other game assets and the shared game are included. The file named `SHA256SUMS` lists a digital fingerprint for each included file. It can help you check that the files survived the download and extraction. The source repository provides the original meshes and build tools. The Technical guide explains how to make the ZIP from the source. That separate build uses Python to turn the player guides into pages with clickable links. [NeuroSurge source](https://github.com/eliminatenoise/NeuroSurge)
