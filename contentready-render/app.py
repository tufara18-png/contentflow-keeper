import gc
import json
import math
import os
import random
import re
import subprocess
import tempfile
import threading
import uuid
import wave
from pathlib import Path
from typing import List

import imageio_ffmpeg
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from faster_whisper import WhisperModel
from starlette.requests import Request

APP_DIR = Path(__file__).parent
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
MODEL_NAME = os.getenv("WHISPER_MODEL", "tiny")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")

app = FastAPI(title="ContentReady BRAT Render Starter")
app.mount("/static", StaticFiles(directory=APP_DIR / "static"), name="static")
templates = Jinja2Templates(directory=APP_DIR / "templates")
_whisper_model = None
_model_lock = threading.Lock()
_job_lock = threading.Lock()


def run(cmd: List[str], cwd: Path | None = None) -> None:
    proc = subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-5000:])


def get_model() -> WhisperModel:
    global _whisper_model
    with _model_lock:
        if _whisper_model is None:
            _whisper_model = WhisperModel(
                MODEL_NAME,
                device=DEVICE,
                compute_type=COMPUTE_TYPE,
                cpu_threads=2,
                num_workers=1,
            )
    return _whisper_model


def cut_audio(src: Path, dst: Path, start: float, duration: float = 15.0) -> None:
    run([
        FFMPEG, "-y", "-ss", f"{max(0, start):.3f}", "-i", str(src),
        "-t", f"{duration:.3f}", "-ac", "2", "-ar", "44100",
        "-c:a", "pcm_s16le", str(dst),
    ])


def prepare_voice(src_wav: Path, dst: Path) -> None:
    # Lightweight vocal enhancement that fits Render Starter memory.
    filters = (
        "pan=mono|c0=0.5*c0+0.5*c1,"
        "highpass=f=120,lowpass=f=8000,"
        "afftdn=nf=-22,acompressor=threshold=-18dB:ratio=3:attack=5:release=80,"
        "dynaudnorm=f=120:g=12"
    )
    run([
        FFMPEG, "-y", "-i", str(src_wav), "-af", filters,
        "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(dst),
    ])


def transcribe_words(voice: Path) -> list[dict]:
    model = get_model()
    segments, _ = model.transcribe(
        str(voice),
        beam_size=1,
        best_of=1,
        temperature=0,
        vad_filter=False,
        word_timestamps=True,
        condition_on_previous_text=False,
        multilingual=True,
    )
    ignored = {"[music]", "[musica]", "[instrumental]", "music", "musica"}
    words = []
    line_idx = 0
    line_word_count = 0
    for segment in segments:
        for item in segment.words or []:
            token = (item.word or "").strip()
            if not token or token.lower() in ignored:
                continue
            start = float(item.start or 0.0)
            end = float(item.end or start + 0.2)
            if start < 0 or start >= 15:
                continue
            end = min(15.0, max(start + 0.05, end))
            words.append({
                "word": token,
                "time": round(start, 3),
                "end": round(end, 3),
                "line_idx": line_idx,
                "word_idx": line_word_count,
            })
            line_word_count += 1
            if line_word_count >= 5 or token.endswith((".", "!", "?", ",")):
                line_idx += 1
                line_word_count = 0
    return words


def detect_beats(snippet: Path) -> list[float]:
    mono = snippet.parent / "beat-mono.wav"
    run([
        FFMPEG, "-y", "-i", str(snippet), "-ac", "1", "-ar", "16000",
        "-c:a", "pcm_s16le", str(mono),
    ])
    with wave.open(str(mono), "rb") as wav:
        sr = wav.getframerate()
        samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16).astype(np.float32)
    if samples.size < sr:
        return [round(x, 3) for x in np.arange(0.75, 15.0, 0.75)]
    samples /= 32768.0
    frame = max(1, int(sr * 0.025))
    usable = samples[: (len(samples) // frame) * frame]
    energy = np.sqrt(np.mean(usable.reshape(-1, frame) ** 2, axis=1) + 1e-9)
    novelty = np.maximum(0.0, np.diff(energy, prepend=energy[0]))
    kernel = np.ones(3, dtype=np.float32) / 3.0
    novelty = np.convolve(novelty, kernel, mode="same")
    threshold = float(np.percentile(novelty, 78))
    candidates = np.where(novelty >= threshold)[0]
    ranked = sorted(candidates, key=lambda i: novelty[i], reverse=True)
    selected = []
    min_gap_frames = int(0.28 / 0.025)
    for idx in ranked:
        if all(abs(idx - other) >= min_gap_frames for other in selected):
            selected.append(int(idx))
        if len(selected) >= 24:
            break
    beats = sorted(round(i * 0.025, 3) for i in selected if 0.15 < i * 0.025 < 14.9)
    if len(beats) < 6:
        beats = [round(x, 3) for x in np.arange(0.75, 15.0, 0.75)]
    return beats


def media_duration(path: Path) -> float:
    proc = subprocess.run([FFMPEG, "-i", str(path)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", proc.stderr)
    if not match:
        return 15.0
    return int(match.group(1)) * 3600 + int(match.group(2)) * 60 + float(match.group(3))


def escape_ass(text: str) -> str:
    return text.replace("\\", r"\\").replace("{", r"\{").replace("}", r"\}").replace("\n", " ")


def ass_time(sec: float) -> str:
    sec = max(0.0, min(15.0, sec))
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    cs = int(round((sec - math.floor(sec)) * 100))
    if cs >= 100:
        s += 1
        cs = 0
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def build_ass(words: list[dict], path: Path) -> None:
    grouped: dict[int, list[dict]] = {}
    for word in words:
        grouped.setdefault(int(word.get("line_idx", 0)), []).append(word)
    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: BRAT,DejaVu Sans Condensed,72,&H00FFFFFF,&H00FFFFFF,&H80000000,&H00000000,-1,0,0,0,88,100,0,0,1,2.2,1.4,5,90,90,300,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    line_ids = sorted(grouped)
    for position, line_id in enumerate(line_ids):
        line_words = sorted(grouped[line_id], key=lambda item: float(item.get("time", 0)))
        next_line_start = 15.0
        if position + 1 < len(line_ids):
            next_line_start = min(float(item.get("time", 15.0)) for item in grouped[line_ids[position + 1]])
        cumulative = []
        for index, word in enumerate(line_words):
            cumulative.append(str(word.get("word", "")).strip())
            start = float(word.get("time", 0.0))
            end = float(line_words[index + 1].get("time", next_line_start)) if index + 1 < len(line_words) else next_line_start
            end = min(15.0, max(start + 0.06, end))
            text = escape_ass(" ".join(cumulative).upper())
            events.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},BRAT,,0,0,0,,{{\\blur1.2}}{text}")
    path.write_text(header + "\n".join(events), encoding="utf-8")


def make_video(clips: list[Path], audio_wav: Path, words: list[dict], beats: list[float], out: Path, seed: int, grain: int) -> None:
    if not clips:
        raise RuntimeError("No video clips uploaded")
    work = out.parent
    rng = random.Random(seed)
    cut_points = [0.0] + sorted({float(x) for x in beats if 0.15 < float(x) < 14.9}) + [15.0]
    segments = []
    last_index = -1
    for start_at, end_at in zip(cut_points, cut_points[1:]):
        duration = end_at - start_at
        if duration < 0.08:
            continue
        choices = list(range(len(clips)))
        if len(choices) > 1 and last_index in choices:
            choices.remove(last_index)
        clip_index = rng.choice(choices)
        last_index = clip_index
        clip = clips[clip_index]
        clip_duration = media_duration(clip)
        source_start = 0.0 if clip_duration <= duration + 0.1 else rng.uniform(0, max(0.0, clip_duration - duration - 0.05))
        segment = work / f"seg_{len(segments):03d}.mp4"
        video_filter = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,fps=30"
        run([
            FFMPEG, "-y", "-ss", f"{source_start:.3f}", "-i", str(clip), "-t", f"{duration:.3f}",
            "-an", "-vf", video_filter, "-c:v", "libx264", "-preset", "ultrafast",
            "-crf", "22", "-pix_fmt", "yuv420p", str(segment),
        ])
        segments.append(segment)
    concat_file = work / "concat.txt"
    concat_file.write_text("\n".join(f"file '{item.as_posix()}'" for item in segments), encoding="utf-8")
    base = work / "base.mp4"
    run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(concat_file), "-c", "copy", str(base)])
    subtitles = work / "captions.ass"
    build_ass(words, subtitles)
    noise = max(0, min(20, int(grain)))
    video_filter = f"subtitles={subtitles.as_posix()}:fontsdir=/usr/share/fonts/truetype/dejavu,noise=alls={noise}:allf=t+u"
    run([
        FFMPEG, "-y", "-i", str(base), "-i", str(audio_wav), "-t", "15",
        "-vf", video_filter, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "21",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest",
        "-movflags", "+faststart", str(out),
    ])


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_NAME, "tier": "starter"}


@app.post("/api/analyze")
async def analyze(audio: UploadFile = File(...), start: float = Form(0.0)):
    if not _job_lock.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Une analyse est déjà en cours. Réessaie dans quelques secondes.")
    try:
        suffix = Path(audio.filename or "audio.wav").suffix or ".wav"
        with tempfile.TemporaryDirectory() as temp_dir:
            work = Path(temp_dir)
            source = work / f"source{suffix}"
            source.write_bytes(await audio.read())
            snippet = work / "snippet.wav"
            voice = work / "voice.wav"
            cut_audio(source, snippet, start, 15.0)
            prepare_voice(snippet, voice)
            words = transcribe_words(voice)
            beats = detect_beats(snippet)
            return {"duration": 15, "start": start, "words": words, "beats": beats}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        gc.collect()
        _job_lock.release()


@app.post("/api/render")
async def render(
    audio: UploadFile = File(...),
    clips: List[UploadFile] = File(...),
    start: float = Form(0.0),
    words_json: str = Form("[]"),
    beats_json: str = Form("[]"),
    seed: int = Form(1),
    grain: int = Form(8),
):
    if not _job_lock.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Un traitement est déjà en cours. Réessaie dans quelques secondes.")
    try:
        job_id = uuid.uuid4().hex
        output_dir = Path(tempfile.gettempdir()) / "cr_outputs"
        output_dir.mkdir(exist_ok=True)
        final_path = output_dir / f"{job_id}.mp4"
        with tempfile.TemporaryDirectory() as temp_dir:
            work = Path(temp_dir)
            audio_source = work / (audio.filename or "audio.wav")
            audio_source.write_bytes(await audio.read())
            snippet = work / "snippet.wav"
            cut_audio(audio_source, snippet, start, 15.0)
            clip_paths = []
            for index, clip in enumerate(clips):
                path = work / f"clip_{index:03d}{Path(clip.filename or '.mp4').suffix or '.mp4'}"
                path.write_bytes(await clip.read())
                clip_paths.append(path)
            words = json.loads(words_json)
            beats = json.loads(beats_json)
            make_video(clip_paths, snippet, words, beats, final_path, seed, grain)
        return FileResponse(final_path, media_type="video/mp4", filename="contentready-brat-15s.mp4")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        gc.collect()
        _job_lock.release()
