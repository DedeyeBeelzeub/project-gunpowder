const viewer = document.querySelector("#scene-viewer");
const projects = window.PORTFOLIO_PROJECTS ?? [];
const projectGrid = document.querySelector("#project-grid");
let projectViewers = [];
const progress = document.querySelector("#load-progress");
const orbitButtons = [...document.querySelectorAll("[data-orbit]")];
const filterButtons = [...document.querySelectorAll("[data-filter]")];
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
const validFilters = new Set(["all", "scene", "piece"]);
const requestedFilter = new URLSearchParams(window.location.search).get("filter");
let currentFilter = validFilters.has(requestedFilter) ? requestedFilter : "all";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function detailHref(project) {
  if (project.sceneManifest) {
    return `scene.html?id=${encodeURIComponent(project.id)}`;
  }

  return `project.html?id=${encodeURIComponent(project.id)}`;
}

function projectCard(project) {
  const href = detailHref(project);
  const previewSrc = project.previewSrc ?? project.mobileSrc ?? project.desktopSrc;
  const kind = project.kind ?? "piece";
  const isFeatured = project.id === "scifi-scene";
  return `
    <article
      class="project-tile project-tile-${escapeHtml(kind)}${isFeatured ? " is-featured" : ""}"
      data-project-id="${escapeHtml(project.id)}"
      data-project-kind="${escapeHtml(kind)}"
    >
      <div class="tile-media">
        <model-viewer
          class="project-viewer"
          data-desktop-src="${escapeHtml(previewSrc)}"
          data-mobile-src="${escapeHtml(project.mobileSrc)}"
          data-mobile-gallery="defer"
          alt="Interactive preview of ${escapeHtml(project.title)}"
          camera-controls
          enable-pan
          touch-action="pan-y"
          interaction-prompt="none"
          auto-rotate
          auto-rotate-delay="1800"
          rotation-per-second="10deg"
          camera-orbit="${escapeHtml(project.cardOrbit)}"
          field-of-view="42deg"
          min-camera-orbit="auto auto 120%"
          max-camera-orbit="auto auto 920%"
          bounds="tight"
          environment-image="neutral"
          exposure="0.7"
          tone-mapping="aces"
          loading="lazy"
          reveal="auto"
        ></model-viewer>
        <a class="tile-open-link" href="${href}">Open inspection</a>
      </div>
      <div class="tile-content">
        <p class="project-type">${escapeHtml(project.category)}</p>
        <h3><a href="${href}">${escapeHtml(project.title)}</a></h3>
        <p>${escapeHtml(project.summary)}</p>
        <dl class="project-meta">
          <div>
            <dt>Desktop</dt>
            <dd>${escapeHtml(project.desktopSize)}</dd>
          </div>
          <div>
            <dt>Mobile</dt>
            <dd>${escapeHtml(project.mobileSize)}</dd>
          </div>
        </dl>
      </div>
    </article>
  `;
}

function renderProjects() {
  if (!projectGrid || projects.length === 0) {
    projectViewers = [...document.querySelectorAll(".project-viewer")];
    return;
  }

  const visibleProjects =
    currentFilter === "all" ? projects : projects.filter((project) => (project.kind ?? "piece") === currentFilter);
  projectGrid.innerHTML = visibleProjects.map(projectCard).join("");
  projectViewers = [...document.querySelectorAll(".project-viewer")];
}

function syncFilterButtons() {
  filterButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.filter === currentFilter));
  });
}

function updateFilterUrl(filter) {
  if (!window.history?.replaceState) {
    return;
  }

  const url = new URL(window.location.href);
  if (filter === "all") {
    url.searchParams.delete("filter");
  } else {
    url.searchParams.set("filter", filter);
  }
  url.hash = "work";
  window.history.replaceState({}, "", url);
}

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

  await Promise.all(
    projectViewers.map(async (projectViewer) => {
      const desktopSrc = projectViewer.dataset.desktopSrc;
      const mobileSrc = projectViewer.dataset.mobileSrc;
      const shouldUseMobile = narrowViewport.matches || coarsePointer.matches;
      const shouldLoadMobile = projectViewer.dataset.mobileGallery === "load";
      const nextSrc =
        shouldUseMobile && shouldLoadMobile && (await sourceExists(mobileSrc))
          ? mobileSrc
          : shouldUseMobile
            ? ""
            : desktopSrc;
      const tileMedia = projectViewer.closest(".tile-media");

      if (nextSrc && projectViewer.getAttribute("src") !== nextSrc) {
        projectViewer.setAttribute("src", nextSrc);
      }

      if (!nextSrc && projectViewer.hasAttribute("src")) {
        projectViewer.removeAttribute("src");
      }

      tileMedia?.classList.toggle("has-live-viewer", Boolean(nextSrc));
    })
  );
}

function setPressed(activeButton) {
  orbitButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button === activeButton));
  });
}

function jumpCameraToGoal(modelViewer) {
  if (typeof modelViewer?.jumpCameraToGoal === "function") {
    modelViewer.jumpCameraToGoal();
  }
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
    jumpCameraToGoal(viewer);
  }
}

function syncPerformanceMode() {
  if (!viewer) {
    return;
  }

  const shouldReduceMotion = narrowViewport.matches || coarsePointer.matches;
  const allViewers = [viewer, ...projectViewers].filter(Boolean);

  allViewers.forEach((modelViewer) => {
    modelViewer.toggleAttribute("auto-rotate", !shouldReduceMotion);
    modelViewer.setAttribute("shadow-intensity", shouldReduceMotion ? "0" : "1");
    modelViewer.setAttribute("exposure", shouldReduceMotion ? "0.68" : modelViewer === viewer ? "0.72" : "0.7");
  });

  rotateButton?.setAttribute("aria-pressed", String(!shouldReduceMotion));
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
  renderProjects();
  syncFilterButtons();
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
      jumpCameraToGoal(viewer);
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
    jumpCameraToGoal(viewer);
    setPressed(orbitButtons[0]);
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextFilter = button.dataset.filter ?? "all";
      currentFilter = validFilters.has(nextFilter) ? nextFilter : "all";
      renderProjects();
      syncFilterButtons();
      updateFilterUrl(currentFilter);
      void applyResponsiveSources();
      syncPerformanceMode();
    });
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
