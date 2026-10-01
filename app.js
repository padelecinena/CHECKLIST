const checklistItems = [
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

const state = {
  answers: {},
  reasons: {}
};

const homeScreen = document.getElementById("homeScreen");
const inspectionScreen = document.getElementById("inspectionScreen");
const historyScreen = document.getElementById("historyScreen");
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

function renderChecklist() {
  checklist.innerHTML = checklistItems.map((item, index) => `
    <article class="check-item" data-item="${item.id}">
      <div class="check-top">
        <div>
          <div class="check-number">PUNTO ${index + 1}</div>
          <h3 class="check-title">${item.title}</h3>
          ${item.options ? `<div class="sub-options">${item.options.map(option => `<span>${option}</span>`).join("")}</div>` : ""}
        </div>
        <div class="check-options">
          <button type="button" class="check-btn ok" data-action="ok" data-id="${item.id}">OK</button>
          <button type="button" class="check-btn nok" data-action="nok" data-id="${item.id}">NOK</button>
        </div>
      </div>
      <div class="reason-box" id="reason-${item.id}">
        <label for="reasonInput-${item.id}">Motivo del NOK *</label>
        <textarea id="reasonInput-${item.id}" data-reason="${item.id}" placeholder="Explica por qué este punto estaba NOK..."></textarea>
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
}

function setAnswer(id, answer) {
  state.answers[id] = answer;

  const item = document.querySelector(`[data-item="${id}"]`);
  const okButton = item.querySelector('[data-action="ok"]');
  const nokButton = item.querySelector('[data-action="nok"]');
  const reasonBox = item.querySelector(".reason-box");
  const textarea = item.querySelector("textarea");

  okButton.classList.toggle("active", answer === "ok");
  nokButton.classList.toggle("active", answer === "nok");
  reasonBox.classList.toggle("visible", answer === "nok");

  if (answer !== "nok") {
    state.reasons[id] = "";
    textarea.value = "";
  }

  updateSummary();
}

function updateSummary() {
  const total = checklistItems.length;
  const answered = checklistItems.filter(item => state.answers[item.id]).length;
  const hasNok = checklistItems.some(item => state.answers[item.id] === "nok");
  const allNokHaveReason = checklistItems
    .filter(item => state.answers[item.id] === "nok")
    .every(item => (state.reasons[item.id] || "").length > 0);

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

document.getElementById("inspectionForm").addEventListener("submit", (event) => {
  event.preventDefault();

  if (!validateVehicle()) return;

  const incomplete = checklistItems.find(item => !state.answers[item.id]);
  if (incomplete) {
    showToast(`Falta cerrar el punto ${checklistItems.indexOf(incomplete) + 1}.`);
    return;
  }

  const missingReason = checklistItems.find(item =>
    state.answers[item.id] === "nok" && !(state.reasons[item.id] || "").trim()
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
        reason: state.reasons[item.id] || ""
      }
    ]))
  };

  console.log("INSPECCIÓN LISTA PARA FIREBASE:", result);
  showToast("Inspección validada. En el siguiente paso la conectaremos con Firebase.");

  // Reset visual después de guardar.
  setTimeout(() => {
    resetInspection();
    showScreen(homeScreen);
  }, 1200);
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
  [homeScreen, inspectionScreen, historyScreen].forEach(item => item.classList.remove("active"));
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

document.getElementById("historyBtn").addEventListener("click", () => {
  showScreen(historyScreen);
});

document.getElementById("backHomeBtn").addEventListener("click", () => {
  resetInspection();
  showScreen(homeScreen);
});

document.getElementById("backHistoryBtn").addEventListener("click", () => {
  showScreen(homeScreen);
});

document.getElementById("cancelBtn").addEventListener("click", () => {
  resetInspection();
  showScreen(homeScreen);
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

renderChecklist();
updateSummary();
