import subprocess
import sys
from pathlib import Path

import modal

APP_ROOT = "/root/contentready-render"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "ffmpeg",
        "libsndfile1",
        "fonts-dejavu-core",
        "libgl1",
        "git",
    )
    .pip_install_from_requirements("contentready-render/requirements-modal.txt")
    .add_local_dir("contentready-render", remote_path=APP_ROOT, copy=True)
    .env(
        {
            "WHISPER_MODEL": "small",
            "WHISPER_DEVICE": "cpu",
            "WHISPER_COMPUTE_TYPE": "int8",
            "OMP_NUM_THREADS": "2",
            "MKL_NUM_THREADS": "2",
        }
    )
)

modal_app = modal.App("contentready-brat")


def _run(command: list[str], cwd: Path | None = None) -> None:
    process = subprocess.run(
        command,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if process.returncode != 0:
        raise RuntimeError(process.stderr[-6000:])


with image.imports():
    sys.path.insert(0, APP_ROOT)
    import app as backend


def demucs_prepare_voice(source_wav: Path, destination_wav: Path) -> None:
    """Separate vocals from the selected 15-second snippet, then normalize for Whisper."""
    work = source_wav.parent
    output = work / "demucs-output"

    _run(
        [
            sys.executable,
            "-m",
            "demucs",
            "--two-stems",
            "vocals",
            "--name",
            "htdemucs",
            "--shifts",
            "1",
            "--segment",
            "15",
            "-o",
            str(output),
            str(source_wav),
        ],
        cwd=work,
    )

    vocals = output / "htdemucs" / source_wav.stem / "vocals.wav"
    if not vocals.exists():
        raise RuntimeError("Demucs did not produce vocals.wav")

    _run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(vocals),
            "-af",
            "highpass=f=90,lowpass=f=9000,dynaudnorm=f=120:g=8",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(destination_wav),
        ]
    )


backend.prepare_voice = demucs_prepare_voice
backend.MODEL_NAME = "small"
backend.DEVICE = "cpu"
backend.COMPUTE_TYPE = "int8"
backend.app.title = "ContentReady BRAT — Modal"


@modal_app.function(
    image=image,
    cpu=2.0,
    memory=8192,
    timeout=900,
    scaledown_window=60,
    max_containers=1,
)
@modal.concurrent(max_inputs=1)
@modal.asgi_app()
def web():
    return backend.app
