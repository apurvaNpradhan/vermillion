# Sounds

All sounds are original: synthesised in this repository by `tools/sounds/generate.py` (Python,
numpy, ffmpeg) with no samples and no third-party material. They are owned outright and need no
attribution. Re-run `python3 tools/sounds/generate.py` to rebuild them; the shipped set is the
"bell" timbre (a "marimba" alternative is kept in `tools/sounds/audition/`). Everything is in C
major, and tick → progress step → finish rises as a phrase.

| File                    | Used for                                       | Notes                     |
| ----------------------- | ---------------------------------------------- | ------------------------- |
| `cue_check.mp3`         | A set ticked                                   | E5, 150 ms                |
| `cue_progress_step.mp3` | Rest 3, 2, 1 seconds to go                     | G5, 250 ms                |
| `rest_end.wav`          | Rest over (in the app and as the notification) | C chord twice, 2 s        |
| `cue_complete.mp3`      | A countdown timer reached zero                 | G5 → C6, 1.2 s            |
| `cue_achievement.mp3`   | A new record                                   | Brighter C pentatonic run |
| `cue_success.mp3`       | The workout was finished                       | C5 → G5 → C6, 1.2 s       |
| `cue_error.mp3`         | A tick was refused (a value is missing)        | Soft, low G4 → E4         |

`rest_end.wav` is 16-bit mono 44.1 kHz WAV: iOS notification sounds cannot be MP3, and Android raw
resources accept WAV. Its name uses an underscore because Android resource names cannot contain a
hyphen, and `rest_end` must stay the name of the Android notification channel's raw resource.
