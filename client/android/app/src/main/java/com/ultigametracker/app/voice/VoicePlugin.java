package com.ultigametracker.app.voice;

import android.Manifest;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Push-to-talk capture + on-device whisper.cpp transcription. The frozen
 * plugin shape lives in client/src/core/voice/plugin.ts — keep them in sync.
 *
 * Capture: 16 kHz mono float PCM via AudioRecord while the scorer holds the
 * button. Long holds are segmented on natural pauses (energy-based silence
 * detection): each closed segment transcribes on the background executor
 * WHILE capture keeps rolling, and fires a `partialTranscript` event so the
 * UI can show the narration assembling live. Release transcribes the tail
 * and resolves with the full stitched transcript — a hold with no pauses
 * degrades gracefully to the old single-shot behaviour.
 * Transcription: whisper.cpp (quantized tiny by default) via WhisperBridge,
 * biased with an initial_prompt of roster names + aliases from the TS side
 * (per-segment, plus the previous segment's text for continuity).
 * Model: lazy first-run download from Hugging Face into filesDir/models.
 */
@CapacitorPlugin(
    name = "Voice",
    permissions = @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = VoicePlugin.MIC_ALIAS)
)
public class VoicePlugin extends Plugin {

    static final String MIC_ALIAS = "microphone";

    private static final int SAMPLE_RATE = 16000;
    private static final String MODEL_FILE = "ggml-tiny-q5_1.bin";
    private static final String MODEL_URL =
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/" + MODEL_FILE;
    /** Anything smaller than this is a truncated download, not a model. */
    private static final long MODEL_MIN_BYTES = 10L * 1024 * 1024;

    // ── Pause segmentation ───────────────────────────────────────────────────
    // A segment closes when ≥ SILENCE_BUFFERS consecutive quiet 100 ms reads
    // follow some speech and the segment is at least MIN_SEGMENT_SAMPLES long
    // (or unconditionally at MAX_SEGMENT_SAMPLES). The RMS threshold is
    // deliberately conservative: a noisy sideline that never reads as quiet
    // simply produces no partials and falls back to one big transcription.
    private static final float SILENCE_RMS         = 0.015f;
    private static final int   SILENCE_BUFFERS     = 7;                     // × 100 ms
    private static final int   MIN_SEGMENT_SAMPLES = SAMPLE_RATE * 3 / 2;   // 1.5 s
    private static final int   MAX_SEGMENT_SAMPLES = SAMPLE_RATE * 15;      // 15 s
    /** whisper dislikes sub-second clips — zero-pad anything shorter. */
    private static final int   MIN_DECODE_SAMPLES  = SAMPLE_RATE * 12 / 10; // 1.2 s

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private final AtomicBoolean capturing = new AtomicBoolean(false);
    private AudioRecord recorder;
    private Thread captureThread;
    private String biasPrompt = "";

    /** Transcribed segment texts for the current capture, in order. */
    private final List<String> segmentTexts = new ArrayList<>();
    /** Tail PCM handed from the capture thread to stopCapture at exit. */
    private volatile float[] tailPcm = null;
    /** Bumped on start/cancel so stale in-flight segment jobs drop out. */
    private final java.util.concurrent.atomic.AtomicInteger captureGen =
        new java.util.concurrent.atomic.AtomicInteger(0);

    private long whisperCtx = 0;

    private File modelFile() {
        File dir = new File(getContext().getFilesDir(), "models");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, MODEL_FILE);
    }

    // ── isModelReady ─────────────────────────────────────────────────────────

    @PluginMethod
    public void isModelReady(PluginCall call) {
        File f = modelFile();
        boolean ready = f.exists() && f.length() > MODEL_MIN_BYTES;
        JSObject out = new JSObject();
        out.put("ready", ready);
        out.put("sizeMb", ready ? f.length() / (1024.0 * 1024.0) : 0);
        call.resolve(out);
    }

    // ── downloadModel ────────────────────────────────────────────────────────

    @PluginMethod
    public void downloadModel(PluginCall call) {
        executor.execute(() -> {
            File target = modelFile();
            File part = new File(target.getAbsolutePath() + ".part");
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(MODEL_URL).openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.connect();
                long total = conn.getContentLengthLong();
                try (InputStream in = new BufferedInputStream(conn.getInputStream());
                     FileOutputStream out = new FileOutputStream(part)) {
                    byte[] buf = new byte[64 * 1024];
                    long done = 0;
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        done += n;
                        if (total > 0) {
                            JSObject progress = new JSObject();
                            progress.put("progress", (double) done / total);
                            notifyListeners("downloadProgress", progress);
                        }
                    }
                }
                if (part.length() < MODEL_MIN_BYTES) {
                    part.delete();
                    call.reject("Model download truncated");
                    return;
                }
                if (!part.renameTo(target)) {
                    call.reject("Could not move model into place");
                    return;
                }
                call.resolve();
            } catch (Exception e) {
                part.delete();
                call.reject("Model download failed: " + e.getMessage());
            }
        });
    }

    // ── startCapture / stopCapture / cancelCapture ──────────────────────────

    @PluginMethod
    public void startCapture(PluginCall call) {
        if (getPermissionState(MIC_ALIAS) != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias(MIC_ALIAS, call, "micPermissionCallback");
            return;
        }
        beginCapture(call);
    }

    @PermissionCallback
    private void micPermissionCallback(PluginCall call) {
        if (getPermissionState(MIC_ALIAS) == com.getcapacitor.PermissionState.GRANTED) {
            beginCapture(call);
        } else {
            call.reject("Microphone permission denied");
        }
    }

    @SuppressWarnings("MissingPermission") // guarded by getPermissionState above
    private void beginCapture(PluginCall call) {
        if (!capturing.compareAndSet(false, true)) {
            call.reject("Capture already in progress");
            return;
        }
        biasPrompt = call.getString("bias", "");
        int minBuf = AudioRecord.getMinBufferSize(
            SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_FLOAT);
        try {
            recorder = new AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_FLOAT,
                Math.max(minBuf, SAMPLE_RATE)); // ≥1 s of head-room
        } catch (IllegalArgumentException e) {
            capturing.set(false);
            call.reject("AudioRecord init failed: " + e.getMessage());
            return;
        }
        synchronized (segmentTexts) { segmentTexts.clear(); }
        tailPcm = null;
        final int gen = captureGen.incrementAndGet();
        recorder.startRecording();
        captureThread = new Thread(() -> {
            float[] buf = new float[SAMPLE_RATE / 10]; // 100 ms reads
            List<float[]> seg = new ArrayList<>();
            int segSamples = 0;
            boolean segHasSpeech = false;
            int quietRun = 0;
            while (capturing.get()) {
                int n = recorder.read(buf, 0, buf.length, AudioRecord.READ_BLOCKING);
                if (n <= 0) continue;
                float[] copy = new float[n];
                System.arraycopy(buf, 0, copy, 0, n);
                seg.add(copy);
                segSamples += n;
                double sum = 0;
                for (float v : copy) sum += v * v;
                boolean quiet = Math.sqrt(sum / n) < SILENCE_RMS;
                if (quiet) quietRun++; else { quietRun = 0; segHasSpeech = true; }
                boolean pauseClose = segHasSpeech && quietRun >= SILENCE_BUFFERS && segSamples >= MIN_SEGMENT_SAMPLES;
                boolean forceClose = segSamples >= MAX_SEGMENT_SAMPLES;
                if (pauseClose || forceClose) {
                    final float[] pcm = concatPcm(seg, segSamples);
                    seg = new ArrayList<>();
                    segSamples = 0;
                    segHasSpeech = false;
                    quietRun = 0;
                    executor.execute(() -> transcribeSegment(pcm, gen, true));
                }
            }
            tailPcm = concatPcm(seg, segSamples);
        }, "voice-capture");
        captureThread.start();
        call.resolve();
    }

    private static float[] concatPcm(List<float[]> parts, int total) {
        float[] pcm = new float[total];
        int off = 0;
        for (float[] c : parts) {
            System.arraycopy(c, 0, pcm, off, c.length);
            off += c.length;
        }
        return pcm;
    }

    /** Stop the recorder + capture thread; returns the unfinished tail PCM. */
    private float[] drainCapture() {
        capturing.set(false);
        if (captureThread != null) {
            try { captureThread.join(500); } catch (InterruptedException ignored) {}
            captureThread = null;
        }
        if (recorder != null) {
            try { recorder.stop(); } catch (IllegalStateException ignored) {}
            recorder.release();
            recorder = null;
        }
        float[] tail = tailPcm;
        tailPcm = null;
        return tail != null ? tail : new float[0];
    }

    /** Lazy whisper context init — executor thread only. */
    private boolean ensureCtx() {
        if (whisperCtx != 0) return true;
        File f = modelFile();
        if (!f.exists() || f.length() < MODEL_MIN_BYTES) return false;
        whisperCtx = WhisperBridge.init(f.getAbsolutePath());
        return whisperCtx != 0;
    }

    /** Transcribe one closed segment (executor thread). Appends the text,
     *  and — for mid-capture segments — fires a partialTranscript event.
     *  Stale generations (cancelled / restarted captures) are dropped. */
    private void transcribeSegment(float[] pcmIn, int gen, boolean notify) {
        if (gen != captureGen.get()) return;
        if (pcmIn.length < SAMPLE_RATE / 4) return; // < 0.25 s — nothing there
        float[] pcm = pcmIn;
        if (pcm.length < MIN_DECODE_SAMPLES) {
            pcm = new float[MIN_DECODE_SAMPLES];    // zero-pad: whisper dislikes sub-second clips
            System.arraycopy(pcmIn, 0, pcm, 0, pcmIn.length);
        }
        try {
            if (!ensureCtx()) return;
            String prev;
            synchronized (segmentTexts) {
                prev = segmentTexts.isEmpty() ? "" : segmentTexts.get(segmentTexts.size() - 1);
            }
            String bias = prev.isEmpty() ? biasPrompt : biasPrompt + ". " + prev;
            int threads = Math.max(2, Math.min(6, Runtime.getRuntime().availableProcessors() - 2));
            String json = WhisperBridge.transcribe(whisperCtx, pcm, bias, threads);
            if (json == null) return;
            String text = new JSONObject(json).optString("transcript", "").trim();
            if (text.isEmpty()) return;
            if (gen != captureGen.get()) return;
            String aggregate;
            int seq;
            synchronized (segmentTexts) {
                segmentTexts.add(text);
                seq = segmentTexts.size() - 1;
                aggregate = joinedTranscript();
            }
            if (notify) {
                JSObject ev = new JSObject();
                ev.put("seq", seq);
                ev.put("transcript", text);
                ev.put("aggregate", aggregate);
                notifyListeners("partialTranscript", ev);
            }
        } catch (Exception ignored) {
            // A failed segment loses its words but never the capture.
        }
    }

    /** Call while holding segmentTexts' lock or from the executor thread. */
    private String joinedTranscript() {
        StringBuilder sb = new StringBuilder();
        for (String t : segmentTexts) {
            if (sb.length() > 0) sb.append(' ');
            sb.append(t);
        }
        return sb.toString();
    }

    @PluginMethod
    public void stopCapture(PluginCall call) {
        if (!capturing.get()) {
            call.reject("No capture in progress");
            return;
        }
        final int gen = captureGen.get();
        final float[] tail = drainCapture();
        // The single-threaded executor keeps ordering: any in-flight segment
        // jobs run first, then the tail, then the assembly that resolves.
        executor.execute(() -> transcribeSegment(tail, gen, false));
        executor.execute(() -> {
            if (gen != captureGen.get()) {
                call.reject("Capture was cancelled");
                return;
            }
            String full;
            synchronized (segmentTexts) { full = joinedTranscript(); }
            if (full.isEmpty() && !ensureCtx()) {
                call.reject("Voice model not downloaded");
                return;
            }
            JSObject out = new JSObject();
            out.put("transcript", full);
            out.put("tokens", new JSONArray());
            call.resolve(out);
        });
    }

    @PluginMethod
    public void cancelCapture(PluginCall call) {
        captureGen.incrementAndGet(); // stale segment jobs drop their output
        if (capturing.get()) drainCapture();
        synchronized (segmentTexts) { segmentTexts.clear(); }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (capturing.get()) drainCapture();
        if (whisperCtx != 0) {
            WhisperBridge.free(whisperCtx);
            whisperCtx = 0;
        }
        executor.shutdown();
        super.handleOnDestroy();
    }
}
