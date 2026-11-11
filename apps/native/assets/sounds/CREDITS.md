# Sounds

All sounds are from the "zen" pack of [uisfx](https://github.com/romainsimon/uisfx) v0.4.0 (npm
package `uisfx`, `sounds/zen/*.mp3`), licensed MIT. Copyright (c) Romain Simon; the licence text is
in the package. They are kept unmodified except `rest_end.wav`.

| File                    | uisfx cue     | Used for                                       |
| ----------------------- | ------------- | ---------------------------------------------- |
| `cue_check.mp3`         | check         | A set ticked                                   |
| `cue_progress_step.mp3` | progress-step | Rest 3, 2, 1 seconds to go                     |
| `rest_end.wav`          | notification  | Rest over (in the app and as the notification) |
| `cue_complete.mp3`      | complete      | A countdown timer reached zero                 |
| `cue_achievement.mp3`   | achievement   | A new record                                   |
| `cue_success.mp3`       | success       | The workout was finished                       |
| `cue_error.mp3`         | error         | A tick was refused (a value is missing)        |

`rest_end.wav` is the "notification" cue converted to 16-bit mono 44.1 kHz WAV with ffmpeg: iOS
notification sounds cannot be MP3, and Android raw resources accept WAV. Its name uses an
underscore because Android resource names cannot contain a hyphen, and `rest_end` must stay the
name of the Android notification channel's raw resource.
