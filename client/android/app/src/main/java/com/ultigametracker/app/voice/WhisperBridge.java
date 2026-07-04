package com.ultigametracker.app.voice;

/**
 * Thin JNI surface over whisper.cpp (src/main/cpp/whisper_jni.cpp). App-agnostic:
 * PCM in, transcript JSON out — every UGT-specific decision lives in TS.
 *
 * The transcribe result is a JSON string
 *   {"transcript":"…","tokens":[{"word":"…","conf":0.93,"t0":0,"t1":320},…]}
 * so the JNI layer never builds complex jobjects.
 */
public final class WhisperBridge {

    static {
        System.loadLibrary("whisper_jni");
    }

    private WhisperBridge() {}

    /** Load a ggml model. Returns a native context handle, 0 on failure. */
    public static native long init(String modelPath);

    /** Release a context returned by {@link #init}. */
    public static native void free(long ctx);

    /**
     * Run full transcription over 16 kHz mono float PCM.
     *
     * @param biasPrompt initial_prompt text biasing the decode toward the
     *                   roster names/aliases (may be empty)
     * @return result JSON, or null on failure
     */
    public static native String transcribe(long ctx, float[] pcm, String biasPrompt, int nThreads);
}
