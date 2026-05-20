import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const projects = window.PORTFOLIO_PROJECTS ?? [];
const params = new URLSearchParams(window.location.search);
const sceneId = params.get("id") ?? "gate-scene";
const project = projects.find((item) => item.id === sceneId);

const canvas = document.querySelector("#scene-canvas");
const canvasWrap = document.querySelector("#scene-canvas-wrap");
const loadPanel = document.querySelector("#scene-load");
const loadText = document.querySelector("#scene-load-text");
const loadProgress = document.querySelector("#scene-load-progress");
const explodeRange = document.querySelector("#explode-range");
const isolateButton = document.querySelector("#scene-isolate");
const resetButton = document.querySelector("#scene-reset");
const partList = document.querySelector("#scene-part-list");

const selectedName = document.querySelector("#selected-part-name");
const sceneMode = document.querySelector("#scene-mode");
const sceneTitle = document.querySelector("#scene-title");
const sceneSummary = document.querySelector("#scene-summary");
const sceneCategory = document.querySelector("#scene-category");
const scenePartCount = document.querySelector("#scene-part-count");
const sceneSize = document.querySelector("#scene-size");

const manifestUrl = project?.sceneManifest ?? `models/${sceneId}/manifest.json`;
const manifestBase = manifestUrl.slice(0, manifestUrl.lastIndexOf("/") + 1);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
renderer.setClearColor(0x030303, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.88;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050505, 0.022);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.minDistance = 3;
controls.maxDistance = 160;

const assembly = new THREE.Group();
scene.add(assembly);

const fillLight = new THREE.HemisphereLight(0xd8d2bd, 0x17120d, 1.45);
scene.add(fillLight);

const keyLight = new THREE.DirectionalLight(0xffe0a3, 3.2);
keyLight.position.set(18, 24, 20);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x98b58e, 1.4);
rimLight.position.set(-18, 10, -20);
scene.add(rimLight);

const grid = new THREE.GridHelper(80, 80, 0x3b3424, 0x15130f);
grid.material.transparent = true;
grid.material.opacity = 0.22;
grid.position.y = -8;
scene.add(grid);

const loader = new GLTFLoader();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const partGroups = [];

let selectedPart = null;
let selectedBox = null;
let manifest = null;
let sceneCenter = new THREE.Vector3();
let sceneRadius = 20;
let isolateMode = false;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setLoading(loaded, total) {
  const progress = total > 0 ? loaded / total : 0;
  if (loadProgress) {
    loadProgress.style.transform = `scaleX(${progress})`;
  }
  setText(loadText, `Loading ${loaded}/${total}`);
  if (loaded >= total) {
    loadPanel?.classList.add("is-hidden");
    loadPanel?.setAttribute("hidden", "");
  }
}

function applyManifestTransform(target, transform = {}) {
  if (Array.isArray(transform.matrix)) {
    target.matrix.fromArray(transform.matrix);
    target.matrix.decompose(target.position, target.quaternion, target.scale);
    return;
  }

  if (Array.isArray(transform.translation)) {
    target.position.fromArray(transform.translation);
  }

  if (Array.isArray(transform.rotation)) {
    target.quaternion.fromArray(transform.rotation);
  }

  if (Array.isArray(transform.scale)) {
    target.scale.fromArray(transform.scale);
  }
}

function normalizePartObject(root, part) {
  root.traverse((object) => {
    object.userData.scenePart = part;

    if (object.isMesh) {
      object.castShadow = false;
      object.receiveShadow = false;
      object.userData.originalMaterial = object.material;
    }
  });
}

function buildPartButton(part) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.partId = part.id;
  button.innerHTML = `
    <span>${escapeHtml(part.name)}</span>
    <small>${formatBytes(part.bytes)}</small>
  `;
  button.addEventListener("click", () => selectPart(part));
  return button;
}

function syncPartList() {
  if (!partList || !manifest) {
    return;
  }

  partList.innerHTML = "";
  const parts = partGroups.length > 0 ? partGroups : manifest.parts;
  parts.forEach((part) => {
    partList.append(buildPartButton(part));
  });
}

function setActivePartButton(part) {
  partList?.querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-pressed", String(Boolean(part) && button.dataset.partId === part.id));
  });
}

function clearSelectionMaterial() {
  if (!selectedPart) {
    return;
  }

  selectedPart.group.traverse((object) => {
    if (object.isMesh && object.userData.originalMaterial) {
      object.material = object.userData.originalMaterial;
    }
  });
}

function applySelectionMaterial(part) {
  part.group.traverse((object) => {
    if (!object.isMesh) {
      return;
    }

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const highlighted = materials.map((material) => {
      const nextMaterial = material.clone();
      if (nextMaterial.emissive) {
        nextMaterial.emissive.set(0xd4a43f);
        nextMaterial.emissiveIntensity = 0.32;
      }
      nextMaterial.needsUpdate = true;
      return nextMaterial;
    });
    object.material = Array.isArray(object.material) ? highlighted : highlighted[0];
  });
}

function updateSelectionBox(part) {
  if (selectedBox) {
    scene.remove(selectedBox);
    selectedBox.geometry?.dispose?.();
    selectedBox.material?.dispose?.();
    selectedBox = null;
  }

  if (!part) {
    return;
  }

  const box = new THREE.Box3().setFromObject(part.group);
  selectedBox = new THREE.Box3Helper(box, 0xd4a43f);
  selectedBox.material.transparent = true;
  selectedBox.material.opacity = 0.9;
  scene.add(selectedBox);
}

function selectPart(part) {
  if (!part?.group) {
    return;
  }

  if (selectedPart?.id === part.id) {
    return;
  }

  clearSelectionMaterial();
  selectedPart = part;
  applySelectionMaterial(part);
  updateSelectionBox(part);
  setActivePartButton(part);
  setText(selectedName, part.name);
  syncIsolation();
}

function syncIsolation() {
  partGroups.forEach((part) => {
    part.group.visible = !isolateMode || !selectedPart || part.id === selectedPart.id;
  });
  isolateButton?.setAttribute("aria-pressed", String(isolateMode));
  setText(sceneMode, isolateMode ? "Isolated" : Number(explodeRange?.value ?? 0) > 0 ? "Exploded" : "Assembled");
}

function updateExplode() {
  const amount = Number(explodeRange?.value ?? 0) / 100;
  const distance = sceneRadius * 0.72 * amount;

  partGroups.forEach((part) => {
    part.group.position.copy(part.basePosition).addScaledVector(part.explodeDirection, distance);
  });

  updateSelectionBox(selectedPart);
  syncIsolation();
}

function resetScene() {
  if (explodeRange) {
    explodeRange.value = "0";
  }
  isolateMode = false;
  updateExplode();
  clearSelectionMaterial();
  selectedPart = null;
  updateSelectionBox(null);
  setActivePartButton(null);
  setText(selectedName, "None");
  frameScene();
}

function frameScene() {
  const width = canvasWrap?.clientWidth ?? window.innerWidth;
  const isNarrow = width < 720;
  const distance = sceneRadius * (isNarrow ? 2.3 : 1.75);
  camera.position.set(distance * 0.72, distance * 0.46, distance * 0.95);
  controls.target.set(0, 0, 0);
  controls.update();
}

function resize() {
  const width = canvasWrap?.clientWidth || window.innerWidth;
  const height = canvasWrap?.clientHeight || window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

function pickPart(event) {
  if (!canvasWrap) {
    return;
  }

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const intersections = raycaster.intersectObjects(assembly.children, true);
  const hit = intersections.find((item) => item.object.userData.scenePart);
  if (hit) {
    selectPart(hit.object.userData.scenePart);
  }
}

async function loadScene() {
  const response = await fetch(manifestUrl, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Unable to load scene manifest: ${response.status}`);
  }
  manifest = await response.json();

  document.title = `${project?.title ?? manifest.name} | Project Gunpowder`;
  setText(sceneTitle, project?.title ?? manifest.name);
  setText(sceneSummary, project?.summary ?? "Assembled from extracted GLB parts.");
  setText(sceneCategory, project?.category ?? "Scene");
  setText(scenePartCount, String(manifest.parts.length));
  setText(sceneSize, formatBytes(manifest.parts.reduce((sum, part) => sum + (part.bytes ?? 0), 0)));
  partGroups.length = 0;
  partGroups.push(
    ...manifest.parts.map((part) => ({
      ...part,
      group: null,
      basePosition: new THREE.Vector3(),
      explodeDirection: new THREE.Vector3(),
    }))
  );
  syncPartList();
  setLoading(0, manifest.parts.length);

  let loaded = 0;
  await Promise.all(
    partGroups.map(async (part) => {
      const gltf = await loader.loadAsync(`${manifestBase}${part.src}`);
      const group = new THREE.Group();
      group.name = part.name;
      applyManifestTransform(group, part.transform);
      normalizePartObject(gltf.scene, part);
      group.add(gltf.scene);
      assembly.add(group);
      part.group = group;
      part.basePosition = group.position.clone();

      loaded += 1;
      setLoading(loaded, manifest.parts.length);
    })
  );

  const box = new THREE.Box3().setFromObject(assembly);
  box.getCenter(sceneCenter);
  sceneRadius = Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 8);
  assembly.position.copy(sceneCenter).multiplyScalar(-1);

  partGroups.forEach((part) => {
    const worldCenter = new THREE.Box3().setFromObject(part.group).getCenter(new THREE.Vector3());
    const direction = worldCenter.sub(sceneCenter);
    if (direction.lengthSq() < 0.0001) {
      direction.set(0, 1, 0);
    }
    part.explodeDirection.copy(direction.normalize());
  });

  frameScene();
}

function animate() {
  controls.update();
  if (selectedBox && selectedPart) {
    selectedBox.box.setFromObject(selectedPart.group);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

explodeRange?.addEventListener("input", updateExplode);
isolateButton?.addEventListener("click", () => {
  isolateMode = !isolateMode;
  syncIsolation();
});
resetButton?.addEventListener("click", resetScene);
renderer.domElement.addEventListener("click", pickPart);

new ResizeObserver(resize).observe(canvasWrap ?? document.body);
resize();
animate();

loadScene().catch((error) => {
  console.error(error);
  setText(loadText, "Scene failed to load");
});
