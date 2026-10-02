import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, query, orderBy, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAm64KiQ4kF5z0TcM-npVFUja6umeoDyxU",
  authDomain: "checklistb10.firebaseapp.com",
  projectId: "checklistb10",
  storageBucket: "checklistb10.firebasestorage.app",
  messagingSenderId: "322956120324",
  appId: "1:322956120324:web:bb4f6f439aa09f66ea8051"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const baseChecklistItems = [
  {
    id: "vin",
    title: "LLEVA EL VIN BIEN GRABADO"
  },
  {
    id: "laserTecho",
    title: "TIENE EL LÁSER DEL TECHO OK",
    options: ["IZQ", "DCHO"]
  },
  {
    id: "paresCriticos",
    title: "HAS REVISADO TODOS LOS PARES CRÍTICOS",
    options: ["PDI", "PDD", "PTI", "PTD", "SUELO", "PORTÓN", "CAPO CARROCERÍA", "CAPO A BISAGRA"]
  },
  {
    id: "chapaTerminada",
    title: "ESTA EL COCHE TERMINADO DE CHAPA",
    options: ["PUERTAS", "CAPO", "LATERAL IZQ", "LATERAL DCHO", "PORTÓN"]
  },
  {
    id: "aletas",
    title: "LAS ALETAS ESTÁN BIEN COLOCADAS",
    options: ["IZQ", "DCHA"]
  },
  {
    id: "bollhoff",
    title: "LOS BOLLHOFF ESTÁN EN LAS PUERTAS"
  },
  {
    id: "pastaVisible",
    title: "ESTA EL COCHE LIMPIO DE PASTA EN ZONAS VISIBLES"
  },
  {
    id: "ajuste",
    title: "AJUSTE"
  }
];

const CONTROL_PASSWORD = "0109";
const CONTROLS_STORAGE_KEY = "carroceria_controles_v3";

// Todos los puntos de la inspección son CONTROLES. No existe diferencia
// funcional entre los controles que vienen de inicio y los que se añaden.
const initialControls = baseChecklistItems.map(item => ({
  ...item,
  options: Array.isArray(item.options) ? [...item.options] : undefined
}));

let checklistItems = loadControls();

const state = {
  answers: {},
  reasons: {}
};

const homeScreen = document.getElementById("homeScreen");
const inspectionScreen = document.getElementById("inspectionScreen");
const historyScreen = document.getElementById("historyScreen");
const analysisScreen = document.getElementById("analysisScreen");
const checklist = document.getElementById("checklist");
const vehicleNumber = document.getElementById("vehicleNumber");
const vehicleError = document.getElementById("vehicleError");
const saveBtn = document.getElementById("saveBtn");
const overallStatusText = document.getElementById("overallStatusText");
const progressText = document.getElementById("progressText");
const progressBar = document.getElementById("progressBar");
const inspectionSummary = document.querySelector(".inspection-summary");
const headerStatus = document.getElementById("headerStatus");
const toast = document.getElementById("toast");
const dashboardDateFilter = document.getElementById("dashboardDateFilter");
const dashboardCarsCount = document.getElementById("dashboardCarsCount");
const dashboardDefectsCount = document.getElementById("dashboardDefectsCount");
const defectChart = document.getElementById("defectChart");

function normalizeControl(item) {
  if (!item || typeof item.id !== "string" || typeof item.title !== "string") return null;

  const title = item.title.trim();
  if (!title) return null;

  const options = Array.isArray(item.options)
    ? item.options.map(option => String(option).trim()).filter(Boolean)
    : [];

  return {
    id: item.id,
    title,
    ...(options.length ? { options } : {})
  };
}

function loadControls() {
  try {
    // v3 is the single source of truth: every item in this array is a
    // control/punto, whether it was original or added later.
    const savedV3 = JSON.parse(localStorage.getItem(CONTROLS_STORAGE_KEY) || "null");
    if (Array.isArray(savedV3)) {
      return savedV3.map(normalizeControl).filter(Boolean);
    }

    // Repair/migrate older versions. The previous releases could store only
    // custom controls, which made the original points impossible to manage.
    // Build v3 with ALL original points + any custom controls found in v1/v2.
    const oldV2 = JSON.parse(localStorage.getItem("carroceria_controles_v2") || "null");
    const oldCustom = JSON.parse(localStorage.getItem("carroceria_custom_controls_v1") || "[]");
    const oldV2Controls = Array.isArray(oldV2) ? oldV2 : [];
    const oldCustomControls = Array.isArray(oldCustom) ? oldCustom : [];

    const merged = [...initialControls, ...oldV2Controls, ...oldCustomControls]
      .map(normalizeControl)
      .filter(Boolean);

    const seen = new Set();
    const unique = merged.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    // The user explicitly wants the original points to be manageable now.
    // We therefore intentionally do NOT import the old "removed controls"
    // list: those removals came from the old, incompatible implementation.
    localStorage.setItem(CONTROLS_STORAGE_KEY, JSON.stringify(unique));
    return unique;
  } catch (error) {
    console.warn("No se pudieron cargar los controles:", error);
    const fallback = initialControls.map(normalizeControl).filter(Boolean);
    localStorage.setItem(CONTROLS_STORAGE_KEY, JSON.stringify(fallback));
    return fallback;
  }
}
function saveControls() {
  localStorage.setItem(CONTROLS_STORAGE_KEY, JSON.stringify(checklistItems));
}

function getAllActiveControls() {
  return checklistItems;
}

function askForControlPassword(actionLabel) {
  const password = window.prompt(`Introduce la contraseña para ${actionLabel}:`);
  if (password === null) return false;

  if (password !== CONTROL_PASSWORD) {
    showToast("Contraseña incorrecta.");
    return false;
  }

  return true;
}

function openAddControlModal() {
  const modal = document.getElementById("addControlModal");
  const titleInput = document.getElementById("newControlTitle");
  const optionInputs = [...document.querySelectorAll(".new-control-option")];
  titleInput.value = "";
  optionInputs.forEach(input => { input.value = ""; });
  modal.classList.add("visible");
  titleInput.focus();
}

function closeAddControlModal() {
  document.getElementById("addControlModal").classList.remove("visible");
}

function addCustomControl() {
  if (!askForControlPassword("poner controles")) return;
  openAddControlModal();
}

function saveNewControlFromModal() {
  const title = document.getElementById("newControlTitle").value.trim();
  const options = [...document.querySelectorAll(".new-control-option")]
    .map(input => input.value.trim())
    .filter(Boolean);

  if (!title) {
    showToast("El nombre del control no puede estar vacío.");
    return;
  }

  const id = `control_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  checklistItems.push({
    id,
    title,
    ...(options.length ? { options } : {})
  });
  saveControls();
  renderChecklist();
  updateSummary();
  closeAddControlModal();
  showToast(options.length
    ? `Control añadido con ${options.length} opciones.`
    : "Control añadido correctamente.");
}

function openRemoveControlModal() {
  if (!askForControlPassword("quitar controles")) return;

  const activeControls = getAllActiveControls();
  if (!activeControls.length) {
    showToast("No hay controles activos para quitar.");
    return;
  }

  const select = document.getElementById("removeControlSelect");
  select.innerHTML = activeControls.map((item, index) =>
    `<option value="${item.id}">PUNTO ${index + 1} — ${item.title}</option>`
  ).join("");
  document.getElementById("removeControlModal").classList.add("visible");
}

function closeRemoveControlModal() {
  document.getElementById("removeControlModal").classList.remove("visible");
}

function removeSelectedControl() {
  const id = document.getElementById("removeControlSelect").value;
  const selected = checklistItems.find(item => item.id === id);

  if (!selected) {
    showToast("No se ha encontrado ese control.");
    return;
  }

  const confirmed = window.confirm(`¿Quieres quitar el control "${selected.title}"?`);
  if (!confirmed) return;

  checklistItems = checklistItems.filter(item => item.id !== selected.id);
  saveControls();

  delete state.answers[selected.id];
  delete state.reasons[selected.id];

  renderChecklist();
  updateSummary();
  closeRemoveControlModal();
  showToast(`Control eliminado: ${selected.title}`);
}

function renderChecklist() {
  checklist.innerHTML = checklistItems.map((item, index) => `
    <article class="check-item" data-item="${item.id}">
      <div class="check-top">
        <div>
          <div class="check-number">PUNTO ${index + 1}</div>
          <h3 class="check-title">${item.title}</h3>
        </div>
        <div class="check-options">
          <button type="button" class="check-btn ok" data-action="ok" data-id="${item.id}">OK</button>
          <button type="button" class="check-btn nok" data-action="nok" data-id="${item.id}">NOK</button>
        </div>
      </div>

      <div class="nok-details" id="details-${item.id}">
        ${item.options ? `
          <div class="nok-detail-title">¿Qué elemento está NOK?</div>
          <div class="nok-option-list">
            ${item.options.map((option, optionIndex) => `
              <label class="nok-option">
                <input
                  type="checkbox"
                  data-nok-option="${item.id}"
                  data-option="${option}"
                  id="nok-${item.id}-${optionIndex}"
                >
                <span class="custom-checkbox"></span>
                <span>${option}</span>
              </label>
            `).join("")}
          </div>
        ` : `
          <label class="reason-label" for="reasonInput-${item.id}">Motivo del NOK *</label>
          <textarea
            id="reasonInput-${item.id}"
            data-reason="${item.id}"
            placeholder="Explica por qué este punto estaba NOK..."
          ></textarea>
        `}
      </div>
    </article>
  `).join("");

  document.querySelectorAll(".check-btn").forEach(button => {
    button.addEventListener("click", () => setAnswer(button.dataset.id, button.dataset.action));
  });

  document.querySelectorAll("textarea[data-reason]").forEach(textarea => {
    textarea.addEventListener("input", () => {
      state.reasons[textarea.dataset.reason] = textarea.value.trim();
      updateSummary();
    });
  });

  document.querySelectorAll("input[data-nok-option]").forEach(checkbox => {
    checkbox.addEventListener("change", () => {
      const id = checkbox.dataset.nokOption;
      if (!state.reasons[id]) state.reasons[id] = [];
      const values = Array.isArray(state.reasons[id]) ? state.reasons[id] : [];

      if (checkbox.checked && !values.includes(checkbox.dataset.option)) {
        values.push(checkbox.dataset.option);
      }

      if (!checkbox.checked) {
        state.reasons[id] = values.filter(value => value !== checkbox.dataset.option);
      } else {
        state.reasons[id] = values;
      }

      updateSummary();
    });
  });
}

function setAnswer(id, answer) {
  state.answers[id] = answer;

  const item = document.querySelector(`[data-item="${id}"]`);
  const okButton = item.querySelector('[data-action="ok"]');
  const nokButton = item.querySelector('[data-action="nok"]');
  const details = item.querySelector(".nok-details");

  okButton.classList.toggle("active", answer === "ok");
  nokButton.classList.toggle("active", answer === "nok");
  details.classList.toggle("visible", answer === "nok");

  if (answer !== "nok") {
    state.reasons[id] = item.querySelectorAll('input[data-nok-option]').length ? [] : "";
    item.querySelectorAll('input[data-nok-option]').forEach(input => {
      input.checked = false;
    });
    const textarea = item.querySelector("textarea");
    if (textarea) textarea.value = "";
  }

  updateSummary();
}

function hasNokReason(item) {
  if (state.answers[item.id] !== "nok") return true;

  if (item.options) {
    return Array.isArray(state.reasons[item.id]) && state.reasons[item.id].length > 0;
  }

  return typeof state.reasons[item.id] === "string" && state.reasons[item.id].length > 0;
}

function updateSummary() {
  const total = checklistItems.length;
  const answered = checklistItems.filter(item => state.answers[item.id]).length;
  const hasNok = checklistItems.some(item => state.answers[item.id] === "nok");
  const allNokHaveReason = checklistItems.every(hasNokReason);
  const vehicleOk = /^\d{6}$/.test(vehicleNumber.value);
  const complete = answered === total && allNokHaveReason && vehicleOk;
  const finalOk = complete && !hasNok;

  progressText.textContent = `${answered} / ${total}`;
  progressBar.style.width = `${(answered / total) * 100}%`;

  if (finalOk) {
    overallStatusText.textContent = "OK";
    inspectionSummary.classList.add("good");
    headerStatus.textContent = "INSPECCIÓN OK";
    headerStatus.className = "status-pill green";
  } else {
    overallStatusText.textContent = hasNok ? "NOK" : "PENDIENTE";
    inspectionSummary.classList.remove("good");
    headerStatus.textContent = hasNok ? "NOK" : "PENDIENTE";
    headerStatus.className = "status-pill red";
  }

  saveBtn.disabled = !complete;
}

function validateVehicle() {
  const value = vehicleNumber.value.trim();

  if (!value) {
    vehicleError.textContent = "El número de vehículo es obligatorio.";
    return false;
  }

  if (!/^\d{6}$/.test(value)) {
    vehicleError.textContent = "Debe contener exactamente 6 dígitos.";
    return false;
  }

  vehicleError.textContent = "";
  return true;
}

vehicleNumber.addEventListener("input", () => {
  vehicleNumber.value = vehicleNumber.value.replace(/\D/g, "").slice(0, 6);
  validateVehicle();
  updateSummary();
});

document.getElementById("inspectionForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!validateVehicle()) return;

  const incomplete = checklistItems.find(item => !state.answers[item.id]);
  if (incomplete) {
    showToast(`Falta cerrar el punto ${checklistItems.indexOf(incomplete) + 1}.`);
    return;
  }

  const missingReason = checklistItems.find(item =>
    state.answers[item.id] === "nok" && !hasNokReason(item)
  );

  if (missingReason) {
    showToast(`Indica el motivo del NOK del punto ${checklistItems.indexOf(missingReason) + 1}.`);
    return;
  }

  const result = {
    vehicleNumber: vehicleNumber.value,
    timestamp: new Date().toISOString(),
    finalStatus: checklistItems.some(item => state.answers[item.id] === "nok") ? "NOK" : "OK",
    points: Object.fromEntries(checklistItems.map(item => [
      item.id,
      {
        status: state.answers[item.id].toUpperCase(),
        reason: Array.isArray(state.reasons[item.id])
          ? state.reasons[item.id].join(", ")
          : (state.reasons[item.id] || "")
      }
    ]))
  };

  try {
    saveBtn.disabled = true;
    await addDoc(collection(db, "inspecciones"), {
      vehiculo: result.vehicleNumber,
      fecha: serverTimestamp(),
      estadoFinal: result.finalStatus,
      puntos: Object.fromEntries(checklistItems.map(item => [item.id, {
        titulo: item.title,
        esPersonalizado: false,
        estado: state.answers[item.id].toUpperCase(),
        opcionesNok: Array.isArray(state.reasons[item.id]) ? state.reasons[item.id] : [],
        motivo: Array.isArray(state.reasons[item.id]) ? "" : (state.reasons[item.id] || "")
      }]))
    });
    showToast("Inspección guardada correctamente en Firebase.");
    await loadDashboard();
    setTimeout(() => { resetInspection(); showScreen(homeScreen); }, 1200);
  } catch (error) {
    console.error("Error guardando en Firebase:", error);
    showToast("No se pudo guardar en Firebase. Revisa las reglas de Firestore.");
    updateSummary();
  }
});

function resetInspection() {
  state.answers = {};
  state.reasons = {};
  vehicleNumber.value = "";
  vehicleError.textContent = "";
  renderChecklist();
  updateSummary();
}

function showScreen(screen) {
  [homeScreen, inspectionScreen, historyScreen, analysisScreen].forEach(item => item.classList.remove("active"));
  screen.classList.add("active");

  if (screen === homeScreen) {
    headerStatus.textContent = "SIN INSPECCIÓN";
    headerStatus.className = "status-pill neutral";
  }
}

document.getElementById("newInspectionBtn").addEventListener("click", () => {
  resetInspection();
  showScreen(inspectionScreen);
  vehicleNumber.focus();
});

if (dashboardDateFilter) {
  dashboardDateFilter.addEventListener("change", renderDashboard);
}

document.getElementById("historyBtn").addEventListener("click", async () => {
  showScreen(historyScreen);
  await loadHistory();
});

document.getElementById("defectsAnalysisBtn")?.addEventListener("click", async () => {
  showScreen(analysisScreen);
  await loadDashboard();
});

document.getElementById("backHomeBtn").addEventListener("click", () => {
  resetInspection();
  showScreen(homeScreen);
});

document.getElementById("backHistoryBtn").addEventListener("click", () => {
  showScreen(homeScreen);
});

document.getElementById("backAnalysisBtn")?.addEventListener("click", () => {
  showScreen(homeScreen);
});

document.getElementById("cancelBtn").addEventListener("click", () => {
  resetInspection();
  showScreen(homeScreen);
});


let historyRecords = [];

async function loadHistory() {
  const container = document.getElementById("historyList");
  const dateFilter = document.getElementById("historyDateFilter");
  const vehicleSearch = document.getElementById("historyVehicleSearch");
  const clearFilters = document.getElementById("clearHistoryFilters");

  if (!container) return;

  container.innerHTML = '<div class="history-empty"><div class="empty-icon">▤</div><h3>Cargando historial...</h3></div>';

  try {
    const snapshot = await getDocs(
      query(
        collection(db, "inspecciones"),
        orderBy("fecha", "desc")
      )
    );

    historyRecords = snapshot.docs.map(doc => ({
      id: doc.id,
      data: doc.data()
    }));

    populateHistoryDateFilter();
    renderFilteredHistory();

    if (dateFilter && !dateFilter.dataset.bound) {
      dateFilter.addEventListener("change", renderFilteredHistory);
      dateFilter.dataset.bound = "true";
    }

    if (vehicleSearch && !vehicleSearch.dataset.bound) {
      vehicleSearch.addEventListener("input", renderFilteredHistory);
      vehicleSearch.dataset.bound = "true";
    }

    if (clearFilters && !clearFilters.dataset.bound) {
      clearFilters.addEventListener("click", () => {
        dateFilter.value = "";
        vehicleSearch.value = "";
        renderFilteredHistory();
      });
      clearFilters.dataset.bound = "true";
    }
  } catch (error) {
    console.error("Error cargando historial:", error);
    container.innerHTML = '<div class="history-empty"><div class="empty-icon">⚠</div><h3>No se pudo cargar el historial</h3><p>Revisa Firebase y las reglas de Firestore.</p></div>';
  }
}

function getHistoryDateKey(timestamp) {
  if (!timestamp) return "";

  const date = timestamp.toDate
    ? timestamp.toDate()
    : new Date(timestamp);

  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatHistoryDate(timestamp) {
  if (!timestamp) return "Fecha pendiente";

  const date = timestamp.toDate
    ? timestamp.toDate()
    : new Date(timestamp);

  if (Number.isNaN(date.getTime())) return "Fecha pendiente";

  return date.toLocaleString("es-ES");
}

function formatHistoryDay(dateKey) {
  const [year, month, day] = dateKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  return date.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function populateHistoryDateFilter() {
  const dateFilter = document.getElementById("historyDateFilter");
  if (!dateFilter) return;

  const currentValue = dateFilter.value;

  const dates = [...new Set(
    historyRecords
      .map(record => getHistoryDateKey(record.data.fecha))
      .filter(Boolean)
  )].sort((a, b) => b.localeCompare(a));

  dateFilter.innerHTML = '<option value="">Todos los días</option>' +
    dates.map(dateKey => `
      <option value="${dateKey}">${formatHistoryDay(dateKey)}</option>
    `).join("");

  if (dates.includes(currentValue)) {
    dateFilter.value = currentValue;
  }
}

async function deleteHistoryRecord(recordId, vehicleNumber) {
  const confirmed = window.confirm(`¿Quieres borrar la inspección del vehículo ${vehicleNumber || "—"}?\n\nEsta acción eliminará el registro de Firebase y también lo quitará del gráfico.`);
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "inspecciones", recordId));

    historyRecords = historyRecords.filter(record => record.id !== recordId);
    dashboardRecords = dashboardRecords.filter(record => record.id !== recordId);

    populateHistoryDateFilter();
    renderFilteredHistory();
    populateDashboardDateFilter();
    renderDashboard();

    showToast(`Inspección del vehículo ${vehicleNumber || "—"} eliminada.`);
  } catch (error) {
    console.error("Error eliminando inspección:", error);
    showToast("No se pudo borrar la inspección. Revisa los permisos de Firebase.");
  }
}

function renderFilteredHistory() {
  const container = document.getElementById("historyList");
  const dateFilter = document.getElementById("historyDateFilter");
  const vehicleSearch = document.getElementById("historyVehicleSearch");

  if (!container) return;

  const selectedDate = dateFilter?.value || "";
  const search = (vehicleSearch?.value || "").trim().toLowerCase();

  const filtered = historyRecords.filter(record => {
    const data = record.data;
    const vehicle = String(data.vehiculo || "").toLowerCase();
    const recordDate = getHistoryDateKey(data.fecha);

    const matchesDate = !selectedDate || recordDate === selectedDate;
    const matchesVehicle = !search || vehicle.includes(search);

    return matchesDate && matchesVehicle;
  });

  if (!filtered.length) {
    container.innerHTML = `
      <div class="history-empty">
        <div class="empty-icon">⌕</div>
        <h3>No hay resultados</h3>
        <p>No se encontraron inspecciones con los filtros seleccionados.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(record => {
    const data = record.data;
    const date = formatHistoryDate(data.fecha);
    const status = data.estadoFinal || "NOK";

    const nokDetails = Object.entries(data.puntos || {})
      .filter(([, p]) => p.estado === "NOK")
      .map(([id, p]) => {
        const item = checklistItems.find(x => x.id === id);
        const title = p.titulo || item?.title || id;
        const detail = p.opcionesNok?.length
          ? p.opcionesNok.join(", ")
          : (p.motivo || "Sin motivo");

        return `<div><strong>${title}:</strong> ${detail}</div>`;
      })
      .join("");

    return `
      <article class="history-card">
        <div class="history-card-top">
          <div>
            <strong>Vehículo ${data.vehiculo || "—"}</strong>
            <div class="history-date">${date}</div>
          </div>
          <div class="history-card-actions">
            <span class="status-pill ${status === "OK" ? "green" : "red"}">${status}</span>
            <button
              type="button"
              class="history-delete-btn"
              title="Borrar inspección"
              aria-label="Borrar inspección del vehículo ${escapeHtml(data.vehiculo || "—")}"
              data-delete-history="${record.id}"
            >🗑️</button>
          </div>
        </div>

        ${nokDetails ? `
          <div class="history-details">
            ${nokDetails}
          </div>
        ` : ""}
      </article>
    `;
  }).join("");

  container.querySelectorAll("[data-delete-history]").forEach(button => {
    button.addEventListener("click", () => {
      const record = historyRecords.find(item => item.id === button.dataset.deleteHistory);
      if (!record) return;
      deleteHistoryRecord(record.id, record.data.vehiculo);
    });
  });
}
let dashboardRecords = [];

function getRecordDateKey(record) {
  return getHistoryDateKey(record?.data?.fecha);
}

function getRecordDefects(record) {
  const points = record?.data?.puntos || {};
  const defects = [];

  Object.entries(points).forEach(([id, point]) => {
    if (!point || point.estado !== "NOK") return;

    const title = point.titulo || checklistItems.find(item => item.id === id)?.title || id;
    const options = Array.isArray(point.opcionesNok)
      ? point.opcionesNok.map(value => String(value).trim()).filter(Boolean)
      : [];

    if (options.length) {
      options.forEach(option => defects.push(`${title} — ${option}`));
      return;
    }

    const reason = String(point.motivo || "").trim();
    defects.push(reason ? `${title} — ${reason}` : title);
  });

  return defects;
}

function populateDashboardDateFilter() {
  if (!dashboardDateFilter) return;

  const currentValue = dashboardDateFilter.value;
  const dates = [...new Set(
    dashboardRecords.map(getRecordDateKey).filter(Boolean)
  )].sort((a, b) => b.localeCompare(a));

  dashboardDateFilter.innerHTML = '<option value="">GENERAL</option>' +
    dates.map(dateKey => `<option value="${dateKey}">${formatHistoryDay(dateKey)}</option>`).join("");

  if (dates.includes(currentValue)) dashboardDateFilter.value = currentValue;
}

function renderDashboard() {
  if (!defectChart || !dashboardCarsCount || !dashboardDefectsCount) return;

  const selectedDate = dashboardDateFilter?.value || "";
  const filtered = dashboardRecords.filter(record => {
    return !selectedDate || getRecordDateKey(record) === selectedDate;
  });

  const counts = new Map();
  filtered.forEach(record => {
    getRecordDefects(record).forEach(defect => {
      counts.set(defect, (counts.get(defect) || 0) + 1);
    });
  });

  const rows = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));

  dashboardCarsCount.textContent = String(filtered.length);
  dashboardDefectsCount.textContent = String(rows.reduce((sum, [, count]) => sum + count, 0));

  if (!filtered.length) {
    defectChart.innerHTML = '<div class="dashboard-empty"><strong>Sin inspecciones</strong><span>No hay coches inspeccionados en el periodo seleccionado.</span></div>';
    return;
  }

  if (!rows.length) {
    defectChart.innerHTML = '<div class="dashboard-empty"><strong>Sin defectos NOK</strong><span>Las inspecciones de este periodo no tienen defectos registrados.</span></div>';
    return;
  }

  const max = Math.max(...rows.map(([, count]) => count));
  defectChart.innerHTML = rows.map(([label, count]) => {
    const width = Math.max(3, Math.round((count / max) * 100));
    return `
      <div class="defect-row" title="${escapeHtml(label)}: ${count}">
        <div class="defect-row-top">
          <span class="defect-label">${escapeHtml(label)}</span>
          <strong>${count}</strong>
        </div>
        <div class="defect-bar-track"><div class="defect-bar" style="width:${width}%"></div></div>
      </div>
    `;
  }).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadDashboard() {
  if (!defectChart) return;

  defectChart.innerHTML = '<div class="dashboard-empty"><strong>Cargando datos...</strong><span>Consultando inspecciones guardadas.</span></div>';

  try {
    const snapshot = await getDocs(
      query(collection(db, "inspecciones"), orderBy("fecha", "desc"))
    );

    dashboardRecords = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
    populateDashboardDateFilter();
    renderDashboard();
  } catch (error) {
    console.error("Error cargando dashboard:", error);
    dashboardRecords = [];
    dashboardCarsCount.textContent = "0";
    dashboardDefectsCount.textContent = "0";
    defectChart.innerHTML = '<div class="dashboard-empty"><strong>No se pudieron cargar los datos</strong><span>Revisa Firebase y las reglas de Firestore.</span></div>';
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

document.getElementById("addControlBtn")?.addEventListener("click", addCustomControl);
document.getElementById("removeControlBtn")?.addEventListener("click", openRemoveControlModal);
document.getElementById("saveNewControlBtn")?.addEventListener("click", saveNewControlFromModal);
document.getElementById("cancelAddControlBtn")?.addEventListener("click", closeAddControlModal);
document.getElementById("confirmRemoveControlBtn")?.addEventListener("click", removeSelectedControl);
document.getElementById("cancelRemoveControlBtn")?.addEventListener("click", closeRemoveControlModal);

renderChecklist();
updateSummary();
