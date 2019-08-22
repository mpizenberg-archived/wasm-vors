import { PointCloud, WasmTracker, default as init } from "./pkg/wasm_vors.js";

// Globals.
const file_input = document.getElementById("file-input");

let camera;
let scene;
let point_cloud;
let geometry;
let renderer;
let stats = new Stats();
let pos_buffer_attr;
let col_buffer_attr;

let nb_particles = 1000000;
let end_valid = 0;

// Prepare WebGL context with THREE.
camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1000);
camera.position.z = 200;
scene = new THREE.Scene();
scene.background = new THREE.Color( 0x050505 );

// Perpare visualization.
geometry = new THREE.BufferGeometry();
geometry.setDrawRange(0, end_valid);

// Prepare DOM.
document.body.appendChild(stats.dom);
window.addEventListener('resize', onWindowResize);

// Run Forest!
run();

async function run() {
	// Initialize the wasm module.
	const wasm = await init("./pkg/wasm_vors_bg.wasm");
	const wasm_tracker = WasmTracker.new();
	point_cloud = PointCloud.new(nb_particles);
	const positions = new Float32Array(
		wasm.memory.buffer,
		point_cloud.points(),
		3 * nb_particles
	);
	const colors = new Float32Array(
		wasm.memory.buffer,
		point_cloud.colors(),
		3 * nb_particles
	);

	// Bind geometry to THREE buffers.
	pos_buffer_attr = new THREE.BufferAttribute(positions, 3).setDynamic(true);
	col_buffer_attr = new THREE.BufferAttribute(colors, 3).setDynamic(true);
	geometry.addAttribute("position", pos_buffer_attr);
	geometry.addAttribute("color", col_buffer_attr);
	let material = new THREE.PointsMaterial({size: 1, vertexColors: THREE.VertexColors});
	let particles = new THREE.Points(geometry, material);
	scene.add(particles);

	// Setup the renderer.
	renderer = new THREE.WebGLRenderer();
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);

	// Set up file reader.
	let file_reader = new FileReader();
	file_input.addEventListener("change", () => {
		const tar_file = file_input.files[0];
		console.log("Loading tar file ...");
		file_reader.readAsArrayBuffer(tar_file);
		document.body.removeChild(file_input);
		document.body.appendChild(renderer.domElement);
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
		let start_valid = end_valid;
		end_valid = point_cloud.tick(wasm_tracker);
		let nb_update = end_valid - start_valid;
		if (nb_update > 0) {
			geometry.setDrawRange(0, end_valid);
			pos_buffer_attr.updateRange.offset = start_valid;
			pos_buffer_attr.updateRange.count = end_valid - start_valid;
			pos_buffer_attr.needsUpdate = true;
			col_buffer_attr.updateRange.offset = start_valid;
			col_buffer_attr.updateRange.count = end_valid - start_valid;
			col_buffer_attr.needsUpdate = true;
		}
		renderer.render(scene, camera);
		stats.update();
		window.requestAnimationFrame(() =>
			track(wasm_tracker, frame_id + 1, nb_frames)
		);
	}
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
}
