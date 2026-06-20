// Application main controller, state handling, rendering and UI interactions

// 1. State Variables
let cargoList = [];
let systemSettings = {
  managerName: "Hout Dara",
  darkMode: false,
  language: "KH",
  senders: ["ភ្នំពេញ (Phnom Penh)", "សេអ៊ូល (Seoul)"],
  receivers: ["ដារ៉ា (Dara)", "ម៉ារី (Mary)"]
};

let activeTab = "dashboard";
let currentFormStatus = "unchecked";
let currentEditFormStatus = "unchecked";
let uploadedImages = [];
let editUploadedImages = [];
let currentDashboardColumn = "not_arrived";
let activeUploadCargoId = "";

// Image Zoom and Pan State
let zoomScale = 1.0;
let panX = 0;
let panY = 0;
let isPanning = false;
let startX = 0;
let startY = 0;

// 2. Initialization on page load
document.addEventListener("DOMContentLoaded", async () => {
  // Load settings and cargo from Local IndexedDB
  const localSettings = await api.getLocalSettings();
  if (localSettings) {
    systemSettings = { ...systemSettings, ...localSettings };
  } else {
    // If no settings in Local DB, fetch from server or write defaults
    const serverSettings = await api.fetchSettingsFromServer();
    if (serverSettings && Object.keys(serverSettings).length > 0) {
      systemSettings = serverSettings;
    } else {
      await api.saveLocalSettings(systemSettings);
    }
  }

  // Load cargo list
  const localCargo = await api.getLocalCargo();
  if (localCargo && localCargo.length > 0) {
    cargoList = localCargo;
  } else {
    cargoList = await api.fetchCargoFromServer();
  }

  // Initialize UI theme, language and drop-downs
  applyTheme(systemSettings.darkMode);
  applyLanguage(systemSettings.language);
  populateDropdowns();
  renderCargoLists();
  renderSettingsLists();
  renderAboutStats();
  
  // Set default dates in form (today)
  const todayStr = new Date().toISOString().split('T')[0];
  document.getElementById("cargo-dep-date").value = todayStr;
  document.getElementById("cargo-arr-date").value = todayStr;

  // Set Manager Input in Settings
  document.getElementById("setting-manager-name").value = systemSettings.managerName;

  // Register real-time sync callbacks from API
  api.registerOnSync((updatedCargoList) => {
    cargoList = updatedCargoList;
    renderCargoLists();
    renderAboutStats();
  });

  api.registerOnSettings((updatedSettings) => {
    systemSettings = updatedSettings;
    applyTheme(systemSettings.darkMode);
    applyLanguage(systemSettings.language);
    populateDropdowns();
    renderSettingsLists();
    document.getElementById("setting-manager-name").value = systemSettings.managerName;
  });

  // Start real-time sync connections
  api.updateOnlineStatus(navigator.onLine);
  api.connectSSE();
});

// 3. Tab Navigation
function switchTab(tabId) {
  activeTab = tabId;
  
  // Update nav item highlights
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.remove("active");
  });
  const activeNavBtn = document.getElementById(`nav-${tabId}`);
  if (activeNavBtn) activeNavBtn.classList.add("active");
  
  // Update view visibility
  document.querySelectorAll(".tab-view").forEach(view => {
    view.classList.remove("active");
  });
  const activeView = document.getElementById(`view-${tabId}`);
  if (activeView) activeView.classList.add("active");

  // Re-render relevant data
  if (tabId === "dashboard") {
    renderCargoLists();
  } else if (tabId === "about") {
    renderAboutStats();
  }
}

// 4. Dark Theme control
function toggleTheme() {
  systemSettings.darkMode = !systemSettings.darkMode;
  applyTheme(systemSettings.darkMode);
  saveSystemSettings();
}

function applyTheme(isDark) {
  const html = document.documentElement;
  const sunIcon = document.getElementById("icon-sun");
  const moonIcon = document.getElementById("icon-moon");

  if (isDark) {
    html.setAttribute("data-theme", "dark");
    if (sunIcon) sunIcon.classList.add("hidden");
    if (moonIcon) moonIcon.classList.remove("hidden");
  } else {
    html.removeAttribute("data-theme");
    if (sunIcon) sunIcon.classList.remove("hidden");
    if (moonIcon) moonIcon.classList.add("hidden");
  }
}

// 5. Language Switching & Dynamic Translations
function changeLanguage(lang) {
  systemSettings.language = lang;
  applyLanguage(lang);
  saveSystemSettings();
  
  // Refresh views to translate status indicators, labels
  renderCargoLists();
  populateDropdowns();
}

function applyLanguage(lang) {
  window.currentLanguage = lang;
  
  // Select all DOM elements that need translation
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (translations[lang] && translations[lang][key]) {
      el.textContent = translations[lang][key];
    }
  });

  // Translate placeholders
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (translations[lang] && translations[lang][key]) {
      el.setAttribute("placeholder", translations[lang][key]);
    }
  });

  // Highlight active language button
  document.getElementById("btn-lang-kh").classList.toggle("active", lang === "KH");
  document.getElementById("btn-lang-kr").classList.toggle("active", lang === "KR");

  // Update connection status language
  api.updateOnlineStatus(navigator.onLine);
}

// 6. Settings Panel updates
async function saveSystemSettings() {
  await api.saveLocalSettings(systemSettings);
  await api.sendSettingsToServer(systemSettings);
}

function renderSettingsLists() {
  const sendersListEl = document.getElementById("settings-senders-list");
  const receiversListEl = document.getElementById("settings-receivers-list");
  
  if (sendersListEl) {
    sendersListEl.innerHTML = systemSettings.senders.map((sender, idx) => `
      <li>
        <span>${sender}</span>
        <button class="delete-item-btn" onclick="deleteSender(${idx})">&times;</button>
      </li>
    `).join("");
  }
  
  if (receiversListEl) {
    receiversListEl.innerHTML = systemSettings.receivers.map((receiver, idx) => `
      <li>
        <span>${receiver}</span>
        <button class="delete-item-btn" onclick="deleteReceiver(${idx})">&times;</button>
      </li>
    `).join("");
  }
}

function populateDropdowns() {
  const senderSelect = document.getElementById("cargo-sender");
  const receiverSelect = document.getElementById("cargo-receiver");
  const editSenderSelect = document.getElementById("edit-cargo-sender");
  const editReceiverSelect = document.getElementById("edit-cargo-receiver");
  
  const senderOptionsHTML = systemSettings.senders.map(s => `<option value="${s}">${s}</option>`).join("");
  const receiverOptionsHTML = systemSettings.receivers.map(r => `<option value="${r}">${r}</option>`).join("");
  
  if (senderSelect) senderSelect.innerHTML = senderOptionsHTML;
  if (receiverSelect) receiverSelect.innerHTML = receiverOptionsHTML;
  if (editSenderSelect) editSenderSelect.innerHTML = senderOptionsHTML;
  if (editReceiverSelect) editReceiverSelect.innerHTML = receiverOptionsHTML;
}

function addNewSender() {
  const input = document.getElementById("new-sender-input");
  const val = input.value.trim();
  if (val) {
    systemSettings.senders.push(val);
    input.value = "";
    renderSettingsLists();
    populateDropdowns();
    saveSystemSettings();
  }
}

function deleteSender(index) {
  systemSettings.senders.splice(index, 1);
  renderSettingsLists();
  populateDropdowns();
  saveSystemSettings();
}

function addNewReceiver() {
  const input = document.getElementById("new-receiver-input");
  const val = input.value.trim();
  if (val) {
    systemSettings.receivers.push(val);
    input.value = "";
    renderSettingsLists();
    populateDropdowns();
    saveSystemSettings();
  }
}

function deleteReceiver(index) {
  systemSettings.receivers.splice(index, 1);
  renderSettingsLists();
  populateDropdowns();
  saveSystemSettings();
}

// 7. Image Upload & Preview Rendering
async function handleImageUpload(event, type) {
  const files = Array.from(event.target.files);
  if (files.length === 0) return;
  
  const targetArray = (type === "entry") ? uploadedImages : editUploadedImages;
  
  for (const file of files) {
    try {
      // Compress client-side to maximum width 800px
      const base64Str = await api.compressImage(file, 800, 0.7);
      targetArray.push(base64Str);
    } catch (err) {
      console.error("Image compression error:", err);
    }
  }
  
  renderImagePreviews(type);
  event.target.value = ""; // Clear file picker
}

function openCameraInput(type) {
  const cameraInput = document.getElementById(`camera-capture-input-${type}`);
  if (cameraInput) {
    cameraInput.click();
  }
}

function removeUploadedImage(index, type) {
  const targetArray = (type === "entry") ? uploadedImages : editUploadedImages;
  targetArray.splice(index, 1);
  renderImagePreviews(type);
}

function renderImagePreviews(type) {
  const gridEl = document.getElementById(`${type}-preview-grid`);
  const targetArray = (type === "entry") ? uploadedImages : editUploadedImages;
  
  if (!gridEl) return;
  
  gridEl.innerHTML = targetArray.map((img, idx) => `
    <div class="preview-img-wrapper">
      <img src="${img}" alt="Preview" onclick="openZoomOverlay('${img}')">
      <button type="button" class="preview-img-remove" onclick="removeUploadedImage(${idx}, '${type}')">&times;</button>
    </div>
  `).join("");
}

// Set status state in Data Entry form
function setFormStatus(status) {
  currentFormStatus = status;
  document.getElementById("status-btn-unchecked").classList.toggle("active", status === "unchecked");
  document.getElementById("status-btn-complete").classList.toggle("active", status === "complete");
  document.getElementById("status-btn-missing").classList.toggle("active", status === "missing");
}

// Set status state in Edit form modal
function setEditFormStatus(status) {
  currentEditFormStatus = status;
  document.getElementById("edit-status-btn-unchecked").classList.toggle("active", status === "unchecked");
  document.getElementById("edit-status-btn-complete").classList.toggle("active", status === "complete");
  document.getElementById("edit-status-btn-missing").classList.toggle("active", status === "missing");
}

// 8. CRUD Operations
// Create Cargo
async function handleCargoSubmit(event) {
  event.preventDefault();
  
  const name = document.getElementById("cargo-name").value.trim();
  const web = document.getElementById("cargo-web").value.trim();
  const depDate = document.getElementById("cargo-dep-date").value;
  const arrDate = document.getElementById("cargo-arr-date").value;
  const caseCode = document.getElementById("cargo-case-code").value.trim();
  const trackCode = document.getElementById("cargo-track-code").value.trim();
  const sender = document.getElementById("cargo-sender").value;
  const receiver = document.getElementById("cargo-receiver").value;
  
  const lang = window.currentLanguage || "KH";
  
  if (!name || !caseCode || !trackCode) {
    alert(translations[lang].alertFillRequired);
    return;
  }

  // Stage rule:
  // If status is 'complete' or 'missing', the cargo automatically transfers to stage 'arrived'.
  // Else (if 'unchecked'), it goes to 'not_arrived'.
  let stage = "not_arrived";
  if (currentFormStatus === "complete" || currentFormStatus === "missing") {
    stage = "arrived";
  }

  const now = new Date();
  const newCargo = {
    id: "cargo_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
    images: [...uploadedImages], // Copy uploaded base64 strings
    name: name,
    web: web,
    departureDate: depDate,
    arrivalDate: arrDate,
    caseCode: caseCode,
    trackingCode: trackCode,
    senderName: sender,
    receiverName: receiver,
    status: currentFormStatus,
    stage: stage,
    dateTime: now.toISOString() // Automatic timestamp
  };

  cargoList.push(newCargo);
  
  // Save locally and send to server
  await api.saveLocalCargoList(cargoList);
  await api.sendCargoToServer(cargoList);
  
  // Clean Form
  document.getElementById("cargo-form").reset();
  uploadedImages = [];
  renderImagePreviews("entry");
  setFormStatus("unchecked");
  
  // Default values
  const todayStr = new Date().toISOString().split('T')[0];
  document.getElementById("cargo-dep-date").value = todayStr;
  document.getElementById("cargo-arr-date").value = todayStr;

  alert(translations[lang].alertSuccess);
  
  // Go to Dashboard
  switchTab("dashboard");
}

// Edit Cargo (Open Modal)
function openEditCargo(id, event) {
  if (event) event.stopPropagation(); // Avoid opening details modal
  
  const cargo = cargoList.find(c => c.id === id);
  if (!cargo) return;
  
  document.getElementById("edit-cargo-id").value = cargo.id;
  document.getElementById("edit-cargo-name").value = cargo.name;
  document.getElementById("edit-cargo-web").value = cargo.web || "";
  document.getElementById("edit-cargo-dep-date").value = cargo.departureDate || "";
  document.getElementById("edit-cargo-arr-date").value = cargo.arrivalDate || "";
  document.getElementById("edit-cargo-case-code").value = cargo.caseCode;
  document.getElementById("edit-cargo-track-code").value = cargo.trackingCode;
  document.getElementById("edit-cargo-sender").value = cargo.senderName;
  document.getElementById("edit-cargo-receiver").value = cargo.receiverName;
  
  setEditFormStatus(cargo.status);
  
  // Load existing images
  editUploadedImages = [...(cargo.images || [])];
  renderImagePreviews("edit");
  
  // Open modal
  document.getElementById("modal-edit").classList.remove("hidden");
}

// Submit Edit Cargo Form
async function handleCargoEditSubmit(event) {
  event.preventDefault();
  
  const id = document.getElementById("edit-cargo-id").value;
  const cargoIdx = cargoList.findIndex(c => c.id === id);
  
  if (cargoIdx === -1) return;
  
  const name = document.getElementById("edit-cargo-name").value.trim();
  const web = document.getElementById("edit-cargo-web").value.trim();
  const depDate = document.getElementById("edit-cargo-dep-date").value;
  const arrDate = document.getElementById("edit-cargo-arr-date").value;
  const caseCode = document.getElementById("edit-cargo-case-code").value.trim();
  const trackCode = document.getElementById("edit-cargo-track-code").value.trim();
  const sender = document.getElementById("edit-cargo-sender").value;
  const receiver = document.getElementById("edit-cargo-receiver").value;
  
  const lang = window.currentLanguage || "KH";
  
  if (!name || !caseCode || !trackCode) {
    alert(translations[lang].alertFillRequired);
    return;
  }

  const originalCargo = cargoList[cargoIdx];
  
  // Stage transitioning logic
  let stage = originalCargo.stage;
  // If status is updated to 'complete' or 'missing', and it was previously 'not_arrived'
  // it automatically transfers to stage 'arrived'.
  if (originalCargo.stage === "not_arrived" && (currentEditFormStatus === "complete" || currentEditFormStatus === "missing")) {
    stage = "arrived";
  }
  // If status is changed back to unchecked, and it is in 'arrived' stage
  if (originalCargo.stage === "arrived" && currentEditFormStatus === "unchecked") {
    stage = "not_arrived";
  }

  const updatedCargo = {
    ...originalCargo,
    images: [...editUploadedImages],
    name: name,
    web: web,
    departureDate: depDate,
    arrivalDate: arrDate,
    caseCode: caseCode,
    trackingCode: trackCode,
    senderName: sender,
    receiverName: receiver,
    status: currentEditFormStatus,
    stage: stage,
    dateTime: new Date().toISOString() // Update timestamp on edit
  };

  cargoList[cargoIdx] = updatedCargo;
  
  await api.saveLocalCargoList(cargoList);
  await api.sendCargoToServer(cargoList);
  
  closeModal("modal-edit");
  renderCargoLists();
  
  // Update details modal if it is open
  const detailsModal = document.getElementById("modal-details");
  if (detailsModal && !detailsModal.classList.contains("hidden")) {
    openCargoDetails(updatedCargo.id);
  }
}

// Delete Cargo
async function deleteCargo(id, event) {
  if (event) event.stopPropagation(); // Avoid opening details modal
  
  const lang = window.currentLanguage || "KH";
  if (!confirm(translations[lang].confirmDelete)) return;
  
  cargoList = cargoList.filter(c => c.id !== id);
  
  await api.saveLocalCargoList(cargoList);
  await api.sendCargoToServer(cargoList);
  
  closeModal("modal-details");
  renderCargoLists();
  renderAboutStats();
}

// Transfer cargo from "Arrived" to "Checked" (Manager validation checkmark click)
async function approveCargoStage(id, event) {
  if (event) event.stopPropagation(); // Avoid triggering details modal
  
  const cargoIdx = cargoList.findIndex(c => c.id === id);
  if (cargoIdx === -1) return;
  
  cargoList[cargoIdx].stage = "checked";
  cargoList[cargoIdx].dateTime = new Date().toISOString(); // Update timestamp
  
  await api.saveLocalCargoList(cargoList);
  await api.sendCargoToServer(cargoList);
  
  closeModal("modal-details");
  renderCargoLists();
  renderAboutStats();
}

// Delete All Checked Cargo (Opens password prompt)
function confirmDeleteAllCargo() {
  document.getElementById("input-delete-all-password").value = "";
  document.getElementById("modal-password").classList.remove("hidden");
}

async function verifyPasswordAndDeleteAll() {
  const password = document.getElementById("input-delete-all-password").value;
  const lang = window.currentLanguage || "KH";
  
  if (password === "dara908055") {
    // Keep only items that are NOT in 'checked' stage
    cargoList = cargoList.filter(c => c.stage !== "checked");
    
    await api.saveLocalCargoList(cargoList);
    await api.sendCargoToServer(cargoList);
    
    closeModal("modal-password");
    renderCargoLists();
    renderAboutStats();
  } else {
    alert(translations[lang].errPassword);
  }
}

// 9. UI Rendering
// Open Cargo Details Card Modal
function openCargoDetails(id) {
  const cargo = cargoList.find(c => c.id === id);
  if (!cargo) return;
  
  const lang = window.currentLanguage || "KH";
  
  let imagesHTML = "";
  if (cargo.images && cargo.images.length > 0) {
    imagesHTML = `
      <div class="details-images-carousel">
        ${cargo.images.map(img => `
          <img class="details-carousel-img" src="${img}" alt="Cargo Detail" onclick="openZoomOverlay('${img}')">
        `).join("")}
      </div>
    `;
  }
  
  let statusClass = "status-unchecked";
  let statusText = translations[lang].statusUnchecked;
  
  if (cargo.status === "complete") {
    statusClass = "status-complete";
    statusText = translations[lang].statusComplete;
  } else if (cargo.status === "missing") {
    statusClass = "status-missing";
    statusText = translations[lang].statusMissing;
  }

  // Format Time and Date
  let dateStr = "";
  let timeStr = "";
  if (cargo.dateTime) {
    const d = new Date(cargo.dateTime);
    dateStr = d.toLocaleDateString();
    timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  let websiteHTML = "-";
  if (cargo.web) {
    websiteHTML = `<a href="${cargo.web}" target="_blank">${cargo.web}</a>`;
  }

  // Details dialog content
  let bodyHTML = `
    <div class="details-grid">
      ${imagesHTML}
      
      <div class="details-row">
        <span class="details-label" data-i18n="cargoName">${translations[lang].cargoName}</span>
        <span class="details-val">${cargo.name}</span>
      </div>
      
      <div class="details-row">
        <span class="details-label" data-i18n="status">${translations[lang].status}</span>
        <span class="details-val details-box ${statusClass}">${statusText}</span>
      </div>

      <div class="details-row">
        <span class="details-label" data-i18n="caseCode">${translations[lang].caseCode}</span>
        <span class="details-val"><strong>${cargo.caseCode}</strong></span>
      </div>

      <div class="details-row">
        <span class="details-label" data-i18n="trackingCode">${translations[lang].trackingCode}</span>
        <span class="details-val"><strong>${cargo.trackingCode}</strong></span>
      </div>

      <div class="details-row">
        <span class="details-label" data-i18n="departureDate">${translations[lang].departureDate}</span>
        <span class="details-val">${cargo.departureDate || "-"}</span>
      </div>

      <div class="details-row">
        <span class="details-label" data-i18n="arrivalDate">${translations[lang].arrivalDate}</span>
        <span class="details-val">${cargo.arrivalDate || "-"}</span>
      </div>

      <div class="details-row">
        <span class="details-label" data-i18n="senderName">${translations[lang].senderName}</span>
        <span class="details-val">${cargo.senderName}</span>
      </div>

      <div class="details-row">
        <span class="details-label" data-i18n="receiverName">${translations[lang].receiverName}</span>
        <span class="details-val">${cargo.receiverName}</span>
      </div>

      <div class="details-row">
        <span class="details-label" data-i18n="website">${translations[lang].website}</span>
        <span class="details-val">${websiteHTML}</span>
      </div>

      <div class="details-row">
        <span class="details-label">${translations[lang].date} & ${translations[lang].time}</span>
        <span class="details-val">${dateStr} | ${timeStr}</span>
      </div>
  `;

  // Manager Approve Section inside modal for "Arrived" stage items
  if (cargo.stage === "arrived") {
    bodyHTML += `
      <div class="manager-validation-panel">
        <span class="manager-label-text">${translations[lang].managerApprove} (${systemSettings.managerName})</span>
        <button class="btn btn-success btn-sm" onclick="approveCargoStage('${cargo.id}', event)">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          ${translations[lang].managerApprove}
        </button>
      </div>
    `;
  }

  bodyHTML += `
      <div class="card-actions">
        ${cargo.stage !== "checked" ? `
          <button class="btn btn-secondary btn-sm" onclick="openEditCargo('${cargo.id}', event)">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            ${translations[lang].edit}
          </button>
        ` : ''}
        <button class="btn btn-danger btn-sm" onclick="deleteCargo('${cargo.id}', event)">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          ${translations[lang].delete}
        </button>
      </div>
    </div>
  `;

  document.getElementById("details-modal-body").innerHTML = bodyHTML;
  document.getElementById("modal-details").classList.remove("hidden");
}

// Render all three columns of Dashboard
function renderCargoLists() {
  const notArrivedList = document.getElementById("list-not-arrived");
  const arrivedList = document.getElementById("list-arrived");
  const checkedList = document.getElementById("list-checked");
  
  if (!notArrivedList || !arrivedList || !checkedList) return;
  
  const lang = window.currentLanguage || "KH";
  
  let notArrivedHTML = "";
  let arrivedHTML = "";
  let checkedHTML = "";
  
  let notArrivedCount = 0;
  let arrivedCount = 0;
  let checkedCount = 0;

  // Sort: newest first
  const sortedCargo = [...cargoList].sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

  sortedCargo.forEach(cargo => {
    // Generate card content HTML
    let cardImagesHTML = "";
    if (cargo.images && cargo.images.length > 0) {
      cardImagesHTML = `
        <div class="card-image-preview-container">
          ${cargo.images.slice(0, 4).map(img => `
            <img class="card-img-thumb" src="${img}" alt="Preview" onclick="openZoomOverlay('${img}', event)">
          `).join("")}
        </div>
      `;
    }

    let statusClass = "status-unchecked";
    let statusText = translations[lang].statusUnchecked;
    
    if (cargo.status === "complete") {
      statusClass = "status-complete";
      statusText = translations[lang].statusComplete;
    } else if (cargo.status === "missing") {
      statusClass = "status-missing";
      statusText = translations[lang].statusMissing;
    }

    // Format auto-run Date and Time
    let dateStr = "";
    let timeStr = "";
    if (cargo.dateTime) {
      const d = new Date(cargo.dateTime);
      dateStr = d.toLocaleDateString();
      timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Common card structure
    const cardHTML = `
      <div class="cargo-card" onclick="openCargoDetails('${cargo.id}')">
        <span class="status-pill ${statusClass}">${statusText}</span>
        ${cardImagesHTML}
        
        <!-- Direct Upload Button Area inside Card -->
        ${cargo.stage !== "checked" ? `
        <div class="card-inline-upload-container" onclick="event.stopPropagation()">
          <button class="card-inline-upload-btn" onclick="triggerCardImageUpload('${cargo.id}', 'file')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span>${translations[lang].uploadImage}</span>
          </button>
          <button class="card-inline-upload-btn" onclick="triggerCardImageUpload('${cargo.id}', 'camera')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            <span>${translations[lang].camera}</span>
          </button>
        </div>
        ` : ''}

        <div class="card-body">
          <h3 class="card-title">${cargo.name}</h3>
          
          <div class="card-meta-row">
            <div class="meta-item">
              <span data-i18n="caseCode">${translations[lang].caseCode}</span>: <strong>${cargo.caseCode}</strong>
            </div>
            <div class="meta-item">
              <span data-i18n="trackingCode">${translations[lang].trackingCode}</span>: <strong>${cargo.trackingCode}</strong>
            </div>
            <div class="meta-item">
              <span>${translations[lang].time}</span>: <strong>${timeStr}</strong>
            </div>
            <div class="meta-item">
              <span>${translations[lang].date}</span>: <strong>${dateStr}</strong>
            </div>
          </div>

          <!-- Direct Status Buttons inside Card -->
          ${cargo.stage !== "checked" ? `
          <div class="card-status-selector" onclick="event.stopPropagation()">
            <button class="card-status-btn ${cargo.status === 'unchecked' ? 'active-unchecked' : ''}" onclick="changeCargoStatusDirect('${cargo.id}', 'unchecked')">${translations[lang].statusUnchecked}</button>
            <button class="card-status-btn ${cargo.status === 'complete' ? 'active-complete' : ''}" onclick="changeCargoStatusDirect('${cargo.id}', 'complete')">${translations[lang].statusComplete}</button>
            <button class="card-status-btn ${cargo.status === 'missing' ? 'active-missing' : ''}" onclick="changeCargoStatusDirect('${cargo.id}', 'missing')">${translations[lang].statusMissing}</button>
          </div>
          ` : ''}

          ${cargo.stage === "arrived" ? `
            <div class="manager-validation-panel" style="margin-top: 8px;">
              <span style="font-size: 0.75rem; font-weight: 700; color: var(--color-success)">${translations[lang].managerApprove}</span>
              <button class="btn btn-success btn-sm" style="padding: 4px 8px; font-size: 0.7rem;" onclick="approveCargoStage('${cargo.id}', event)">
                <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                ${translations[lang].managerApprove}
              </button>
            </div>
          ` : ''}

          <div class="card-actions">
            ${cargo.stage !== "checked" ? `
              <button class="btn btn-secondary btn-sm" onclick="openEditCargo('${cargo.id}', event)">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                ${translations[lang].edit}
              </button>
            ` : ''}
            <button class="btn btn-secondary btn-sm text-red" style="color: var(--color-danger);" onclick="deleteCargo('${cargo.id}', event)">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              ${translations[lang].delete}
            </button>
          </div>
        </div>
      </div>
    `;

    // Filter by stage
    if (cargo.stage === "not_arrived") {
      notArrivedHTML += cardHTML;
      notArrivedCount++;
    } else if (cargo.stage === "arrived") {
      arrivedHTML += cardHTML;
      arrivedCount++;
    } else if (cargo.stage === "checked") {
      checkedHTML += cardHTML;
      checkedCount++;
    }
  });

  notArrivedList.innerHTML = notArrivedHTML;
  arrivedList.innerHTML = arrivedHTML;
  checkedList.innerHTML = checkedHTML;

  // Update counts on desktop columns header
  document.getElementById("count-not-arrived").textContent = notArrivedCount;
  document.getElementById("count-arrived").textContent = arrivedCount;
  document.getElementById("count-checked").textContent = checkedCount;

  // Update counts on mobile segmented button switcher
  document.getElementById("switch-count-not-arrived").textContent = notArrivedCount;
  document.getElementById("switch-count-arrived").textContent = arrivedCount;
  document.getElementById("switch-count-checked").textContent = checkedCount;

  // Update column visibility class for mobile/tablet responsive layout
  document.getElementById("col-not-arrived").classList.toggle("active-col", currentDashboardColumn === "not_arrived");
  document.getElementById("col-arrived").classList.toggle("active-col", currentDashboardColumn === "arrived");
  document.getElementById("col-checked").classList.toggle("active-col", currentDashboardColumn === "checked");

  // Toggle "Delete All" button inside Column 3 Checked
  const btnDeleteAll = document.getElementById("btn-delete-all");
  if (btnDeleteAll) {
    if (checkedCount > 0) {
      btnDeleteAll.classList.remove("hidden");
    } else {
      btnDeleteAll.classList.add("hidden");
    }
  }
}

// Render Stats on About Panel
function renderAboutStats() {
  let depCount = 0;
  let arrCount = 0;
  
  cargoList.forEach(cargo => {
    // Departure counts: Any cargo created (stands for boxes sent out)
    depCount++;
    // Arrival counts: Cargo in 'arrived' or 'checked' stage
    if (cargo.stage === "arrived" || cargo.stage === "checked") {
      arrCount++;
    }
  });

  const depEl = document.getElementById("stat-dep-count");
  const arrEl = document.getElementById("stat-arr-count");
  
  if (depEl) depEl.textContent = depCount;
  if (arrEl) arrEl.textContent = arrCount;
}

// ================= DIRECT CARD INTERACTIONS & OPTIMISTIC SYNC LOGIC =================

function switchDashboardColumn(colName) {
  currentDashboardColumn = colName;
  
  // Highlight active segmented button switcher
  document.getElementById("switch-col-not-arrived").classList.toggle("active", colName === "not_arrived");
  document.getElementById("switch-col-arrived").classList.toggle("active", colName === "arrived");
  document.getElementById("switch-col-checked").classList.toggle("active", colName === "checked");
  
  // Rerender lists to toggle column visibility classes
  renderCargoLists();
}

async function changeCargoStatusDirect(id, newStatus) {
  const cargoIdx = cargoList.findIndex(c => c.id === id);
  if (cargoIdx === -1) return;
  
  const originalCargo = cargoList[cargoIdx];
  let stage = originalCargo.stage;
  
  // Move cargo across columns automatically based on status changes
  if (originalCargo.stage === "not_arrived" && (newStatus === "complete" || newStatus === "missing")) {
    stage = "arrived";
  } else if (originalCargo.stage === "arrived" && newStatus === "unchecked") {
    stage = "not_arrived";
  }
  
  cargoList[cargoIdx] = {
    ...originalCargo,
    status: newStatus,
    stage: stage,
    dateTime: new Date().toISOString()
  };
  
  // Optimistic UI Redraw: instant updates for user
  renderCargoLists();
  renderAboutStats();
  
  // Save in background to IndexedDB & Server
  await api.saveLocalCargoList(cargoList);
  await api.sendCargoToServer(cargoList);
}

function triggerCardImageUpload(id, source) {
  activeUploadCargoId = id;
  if (source === "camera") {
    document.getElementById("camera-capture-input-card-cam").click();
  } else {
    document.getElementById("camera-capture-input-card").click();
  }
}

async function handleCardImageUpload(event) {
  const files = Array.from(event.target.files);
  if (files.length === 0 || !activeUploadCargoId) return;
  
  const cargoIdx = cargoList.findIndex(c => c.id === activeUploadCargoId);
  if (cargoIdx === -1) return;
  
  const cargo = cargoList[cargoIdx];
  if (!cargo.images) cargo.images = [];
  
  for (const file of files) {
    try {
      const base64Str = await api.compressImage(file, 800, 0.7);
      cargo.images.push(base64Str);
    } catch (err) {
      console.error("Card image upload compression error:", err);
    }
  }
  
  cargo.dateTime = new Date().toISOString();
  
  // Optimistic UI Redraw: show uploaded image immediately
  renderCargoLists();
  
  // Save to db & server in background
  await api.saveLocalCargoList(cargoList);
  await api.sendCargoToServer(cargoList);
  
  // Reset state
  event.target.value = "";
  activeUploadCargoId = "";
}

// Expose functions globally to prevent window reference errors
window.switchDashboardColumn = switchDashboardColumn;
window.changeCargoStatusDirect = changeCargoStatusDirect;
window.triggerCardImageUpload = triggerCardImageUpload;
window.handleCardImageUpload = handleCardImageUpload;

// 10. Modals Close helper
function closeModal(modalId) {
  document.getElementById(modalId).classList.add("hidden");
}

// Close modal when clicking on backdrop
document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
  backdrop.addEventListener("click", function(e) {
    if (e.target === this) {
      this.classList.add("hidden");
    }
  });
});

// 11. Image Zooming logic
function openZoomOverlay(imgSrc, event) {
  if (event) event.stopPropagation(); // Avoid triggering details modal if clicked inside list
  
  const overlay = document.getElementById("overlay-zoom");
  const img = document.getElementById("zoomed-image");
  
  img.src = imgSrc;
  overlay.classList.remove("hidden");
  
  resetZoom();
}

function closeZoomOverlay() {
  document.getElementById("overlay-zoom").classList.add("hidden");
}

function adjustZoom(factor) {
  zoomScale = Math.max(0.5, Math.min(4, zoomScale + factor));
  updateZoomTransform();
}

function resetZoom() {
  zoomScale = 1.0;
  panX = 0;
  panY = 0;
  updateZoomTransform();
}

function updateZoomTransform() {
  const img = document.getElementById("zoomed-image");
  if (img) {
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
  }
}

// Mouse wheel zoom
const zoomContainer = document.querySelector(".zoom-container");
if (zoomContainer) {
  zoomContainer.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 0.1 : -0.1;
    adjustZoom(factor);
  });
}

// Mouse Drag/Pan Zoomed Image
function startDrag(e) {
  e.preventDefault();
  isPanning = true;
  startX = e.clientX - panX;
  startY = e.clientY - panY;
  
  document.addEventListener("mousemove", dragImage);
  document.addEventListener("mouseup", stopDrag);
}

function dragImage(e) {
  if (!isPanning) return;
  panX = e.clientX - startX;
  panY = e.clientY - startY;
  updateZoomTransform();
}

function stopDrag() {
  isPanning = false;
  document.removeEventListener("mousemove", dragImage);
  document.removeEventListener("mouseup", stopDrag);
}

// Touch Drag/Pan (Mobile support)
function startTouchDrag(e) {
  if (e.touches.length !== 1) return; // Only single finger drag
  isPanning = true;
  startX = e.touches[0].clientX - panX;
  startY = e.touches[0].clientY - panY;
  
  document.addEventListener("touchmove", touchDragImage, { passive: false });
  document.addEventListener("touchend", stopTouchDrag);
}

function touchDragImage(e) {
  if (!isPanning || e.touches.length !== 1) return;
  e.preventDefault();
  panX = e.touches[0].clientX - startX;
  panY = e.touches[0].clientY - startY;
  updateZoomTransform();
}

function stopTouchDrag() {
  isPanning = false;
  document.removeEventListener("touchmove", touchDragImage);
  document.removeEventListener("touchend", stopTouchDrag);
}

// Manager update settings input changes
document.getElementById("setting-manager-name").addEventListener("change", (e) => {
  systemSettings.managerName = e.target.value.trim() || "Hout Dara";
  saveSystemSettings();
  renderCargoLists(); // Update labels
});

// Register Service Worker for offline capability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered successfully:', reg.scope))
      .catch(err => console.warn('Service Worker registration failed:', err));
  });
}
