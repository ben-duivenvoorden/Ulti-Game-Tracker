// JNI wrapper over whisper.cpp for the UGT VoicePlugin. Deliberately dumb:
// PCM in, JSON out ({"transcript", "tokens":[{word, conf, t0, t1}]}) so the
// Java side never marshals complex objects across JNI.

#include <jni.h>
#include <android/log.h>

#include <string>
#include <vector>

#include "whisper.h"

#define TAG "whisper_jni"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

static std::string json_escape(const char *s) {
    std::string out;
    for (const char *p = s; *p; ++p) {
        const unsigned char c = (unsigned char) *p;
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:
                if (c < 0x20) {
                    char buf[8];
                    snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out += buf;
                } else {
                    out += (char) c;
                }
        }
    }
    return out;
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_ultigametracker_app_voice_WhisperBridge_init(JNIEnv *env, jclass, jstring modelPath) {
    const char *path = env->GetStringUTFChars(modelPath, nullptr);
    whisper_context_params cparams = whisper_context_default_params();
    cparams.use_gpu = false;
    whisper_context *ctx = whisper_init_from_file_with_params(path, cparams);
    if (ctx == nullptr) {
        LOGE("failed to load model at %s", path);
    } else {
        LOGI("model loaded: %s", path);
    }
    env->ReleaseStringUTFChars(modelPath, path);
    return reinterpret_cast<jlong>(ctx);
}

extern "C" JNIEXPORT void JNICALL
Java_com_ultigametracker_app_voice_WhisperBridge_free(JNIEnv *, jclass, jlong ctxPtr) {
    if (ctxPtr != 0) {
        whisper_free(reinterpret_cast<whisper_context *>(ctxPtr));
    }
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_ultigametracker_app_voice_WhisperBridge_transcribe(
        JNIEnv *env, jclass, jlong ctxPtr, jfloatArray pcm, jstring biasPrompt, jint nThreads) {
    auto *ctx = reinterpret_cast<whisper_context *>(ctxPtr);
    if (ctx == nullptr) return nullptr;

    const jsize n = env->GetArrayLength(pcm);
    if (n <= 0) return env->NewStringUTF("{\"transcript\":\"\",\"tokens\":[]}");
    std::vector<float> samples(n);
    env->GetFloatArrayRegion(pcm, 0, n, samples.data());

    const char *bias = env->GetStringUTFChars(biasPrompt, nullptr);

    whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.n_threads        = nThreads > 0 ? nThreads : 4;
    params.translate        = false;
    params.language         = "en";
    params.no_context       = true;
    params.single_segment   = false;
    params.print_progress   = false;
    params.print_realtime   = false;
    params.print_special    = false;
    params.token_timestamps = true;
    params.suppress_blank   = true;
    if (bias != nullptr && bias[0] != '\0') {
        params.initial_prompt = bias;
    }

    const int rc = whisper_full(ctx, params, samples.data(), (int) n);
    env->ReleaseStringUTFChars(biasPrompt, bias);
    if (rc != 0) {
        LOGE("whisper_full failed: %d", rc);
        return nullptr;
    }

    std::string transcript;
    std::string tokens = "[";
    bool firstTok = true;
    const int n_segments = whisper_full_n_segments(ctx);
    for (int i = 0; i < n_segments; ++i) {
        transcript += whisper_full_get_segment_text(ctx, i);
        const int n_tokens = whisper_full_n_tokens(ctx, i);
        for (int j = 0; j < n_tokens; ++j) {
            const whisper_token_data td = whisper_full_get_token_data(ctx, i, j);
            if (td.id >= whisper_token_eot(ctx)) continue; // skip specials
            const char *text = whisper_full_get_token_text(ctx, i, j);
            if (!firstTok) tokens += ",";
            firstTok = false;
            char buf[64];
            tokens += "{\"word\":\"" + json_escape(text) + "\"";
            snprintf(buf, sizeof(buf), ",\"conf\":%.4f", td.p);
            tokens += buf;
            // whisper timestamps are in 10 ms units → report milliseconds.
            snprintf(buf, sizeof(buf), ",\"t0\":%lld,\"t1\":%lld}",
                     (long long) td.t0 * 10, (long long) td.t1 * 10);
            tokens += buf;
        }
    }
    tokens += "]";

    std::string json = "{\"transcript\":\"" + json_escape(transcript.c_str())
                     + "\",\"tokens\":" + tokens + "}";
    return env->NewStringUTF(json.c_str());
}
