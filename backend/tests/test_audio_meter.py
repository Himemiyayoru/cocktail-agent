import io
import sys
import unittest
import wave
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
from audio_meter import prepare_audio

class AudioMeterTests(unittest.TestCase):
    def pcm(self, seconds):
        target = io.BytesIO()
        with wave.open(target, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(16000)
            wav.writeframes(bytes(int(seconds * 16000) * 2))
        return target.getvalue()

    def test_duration_is_measured_from_decoded_samples(self):
        audio, seconds = prepare_audio(self.pcm(1.25))
        self.assertEqual(seconds, 1.25)
        with wave.open(io.BytesIO(audio)) as wav:
            self.assertEqual(wav.getnframes(), 20000)

    def test_invalid_and_overlong_audio_are_rejected(self):
        for payload in (b"invalid", self.pcm(121), self.pcm(0)):
            with self.assertRaises(ValueError):
                prepare_audio(payload)
