// 음성인식(Whisper base)을 따로 돌리는 일꾼. 모델은 처음 한 번 약 80MB를 받고 브라우저에 보관된다
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';

let asr = null;
self.onmessage = async ({ data }) => {
  try {
    if (!asr) {
      const got = {};
      asr = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base_timestamped', {
        dtype: 'q8', device: 'wasm',
        progress_callback: p => { if (p.status === 'progress' && p.total) { got[p.file] = [p.loaded, p.total]; const v = Object.values(got); self.postMessage({ type: 'load', loaded: v.reduce((s, x) => s + x[0], 0), total: v.reduce((s, x) => s + x[1], 0) }); } },
      });
    }
    self.postMessage({ type: 'run' });
    const out = await asr(data.audio, { language: data.lang, task: 'transcribe', return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 });
    self.postMessage({ type: 'done', words: out.chunks || [], text: out.text || '' });
  } catch (e) { self.postMessage({ type: 'error', msg: e?.message || String(e) }); }
};
