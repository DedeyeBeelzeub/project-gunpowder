const viewer = document.querySelector("#scene-viewer");
const projectViewers = [...document.querySelectorAll(".project-viewer")];
const progress = document.querySelector("#load-progress");
const orbitButtons = [...document.querySelectorAll("[data-orbit]")];
const rotateButton = document.querySelector("#toggle-rotate");
const resetButton = document.querySelector("#reset-view");

const cameraPresets = {
  desktop: ["-28deg 68deg 320%", "-88deg 66deg 340%", "54deg 66deg 340%", "-28deg 38deg 390%"],
  mobile: ["-28deg 68deg 560%", "-88deg 66deg 580%", "54deg 66deg 580%", "-28deg 38deg 640%"],
};

const narrowViewport = window.matchMedia("(max-width: 700px)");
const coarsePointer = window.matchMedia("(pointer: coarse)");
let defaultOrbit = viewer?.getAttribute("camera-orbit") ?? cameraPresets.desktop[0];
const sourceAvailability = new Map();

async function sourceExists(url) {
  if (!url) {
    return false;
  }

  if (sourceAvailability.has(url)) {
    return sourceAvailability.get(url);
  }

  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-cache" });
    const exists = response.ok;
    sourceAvailability.set(url, exists);
    return exists;
  } catch {
    sourceAvailability.set(url, false);
    return false;
  }
}

async function pickModelSource(element) {
  const desktopSrc = element.dataset.desktopSrc;
  const mobileSrc = element.dataset.mobileSrc;

  if ((narrowViewport.matches || coarsePointer.matches) && (await sourceExists(mobileSrc))) {
    return mobileSrc;
  }

  return desktopSrc;
}

async function applyResponsiveSources() {
  if (viewer) {
    const nextSrc = await pickModelSource(viewer);
    if (nextSrc && viewer.getAttribute("src") !== nextSrc) {
      viewer.setAttribute("src", nextSrc);
    }
  }

  projectViewers.forEach((projectViewer) => {
    const shouldLoad = !narrowViewport.matches && !coarsePointer.matches;
    const desktopSrc = projectViewer.dataset.desktopSrc;

    if (shouldLoad && desktopSrc && projectViewer.getAttribute("src") !== desktopSrc) {
      projectViewer.setAttribute("src", desktopSrc);
    }

    if (!shouldLoad && projectViewer.hasAttribute("src")) {
      projectViewer.removeAttribute("src");
    }
  });
}

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

function syncPerformanceMode() {
  if (!viewer) {
    return;
  }

  const shouldReduceMotion = narrowViewport.matches || coarsePointer.matches;
  viewer.toggleAttribute("auto-rotate", !shouldReduceMotion);
  rotateButton?.setAttribute("aria-pressed", String(!shouldReduceMotion));

  if (shouldReduceMotion) {
    viewer.setAttribute("shadow-intensity", "0");
    viewer.setAttribute("exposure", "0.68");
  } else {
    viewer.setAttribute("shadow-intensity", "1");
    viewer.setAttribute("exposure", "0.72");
  }
}

function watchMediaQuery(mediaQuery, callback) {
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", callback);
    return;
  }

  if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener(callback);
  }
}

if (viewer) {
  applyResponsiveSources();
  syncCameraPresets(true);
  syncPerformanceMode();

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

  watchMediaQuery(narrowViewport, () => {
    applyResponsiveSources();
    syncCameraPresets(true);
    syncPerformanceMode();
  });
  watchMediaQuery(coarsePointer, () => {
    applyResponsiveSources();
    syncPerformanceMode();
  });
}
