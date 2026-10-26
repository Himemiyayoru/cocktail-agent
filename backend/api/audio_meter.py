"""Decode bounded audio locally and send only metered PCM to the provider."""
import io
import wave


def prepare_audio(payload):
    import av
    frames = []
    samples = 0
    rate = 16000
    try:
        with av.open(io.BytesIO(payload)) as source:
            resampler = av.AudioResampler(format="s16", layout="mono", rate=rate)
            for decoded in source.decode(audio=0):
                for frame in resampler.resample(decoded):
                    samples += frame.samples
                    if samples > rate * 120:
                        raise ValueError("Voice messages must be no longer than 2 minutes.")
                    frames.append(bytes(frame.planes[0])[:frame.samples * 2])
            for frame in resampler.resample(None):
                samples += frame.samples
                frames.append(bytes(frame.planes[0])[:frame.samples * 2])
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("This recording could not be read. Please record it again.") from exc
    if not 0 < samples <= rate * 120:
        raise ValueError("Voice messages must be between 0 and 120 seconds.")
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(b"".join(frames))
    return output.getvalue(), samples / rate
