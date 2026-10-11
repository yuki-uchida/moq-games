# Monster-assault and final-boss music

`monster-assault.mp3` is the project owner's supplied Suno Pro-generated track, originally named `nimble staccato strings(1).mp3`. The owner identified this as music they created and explicitly approved incorporating it as the monster-assault BGM. It is included for this game's playback and authorized repository distribution; no broader standalone music license is granted here. The repository's code license does not imply a separate license to this recording.

The supplied bytes are preserved unchanged (including their embedded metadata/artwork), with no transcoding or new generation:

- SHA-256: `e51cc0e6d55e40c70d4c6081f870c652056a1573e4bfe4d1cbfb99fcd4c358fe`
- Size: 3,009,155 bytes
- Format: MPEG Layer III / MP3, 48 kHz, stereo
- Duration: 127.176 seconds

The generation-plan provenance is based on the owner's statement; it has not been independently audited. This provenance does not guarantee copyright protection, exclusivity, or third-party non-infringement. Suno's applicable generation-time terms govern the owner's rights; this file does not replace those terms.

## Stage 10: final boss

`final-boss.mp3` is the owner's second supplied Suno Pro-generated recording, originally named `Monster March.mp3`, explicitly assigned to stage 10 only. Its original bytes are also preserved unchanged. The same provenance limitations and game-use distribution scope above apply.

- SHA-256: `e7ff453f851007cf053db9cb3cee5d4e0a5baca42bd2bd1ffba04100ebcbe8fa`
- Size: 3,268,794 bytes
- Format: MPEG Layer III / MP3, 48 kHz, stereo
- Duration: 144.648 seconds

Stages 1–9 randomly choose `monster-assault.mp3` or `monster-assault-2.mp3` with equal probability once per assault, including earlier boss encounters. The chosen track loops for that assault and does not change on settings, visibility changes, or rendering. The selection is saved separately from game state when browser storage is available, so Continue keeps it. New runs/retries clear that selection. Music uses its own random draw and never consumes the combat RNG. Stage 10 uses `final-boss.mp3`, including a continued or retried stage-10 assault. Switching replaces the source of the same audio element, preventing overlapping tracks.

Runtime: a single streaming HTML audio element, looping only during assaults, default volume 20%, with separate persisted BGM mute/volume controls. It stops on preparation, outcomes, title return, and page exit, and pauses while the page is hidden. SFX controls and combat behavior are unchanged.

## Second normal-assault track

`monster-assault-2.mp3` is the owner's third supplied Suno Pro-generated recording, originally named `nimble staccato strings 2.mp3`. The owner explicitly requested random selection between the two normal tracks for stages 1–9. Original bytes are preserved unchanged; the same provenance limitations and game-use distribution scope above apply.

- SHA-256: `4dbad1d5f22bbc273776480acbe9202443d21e07ed0dcd05771952f866b9900a`
- Size: 3,486,534 bytes
- Format: MPEG Layer III / MP3, 48 kHz, stereo
- Duration: 151.008 seconds
