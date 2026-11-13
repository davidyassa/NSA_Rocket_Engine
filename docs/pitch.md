# Sol Check · pitch kit

One storyline, told from the astronaut's side. Everything else goes in the appendix (README Appendix A and B).

## 90-second spoken pitch

> **(Human opening, 20 s)** Imagine you are Maya. You live in a small habitat on Mars. Two days ago a solar storm hit, and you spent two days crammed into a shelter with your crew. You slept four and a half hours. You tell everyone you're fine. And your nearest doctor is on Earth: twenty minutes away at the speed of light. Every question and answer takes forty.
>
> **(What Sol Check does, 30 s)** Sol Check is Maya's daily check-in. Three minutes, one question per page. The laptop camera reads her pulse, breathing and heart-rate variability on the device; nothing is sent anywhere. Then Sol Check compares Maya with *Maya*, not with an average person. It notices that her sleep and her mood have both been below her own normal on four of the last five days, that her heart-rate variability has dropped, and that she's eating too little. It doesn't diagnose. It tells her in plain words, and suggests she talks to the crew medical officer today.
>
> **(The handoff, 15 s)** The medical officer sees every reading, Maya's baseline, and the rule and source behind each finding. If they need Earth, Sol Check packs one complete handoff, so a single forty-minute round trip is enough.
>
> **(Proof, 15 s)** Does "compare you with you" work? We tested it on real NASA data: the blood counts of the four Inspiration4 astronauts. Every post-flight value looked normal against population ranges. Against each astronaut's own baseline, four real changes stood out, and all recovered by the next visit.
>
> **(Close, 10 s)** And this isn't only for Mars: Antarctic stations, ships, offshore rigs, remote clinics here in Egypt. Anywhere the doctor is far away. Sol Check: so no one has to wait forty minutes to know something's wrong.

## Six slides

| # | Title | On the slide | Say |
|---|---|---|---|
| 1 | Twenty minutes from help | Mars habitat photo (NASA/JPL-Caltech/MSSS, credited), "Sol 43" | The human opening |
| 2 | Maya's check-in | Two phone screenshots: camera oval with result; plain-language assessment | Three minutes, on the device, compares Maya with Maya |
| 3 | From finding to Earth | Assessment → medical officer console → ground handoff (three screenshots, arrows) | One complete handoff, one round trip |
| 4 | Tested on real astronauts | The four numbers from **Demo and data → Tested on real astronaut data**: 0 of 20 outside population range · 4 real personal changes · 4 of 4 recovered · 2 entry errors caught | Personal baselines see what population ranges miss |
| 5 | Measured, not guessed | Camera vs reference: bench table (82/67/104 → exact) **plus your people-test result** from `node scripts/validate-camera.mjs` | Show the error honestly, including failed scans |
| 6 | Beyond Mars | Antarctica · ships and rigs · remote clinics in Sinai and the Western Desert | Same problem on Earth today; team and thanks |

## 60-second video

A silent screen recording with captions is generated automatically from the live app:

```sh
npm run build
node scripts/make-demo-video.mjs        # writes docs/media/sol-check-demo.mp4
```

Shot list (captions in the video): Sol 43 dashboard → check-in camera oval → demo readings and save → plain-language assessment → evidence passport → medical officer console → timeline with the real Curiosity storm → real astronaut data panel → "Not a diagnosis. Built for Mars, useful on Earth."

For the final submission, record a voice-over of the 90-second script on top, or film a teammate doing a real camera check-in for the human shot.

## Before judging

- Run the people test in [validation/README.md](validation/README.md) and put the real numbers on slide 5.
- Publish the live link and paste it at the top of the README.
- Rehearse the five-step demo in the README with a stopwatch.
