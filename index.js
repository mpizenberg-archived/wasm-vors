import { PointCloud, WasmTracker, default as init } from "./pkg/wasm_vors.js";

// Globals.
const file_input = document.getElementById("file-input");

let wasm;

let camera;
let scene;
let controls;
let point_cloud;
let geometry;
let renderer;
let stats = new Stats();
let pos_buffer_attr;
let col_buffer_attr;

let nb_particles = 1000000;
let end_valid = 0;

// Prepare WebGL context with THREE.
camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.z = 10;
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
	wasm = await init("./pkg/wasm_vors_bg.wasm");
	const wasm_tracker = WasmTracker.new();
	point_cloud = PointCloud.new(nb_particles);

	// Bind geometry to THREE buffers.
	pos_buffer_attr = new THREE.BufferAttribute(getPosMemBuffer(), 3).setDynamic(true);
	col_buffer_attr = new THREE.BufferAttribute(getColMemBuffer(), 3).setDynamic(true);
	geometry.addAttribute("position", pos_buffer_attr);
	geometry.addAttribute("color", col_buffer_attr);
	let material = new THREE.PointsMaterial({size: 0.01, vertexColors: THREE.VertexColors});
	let particles = new THREE.Points(geometry, material);
	particles.frustumCulled = false;
	scene.add(particles);

	// Setup the renderer.
	renderer = new THREE.WebGLRenderer();
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	controls = new THREE.OrbitControls(camera, renderer.domElement);
	controls.update();

	// Set up file reader.
	let file_reader = new FileReader();
	file_input.addEventListener("change", () => {
		const tar_file = file_input.files[0];
		console.log("Loading tar file ...");
		file_reader.readAsArrayBuffer(tar_file);
		document.body.removeChild(file_input);
		document.body.appendChild(renderer.domElement);
		renderer.render(scene, camera);
	});

	// Transfer archive data to wasm when the file is loaded.
	file_reader.onload = () => {
		console.log("Transfering tar data to wasm memory ...");
		transferContent(file_reader.result, wasm_tracker, wasm);
		console.log("Initializing tracker with first image ...");
		const nb_frames = wasm_tracker.init("icl");
		console.log("Rendering first frame point cloud ...");
		let start_valid = end_valid;
		end_valid = point_cloud.tick(wasm_tracker);
		updateGeometry(start_valid, end_valid);
		renderer.render(scene, camera);
		console.log("Starting animation frame loop ...");
		window.requestAnimationFrame(() => track(wasm_tracker, 1, nb_frames));
		file_reader = null; // Free memory.
	};
}

function getPosMemBuffer() {
	return new Float32Array(wasm.memory.buffer, point_cloud.points(), 3 * nb_particles);
}

function getColMemBuffer() {
	return new Float32Array(wasm.memory.buffer, point_cloud.colors(), 3 * nb_particles);
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
		updateGeometry(start_valid, end_valid);
	}
	controls.update();
	renderer.render(scene, camera);
	stats.update();
	window.requestAnimationFrame(() =>
		track(wasm_tracker, frame_id + 1, nb_frames)
	);
}

function updateGeometry(start_valid, end_valid) {
	let nb_update = end_valid - start_valid;
	if (nb_update > 0) {
		geometry.setDrawRange(0, end_valid);

		// Update buffers because wasm memory might grow.
		pos_buffer_attr.setArray(getPosMemBuffer());
		col_buffer_attr.setArray(getColMemBuffer());

		pos_buffer_attr.updateRange.offset = start_valid;
		pos_buffer_attr.updateRange.count = end_valid - start_valid;
		pos_buffer_attr.needsUpdate = true;
		col_buffer_attr.updateRange.offset = start_valid;
		col_buffer_attr.updateRange.count = end_valid - start_valid;
		col_buffer_attr.needsUpdate = true;
	}
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
}
