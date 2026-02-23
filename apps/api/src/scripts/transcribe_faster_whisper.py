import json
import os
import sys


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: transcribe_faster_whisper.py <audio_file>"}))
        return 2

    audio_file = sys.argv[1]
    if not os.path.exists(audio_file):
        print(json.dumps({"error": f"Audio file not found: {audio_file}"}))
        return 2

    model_name = os.getenv("FASTER_WHISPER_MODEL", "base")
    device = os.getenv("FASTER_WHISPER_DEVICE", "cpu")
    compute_type = os.getenv("FASTER_WHISPER_COMPUTE_TYPE", "int8")
    language = os.getenv("FASTER_WHISPER_LANGUAGE", "es")
    beam_size = int(os.getenv("FASTER_WHISPER_BEAM_SIZE", "1"))

    try:
        from faster_whisper import WhisperModel
    except Exception as exc:
        print(json.dumps({"error": f"faster-whisper import failed: {exc}"}))
        return 3

    try:
        # Load model on demand; first run may download weights.
        model = WhisperModel(model_name, device=device, compute_type=compute_type)
        segments, info = model.transcribe(
            audio_file,
            language=language or None,
            beam_size=beam_size,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        text = " ".join((seg.text or "").strip() for seg in segments).strip()
        payload = {
            "text": text,
            "language": getattr(info, "language", None),
            "duration": getattr(info, "duration", None),
        }
        print(json.dumps(payload, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({"error": f"faster-whisper transcribe failed: {exc}"}))
        return 4


if __name__ == "__main__":
    sys.exit(main())
