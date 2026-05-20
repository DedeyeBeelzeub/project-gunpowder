const projects = window.PORTFOLIO_PROJECTS ?? [];
const params = new URLSearchParams(window.location.search);
const requestedProject = params.get("id");
const project = projects.find((item) => item.id === requestedProject) ?? projects[0];
const narrowViewport = window.matchMedia("(max-width: 700px)");
const coarsePointer = window.matchMedia("(pointer: coarse)");
const sourceAvailability = new Map();

const detailViewer = document.querySelector("#detail-viewer");
const relatedGrid = document.querySelector("#related-grid");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function detailHref(item) {
  return `project.html?id=${encodeURIComponent(item.id)}`;
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

async function chooseSource(item) {
  const shouldUseMobile = narrowViewport.matches || coarsePointer.matches;
  if (shouldUseMobile && (await sourceExists(item.mobileSrc))) {
    return item.mobileSrc;
  }

  return item.desktopSrc;
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
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

function relatedProjects() {
  if (!project) {
    return [];
  }

  const sameKind = projects.filter((item) => item.id !== project.id && item.kind === project.kind);
  const otherKind = projects.filter((item) => item.id !== project.id && item.kind !== project.kind);
  return [...sameKind, ...otherKind].slice(0, 4);
}

function relatedCard(item) {
  return `
    <a class="related-card" href="${detailHref(item)}">
      <span>${escapeHtml(item.category)}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <small>${escapeHtml(item.mobileSize)} mobile / ${escapeHtml(item.desktopSize)} desktop</small>
    </a>
  `;
}

function renderRelatedProjects() {
  if (!relatedGrid) {
    return;
  }

  relatedGrid.innerHTML = relatedProjects().map(relatedCard).join("");
}

async function applyModelSource() {
  if (!detailViewer || !project) {
    return;
  }

  const src = await chooseSource(project);
  detailViewer.setAttribute("src", src);
  detailViewer.setAttribute("alt", `Interactive inspection of ${project.title}`);
  detailViewer.setAttribute("camera-orbit", project.detailOrbit);

  const shouldReduceMotion = narrowViewport.matches || coarsePointer.matches;
  detailViewer.toggleAttribute("auto-rotate", !shouldReduceMotion);
  detailViewer.setAttribute("shadow-intensity", shouldReduceMotion ? "0" : "1");
  detailViewer.setAttribute("exposure", shouldReduceMotion ? "0.68" : "0.72");
}

if (project) {
  document.title = `${project.title} | Project Gunpowder`;
  setText("#detail-category", project.category);
  setText("#detail-title", project.title);
  setText("#detail-summary", project.summary);
  setText("#detail-format", project.format);
  setText("#detail-desktop-size", project.desktopSize);
  setText("#detail-mobile-size", project.mobileSize);
  setText("#detail-mood", project.mood);
  setText("#detail-description", project.description);
  renderRelatedProjects();
  applyModelSource();
}

watchMediaQuery(narrowViewport, applyModelSource);
watchMediaQuery(coarsePointer, applyModelSource);
