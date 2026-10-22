from faster_whisper import WhisperModel


def transcribe(audio_path: str, model_size: str = "large-v3-turbo") -> str:
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, _ = model.transcribe(audio_path, vad_filter=True)
    lines = []
    for segment in list(segments):
        start = f"{int(segment.start // 60):02d}:{segment.start % 60:05.2f}"
        end = f"{int(segment.end // 60):02d}:{segment.end % 60:05.2f}"
        lines.append(f"[{start} --> {end}] {segment.text.strip()}")
    return "\n".join(lines)
