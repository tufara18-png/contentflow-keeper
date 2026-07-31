import json
import math
import os
import random
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import List

import imageio_ffmpeg
import librosa
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from faster_whisper import WhisperModel
from starlette.requests import Request

APP_DIR = Path(__file__).parent
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
MODEL_NAME = os.getenv("WHISPER_MODEL", "small")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")

app = FastAPI(title="ContentReady BRAT Render")
app.mount("/static", StaticFiles(directory=APP_DIR / "static"), name="static")
templates = Jinja2Templates(directory=APP_DIR / "templates")
_whisper_model = None


def run(cmd: List[str], cwd: Path | None = None) -> None:
    proc = subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-5000:])


def get_model() -> WhisperModel:
    global _whisper_model
    if _whisper_model is None:
        _whisper_model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)
    return _whisper_model


def cut_audio(src: Path, dst: Path, start: float, duration: float = 15.0) -> None:
    run([
        FFMPEG, "-y", "-ss", f"{max(0, start):.3f}", "-i", str(src),
        "-t", f"{duration:.3f}", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(dst)
    ])


def separate_vocals(src_wav: Path, work: Path) -> Path:
    out_dir = work / "demucs"
    run([
        "python", "-m", "demucs", "--two-stems", "vocals", "--name", "htdemucs",
        "-o", str(out_dir), str(src_wav)
    ], cwd=work)
    candidate = out_dir / "htdemucs" / src_wav.stem / "vocals.wav"
    if not candidate.exists():
        raise RuntimeError("Demucs did not produce vocals.wav")
    return candidate


def transcribe_words(vocals: Path) -> list[dict]:
    model = get_model()
    segments, _ = model.transcribe(
        str(vocals), beam_size=5, language=None, vad_filter=True,
        word_timestamps=True, condition_on_previous_text=False,
    )
    words = []
    line_idx = 0
    line_word_count = 0
    for segment in segments:
        if not segment.words:
            continue
        for w in segment.words:
            token = (w.word or "").strip()
            if not token:
                continue
            start = max(0.0, min(15.0, float(w.start or 0.0)))
            end = max(start + 0.05, min(15.0, float(w.end or start + 0.2)))
            if start >= 15.0:
                continue
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
    y, sr = librosa.load(snippet, sr=22050, mono=True)
    _, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    times = librosa.frames_to_time(beat_frames, sr=sr)
    beats = [round(float(t), 3) for t in times if 0.1 < t < 14.95]
    if len(beats) < 4:
        beats = [round(x, 3) for x in np.arange(0.75, 15.0, 0.75)]
    return beats


def ffprobe_duration(path: Path) -> float:
    probe = FFMPEG.replace("ffmpeg", "ffprobe")
    if not Path(probe).exists():
        return 60.0
    proc = subprocess.run([
        probe, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)
    ], capture_output=True, text=True)
    try:
        return float(proc.stdout.strip())
    except Exception:
        return 60.0


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
    for w in words:
        grouped.setdefault(int(w.get("line_idx", 0)), []).append(w)
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
    for pos, lid in enumerate(line_ids):
        line_words = sorted(grouped[lid], key=lambda x: float(x.get("time", 0)))
        next_line_start = 15.0
        if pos + 1 < len(line_ids):
            next_line_start = min(float(w.get("time", 15.0)) for w in grouped[line_ids[pos + 1]])
        cumulative = []
        for idx, w in enumerate(line_words):
            cumulative.append(str(w.get("word", "")).strip())
            start = float(w.get("time", 0.0))
            if idx + 1 < len(line_words):
                end = float(line_words[idx + 1].get("time", next_line_start))
            else:
                end = max(float(w.get("end", next_line_start)), next_line_start)
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
    last_idx = -1
    for i in range(len(cut_points) - 1):
        dur = cut_points[i + 1] - cut_points[i]
        if dur < 0.08:
            continue
        choices = list(range(len(clips)))
        if len(choices) > 1 and last_idx in choices:
            choices.remove(last_idx)
        idx = rng.choice(choices)
        last_idx = idx
        clip = clips[idx]
        clip_dur = ffprobe_duration(clip)
        start = 0.0 if clip_dur <= dur + 0.1 else rng.uniform(0, max(0.0, clip_dur - dur - 0.05))
        seg = work / f"seg_{len(segments):03d}.mp4"
        vf = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,fps=30"
        run([
            FFMPEG, "-y", "-ss", f"{start:.3f}", "-i", str(clip), "-t", f"{dur:.3f}",
            "-an", "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", str(seg)
        ])
        segments.append(seg)
    concat_list = work / "concat.txt"
    concat_list.write_text("\n".join([f"file '{p.as_posix()}'" for p in segments]), encoding="utf-8")
    base = work / "base.mp4"
    run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list), "-c", "copy", str(base)])
    ass = work / "captions.ass"
    build_ass(words, ass)
    noise = max(0, min(30, int(grain)))
    vf = f"subtitles={ass.as_posix()}:fontsdir=/usr/share/fonts/truetype/dejavu,noise=alls={noise}:allf=t+u"
    run([
        FFMPEG, "-y", "-i", str(base), "-i", str(audio_wav), "-t", "15",
        "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(out)
    ])


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL_NAME}


@app.post("/api/analyze")
async def analyze(audio: UploadFile = File(...), start: float = Form(0.0)):
    suffix = Path(audio.filename or "audio.wav").suffix or ".wav"
    with tempfile.TemporaryDirectory() as td:
        work = Path(td)
        src = work / f"source{suffix}"
        src.write_bytes(await audio.read())
        snippet = work / "snippet.wav"
        try:
            cut_audio(src, snippet, start, 15.0)
            vocals = separate_vocals(snippet, work)
            words = transcribe_words(vocals)
            beats = detect_beats(snippet)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        return {"duration": 15, "start": start, "words": words, "beats": beats}


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
    job_id = uuid.uuid4().hex
    out_dir = Path(tempfile.gettempdir()) / "cr_outputs"
    out_dir.mkdir(exist_ok=True)
    final_path = out_dir / f"{job_id}.mp4"
    with tempfile.TemporaryDirectory() as td:
        work = Path(td)
        audio_src = work / (audio.filename or "audio.wav")
        audio_src.write_bytes(await audio.read())
        snippet = work / "snippet.wav"
        cut_audio(audio_src, snippet, start, 15.0)
        clip_paths = []
        for i, clip in enumerate(clips):
            p = work / f"clip_{i:03d}{Path(clip.filename or '.mp4').suffix or '.mp4'}"
            p.write_bytes(await clip.read())
            clip_paths.append(p)
        try:
            words = json.loads(words_json)
            beats = json.loads(beats_json)
            make_video(clip_paths, snippet, words, beats, final_path, seed, grain)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
    return FileResponse(final_path, media_type="video/mp4", filename="contentready-brat-15s.mp4")
