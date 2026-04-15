# UNS Audio Assets

Place the following audio files in this directory before building:

| File | Description | Spec |
|---|---|---|
| `drone_deep.mp3` | Low-frequency drone (80-200Hz), for transit rumble masking | Loop, 30s min, -18dB |
| `drone_mid.mp3` | Mid-frequency drone (200-400Hz), warmth layer | Loop, 30s min, -22dB |
| `bell_chime.mp3` | Single chime transient, triggered on brake-sound spike | One-shot, <2s, -12dB peak |
| `nature_bed.mp3` | Ambient nature soundscape (forest / stream) | Loop, 60s min, -20dB |
| `shield_open.mp3` | Sanctuary activation SFX (ascending, 1.5s) | One-shot, -10dB peak |
| `shield_close.mp3` | Sanctuary deactivation SFX (descending, 1.2s) | One-shot, -10dB peak |

## Recommended free sources
- freesound.org (Creative Commons)
- Pixabay sound effects (CC0)
- BBC Sound Effects Library (selected tracks)

## Production targets
- All drone files: binaural-ready (mono per ear in stereo file)
- Sample rate: 44100 Hz
- Bit depth: 16-bit minimum (24-bit preferred)
- Format: MP3 192kbps or higher
