package appfiles

import (
	"path/filepath"
)

// Directory and file names inside the Linetime folder. These mirror what
// linetime_fetch downloads and renames, so both tools agree by construction.
const (
	LinetimeModelsDirName    = "sounddetect_models"
	LinetimeWhisperCliDir    = "whisper_cli"
	LinetimeGPULibDirName    = "lib_gpu"
	LinetimeTokenizerName    = "mms_multilingual_tokenizer.json"
	LinetimeModelStandard    = "mms_fa.onnx"
	LinetimeModelStandardDta = "mms_fa.onnx.data"
	LinetimeModelFast        = "mms_fa_uint8.onnx"
	LinetimeWhisperFP16      = "ggml-large-v3.bin"
	LinetimeWhisperQ5        = "ggml-large-v3-q5_0.bin"
)

// LinetimeBinaryName is the destination name for the downloaded aligner. It is
// deliberately not derived from the release asset name: doing that produced a
// "linetime-windows-x64.exe_cpu" on Windows, which nothing looks for.
func LinetimeBinaryName(useGPU bool) string {
	name := "sounddetect_cpu"
	if useGPU {
		name = "sounddetect_gpu"
	}
	return name + execSuffix()
}

func LinetimeWhisperCliExecName() string {
	return "whisper-cli" + execSuffix()
}

func LinetimeModelPath(folder, name string) string {
	return filepath.Join(folder, LinetimeModelsDirName, name)
}

func LinetimeTokenizerPath(folder string) string {
	return LinetimeModelPath(folder, LinetimeTokenizerName)
}

func LinetimeFfmpegPath(folder string) string {
	return filepath.Join(folder, LinetimeFfmpegName())
}

func LinetimeGPULibPath(folder string) string {
	return filepath.Join(folder, LinetimeGPULibDirName)
}

func LinetimeWhisperCliPath(folder string) string {
	return filepath.Join(folder, LinetimeWhisperCliDir, LinetimeWhisperCliExecName())
}

// WhisperModelName maps a whisper variant id to its model filename. Returns "" for
// an unknown id. whisper.cpp publishes large-v3 in fp16 and q5_0 only, so there
// is no q8_0 and asking for one is a hard error rather than a missing file.
func WhisperModelName(variant string) string {
	if variant == "standard" {
		return LinetimeWhisperFP16
	}
	if variant == "whisper-q5" {
		return LinetimeWhisperQ5
	}
	return ""
}

// LinetimeComponents is the expected Linetime inventory with resolved paths.
// binary_check turns this into a report. Ordering matches the settings tables.
func LinetimeComponents(folder string) []Component {
	cpu := NewComponent("cpu", "binary", "CPU", map[string]string{
		"binary": filepath.Join(folder, LinetimeBinaryName(false)),
		"ffmpeg": LinetimeFfmpegPath(folder),
	})

	gpu := NewComponent("gpu", "binary", "GPU (CUDA 12)", map[string]string{
		"binary": filepath.Join(folder, LinetimeBinaryName(true)),
		"lib":    LinetimeGPULibPath(folder),
	})
	gpu.Optional = true
	gpu.Unsupported = !GPUSupported()

	tokenizer := NewComponent("tokenizer", "model", "Tokenizer (required)", map[string]string{
		"tokenizer": LinetimeTokenizerPath(folder),
	})

	// The ONNX graph references its external weights by name, so the pair only
	// loads together.
	standard := NewComponent("standard", "model", "Standard (FP32)", map[string]string{
		"model": LinetimeModelPath(folder, LinetimeModelStandard),
		"data":  LinetimeModelPath(folder, LinetimeModelStandardDta),
	})

	fast := NewComponent("fast", "model", "Fast (UINT8)", map[string]string{
		"model": LinetimeModelPath(folder, LinetimeModelFast),
	})

	whisperFP16 := NewComponent("whisper-standard", "whisper", "Standard (fp16)", map[string]string{
		"model": LinetimeModelPath(folder, LinetimeWhisperFP16),
	})
	whisperFP16.Optional = true

	whisperQ5 := NewComponent("whisper-q5", "whisper", "Balanced (q5_0)", map[string]string{
		"model": LinetimeModelPath(folder, LinetimeWhisperQ5),
	})
	whisperQ5.Optional = true

	cli := NewComponent("whisper-cli", "cli", "Whisper CLI", map[string]string{
		"cli": LinetimeWhisperCliPath(folder),
	})
	cli.Optional = true
	cli.Unsupported = !WhisperCliSupported()

	return []Component{cpu, gpu, tokenizer, standard, fast, whisperFP16, whisperQ5, cli}
}
