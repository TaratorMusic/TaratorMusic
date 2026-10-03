package appfiles

import (
	"path/filepath"
	"runtime"
)

// Directory and file names inside the Linetime folder. These mirror what
// linetime_fetch downloads and renames, so both tools agree by construction.
const (
	LinetimeModelsDirName    = "sounddetect_models"
	LinetimeWhisperCliDir    = "whisper_cli"
	LinetimeGPULibDirName    = "lib_gpu"
	LinetimeWhisperCliGPUDir = "whisper_cli_gpu"
	LinetimeTokenizerName    = "mms_multilingual_tokenizer.json"
	LinetimeModelStandard    = "mms_fa.onnx"
	LinetimeModelStandardDta = "mms_fa.onnx.data"
	LinetimeModelFast        = "mms_fa_uint8.onnx"
	LinetimeWhisperFP16      = "ggml-large-v3.bin"
	LinetimeWhisperQ5        = "ggml-large-v3-q5_0.bin"
	LinetimeVadModel         = "ggml-silero-v6.2.0.bin"
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

// LinetimeWhisperCliGPUPath is the CUDA-built whisper-cli that ships inside the
// GPU bundle. It is kept apart from the CPU one so switching the aligner back
// to the CPU cannot leave a binary behind that needs lib_gpu to start.
func LinetimeWhisperCliGPUPath(folder string) string {
	return filepath.Join(folder, LinetimeWhisperCliGPUDir, LinetimeWhisperCliExecName())
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

	// The lib part only exists on Linux. The Windows bundle keeps its CUDA DLLs
	// flat next to the executable because that is where the loader looks, so
	// declaring a lib folder there would leave the component permanently
	// reported as missing.
	gpuParts := map[string]string{
		"binary": filepath.Join(folder, LinetimeBinaryName(true)),
	}
	if runtime.GOOS == "linux" {
		gpuParts["lib"] = LinetimeGPULibPath(folder)
	}
	gpu := NewComponent("gpu", "binary", "GPU (CUDA 12)", gpuParts)
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

	// Voice activity detection. Not an accelerator, but it needs its own model
	// file, so it is a component like any other and the downloader owns it.
	vad := NewComponent("vad", "model", "Voice activity (optional)", map[string]string{
		"model": LinetimeModelPath(folder, LinetimeVadModel),
	})
	vad.Optional = true
	vad.Unsupported = !WhisperCliSupported()

	// The CUDA whisper-cli arrives with the GPU bundle rather than from its own
	// download, so it is a separate optional component: reporting it apart keeps
	// the GPU aligner present when a bundle predates this, instead of folding a
	// missing CLI into the aligner's own state.
	gpuCli := NewComponent("gpu-cli", "cli", "Whisper CLI (CUDA)", map[string]string{
		"cli": LinetimeWhisperCliGPUPath(folder),
	})
	gpuCli.Optional = true
	gpuCli.Unsupported = !GPUSupported()

	return []Component{cpu, gpu, tokenizer, standard, fast, whisperFP16, whisperQ5, cli, gpuCli, vad}
}
