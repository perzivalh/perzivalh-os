import os
import sys


def main():
    pydeps = "apps/api/.pydeps"
    if pydeps not in sys.path:
        sys.path.insert(0, pydeps)

    extra = os.getenv("FASTER_WHISPER_PYDEPS_PATH", "").strip()
    if extra and extra not in sys.path:
        sys.path.insert(0, extra)

    import faster_whisper  # noqa: F401

    print("faster_whisper import OK")


if __name__ == "__main__":
    main()
