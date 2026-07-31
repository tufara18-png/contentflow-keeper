import json
import math
import os
import random
import shutil
import subprocess
import sys
from pathlib import Path

from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parents[1]
JOB_ID = os.environ["JOB_ID"]
JOB_DIR = ROOT / "contentready-jobs" / JOB_ID
OUT_DIR = ROOT / "contentready-output" / JOB_ID
OUT_DIR.mkdir(parents=True, exist_ok=True)


def run(cmd: list[str], cwd: Path | None = None) -> None:
    print("+", " ".join(map(str, cmd)), flush=True)
    result = subprocess.run(cmd, cwd=cwd, text=True)
    if result.returncode:
        raise RuntimeError(f"Command failed with exit code {result.returncode}")


def ffprobe_duration(path: Path) -> float:
    result = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=nw=1:nk=1", str(path)
    ], capture_output=True, text=True, check=True)
    return float(result.stdout.strip())


def cut_audio(source: Path, destination: Path, start: float) -> None:
    run([
        "ffmpeg", "-y", "-ss", f"{max(0.0, start):.3f}", "-i", str(source),
        "-t", "15", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(destination)
    ])


def separate_vocals(snippet: Path, work: Path) -> Path:
    demucs_out = work / "demucs"
    run([
        sys.executable, "-m", "demucs", "--two-stems", "vocals",
        "--name", "htdemucs", "--shifts", "1", "--segment", "15",
        "-o", str(demucs_out), str(snippet)
    ])
    vocals = demucs_out / "htdemucs" / snippet.stem / "vocals.wav"
    if not vocals.exists():
        raise RuntimeError("Demucs did not create vocals.wav")
    prepared = work / "voice.wav"
    run([
        "ffmpeg", "-y", "-i", str(vocals),
        "-af", "highpass=f=90,lowpass=f=9000,dynaudnorm=f=120:g=8",
        "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(prepared)
    ])
    return prepared


def transcribe(voice: Path) -> list[dict]:
    model_name = os.getenv("WHISPER_MODEL", "small")
    model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=2, num_workers=1)
    segments, _ = model.transcribe(
        str(voice), beam_size=5, best_of=5, vad_filter=False,
        word_timestamps=True, condition_on_previous_text=False,
        temperature=0,
    )
    ignored = {"[music]", "[musica]", "[musique]", "[instrumental]", "music", "musica", "musique"}
    words: list[dict] = []
    line_idx = 0
    word_idx = 0
    for segment in segments:
        for item in segment.words or []:
            token = (item.word or "").strip()
            if not token or token.lower() in ignored:
                continue
            start = max(0.0, min(15.0, float(item.start or 0.0)))
            end = max(start + 0.05, min(15.0, float(item.end or start + 0.2)))
            if start >= 15:
                continue
            words.append({
                "word": token,
                "time": round(start, 3),
                "end": round(end, 3),
                "line_idx": line_idx,
                "word_idx": word_idx,
            })
            word_idx += 1
            if word_idx >= 5 or token.endswith((".", "!", "?", ",")):
                line_idx += 1
                word_idx = 0
    return words


def detect_beats(snippet: Path) -> list[float]:
    result = subprocess.run([
        "ffmpeg", "-hide_banner", "-i", str(snippet),
        "-filter_complex", "silencedetect=noise=-18dB:d=0.08", "-f", "null", "-"
    ], capture_output=True, text=True)
    beats = []
    for line in result.stderr.splitlines():
        if "silence_end:" in line:
            try:
                time = float(line.split("silence_end:", 1)[1].split("|", 1)[0].strip())
                if 0.15 < time < 14.9:
                    beats.append(round(time, 3))
            except ValueError:
                pass
    if len(beats) < 6:
        beats = [round(i * 0.75, 3) for i in range(1, 20)]
    return beats[:28]


def ass_time(seconds: float) -> str:
    seconds = max(0.0, min(15.0, seconds))
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    whole = int(seconds % 60)
    centis = int(round((seconds - math.floor(seconds)) * 100))
    return f"{hours}:{minutes:02d}:{whole:02d}.{min(99, centis):02d}"


def escape_ass(text: str) -> str:
    return text.replace("\\", r"\\").replace("{", r"\{").replace("}", r"\}").replace("\n", " ")


def build_ass(words: list[dict], output: Path) -> None:
    grouped: dict[int, list[dict]] = {}
    for word in words:
        grouped.setdefault(int(word.get("line_idx", 0)), []).append(word)
    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: BRAT,DejaVu Sans Condensed,74,&H00FFFFFF,&H00FFFFFF,&H70000000,&H00000000,-1,0,0,0,88,100,0,0,1,2.4,1.4,5,80,80,300,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    line_ids = sorted(grouped)
    for pos, line_id in enumerate(line_ids):
        line_words = sorted(grouped[line_id], key=lambda x: float(x.get("time", 0)))
        next_line = 15.0
        if pos + 1 < len(line_ids):
            next_line = min(float(x.get("time", 15)) for x in grouped[line_ids[pos + 1]])
        cumulative = []
        for index, word in enumerate(line_words):
            cumulative.append(str(word.get("word", "")).strip())
            start = float(word.get("time", 0))
            end = float(line_words[index + 1].get("time", next_line)) if index + 1 < len(line_words) else next_line
            end = max(start + 0.06, min(15, end))
            text = escape_ass(" ".join(cumulative).upper())
            events.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},BRAT,,0,0,0,,{{\\blur1.2}}{text}")
    output.write_text(header + "\n".join(events), encoding="utf-8")


def render_video(clips: list[Path], audio: Path, words: list[dict], beats: list[float], output: Path, seed: int, grain: int) -> None:
    if not clips:
        return
    work = output.parent / "render-work"
    work.mkdir(parents=True, exist_ok=True)
    rng = random.Random(seed)
    cut_points = [0.0] + sorted({float(x) for x in beats if 0.15 < float(x) < 14.9}) + [15.0]
    segments = []
    last = -1
    for start, end in zip(cut_points, cut_points[1:]):
        duration = end - start
        if duration < 0.1:
            continue
        choices = list(range(len(clips)))
        if len(choices) > 1 and last in choices:
            choices.remove(last)
        chosen = rng.choice(choices)
        last = chosen
        clip = clips[chosen]
        source_duration = ffprobe_duration(clip)
        source_start = 0 if source_duration <= duration else rng.uniform(0, max(0, source_duration - duration))
        segment = work / f"segment-{len(segments):03d}.mp4"
        run([
            "ffmpeg", "-y", "-ss", f"{source_start:.3f}", "-i", str(clip), "-t", f"{duration:.3f}",
            "-an", "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,fps=30",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", str(segment)
        ])
        segments.append(segment)
    concat = work / "concat.txt"
    concat.write_text("\n".join(f"file '{p.resolve()}'" for p in segments), encoding="utf-8")
    base = work / "base.mp4"
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", str(base)])
    subtitles = work / "captions.ass"
    build_ass(words, subtitles)
    noise = max(0, min(25, grain))
    run([
        "ffmpeg", "-y", "-i", str(base), "-i", str(audio), "-t", "15",
        "-vf", f"subtitles={subtitles}:fontsdir=/usr/share/fonts/truetype/dejavu,noise=alls={noise}:allf=t+u",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(output)
    ])


def main() -> None:
    config_path = JOB_DIR / "job.json"
    if not config_path.exists():
        raise FileNotFoundError(f"Missing {config_path}")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    audio_files = [p for p in JOB_DIR.iterdir() if p.name.startswith("audio.")]
    if not audio_files:
        raise FileNotFoundError("Missing audio file")
    audio_source = audio_files[0]
    work = OUT_DIR / "work"
    work.mkdir(parents=True, exist_ok=True)
    snippet = work / "snippet.wav"
    cut_audio(audio_source, snippet, float(config.get("start", 0)))

    supplied_words = config.get("words") or []
    if supplied_words:
        words = supplied_words
    else:
        voice = separate_vocals(snippet, work)
        words = transcribe(voice)
    beats = config.get("beats") or detect_beats(snippet)

    analysis = {"job_id": JOB_ID, "duration": 15, "start": config.get("start", 0), "words": words, "beats": beats}
    (OUT_DIR / "analysis.json").write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8")

    clips = sorted([p for p in JOB_DIR.iterdir() if p.name.startswith("clip-")])
    if clips:
        render_video(
            clips, snippet, words, beats, OUT_DIR / "contentready-brat-15s.mp4",
            int(config.get("seed", 1)), int(config.get("grain", 8)),
        )
    shutil.copy2(snippet, OUT_DIR / "snippet.wav")
    shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
