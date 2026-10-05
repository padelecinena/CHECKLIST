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

function getDashboardData() {
  const filtered = getFilteredDashboardRecords();
  const defectMap = new Map();
  const controlMap = new Map();

  filtered.forEach(record => {
    getRecordDefectsDetailed(record).forEach(defect => {
      if (!defectMap.has(defect.id)) {
        defectMap.set(defect.id, {
          ...defect,
          count: 0,
          vehicles: new Set()
        });
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

  return {
    filtered,
    rows,
    groups,
    affectedVehicles,
    totalDefects: rows.reduce((sum, row) => sum + row.count, 0)
  };
}

function populateDashboardDateFilter() {
  if (!dashboardDateFilter) return;
  const currentValue = dashboardDateFilter.value;
  const dates = [...new Set(dashboardRecords.map(getRecordDateKey).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  dashboardDateFilter.innerHTML = '<option value="">GENERAL</option>' +
    dates.map(dateKey => `<option value="${dateKey}">${formatHistoryDay(dateKey)}</option>`).join("");
  if (dates.includes(currentValue)) dashboardDateFilter.value = currentValue;
}

function renderDashboard() {
  if (!defectChart || !dashboardCarsCount || !dashboardDefectsCount) return;

  const data = getDashboardData();
  const totalCars = data.filtered.length;
  const affectedCount = data.affectedVehicles.size;
  const affectedPercent = totalCars ? (affectedCount / totalCars) * 100 : 0;
  const selectedDate = dashboardDateFilter?.value || "";

  dashboardCarsCount.textContent = String(totalCars);
  dashboardDefectsCount.textContent = String(data.totalDefects);
  const affectedEl = document.getElementById("dashboardAffectedCars");
  if (affectedEl) affectedEl.textContent = `${affectedPercent.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
  const periodLabel = document.getElementById("analysisPeriodLabel");
  if (periodLabel) periodLabel.textContent = `Periodo: ${selectedDate ? formatHistoryDay(selectedDate) : "GENERAL"}`;
  const generatedAt = document.getElementById("analysisGeneratedAt");
  if (generatedAt) generatedAt.textContent = new Date().toLocaleString("es-ES");

  const detailsBody = document.getElementById("defectDetailsBody");
  const groupsEl = document.getElementById("controlGroups");

  if (!totalCars) {
    defectChart.innerHTML = '<div class="dashboard-empty"><strong>Sin inspecciones</strong><span>No hay coches inspeccionados en el periodo seleccionado.</span></div>';
    if (detailsBody) detailsBody.innerHTML = '<tr><td colspan="5" class="table-empty">Sin datos para este periodo.</td></tr>';
    if (groupsEl) groupsEl.innerHTML = '';
    return;
  }

  if (!data.rows.length) {
    defectChart.innerHTML = '<div class="dashboard-empty"><strong>Sin defectos NOK</strong><span>Las inspecciones de este periodo no tienen defectos registrados.</span></div>';
    if (detailsBody) detailsBody.innerHTML = '<tr><td colspan="5" class="table-empty">No se han detectado defectos NOK.</td></tr>';
    if (groupsEl) groupsEl.innerHTML = '';
    return;
  }

  const max = Math.max(...data.rows.map(row => row.count));
  defectChart.innerHTML = data.rows.map((row, index) => {
    const width = Math.max(5, Math.round((row.count / max) * 100));
    return `
      <div class="defect-row" title="${escapeHtml(row.label)}: ${row.count}">
        <div class="defect-rank">${index + 1}</div>
        <div class="defect-row-main">
          <div class="defect-row-top"><span class="defect-label">${escapeHtml(row.label)}</span><strong>${row.count}</strong></div>
          <div class="defect-bar-track"><div class="defect-bar" style="width:${width}%"></div></div>
        </div>
      </div>
    `;
  }).join("");

  if (detailsBody) {
    detailsBody.innerHTML = data.rows.map((row, index) => {
      const cars = row.vehicles.size;
      const pct = totalCars ? (cars / totalCars) * 100 : 0;
      return `<tr><td>${index + 1}</td><td class="defect-table-label">${escapeHtml(row.label)}</td><td><strong>${row.count}</strong></td><td>${cars}</td><td>${pct.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %</td></tr>`;
    }).join("");
  }

  if (groupsEl) {
    groupsEl.innerHTML = data.groups.map((group, index) => {
      const subs = [...group.defects.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
      const maxSub = Math.max(...subs.map(item => item.count), 1);
      return `
        <article class="control-group-card">
          <div class="control-group-head"><strong>${index + 1}. ${escapeHtml(group.title)}</strong><span>${group.count} defectos</span></div>
          <div class="control-group-items">
            ${subs.slice(0, 6).map(sub => `
              <div class="control-sub-row">
                <span>${escapeHtml(sub.label)}</span>
                <div class="control-sub-bar-track"><div class="control-sub-bar" style="width:${Math.max(4, Math.round((sub.count / maxSub) * 100))}%"></div></div>
                <strong>${sub.count}</strong>
              </div>`).join("")}
          </div>
        </article>`;
    }).join("");
  }
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
  doc.rect(0, 0, pageWidth, 34, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("STELLANTIS", 14, 13);
  doc.setFontSize(13);
  doc.text("INFORME DE ANÁLISIS DE DEFECTOS", 55, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Control de Carrocería", 55, 18);
  doc.setFontSize(8);
  doc.text(`Periodo: ${periodLabel}`, pageWidth - 14, 13, { align: "right" });
  doc.text(new Date().toLocaleString("es-ES"), pageWidth - 14, 19, { align: "right" });
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
    return 45;
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
  const totalCars = data.filtered.length;
  const affectedCars = data.affectedVehicles.size;
  const affectedPercent = totalCars ? (affectedCars / totalCars) * 100 : 0;

  drawPdfHeader(doc, periodLabel);
  let y = 42;

  const cards = [
    ["COCHES INSPECCIONADOS", String(totalCars)],
    ["DEFECTOS DETECTADOS", String(data.totalDefects)],
    ["COCHES CON DEFECTOS", `${affectedPercent.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`]
  ];
  const cardW = (pageWidth - 36) / 3;
  cards.forEach((card, index) => {
    const x = 12 + index * (cardW + 6);
    doc.setFillColor(245, 249, 255);
    doc.setDrawColor(190, 211, 238);
    doc.roundedRect(x, y, cardW, 26, 3, 3, "FD");
    doc.setTextColor(10, 58, 120);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(card[0], x + 6, y + 8);
    doc.setFontSize(18);
    doc.text(card[1], x + 6, y + 20);
  });
  y += 34;

  y = drawPdfSectionTitle(doc, "RANKING DE DEFECTOS", y);
  if (!data.rows.length) {
    doc.setTextColor(90, 105, 125);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("No se han detectado defectos NOK en el periodo seleccionado.", 16, y + 5);
    y += 18;
  } else {
    const max = Math.max(...data.rows.map(r => r.count));
    data.rows.slice(0, 12).forEach((row, index) => {
      y = addPdfPageIfNeeded(doc, y, 12);
      doc.setTextColor(12, 48, 99);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text(String(index + 1), 15, y + 4);
      doc.setFont("helvetica", "normal");
      doc.text(row.label.slice(0, 54), 24, y + 4);
      const barX = 75;
      const barW = 100;
      doc.setFillColor(228, 236, 247);
      doc.roundedRect(barX, y, barW, 5, 1.5, 1.5, "F");
      doc.setFillColor(12, 91, 190);
      doc.roundedRect(barX, y, Math.max(3, (row.count / max) * barW), 5, 1.5, 1.5, "F");
      doc.setFont("helvetica", "bold");
      doc.text(String(row.count), 186, y + 4);
      y += 9;
    });
    y += 2;
  }

  y = addPdfPageIfNeeded(doc, y, 45);
  y = drawPdfSectionTitle(doc, "DETALLE DE DEFECTOS", y);
  const tableRows = data.rows.map((row, index) => {
    const cars = row.vehicles.size;
    const pct = totalCars ? (cars / totalCars) * 100 : 0;
    return [String(index + 1), row.label, String(row.count), String(cars), `${pct.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`];
  });
  doc.autoTable({
    startY: y,
    head: [["#", "Defecto", "Veces detectado", "Coches afectados", "% coches"]],
    body: tableRows,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 2.5, textColor: [14, 43, 82] },
    headStyles: { fillColor: [8, 61, 130], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [247, 250, 255] },
    columnStyles: { 0: { cellWidth: 9 }, 1: { cellWidth: 82 }, 2: { cellWidth: 27, halign: "center" }, 3: { cellWidth: 31, halign: "center" }, 4: { cellWidth: 23, halign: "center" } },
    margin: { left: 12, right: 12 }
  });
  y = (doc.lastAutoTable?.finalY || y + 30) + 8;

  y = addPdfPageIfNeeded(doc, y, 50);
  y = drawPdfSectionTitle(doc, "DEFECTOS AGRUPADOS POR CONTROL", y);
  data.groups.forEach(group => {
    y = addPdfPageIfNeeded(doc, y, 24);
    doc.setTextColor(8, 55, 112);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`${group.title} — ${group.count} defectos`, 15, y + 4);
    y += 8;
    const subs = [...group.defects.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
    const maxSub = Math.max(...subs.map(s => s.count), 1);
    subs.slice(0, 8).forEach(sub => {
      y = addPdfPageIfNeeded(doc, y, 8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(40, 65, 100);
      doc.text(sub.label.slice(0, 42), 18, y + 3.5);
      doc.setFillColor(230, 237, 247);
      doc.roundedRect(90, y, 70, 4, 1.2, 1.2, "F");
      doc.setFillColor(20, 102, 202);
      doc.roundedRect(90, y, Math.max(3, (sub.count / maxSub) * 70), 4, 1.2, 1.2, "F");
      doc.setFont("helvetica", "bold");
      doc.text(String(sub.count), 165, y + 3.5);
      y += 7;
    });
    y += 3;
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    const h = doc.internal.pageSize.getHeight();
    doc.setFillColor(5, 42, 94);
    doc.rect(0, h - 10, pageWidth, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("STELLANTIS", 12, h - 4);
    doc.setFont("helvetica", "normal");
    doc.text("TOGETHER FOR A BETTER FUTURE", pageWidth / 2, h - 4, { align: "center" });
    doc.text(`Página ${page} de ${pages}`, pageWidth - 12, h - 4, { align: "right" });
  }

  const suffix = dashboardDateFilter?.value ? dashboardDateFilter.value : "general";
  doc.save(`informe-defectos-${suffix}.pdf`);
}

async function loadDashboard() {
  if (!defectChart) return;
  defectChart.innerHTML = '<div class="dashboard-empty"><strong>Cargando datos...</strong><span>Consultando inspecciones guardadas.</span></div>';
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
    dashboardCarsCount.textContent = "0";
    dashboardDefectsCount.textContent = "0";
    const affectedEl = document.getElementById("dashboardAffectedCars");
    if (affectedEl) affectedEl.textContent = "0 %";
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

// Sincronización global: los controles se comparten entre todos los dispositivos.
initializeControlsSync();
