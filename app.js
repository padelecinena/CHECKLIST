import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, query, orderBy, deleteDoc, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

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
    title: "AJUSTE",
    options: [
      "CAPO CON ALETA IZQ",
      "CAPO CON ALETA DERECHA",
      "CAPO",
      "ALETA IZQ",
      "ALETA DCHA",
      "PORTÓN",
      "PUERTAS IZQ",
      "PUERTAS DCHAS"
    ]
  }
];

const CONTROL_PASSWORD = "0109";
const CONTROLS_STORAGE_KEY = "carroceria_controles_v3";
const CONTROLS_DOC = doc(db, "inspecciones", "__config_controles");
let controlsSyncReady = false;
let controlsSyncUnsubscribe = null;

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
    const savedV3 = JSON.parse(localStorage.getItem(CONTROLS_STORAGE_KEY) || "null");
    if (Array.isArray(savedV3)) {
      return savedV3.map(normalizeControl).filter(Boolean);
    }

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

    localStorage.setItem(CONTROLS_STORAGE_KEY, JSON.stringify(unique));
    return unique;
  } catch (error) {
    console.warn("No se pudieron cargar los controles:", error);
    const fallback = initialControls.map(normalizeControl).filter(Boolean);
    localStorage.setItem(CONTROLS_STORAGE_KEY, JSON.stringify(fallback));
    return fallback;
  }
}

function saveControlsLocal() {
  localStorage.setItem(CONTROLS_STORAGE_KEY, JSON.stringify(checklistItems));
}

async function saveControlsRemote() {
  try {
    await setDoc(CONTROLS_DOC, {
      controls: checklistItems,
      updatedAt: serverTimestamp()
    }, { merge: true });
    controlsSyncReady = true;
    return true;
  } catch (error) {
    console.error("No se pudieron sincronizar los controles con Firebase:", error);
    showToast("No se pudo sincronizar el cambio con Firebase.");
    return false;
  }
}

async function initializeControlsSync() {
  try {
    const snapshot = await getDoc(CONTROLS_DOC);

    if (snapshot.exists() && Array.isArray(snapshot.data().controls)) {
      let remoteControls = snapshot.data().controls.map(normalizeControl).filter(Boolean);
      if (remoteControls.length) {
        // AJUSTE (control 7) lleva estas opciones por defecto para que
        // también se incorporen en instalaciones/dispositivos existentes.
        const ajusteDefaults = initialControls.find(item => item.id === "ajuste");
        let remoteChanged = false;
        remoteControls = remoteControls.map(item => {
          if (item.id === "ajuste" && (!item.options || !item.options.length) && ajusteDefaults?.options?.length) {
            remoteChanged = true;
            return { ...item, options: [...ajusteDefaults.options] };
          }
          return item;
        });

        checklistItems = remoteControls;
        saveControlsLocal();
        renderChecklist();
        updateSummary();

        if (remoteChanged) {
          await saveControlsRemote();
        }
      }
    } else {
      // Primera puesta en marcha: publica los controles que ya existían
      // localmente para que no se pierda el trabajo realizado hasta ahora.
      await saveControlsRemote();
    }

    if (controlsSyncUnsubscribe) controlsSyncUnsubscribe();
    controlsSyncUnsubscribe = onSnapshot(CONTROLS_DOC, (snap) => {
      if (!snap.exists()) return;
      const remoteControls = snap.data().controls;
      if (!Array.isArray(remoteControls)) return;

      const normalized = remoteControls.map(normalizeControl).filter(Boolean);
      checklistItems = normalized;
      saveControlsLocal();
      renderChecklist();
      updateSummary();
      // Si el análisis ya está cargado, aplica inmediatamente el mismo
      // catálogo global de controles sin esperar a recargar la página.
      if (dashboardRecords.length) {
        populateDashboardDateFilter();
        renderDashboard();
      }
    }, (error) => {
      console.error("Error escuchando los controles de Firebase:", error);
      showToast("No se pudo actualizar la lista de controles en tiempo real.");
    });

    controlsSyncReady = true;
  } catch (error) {
    console.error("No se pudo iniciar la sincronización de controles:", error);
    showToast("No se pudo cargar la lista compartida de controles.");
  }
}

function saveControls() {
  saveControlsLocal();
  if (controlsSyncReady) saveControlsRemote();
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

async function saveNewControlFromModal() {
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
  saveControlsLocal();
  const synced = await saveControlsRemote();
  renderChecklist();
  updateSummary();
  closeAddControlModal();
  showToast(synced
    ? (options.length ? `Control añadido y compartido con todos los dispositivos (${options.length} opciones).` : "Control añadido y compartido con todos los dispositivos.")
    : "Control añadido en este dispositivo, pero no se pudo sincronizar.");
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

async function removeSelectedControl() {
  const id = document.getElementById("removeControlSelect").value;
  const selected = checklistItems.find(item => item.id === id);

  if (!selected) {
    showToast("No se ha encontrado ese control.");
    return;
  }

  const confirmed = window.confirm(`¿Quieres quitar el control "${selected.title}"?`);
  if (!confirmed) return;

  checklistItems = checklistItems.filter(item => item.id !== selected.id);
  saveControlsLocal();
  const synced = await saveControlsRemote();

  delete state.answers[selected.id];
  delete state.reasons[selected.id];

  renderChecklist();
  updateSummary();
  closeRemoveControlModal();
  showToast(synced
    ? `Control eliminado y actualizado en todos los dispositivos: ${selected.title}`
    : `Control eliminado en este dispositivo, pero no se pudo sincronizar: ${selected.title}`);
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

document.getElementById("generatePdfBtn")?.addEventListener("click", generateAnalysisPdf);

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

function updateHistoryVehicleCount(selectedDate = "") {
  const counter = document.getElementById("historyVehicleCount");
  if (!counter) return;

  const count = historyRecords.filter(record => {
    const recordDate = getHistoryDateKey(record.data.fecha);
    return !selectedDate || recordDate === selectedDate;
  }).length;

  const label = selectedDate
    ? `Carrocerías enviadas el ${formatHistoryDay(selectedDate)}`
    : "Carrocerías enviadas";

  counter.innerHTML = `
    <span class="history-vehicle-count-label">${label}</span>
    <strong>${count}</strong>
  `;
}

function renderFilteredHistory() {
  const container = document.getElementById("historyList");
  const dateFilter = document.getElementById("historyDateFilter");
  const vehicleSearch = document.getElementById("historyVehicleSearch");

  if (!container) return;

  const selectedDate = dateFilter?.value || "";
  const search = (vehicleSearch?.value || "").trim().toLowerCase();

  updateHistoryVehicleCount(selectedDate);

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

function getRecordDate(record) {
  const value = record?.data?.fecha;
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Las semanas se calculan como semanas ISO. La regla de trabajo es:
// semana impar: A mañana / B tarde; semana par: B mañana / A tarde.
function getISOWeekInfo(date) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay() || 7;
  local.setDate(local.getDate() + 4 - day);
  const yearStart = new Date(local.getFullYear(), 0, 1);
  const week = Math.ceil((((local - yearStart) / 86400000) + 1) / 7);
  return { week, year: local.getFullYear() };
}

function getWorkShift(record) {
  const date = getRecordDate(record);
  if (!date) return { team: "SIN TURNO", period: "", label: "SIN TURNO", week: null };

  const minutes = date.getHours() * 60 + date.getMinutes();
  const { week } = getISOWeekInfo(date);
  let period = "";
  if (minutes >= 360 && minutes < 840) period = "MAÑANA";       // 06:00-13:59
  else if (minutes >= 840 && minutes < 1320) period = "TARDE";  // 14:00-21:59
  else return { team: "FUERA DE TURNO", period: "", label: "FUERA DE TURNO", week };

  const oddWeek = week % 2 === 1;
  const team = period === "MAÑANA"
    ? (oddWeek ? "A" : "B")
    : (oddWeek ? "B" : "A");

  return { team, period, label: `TURNO ${team} · ${period}`, week };
}

function getRecordDefectsDetailed(record) {
  const points = record?.data?.puntos || {};
  const defects = [];
  const activeControls = new Map(checklistItems.map(item => [item.id, item]));

  Object.entries(points).forEach(([id, point]) => {
    if (!activeControls.has(id) || !point || point.estado !== "NOK") return;

    const control = activeControls.get(id);
    const title = point.titulo || control.title || id;
    const options = Array.isArray(point.opcionesNok)
      ? point.opcionesNok.map(value => String(value).trim()).filter(Boolean)
      : [];
    const vehicle = String(record?.data?.vehiculo || "").trim();

    if (options.length) {
      options.forEach(option => defects.push({
        id: `${id}::${option}`,
        controlId: id,
        controlTitle: title,
        label: `${title} — ${option}`,
        shortLabel: option,
        vehicle
      }));
      return;
    }

    const reason = String(point.motivo || "").trim();
    const label = reason ? `${title} — ${reason}` : title;
    defects.push({
      id: `${id}::${reason || "__sin_motivo__"}`,
      controlId: id,
      controlTitle: title,
      label,
      shortLabel: reason || "NOK",
      vehicle
    });
  });

  return defects;
}

function getFilteredDashboardRecords() {
  const selectedDate = dashboardDateFilter?.value || "";
  return dashboardRecords.filter(record => !selectedDate || getRecordDateKey(record) === selectedDate);
}

function createDefectAggregate(records) {
  const defectMap = new Map();
  const controlMap = new Map();

  records.forEach(record => {
    getRecordDefectsDetailed(record).forEach(defect => {
      if (!defectMap.has(defect.id)) {
        defectMap.set(defect.id, { ...defect, count: 0, vehicles: new Set() });
      }
      const row = defectMap.get(defect.id);
      row.count += 1;
      if (defect.vehicle) row.vehicles.add(defect.vehicle);

      if (!controlMap.has(defect.controlId)) {
        controlMap.set(defect.controlId, {
          id: defect.controlId,
          title: defect.controlTitle,
          count: 0,
          defects: new Map()
        });
      }
      const group = controlMap.get(defect.controlId);
      group.count += 1;
      const subKey = defect.shortLabel || defect.label;
      if (!group.defects.has(subKey)) group.defects.set(subKey, { label: subKey, count: 0, vehicles: new Set() });
      const sub = group.defects.get(subKey);
      sub.count += 1;
      if (defect.vehicle) sub.vehicles.add(defect.vehicle);
    });
  });

  const rows = [...defectMap.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
  const groups = [...controlMap.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, "es"));
  const affectedVehicles = new Set();
  rows.forEach(row => row.vehicles.forEach(vehicle => affectedVehicles.add(vehicle)));
  return { rows, groups, affectedVehicles, totalDefects: rows.reduce((sum, row) => sum + row.count, 0) };
}

function getDashboardData() {
  const filtered = getFilteredDashboardRecords();
  const overall = createDefectAggregate(filtered);
  const shifts = {
    A: { cars: [], defects: 0, aggregate: null },
    B: { cars: [], defects: 0, aggregate: null },
    "FUERA DE TURNO": { cars: [], defects: 0, aggregate: null }
  };

  filtered.forEach(record => {
    const shift = getWorkShift(record);
    if (!shifts[shift.team]) shifts[shift.team] = { cars: [], defects: 0, aggregate: null };
    shifts[shift.team].cars.push(record);
  });

  Object.keys(shifts).forEach(team => {
    const records = shifts[team].cars;
    shifts[team].aggregate = createDefectAggregate(records);
    shifts[team].defects = shifts[team].aggregate.totalDefects;
  });

  return { filtered, ...overall, shifts };
}

function populateDashboardDateFilter() {
  if (!dashboardDateFilter) return;
  const currentValue = dashboardDateFilter.value;
  const dates = [...new Set(dashboardRecords.map(getRecordDateKey).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  dashboardDateFilter.innerHTML = '<option value="">GENERAL</option>' +
    dates.map(dateKey => `<option value="${dateKey}">${formatHistoryDay(dateKey)}</option>`).join("");
  if (dates.includes(currentValue)) dashboardDateFilter.value = currentValue;
}

function renderShiftPie(shifts) {
  const pie = document.getElementById("shiftPieChart");
  const legend = document.getElementById("shiftPieLegend");
  if (!pie || !legend) return;
  const a = shifts.A.cars.length;
  const b = shifts.B.cars.length;
  const outside = shifts["FUERA DE TURNO"]?.cars.length || 0;
  const total = a + b + outside;
  if (!total) {
    pie.style.background = "#e9eff7";
    legend.innerHTML = '<span class="shift-legend-empty">Sin carrocerías en el periodo.</span>';
    return;
  }
  const aPct = a / total * 100;
  const bPct = b / total * 100;
  const gradient = outside
    ? `conic-gradient(#0b65c9 0 ${aPct}%, #4f9be8 ${aPct}% ${aPct + bPct}%, #a9b8c9 ${aPct + bPct}% 100%)`
    : `conic-gradient(#0b65c9 0 ${aPct}%, #4f9be8 ${aPct}% 100%)`;
  pie.style.background = gradient;
  const item = (label, count, cls) => `<div class="shift-legend-item"><span class="shift-dot ${cls}"></span><span>${label}</span><strong>${count}</strong><small>${(count / total * 100).toLocaleString("es-ES", {maximumFractionDigits: 1})}%</small></div>`;
  legend.innerHTML = item("TURNO A", a, "shift-a") + item("TURNO B", b, "shift-b") + (outside ? item("FUERA DE TURNO", outside, "shift-out") : "");
}

function renderShiftProduction(shifts) {
  const el = document.getElementById("shiftProductionChart");
  if (!el) return;
  const max = Math.max(shifts.A.cars.length, shifts.B.cars.length, 1);
  el.innerHTML = ["A", "B"].map(team => {
    const count = shifts[team].cars.length;
    const sample = shifts[team].cars[0];
    const label = sample ? getWorkShift(sample).period : "sin datos";
    return `<div class="shift-bar-row"><div class="shift-bar-label"><strong>TURNO ${team}</strong><span>${label}</span></div><div class="shift-bar-track"><div class="shift-bar-fill shift-${team.toLowerCase()}" style="width:${Math.max(count ? 5 : 0, count / max * 100)}%"></div></div><strong class="shift-bar-value">${count}</strong></div>`;
  }).join("");
}

function renderShiftDefects(shifts) {
  const el = document.getElementById("shiftDefectsChart");
  if (!el) return;
  const max = Math.max(shifts.A.defects, shifts.B.defects, 1);
  el.innerHTML = ["A", "B"].map(team => {
    const count = shifts[team].defects;
    return `<div class="shift-bar-row"><div class="shift-bar-label"><strong>TURNO ${team}</strong><span>${shifts[team].cars.length} coches</span></div><div class="shift-bar-track"><div class="shift-bar-fill shift-${team.toLowerCase()}" style="width:${Math.max(count ? 5 : 0, count / max * 100)}%"></div></div><strong class="shift-bar-value">${count}</strong></div>`;
  }).join("");
}

function renderShiftTopDefects(shifts) {
  const el = document.getElementById("shiftTopDefects");
  if (!el) return;
  el.innerHTML = ["A", "B"].map(team => {
    const rows = shifts[team].aggregate.rows.slice(0, 5);
    return `<article class="shift-top-card"><div class="shift-top-head"><strong>TOP TURNO ${team}</strong><span>${shifts[team].cars.length} coches</span></div>${rows.length ? rows.map((row, i) => `<div class="shift-top-row"><span>${i + 1}</span><em>${escapeHtml(row.label)}</em><strong>${row.count}</strong></div>`).join("") : '<div class="shift-top-empty">Sin defectos detectados.</div>'}</article>`;
  }).join("");
}

function renderControlGroups(groupsEl, groups, shifts) {
  if (!groupsEl) return;
  if (!groups.length) {
    groupsEl.innerHTML = '<div class="dashboard-empty"><strong>Sin defectos detectados</strong><span>No hay defectos registrados en el periodo seleccionado.</span></div>';
    return;
  }

  const byControl = new Map();
  const addShiftGroups = (team) => {
    const teamGroups = shifts?.[team]?.aggregate?.groups || [];
    teamGroups.forEach(group => {
      if (!byControl.has(group.id)) {
        byControl.set(group.id, { id: group.id, title: group.title, A: 0, B: 0, total: 0 });
      }
      const row = byControl.get(group.id);
      row[team] += group.count;
      row.total += group.count;
    });
  };

  addShiftGroups('A');
  addShiftGroups('B');

  // Fallback for compatibility with data where a shift aggregate has no groups.
  if (!byControl.size) {
    groups.forEach(group => byControl.set(group.id, { id: group.id, title: group.title, A: 0, B: 0, total: group.count }));
  }

  const rows = [...byControl.values()].sort((a, b) => b.total - a.total || a.title.localeCompare(b.title, 'es'));
  const maxTotal = Math.max(...rows.map(row => row.total), 1);

  groupsEl.innerHTML = rows.map((row, index) => {
    const aPct = row.total ? (row.A / row.total) * 100 : 0;
    const bPct = row.total ? (row.B / row.total) * 100 : 0;
    const width = row.total ? Math.max(4, (row.total / maxTotal) * 100) : 0;
    const aWidth = aPct;
    const bWidth = bPct;
    return `<div class="control-stack-row">
      <div class="control-stack-label"><span>${index + 1}. ${escapeHtml(row.title)}</span></div>
      <div class="control-stack-track" style="width:${width}%">
        <div class="control-stack-segment stack-a" style="width:${aWidth}%" title="Turno A: ${row.A}"></div>
        <div class="control-stack-segment stack-b" style="width:${bWidth}%" title="Turno B: ${row.B}"></div>
      </div>
      <div class="control-stack-count"><strong>${row.total}</strong><small>A ${row.A} · B ${row.B}</small></div>
    </div>`;
  }).join('');
}

function renderDashboard() {
  if (!analysisScreen) return;
  const data = getDashboardData();
  const totalCars = data.filtered.length;
  const selectedDate = dashboardDateFilter?.value || "";
  const periodLabel = document.getElementById("analysisPeriodLabel");
  if (periodLabel) periodLabel.textContent = `Periodo: ${selectedDate ? formatHistoryDay(selectedDate) : "GENERAL"}`;
  const generatedAt = document.getElementById("analysisGeneratedAt");
  if (generatedAt) generatedAt.textContent = new Date().toLocaleString("es-ES");

  renderShiftPie(data.shifts);
  renderShiftProduction(data.shifts);
  renderShiftDefects(data.shifts);
  renderShiftTopDefects(data.shifts);
  renderControlGroups(document.getElementById("controlGroups"), data.groups, data.shifts);

  const note = document.getElementById("analysisNoData");
  if (note) note.hidden = totalCars > 0;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pdfAskPassword() {
  const password = window.prompt("Introduce la contraseña para GENERAR INFORME PDF:");
  if (password === null) return false;
  if (password !== CONTROL_PASSWORD) {
    showToast("Contraseña incorrecta.");
    return false;
  }
  return true;
}

function drawPdfHeader(doc, periodLabel) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(5, 42, 94);
  doc.rect(0, 0, pageWidth, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("STELLANTIS", 14, 13);
  doc.setFontSize(12);
  doc.text("ANÁLISIS DE DEFECTOS DETECTADOS POR TURNO", 55, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Periodo: ${periodLabel}`, pageWidth - 14, 12, { align: "right" });
  doc.text(new Date().toLocaleString("es-ES"), pageWidth - 14, 18, { align: "right" });
}

function drawPdfSectionTitle(doc, title, y) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(8, 61, 130);
  doc.roundedRect(12, y, pageWidth - 24, 9, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(title, 17, y + 6.2);
  return y + 13;
}

function addPdfPageIfNeeded(doc, currentY, needed = 25) {
  const height = doc.internal.pageSize.getHeight();
  if (currentY + needed > height - 16) {
    doc.addPage();
    drawPdfHeader(doc, dashboardDateFilter?.value ? formatHistoryDay(dashboardDateFilter.value) : "GENERAL");
    return 42;
  }
  return currentY;
}

function generateAnalysisPdf() {
  if (!pdfAskPassword()) return;
  if (!window.jspdf?.jsPDF) {
    showToast("No se pudo cargar el generador PDF. Comprueba la conexión a internet.");
    return;
  }

  const data = getDashboardData();
  const periodLabel = dashboardDateFilter?.value ? formatHistoryDay(dashboardDateFilter.value) : "GENERAL";
  const doc = new window.jspdf.jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  drawPdfHeader(doc, periodLabel);
  let y = 42;

  y = drawPdfSectionTitle(doc, "PRODUCCIÓN POR TURNO", y);
  const teams = ["A", "B"];
  const cardW = (pageWidth - 36) / 2;
  teams.forEach((team, index) => {
    const x = 12 + index * (cardW + 6);
    const sample = data.shifts[team].cars[0];
    const shiftLabel = sample ? getWorkShift(sample).period : "sin datos";
    doc.setFillColor(245, 249, 255);
    doc.setDrawColor(190, 211, 238);
    doc.roundedRect(x, y, cardW, 26, 3, 3, "FD");
    doc.setTextColor(10, 58, 120);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`TURNO ${team} · ${shiftLabel}`, x + 6, y + 8);
    doc.setFontSize(18);
    doc.text(String(data.shifts[team].cars.length), x + 6, y + 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("carrocerías", x + 28, y + 20);
  });
  y += 34;

  y = drawPdfSectionTitle(doc, "DEFECTOS DETECTADOS POR TURNO", y);
  const maxDefects = Math.max(data.shifts.A.defects, data.shifts.B.defects, 1);
  teams.forEach(team => {
    y = addPdfPageIfNeeded(doc, y, 14);
    const count = data.shifts[team].defects;
    doc.setTextColor(15, 55, 105);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(`TURNO ${team}`, 15, y + 4);
    doc.setFillColor(230, 237, 247);
    doc.roundedRect(48, y, 115, 5, 1.5, 1.5, "F");
    doc.setFillColor(team === "A" ? 11 : 79, team === "A" ? 101 : 155, team === "A" ? 201 : 232);
    doc.roundedRect(48, y, Math.max(count ? 3 : 0, (count / maxDefects) * 115), 5, 1.5, 1.5, "F");
    doc.text(String(count), 171, y + 4);
    y += 10;
  });
  y += 2;

  y = drawPdfSectionTitle(doc, "TOP DE DEFECTOS DETECTADOS POR TURNO", y);
  teams.forEach(team => {
    y = addPdfPageIfNeeded(doc, y, 42);
    doc.setTextColor(8, 55, 112);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`TURNO ${team}`, 15, y + 4);
    y += 8;
    const rows = data.shifts[team].aggregate.rows.slice(0, 5);
    if (!rows.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(90, 105, 125);
      doc.text("Sin defectos detectados.", 18, y + 3);
      y += 9;
    } else {
      rows.forEach((row, index) => {
        y = addPdfPageIfNeeded(doc, y, 8);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(40, 65, 100);
        doc.text(`${index + 1}. ${row.label.slice(0, 70)}`, 18, y + 3.5);
        doc.setFont("helvetica", "bold");
        doc.text(String(row.count), 188, y + 3.5, { align: "right" });
        y += 7;
      });
    }
    y += 3;
  });

  y = addPdfPageIfNeeded(doc, y, 50);
  y = drawPdfSectionTitle(doc, "DEFECTOS AGRUPADOS POR CONTROL", y);
  if (!data.groups.length) {
    doc.setTextColor(90, 105, 125);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("No se han detectado defectos NOK en el periodo seleccionado.", 16, y + 5);
    y += 15;
  } else {
    const controlShiftMap = new Map();
    ["A", "B"].forEach(team => {
      (data.shifts[team].aggregate.groups || []).forEach(group => {
        if (!controlShiftMap.has(group.id)) controlShiftMap.set(group.id, { id: group.id, title: group.title, A: 0, B: 0, total: 0 });
        const row = controlShiftMap.get(group.id);
        row[team] += group.count;
        row.total += group.count;
      });
    });
    const controlRows = [...controlShiftMap.values()].sort((a, b) => b.total - a.total || a.title.localeCompare(b.title, "es"));
    const maxTotal = Math.max(...controlRows.map(row => row.total), 1);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(35, 72, 120);
    doc.text("AZUL = TURNO A", 15, y + 4);
    doc.setTextColor(190, 45, 45);
    doc.text("ROJO = TURNO B", 47, y + 4);
    y += 9;

    controlRows.forEach((row, index) => {
      y = addPdfPageIfNeeded(doc, y, 11);
      const barX = 80;
      const barW = 82;
      const aW = row.total ? (row.A / maxTotal) * barW : 0;
      const bW = row.total ? (row.B / maxTotal) * barW : 0;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(35, 67, 105);
      const title = `${index + 1}. ${row.title}`;
      doc.text(title.slice(0, 43), 15, y + 4);

      doc.setFillColor(232, 238, 247);
      doc.roundedRect(barX, y, barW, 5, 1.2, 1.2, "F");
      if (aW > 0) {
        doc.setFillColor(11, 101, 201);
        doc.roundedRect(barX, y, Math.max(1.2, aW), 5, 1.2, 1.2, "F");
      }
      if (bW > 0) {
        doc.setFillColor(210, 55, 55);
        doc.rect(barX + aW, y, Math.max(1.2, bW), 5, "F");
      }

      doc.setFont("helvetica", "bold");
      doc.setTextColor(35, 67, 105);
      doc.text(String(row.total), 169, y + 4);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.text(`A ${row.A} · B ${row.B}`, 177, y + 4);
      y += 9;
    });
  }

  doc.save(`informe-turnos-defectos-${suffix}.pdf`);
}

async function loadDashboard() {
  if (!analysisScreen) return;
  const loading = document.getElementById("shiftPieLegend");
  if (loading) loading.innerHTML = '<span class="shift-legend-empty">Cargando datos...</span>';
  try {
    const snapshot = await getDocs(query(collection(db, "inspecciones"), orderBy("fecha", "desc")));
    dashboardRecords = snapshot.docs
      .filter(docSnap => docSnap.id !== "__config_controles")
      .map(docSnap => ({ id: docSnap.id, data: docSnap.data() }));
    populateDashboardDateFilter();
    renderDashboard();
  } catch (error) {
    console.error("Error cargando dashboard:", error);
    dashboardRecords = [];
    const note = document.getElementById("analysisNoData");
    if (note) { note.hidden = false; note.querySelector("strong").textContent = "No se pudieron cargar los datos"; note.querySelector("span").textContent = "Revisa Firebase y las reglas de Firestore."; }
    const pie = document.getElementById("shiftPieChart");
    if (pie) pie.style.background = "#e9eff7";
    const legend = document.getElementById("shiftPieLegend");
    if (legend) legend.innerHTML = '<span class="shift-legend-empty">No se pudieron cargar los datos.</span>';
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

// Sincronización global: los controles se comparten entre todos los dispositivos.
initializeControlsSync();
