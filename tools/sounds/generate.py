#!/usr/bin/env python3
"""Synthesises Sigil's sound cues: one soft family, two timbres (bell, marimba), one key (C major).

Usage:  python3 tools/sounds/generate.py            (from the repo root)

Needs python3 + numpy and ffmpeg (libmp3lame). Output is deterministic (fixed seed).
  - bell set     -> apps/native/assets/sounds/   (the active set; same filenames as before)
  - both sets    -> tools/sounds/audition/{bell,marimba}/ plus audition/index.html
See tools/sounds/README.md.
"""
import html
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

SR = 44100
ROOT = Path(__file__).resolve().parents[2]
ACTIVE_DIR = ROOT / "apps/native/assets/sounds"
AUDITION_DIR = Path(__file__).resolve().parent / "audition"

# C major pentatonic (Hz). One key for every cue.
C4, E4, G4 = 261.63, 329.63, 392.00
C5, E5, G5 = 523.25, 659.25, 783.99
C6, E6, G6 = 1046.50, 1318.51, 1567.98
A4 = 440.00

# cue file -> (what it is for, max seconds)
CUES = {
    "cue_check.mp3": ("Tick: a set ticked", 0.15),
    "cue_progress_step.mp3": ("Progress step: rest 3, 2, 1", 0.25),
    "cue_complete.mp3": ("Countdown timer reached zero", 1.2),
    "cue_success.mp3": ("Finish: the workout was finished", 1.2),
    "cue_achievement.mp3": ("Record: a new record", 1.2),
    "cue_error.mp3": ("Error: a tick was refused", 0.6),
    "rest_end.wav": ("Rest end (also the notification sound)", 2.0),
}

# Per-cue loudness target (RMS dBFS over the audible part); rest end sits a little above the rest.
TARGET_RMS_DB = {"cue_check.mp3": -22, "cue_progress_step.mp3": -22, "cue_error.mp3": -24,
                 "cue_complete.mp3": -21, "cue_success.mp3": -21, "cue_achievement.mp3": -21,
                 "rest_end.wav": -17}
PEAK_CEILING_DB = -2.0


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def envelope(t, attack, decay_t60):
    """Gentle linear-ish attack, then exponential decay (to -60 dB at decay_t60)."""
    att = np.minimum(1.0, t / attack) ** 1.5 if attack > 0 else 1.0
    return att * np.exp(-6.9078 * t / decay_t60)


def bell_note(freq, dur, vel=1.0):
    """Additive bell: inharmonic partials with a touch of FM shimmer on the strike."""
    t = t_axis(dur)
    # (ratio, amplitude, decay t60 as a fraction of the longest)
    partials = [(1.0, 1.00, 1.00), (2.0, 0.45, 0.70), (2.76, 0.28, 0.45),
                (4.07, 0.14, 0.30), (5.40, 0.09, 0.20), (8.93, 0.04, 0.10)]
    out = np.zeros_like(t)
    base_t60 = dur * 0.55
    for ratio, amp, dec in partials:
        f = freq * ratio
        if f > 9000:
            continue
        # tiny FM that dies fast = soft metallic "tink" at the attack, not a harsh one
        fm = 0.6 * np.exp(-t / 0.03) * np.sin(2 * np.pi * f * 1.41 * t)
        out += amp * envelope(t, 0.006, base_t60 * dec) * np.sin(2 * np.pi * f * t + fm)
    return vel * out


def marimba_note(freq, dur, vel=1.0):
    """Wooden bar: fundamental + 4x + ~10x partials, short decay, a soft mallet thump."""
    t = t_axis(dur)
    partials = [(1.0, 1.00, 1.00), (3.93, 0.32, 0.18), (9.20, 0.08, 0.07)]
    out = np.zeros_like(t)
    base_t60 = min(dur * 0.45, 0.55 + 0.0 * freq)
    for ratio, amp, dec in partials:
        f = freq * ratio
        if f > 9000:
            continue
        out += amp * envelope(t, 0.003, base_t60 * dec) * np.sin(2 * np.pi * f * t)
    # mallet thump: low-passed noise burst
    rng = np.random.default_rng(7)
    thump = rng.standard_normal(len(t)) * np.exp(-t / 0.006)
    k = np.ones(24) / 24
    thump = np.convolve(thump, k, mode="same") * 0.35
    return vel * (out + thump)


def place(buf, note, start):
    i = int(start * SR)
    n = min(len(note), len(buf) - i)
    if n > 0:
        buf[i:i + n] += note[:n]


def reverb_ir(rt60=0.9, seed=3):
    """Synthetic room: decaying noise, darker over time. Cheap, deterministic, no samples."""
    rng = np.random.default_rng(seed)
    n = int(rt60 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n) * np.exp(-6.9078 * t / rt60)
    # one-pole lowpass to soften the tail
    a = 0.55
    out = np.empty_like(noise)
    acc = 0.0
    for i, x in enumerate(noise):
        acc = a * acc + (1 - a) * x
        out[i] = acc
    out[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))  # pre-delay-ish fade-in
    return out / np.sqrt(np.sum(out**2))


def add_reverb(x, wet, rt60):
    if wet <= 0:
        return x
    ir = reverb_ir(rt60)
    n = len(x) + len(ir)
    size = 1 << (n - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x + wet * y * (np.sqrt(np.sum(x**2)) / (np.sqrt(np.sum(y**2)) + 1e-12))


def finish(x, max_dur, name):
    """Trim to the budget, fade the end, remove DC, normalise loudness, keep peaks under ceiling."""
    x = x[: int(max_dur * SR)].copy()
    fade = min(int(0.04 * SR), len(x) // 4)
    x[-fade:] *= np.linspace(1, 0, fade) ** 2
    x -= x.mean()
    audible = np.abs(x) > 1e-3 * np.max(np.abs(x))
    rms = np.sqrt(np.mean(x[audible] ** 2))
    gain = 10 ** (TARGET_RMS_DB[name] / 20) / rms
    x *= gain
    ceiling = 10 ** (PEAK_CEILING_DB / 20)
    peak = np.max(np.abs(x))
    if peak > ceiling:  # scale down rather than clip
        x *= ceiling / peak
    return x.astype(np.float32)


def build(note):
    """note(freq, dur, vel) -> samples. Returns {filename: float32 array}."""
    # Each timbre has its own tails: bell rings, marimba is dry-ish.
    def seq(notes, total, wet, rt60):
        buf = np.zeros(int(total * SR))
        for freq, start, dur, vel in notes:
            place(buf, note(freq, dur, vel), start)
        return add_reverb(buf, wet, rt60)

    c = {}
    # Rising phrase: tick E5 -> step G5 -> finish C5-G5-C6 arpeggio.
    c["cue_check.mp3"] = seq([(E5, 0, 0.14, 1.0)], 0.15, 0.12, 0.15)
    c["cue_progress_step.mp3"] = seq([(G5, 0, 0.24, 1.0)], 0.25, 0.14, 0.2)
    c["cue_success.mp3"] = seq([(C5, 0, 0.5, 0.8), (G5, 0.11, 0.5, 0.85), (C6, 0.22, 1.0, 1.0)],
                               1.2, 0.28, 0.8)
    # Countdown done: a calm two-note "there" (G5 -> C6).
    c["cue_complete.mp3"] = seq([(G5, 0, 0.5, 0.85), (C6, 0.16, 1.0, 1.0)], 1.2, 0.26, 0.8)
    # Record: brighter, quicker arpeggio up the pentatonic, ending high.
    c["cue_achievement.mp3"] = seq([(C5, 0, 0.4, 0.7), (E5, 0.075, 0.4, 0.75), (G5, 0.15, 0.4, 0.8),
                                    (C6, 0.225, 0.5, 0.9), (E6, 0.30, 0.9, 1.0), (G6, 0.375, 0.8, 0.8)],
                                   1.2, 0.26, 0.8)
    # Error: soft, low, descending pair (G4 -> E4 an octave under the family).
    c["cue_error.mp3"] = seq([(G4, 0, 0.35, 0.9), (E4, 0.14, 0.45, 1.0)], 0.6, 0.15, 0.4)
    # Rest end: two statements of the C chord, clearly noticeable, ~1.9 s.
    c["rest_end.wav"] = seq([(G5, 0, 1.0, 0.8), (C6, 0.0, 1.2, 0.9),
                             (C5, 0.55, 1.3, 0.8), (E5, 0.55, 1.3, 0.55), (G5, 0.55, 1.3, 0.7),
                             (C6, 0.55, 1.3, 1.0)], 2.0, 0.3, 1.1)
    return {k: finish(v, CUES[k][1], k) for k, v in c.items()}


def write_wav(path, x):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())


def export(cues, outdir):
    """MP3 (mono, 44.1 kHz) for cues; 16-bit mono WAV for rest_end (iOS/Android notification)."""
    outdir.mkdir(parents=True, exist_ok=True)
    for name, x in cues.items():
        dest = outdir / name
        if name.endswith(".wav"):
            write_wav(dest, x)
            continue
        with tempfile.TemporaryDirectory() as tmp:
            wav = Path(tmp) / "in.wav"
            write_wav(wav, x)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-ac", "1",
                            "-ar", str(SR), "-c:a", "libmp3lame", "-b:a", "96k",
                            "-map_metadata", "-1", "-fflags", "+bitexact", str(dest)], check=True)


def audition_html():
    rows = "".join(
        f'<tr><td>{html.escape(desc)}<br><code>{name}</code></td>'
        + "".join(f'<td><button onclick="new Audio(\'{v}/{name}\').play()">▶ {v}</button></td>'
                  for v in ("bell", "marimba")) + "</tr>"
        for name, (desc, _) in CUES.items())
    seq = ["cue_check.mp3", "cue_progress_step.mp3", "cue_success.mp3"]
    return f"""<!doctype html><meta charset="utf-8"><title>Sigil sound audition</title>
<style>body{{font:16px system-ui;max-width:640px;margin:2rem auto;padding:0 1rem}}
td{{padding:.5rem .75rem;border-bottom:1px solid #8884}}button{{font-size:1rem;padding:.4rem .8rem}}</style>
<h1>Sigil sounds: bell vs marimba</h1>
<p>Both sets are in C major. The bell set is the shipped one.</p>
<p>Phrase (tick → step → finish): {" ".join(f'<button onclick="phrase(\'{v}\')">▶ {v}</button>' for v in ("bell", "marimba"))}</p>
<table>{rows}</table>
<script>
const seq={seq!r};
function phrase(v){{seq.forEach((n,i)=>setTimeout(()=>new Audio(v+'/'+n).play(),[0,450,900][i]))}}
</script>
"""


def main():
    if shutil.which("ffmpeg") is None:
        sys.exit("ffmpeg (with libmp3lame) is required")
    sets = {"bell": build(bell_note), "marimba": build(marimba_note)}
    for variant, cues in sets.items():
        export(cues, AUDITION_DIR / variant)
    export(sets["bell"], ACTIVE_DIR)  # the shipped set
    (AUDITION_DIR / "index.html").write_text(audition_html(), encoding="utf-8")
    for variant, cues in sets.items():
        for name, x in cues.items():
            print(f"{variant:8s} {name:22s} {len(x)/SR*1000:6.0f} ms  peak {20*np.log10(np.max(np.abs(x))):5.1f} dBFS")


if __name__ == "__main__":
    main()
