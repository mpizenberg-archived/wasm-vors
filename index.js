import { WasmTracker, default as init } from "./pkg/wasm_vors.js";

// Globals.
const stats = new Stats();
const file_input = document.getElementById("file-input");

// Prepare DOM.
document.body.appendChild(stats.dom);

// Run Forest!
run();

async function run() {
	// Initialize the wasm module.
	const wasm = await init("./pkg/wasm_vors_bg.wasm");
	const wasm_tracker = WasmTracker.new();

	// Set up file reader.
	let file_reader = new FileReader();
	file_input.addEventListener("change", () => {
		const tar_file = file_input.files[0];
		console.log("Loading tar file ...");
		file_reader.readAsArrayBuffer(tar_file);
	});

	// Transfer archive data to wasm when the file is loaded.
	file_reader.onload = () => {
		console.log("Transfering tar data to wasm memory ...");
		transferContent(file_reader.result, wasm_tracker, wasm);
		console.log("Initializing tracker with first image ...");
		const nb_frames = wasm_tracker.init("icl");
		console.log("Starting animation frame loop ...");
		window.requestAnimationFrame(() => track(wasm_tracker, 1, nb_frames));
		file_reader = null; // Free memory.
	};
}

// Transfer archive data to wasm when the file is loaded.
function transferContent(arrayBuffer, wasm_tracker, wasm) {
	wasm_tracker.allocate(arrayBuffer.byteLength);
	const wasm_buffer = new Uint8Array(wasm.memory.buffer);
	const start = wasm_tracker.memory_pos();
	let file_buffer = new Uint8Array(arrayBuffer);
	wasm_buffer.set(file_buffer, start);
	file_buffer = null; arrayBuffer = null; // Free memory.
	console.log("Building entries hash map ...");
	wasm_tracker.build_entries_map();
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
