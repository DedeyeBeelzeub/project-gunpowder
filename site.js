const viewer = document.querySelector("#scene-viewer");
const progress = document.querySelector("#load-progress");
const orbitButtons = [...document.querySelectorAll("[data-orbit]")];
const rotateButton = document.querySelector("#toggle-rotate");
const resetButton = document.querySelector("#reset-view");

const cameraPresets = {
  desktop: ["-28deg 68deg 320%", "-88deg 66deg 340%", "54deg 66deg 340%", "-28deg 38deg 390%"],
  mobile: ["-28deg 68deg 560%", "-88deg 66deg 580%", "54deg 66deg 580%", "-28deg 38deg 640%"],
};

const narrowViewport = window.matchMedia("(max-width: 700px)");
let defaultOrbit = viewer?.getAttribute("camera-orbit") ?? cameraPresets.desktop[0];

function setPressed(activeButton) {
  orbitButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button === activeButton));
  });
}

function syncCameraPresets(shouldMoveCamera = false) {
  const presets = narrowViewport.matches ? cameraPresets.mobile : cameraPresets.desktop;
  orbitButtons.forEach((button, index) => {
    button.dataset.orbit = presets[index];
  });

  defaultOrbit = presets[0];

  if (shouldMoveCamera && viewer) {
    const activeButton =
      orbitButtons.find((button) => button.getAttribute("aria-pressed") === "true") ?? orbitButtons[0];
    const nextOrbit = activeButton?.dataset.orbit ?? defaultOrbit;
    viewer.setAttribute("camera-orbit", nextOrbit);
    viewer.cameraOrbit = nextOrbit;
    viewer.jumpCameraToGoal();
  }
}

if (viewer) {
  syncCameraPresets(true);

  viewer.addEventListener("progress", (event) => {
    const totalProgress = event.detail.totalProgress ?? 0;
    if (progress) {
      progress.style.transform = `scaleX(${totalProgress})`;
    }
  });

  viewer.addEventListener("load", () => {
    document.body.classList.add("is-loaded");
    if (progress) {
      progress.style.transform = "scaleX(1)";
    }
    syncCameraPresets(true);
  });

  orbitButtons.forEach((button) => {
    button.addEventListener("click", () => {
      viewer.setAttribute("camera-orbit", button.dataset.orbit);
      viewer.cameraOrbit = button.dataset.orbit;
      viewer.jumpCameraToGoal();
      setPressed(button);
    });
  });

  rotateButton?.addEventListener("click", () => {
    const shouldRotate = !viewer.hasAttribute("auto-rotate");
    viewer.toggleAttribute("auto-rotate", shouldRotate);
    rotateButton.setAttribute("aria-pressed", String(shouldRotate));
  });

  resetButton?.addEventListener("click", () => {
    viewer.setAttribute("camera-orbit", defaultOrbit);
    viewer.cameraOrbit = defaultOrbit;
    viewer.fieldOfView = "42deg";
    viewer.jumpCameraToGoal();
    setPressed(orbitButtons[0]);
  });

  narrowViewport.addEventListener("change", () => syncCameraPresets(true));
}
