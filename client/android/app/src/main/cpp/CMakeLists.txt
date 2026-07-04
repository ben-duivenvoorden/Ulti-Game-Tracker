# whisper.cpp + the JNI shim for the UGT VoicePlugin.
#
# whisper.cpp is fetched at configure time, pinned to a release tag — bump
# deliberately, not transitively. CPU-only (no GPU delegate) keeps the build
# portable across every Android device; tiny-q5_1 runs above realtime on
# mid-range hardware, which is the tier the voice brief targets.

cmake_minimum_required(VERSION 3.22)
project(whisper_jni CXX)

include(FetchContent)

set(BUILD_SHARED_LIBS OFF)
set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)

FetchContent_Declare(
    whisper
    GIT_REPOSITORY https://github.com/ggml-org/whisper.cpp.git
    GIT_TAG        v1.8.7
    GIT_SHALLOW    TRUE
)
FetchContent_MakeAvailable(whisper)

add_library(whisper_jni SHARED whisper_jni.cpp)

target_link_libraries(whisper_jni
    whisper
    android
    log
)
