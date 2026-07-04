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
 * Capture: 16 kHz mono float PCM via AudioRecord, accumulated while the
 * scorer holds the button (points are short; a 60 s hold is ~3.8 MB).
 * Transcription: whisper.cpp (quantized tiny by default) via WhisperBridge,
 * biased with an initial_prompt of roster names + aliases from the TS side.
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

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private final AtomicBoolean capturing = new AtomicBoolean(false);
    private AudioRecord recorder;
    private Thread captureThread;
    private final List<float[]> chunks = new ArrayList<>();
    private String biasPrompt = "";

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
        synchronized (chunks) { chunks.clear(); }
        recorder.startRecording();
        captureThread = new Thread(() -> {
            float[] buf = new float[SAMPLE_RATE / 10]; // 100 ms reads
            while (capturing.get()) {
                int n = recorder.read(buf, 0, buf.length, AudioRecord.READ_BLOCKING);
                if (n > 0) {
                    float[] copy = new float[n];
                    System.arraycopy(buf, 0, copy, 0, n);
                    synchronized (chunks) { chunks.add(copy); }
                }
            }
        }, "voice-capture");
        captureThread.start();
        call.resolve();
    }

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
        synchronized (chunks) {
            int total = 0;
            for (float[] c : chunks) total += c.length;
            float[] pcm = new float[total];
            int off = 0;
            for (float[] c : chunks) {
                System.arraycopy(c, 0, pcm, off, c.length);
                off += c.length;
            }
            chunks.clear();
            return pcm;
        }
    }

    @PluginMethod
    public void stopCapture(PluginCall call) {
        if (!capturing.get()) {
            call.reject("No capture in progress");
            return;
        }
        final float[] pcm = drainCapture();
        final String bias = biasPrompt;
        executor.execute(() -> {
            try {
                if (whisperCtx == 0) {
                    File f = modelFile();
                    if (!f.exists() || f.length() < MODEL_MIN_BYTES) {
                        call.reject("Voice model not downloaded");
                        return;
                    }
                    whisperCtx = WhisperBridge.init(f.getAbsolutePath());
                    if (whisperCtx == 0) {
                        call.reject("Could not load voice model");
                        return;
                    }
                }
                int threads = Math.max(2, Math.min(6, Runtime.getRuntime().availableProcessors() - 2));
                String json = WhisperBridge.transcribe(whisperCtx, pcm, bias, threads);
                if (json == null) {
                    call.reject("Transcription failed");
                    return;
                }
                JSONObject parsed = new JSONObject(json);
                JSObject out = new JSObject();
                out.put("transcript", parsed.optString("transcript", ""));
                out.put("tokens", parsed.optJSONArray("tokens") != null
                    ? parsed.getJSONArray("tokens") : new JSONArray());
                call.resolve(out);
            } catch (Exception e) {
                call.reject("Transcription failed: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void cancelCapture(PluginCall call) {
        if (capturing.get()) drainCapture();
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
