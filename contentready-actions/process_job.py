import base64
import json
import math
import os
import random
import shutil
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
import requests
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parents[1]
JOB_ID = os.environ.get("JOB_ID", "local-job")
CONFIG_B64 = os.environ.get("JOB_CONFIG_JSON", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "tufara18-png/contentflow-keeper")
OUT_DIR = ROOT / "contentready-output" / JOB_ID
OUT_DIR.mkdir(parents=True, exist_ok=True)


def log(message: str) -> None:
    print(message, flush=True)


def run(cmd: list[str], cwd: Path | None = None) -> None:
    log("+ " + " ".join(map(str, cmd)))
    result = subprocess.run(cmd, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if result.stdout:
        print(result.stdout[-8000:], flush=True)
    if result.returncode:
        raise RuntimeError(f"Command failed with exit code {result.returncode}")


def read_config() -> dict:
    if CONFIG_B64:
        try:
            return json.loads(base64.b64decode(CONFIG_B64).decode("utf-8"))
        except Exception as exc:
            raise RuntimeError("Invalid JOB_CONFIG_JSON") from exc
    legacy = ROOT / "contentready-jobs" / JOB_ID / "job.json"
    if legacy.exists():
        return json.loads(legacy.read_text(encoding="utf-8"))
    raise FileNotFoundError("Missing job config")


def download_asset(asset_id: int | str, destination: Path) -> None:
    if not GITHUB_TOKEN:
        raise RuntimeError("Missing GITHUB_TOKEN")
    url = f"https://api.github.com/repos/{GITHUB_REPOSITORY}/releases/assets/{asset_id}"
    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/octet-stream",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    with requests.get(url, headers=headers, stream=True, timeout=120) as response:
        response.raise_for_status()
        with destination.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)


def media_duration(path: Path) -> float:
    result = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=nw=1:nk=1", str(path)
    ], capture_output=True, text=True)
    try:
        return float(result.stdout.strip())
    except Exception:
        return 15.0


def cut_audio(source: Path, destination: Path, start: float) -> None:
    run([
        "ffmpeg", "-y", "-ss", f"{max(0.0, start):.3f}", "-i", str(source),
        "-t", "15", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(destination)
    ])


def prepare_voice(snippet: Path, work: Path) -> Path:
    demucs_out = work / "demucs"
    run([
        sys.executable, "-m", "demucs", "--two-stems", "vocals", "--name", "htdemucs",
        "--shifts", "1", "--segment", "15", "-o", str(demucs_out), str(snippet)
    ])
    vocals = demucs_out / "htdemucs" / snippet.stem / "vocals.wav"
    if not vocals.exists():
        raise RuntimeError("Demucs did not create vocals.wav")
    prepared = work / "voice.wav"
    run([
        "ffmpeg", "-y", "-i", str(vocals),
        "-af", "highpass=f=90,lowpass=f=9000,afftdn=nf=-24,dynaudnorm=f=120:g=9",
        "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(prepared)
    ])
    return prepared


def transcribe(voice: Path) -> list[dict]:
    model_name = os.getenv("WHISPER_MODEL", "small")
    model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=2, num_workers=1)
    segments, _ = model.transcribe(
        str(voice), beam_size=5, best_of=5, vad_filter=False,
        word_timestamps=True, condition_on_previous_text=False, temperature=0,
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


def load_mono(path: Path, work: Path) -> tuple[np.ndarray, int]:
    mono = work / "analysis-mono.wav"
    run(["ffmpeg", "-y", "-i", str(path), "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(mono)])
    with wave.open(str(mono), "rb") as wav:
        sr = wav.getframerate()
        samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    return samples, sr


def smooth(values: np.ndarray, width: int) -> np.ndarray:
    if width <= 1:
        return values
    kernel = np.ones(width, dtype=np.float32) / width
    return np.convolve(values, kernel, mode="same")


def local_maxima(values: np.ndarray, min_gap: int, limit: int) -> list[int]:
    if len(values) < 3:
        return []
    candidates = [i for i in range(1, len(values) - 1) if values[i] >= values[i - 1] and values[i] >= values[i + 1]]
    candidates.sort(key=lambda idx: values[idx], reverse=True)
    chosen: list[int] = []
    for idx in candidates:
        if all(abs(idx - other) >= min_gap for other in chosen):
            chosen.append(idx)
        if len(chosen) >= limit:
            break
    return sorted(chosen)


def build_cut_markers(snippet: Path, words: list[dict], seed: int, work: Path) -> tuple[list[float], list[dict]]:
    rng = random.Random(seed)
    samples, sr = load_mono(snippet, work)
    hop_s = 0.025
    frame = max(1, int(sr * hop_s))
    usable = samples[: (len(samples) // frame) * frame]
    if usable.size < frame * 10:
        cuts = [round(x, 3) for x in np.arange(0, 15.001, 0.9)]
        return cuts, [{"t": t, "score": 0.3, "type": "fallback"} for t in cuts]
    frames = usable.reshape(-1, frame)
    rms = np.sqrt(np.mean(frames * frames, axis=1) + 1e-9)
    log_rms = np.log1p(rms * 20)
    novelty = np.maximum(0.0, np.diff(log_rms, prepend=log_rms[0]))
    novelty = smooth(novelty, 3)
    energy = smooth(rms, 7)
    novelty_norm = novelty / (float(np.max(novelty)) + 1e-9)
    energy_norm = energy / (float(np.max(energy)) + 1e-9)

    scored: list[dict] = []
    for idx in local_maxima(novelty_norm, min_gap=max(1, int(0.18 / hop_s)), limit=80):
        t = idx * hop_s
        if 0.12 < t < 14.9:
            scored.append({"t": round(t, 3), "score": float(0.75 * novelty_norm[idx] + 0.25 * energy_norm[idx]), "type": "onset"})
    for idx in local_maxima(energy_norm, min_gap=max(1, int(0.35 / hop_s)), limit=30):
        t = idx * hop_s
        if 0.12 < t < 14.9:
            scored.append({"t": round(t, 3), "score": float(0.45 + 0.35 * energy_norm[idx]), "type": "energy"})
    for word in words:
        t = float(word.get("time", 0))
        if 0.12 < t < 14.9:
            is_line_start = int(word.get("word_idx", 0)) == 0
            scored.append({"t": round(t, 3), "score": 0.72 if is_line_start else 0.38, "type": "lyric_start" if is_line_start else "word"})

    if not scored:
        scored = [{"t": round(x, 3), "score": 0.45, "type": "grid"} for x in np.arange(0.6, 14.8, 0.85)]

    def energy_at(time_s: float) -> float:
        idx = max(0, min(len(energy_norm) - 1, int(time_s / hop_s)))
        return float(energy_norm[idx])

    cuts = [0.0]
    marker_debug: list[dict] = []
    current = 0.0
    while current < 14.65:
        e = energy_at(current)
        if e > 0.68:
            min_d, target, max_d = 0.28, rng.uniform(0.42, 0.72), 0.95
        elif e > 0.38:
            min_d, target, max_d = 0.42, rng.uniform(0.68, 1.08), 1.45
        else:
            min_d, target, max_d = 0.65, rng.uniform(1.05, 1.85), 2.25
        window_start = current + min_d
        window_end = min(14.85, current + max_d)
        target_time = min(14.85, current + target)
        candidates = [m for m in scored if window_start <= float(m["t"]) <= window_end]
        if candidates:
            def value(marker: dict) -> float:
                distance_penalty = abs(float(marker["t"]) - target_time) * 0.28
                return float(marker["score"]) - distance_penalty + rng.uniform(-0.08, 0.08)
            chosen = max(candidates, key=value)
            next_cut = float(chosen["t"])
            marker_debug.append({**chosen, "selected": True})
        else:
            next_cut = target_time + rng.uniform(-0.06, 0.06)
            marker_debug.append({"t": round(next_cut, 3), "score": 0.25, "type": "timing_fill", "selected": True})
        next_cut = max(current + 0.25, min(14.9, next_cut))
        if next_cut - current < 0.25:
            break
        cuts.append(round(next_cut, 3))
        current = next_cut
    if cuts[-1] < 14.92:
        cuts.append(15.0)
    else:
        cuts[-1] = 15.0
    return cuts, marker_debug


def ass_time(seconds: float) -> str:
    seconds = max(0.0, min(15.0, seconds))
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    whole = int(seconds % 60)
    centis = int(round((seconds - math.floor(seconds)) * 100))
    return f"{hours}:{minutes:02d}:{whole:02d}.{min(99, centis):02d}"


def escape_ass(text: str) -> str:
    return text.replace("\\", r"\\").replace("{", r"\{").replace("}", r"\}").replace("\n", " ")


def build_ass(words: list[dict], output: Path, seed: int) -> None:
    rng = random.Random(seed + 999)
    grouped: dict[int, list[dict]] = {}
    for word in words:
        grouped.setdefault(int(word.get("line_idx", 0)), []).append(word)
    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: BRAT,Liberation Sans Narrow,72,&H00FFFFFF,&H00FFFFFF,&H85000000,&H00000000,-1,0,0,0,86,100,-1,0,1,2.2,1.4,5,60,60,300,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    line_ids = sorted(grouped)
    line_positions = {line_id: rng.choice([850, 900, 960, 1015, 1070]) for line_id in line_ids}
    for pos, line_id in enumerate(line_ids):
        line_words = sorted(grouped[line_id], key=lambda x: float(x.get("time", 0)))
        next_line = 15.0
        if pos + 1 < len(line_ids):
            next_line = min(float(x.get("time", 15)) for x in grouped[line_ids[pos + 1]])
        cumulative: list[str] = []
        for index, word in enumerate(line_words):
            token = str(word.get("word", "")).strip()
            if not token:
                continue
            cumulative.append(token)
            start = float(word.get("time", 0))
            end = float(line_words[index + 1].get("time", next_line)) if index + 1 < len(line_words) else next_line
            end = max(start + 0.06, min(15, end))
            text = escape_ass(" ".join(cumulative).lower())
            font_size = max(48, min(78, 78 - max(0, len(text) - 16) * 1.8))
            y = line_positions[line_id]
            events.append(
                f"Dialogue: 0,{ass_time(start)},{ass_time(end)},BRAT,,0,0,0,,"
                f"{{\\pos(540,{y})\\an5\\fs{font_size:.0f}\\blur1.2\\fsp-1}}{text}"
            )
    output.write_text(header + "\n".join(events), encoding="utf-8")


def overlaps(a: tuple[float, float], b: tuple[float, float]) -> bool:
    return max(a[0], b[0]) < min(a[1], b[1])


def choose_source_interval(clip: Path, duration: float, used: list[tuple[float, float]], rng: random.Random) -> tuple[float, bool]:
    clip_duration = media_duration(clip)
    if clip_duration <= duration + 0.05:
        candidate = (0.0, min(clip_duration, duration))
        if duration >= 1.0:
            used.append(candidate)
        return 0.0, False
    for _ in range(300):
        start = rng.uniform(0.0, max(0.0, clip_duration - duration - 0.02))
        interval = (start, start + duration)
        if duration < 1.0 or all(not overlaps(interval, old) for old in used):
            if duration >= 1.0:
                used.append(interval)
            return start, False
    start = rng.uniform(0.0, max(0.0, clip_duration - duration - 0.02))
    if duration >= 1.0:
        used.append((start, start + duration))
    return start, True


def render_video(clips: list[Path], audio: Path, words: list[dict], cuts: list[float], output: Path, seed: int, grain: int) -> list[dict]:
    if not clips:
        return []
    work = output.parent / "render-work"
    work.mkdir(parents=True, exist_ok=True)
    rng = random.Random(seed)
    segments = []
    used: dict[int, list[tuple[float, float]]] = {i: [] for i in range(len(clips))}
    timeline: list[dict] = []
    last_clip = -1
    for start, end in zip(cuts, cuts[1:]):
        duration = end - start
        if duration < 0.08:
            continue
        choices = list(range(len(clips)))
        if len(choices) > 1 and last_clip in choices:
            choices.remove(last_clip)
        rng.shuffle(choices)
        chosen = choices[0]
        source_start, reused = choose_source_interval(clips[chosen], duration, used[chosen], rng)
        last_clip = chosen
        segment = work / f"segment-{len(segments):03d}.mp4"
        vf = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,fps=30"
        run([
            "ffmpeg", "-y", "-ss", f"{source_start:.3f}", "-i", str(clips[chosen]), "-t", f"{duration:.3f}",
            "-an", "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", str(segment)
        ])
        segments.append(segment)
        timeline.append({
            "timeline_start": round(start, 3), "timeline_end": round(end, 3), "duration": round(duration, 3),
            "clip_index": chosen, "clip_name": clips[chosen].name, "source_start": round(source_start, 3),
            "source_end": round(source_start + duration, 3), "reused_interval_fallback": reused,
        })
    concat = work / "concat.txt"
    concat.write_text("\n".join(f"file '{p.resolve()}'" for p in segments), encoding="utf-8")
    base = work / "base.mp4"
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", str(base)])
    subtitles = work / "captions.ass"
    build_ass(words, subtitles, seed)
    noise = max(0, min(25, int(grain)))
    run([
        "ffmpeg", "-y", "-i", str(base), "-i", str(audio), "-t", "15",
        "-vf", f"subtitles={subtitles}:fontsdir=/usr/share/fonts/truetype/liberation:/usr/share/fonts/truetype/dejavu,noise=alls={noise}:allf=t+u",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(output)
    ])
    return timeline


def main() -> None:
    config = read_config()
    work = OUT_DIR / "work"
    work.mkdir(parents=True, exist_ok=True)

    audio_name = config.get("audio_name") or "audio.mp3"
    audio_source = work / audio_name
    if config.get("audio_asset_id"):
        log(f"Downloading audio asset {config['audio_asset_id']}")
        download_asset(config["audio_asset_id"], audio_source)
    elif config.get("audio_path"):
        legacy = ROOT / config["audio_path"]
        if not legacy.exists():
            raise FileNotFoundError(str(legacy))
        shutil.copy2(legacy, audio_source)
    else:
        raise RuntimeError("No audio selected")

    snippet = work / "snippet.wav"
    cut_audio(audio_source, snippet, float(config.get("start", 0)))

    words = config.get("words") or []
    if not words:
        voice = prepare_voice(snippet, work)
        words = transcribe(voice)

    clip_paths: list[Path] = []
    for index, item in enumerate(config.get("video_assets", [])):
        name = item.get("name") or f"clip-{index:02d}.mp4"
        target = work / f"clip-{index:02d}-{Path(name).name}"
        log(f"Downloading video asset {item.get('id')} -> {target.name}")
        download_asset(item["id"], target)
        clip_paths.append(target)
    for index, path in enumerate(config.get("video_paths", [])):
        source = ROOT / path
        if source.exists():
            target = work / f"clip-legacy-{index:02d}-{source.name}"
            shutil.copy2(source, target)
            clip_paths.append(target)

    seed = int(config.get("seed", 1))
    cuts, marker_debug = build_cut_markers(snippet, words, seed, work)
    timeline = []
    if clip_paths:
        timeline = render_video(clip_paths, snippet, words, cuts, OUT_DIR / "contentready-brat-15s.mp4", seed, int(config.get("grain", 8)))

    analysis = {
        "job_id": JOB_ID,
        "duration": 15,
        "start": config.get("start", 0),
        "audio_name": audio_name,
        "words": words,
        "cut_markers": cuts,
        "candidate_markers_selected": marker_debug,
        "timeline": timeline,
        "note": "Cuts are selected from scored onset, energy, and lyric-boundary candidates. Source intervals longer than 1s are not reused unless the footage pool is insufficient.",
    }
    (OUT_DIR / "analysis.json").write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8")
    shutil.copy2(snippet, OUT_DIR / "snippet.wav")
    shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
