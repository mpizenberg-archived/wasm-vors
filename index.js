import { WasmTracker, default as init } from "./pkg/wasm_vors.js";

// Globals.
let stats = new Stats();
document.body.appendChild(stats.dom);

const file_input = document.getElementById("file-input");
const file_reader = new FileReader();
file_input.addEventListener("change", () => loadInput(file_input));

async function run() {
	// Initialize the wasm module.
	const wasm = await init("./pkg/wasm_vors_bg.wasm");
	const wasm_tracker = WasmTracker.new();

	// Transfer archive data to wasm when the file is loaded.
	file_reader.onload = () =>
		transferContent(file_reader.result, wasm_tracker, wasm);
}

function loadInput(input) {
	const tar_file = input.files[0];
	file_reader.readAsArrayBuffer(tar_file);
}

// Transfer archive data to wasm when the file is loaded.
function transferContent(arrayBuffer, wasm_tracker, wasm) {
	wasm_tracker.allocate(arrayBuffer.byteLength);
	const wasm_buffer = new Uint8Array(wasm.memory.buffer);
	const start = wasm_tracker.memory_pos();
	const file_buffer = new Uint8Array(arrayBuffer);
	wasm_buffer.set(file_buffer, start);
	console.log("Building entries hash map ...");
	wasm_tracker.build_entries_map();
	console.log("Initializing tracker with first image ...");
	const nb_frames = wasm_tracker.init("fr3");
	console.log("Starting animation frame loop ...");
	window.requestAnimationFrame(() => track(wasm_tracker, 1, nb_frames));
}

function track(wasm_tracker, frame_id, nb_frames) {
	if (frame_id < nb_frames) {
		const frame_pose = wasm_tracker.track(frame_id);
		console.log(frame_pose);
		stats.update();
		window.requestAnimationFrame(() =>
			track(wasm_tracker, frame_id + 1, nb_frames)
		);
	}
}

run();
