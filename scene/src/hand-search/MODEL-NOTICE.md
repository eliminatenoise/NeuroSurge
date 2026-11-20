# Search a recorded right-hand movement

Type an action such as “press the button.” The browser compares your words with five intervals in a recording of someone using a printer. A headset tracked the right hand. An observer later described what the person did. This example comes from the training recordings, so a close match here tells us little about success on another recording.

The default model counts familiar words and uses them to estimate how the fingers and wrist moved. The attention model also uses word order. Both compare your description with hand measurements summarized before you opened the page. The timing and tracking controls ask how far a search can get using clues such as when an interval occurred or how much of the hand the headset could see. A control score can be high for a reason as simple as two intervals lasting roughly the same time.

Both movement models consider the first 32 words or numbers. If all are unfamiliar, the ridge model gives the same fallback prediction for every such description and the attention model uses an unknown-word symbol. Equal scores share a rank. All five intervals come from the same printer task, so task identity gives each interval the same score.

The data come from *HoloAssist*, by Xin Wang, Taein Kwon and colleagues (ICCV 2023), recording R031-12July-SmallPrinter. The data agreement accompanies the derived gallery. The study software and fitted parameters carry CC0 1.0. [HoloAssist](https://holoassist.github.io/) · [Data agreement](CDLA-Permissive-2.0.txt) · [CC0](LICENSE)
