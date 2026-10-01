import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// ================================
// FIREBASE
// ================================

const firebaseConfig = {
  apiKey: "AIzaSyAm64KiQ4kF5z0TcM-npVFUja6umeoDyxU",
  authDomain: "checklistb10.firebaseapp.com",
  projectId: "checklistb10",
  storageBucket: "checklistb10.firebasestorage.app",
  messagingSenderId: "322956120324",
  appId: "1:322956120324:web:bb4f6f439aa09f66ea8051"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);


// ================================
// CHECKLIST
// ================================

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
    options: [
      "PDI",
      "PDD",
      "PTI",
      "PTD",
      "SUELO",
      "PORTÓN",
      "CAPO CARROCERÍA",
      "CAPO A BISAGRA"
    ]
  },
  {
    id: "chapaTerminada",
    title: "ESTA EL COCHE TERMINADO DE CHAPA",
    options: [
      "PUERTAS",
      "CAPO",
      "LATERAL IZQ",
      "LATERAL DCHO",
      "PORTÓN"
    ]
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


// ================================
// ESTADO DE LA APLICACIÓN
// ================================

const state = {
  answers: {},
  reasons: {}
};


// ================================
// ELEMENTOS HTML
// ================================

const homeScreen = document.getElementById("homeScreen");
const inspectionScreen = document.getElementById("inspectionScreen");
const historyScreen = document.getElementById("historyScreen");

const checklist = document.getElementById("checklist");
const vehicleNumber = document.getElementById("vehicleNumber");
const vehicleError = document.getElementById("vehicleError");

const saveBtn = document.getElementById("saveBtn");

const overallStatusText =
  document.getElementById("overallStatusText");

const progressText =
  document.getElementById("progressText");

const progressBar =
  document.getElementById("progressBar");

const inspectionSummary =
  document.querySelector(".inspection-summary");

const headerStatus =
  document.getElementById("headerStatus");

const toast =
  document.getElementById("toast");


// ================================
// PINTAR CHECKLIST
// ================================

function renderChecklist() {

  checklist.innerHTML = checklistItems.map((item, index) => `
    
    <article class="check-item" data-item="${item.id}">

      <div class="check-top">

        <div>

          <div class="check-number">
            PUNTO ${index + 1}
          </div>

          <h3 class="check-title">
            ${item.title}
          </h3>

        </div>

        <div class="check-options">

          <button
            type="button"
            class="check-btn ok"
            data-action="ok"
            data-id="${item.id}"
          >
            OK
          </button>

          <button
            type="button"
            class="check-btn nok"
            data-action="nok"
            data-id="${item.id}"
          >
            NOK
          </button>

        </div>

      </div>


      <div
        class="nok-details"
        id="details-${item.id}"
      >

        ${
          item.options
            ? `

              <div class="nok-detail-title">
                ¿Qué elemento está NOK?
              </div>

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

                    <span>
                      ${option}
                    </span>

                  </label>

                `).join("")}

              </div>

            `
            : `

              <label
                class="reason-label"
                for="reasonInput-${item.id}"
              >
                Motivo del NOK *
              </label>

              <textarea
                id="reasonInput-${item.id}"
                data-reason="${item.id}"
                placeholder="Explica por qué este punto estaba NOK..."
              ></textarea>

            `
        }

      </div>

    </article>

  `).join("");


  // Botones OK / NOK

  document
    .querySelectorAll(".check-btn")
    .forEach(button => {

      button.addEventListener("click", () => {

        setAnswer(
          button.dataset.id,
          button.dataset.action
        );

      });

    });


  // Campos de texto para NOK

  document
    .querySelectorAll("textarea[data-reason]")
    .forEach(textarea => {

      textarea.addEventListener("input", () => {

        state.reasons[textarea.dataset.reason] =
          textarea.value.trim();

        updateSummary();

      });

    });


  // Casillas de opciones NOK

  document
    .querySelectorAll("input[data-nok-option]")
    .forEach(checkbox => {

      checkbox.addEventListener("change", () => {

        const id =
          checkbox.dataset.nokOption;

        if (!state.reasons[id]) {
          state.reasons[id] = [];
        }

        const values =
          Array.isArray(state.reasons[id])
            ? state.reasons[id]
            : [];


        if (
          checkbox.checked &&
          !values.includes(checkbox.dataset.option)
        ) {

          values.push(
            checkbox.dataset.option
          );

        }


        if (!checkbox.checked) {

          state.reasons[id] =
            values.filter(
              value =>
                value !== checkbox.dataset.option
            );

        } else {

          state.reasons[id] = values;

        }

        updateSummary();

      });

    });

}


// ================================
// SELECCIONAR OK / NOK
// ================================

function setAnswer(id, answer) {

  state.answers[id] = answer;


  const item =
    document.querySelector(
      `[data-item="${id}"]`
    );


  const okButton =
    item.querySelector(
      '[data-action="ok"]'
    );


  const nokButton =
    item.querySelector(
      '[data-action="nok"]'
    );


  const details =
    item.querySelector(".nok-details");


  okButton.classList.toggle(
    "active",
    answer === "ok"
  );


  nokButton.classList.toggle(
    "active",
    answer === "nok"
  );


  details.classList.toggle(
    "visible",
    answer === "nok"
  );


  // Si vuelve de NOK a OK,
  // borramos los motivos anteriores.

  if (answer !== "nok") {

    state.reasons[id] =
      item.querySelectorAll(
        'input[data-nok-option]'
      ).length
        ? []
        : "";


    item
      .querySelectorAll(
        'input[data-nok-option]'
      )
      .forEach(input => {

        input.checked = false;

      });


    const textarea =
      item.querySelector("textarea");


    if (textarea) {
      textarea.value = "";
    }

  }


  updateSummary();

}


// ================================
// COMPROBAR MOTIVO DEL NOK
// ================================

function hasNokReason(item) {

  if (
    state.answers[item.id] !== "nok"
  ) {
    return true;
  }


  // Puntos que tienen opciones

  if (item.options) {

    return (
      Array.isArray(state.reasons[item.id]) &&
      state.reasons[item.id].length > 0
    );

  }


  // Puntos con explicación escrita

  return (
    typeof state.reasons[item.id] === "string" &&
    state.reasons[item.id].trim().length > 0
  );

}


// ================================
// ACTUALIZAR ESTADO GENERAL
// ================================

function updateSummary() {

  const total =
    checklistItems.length;


  const answered =
    checklistItems.filter(
      item => state.answers[item.id]
    ).length;


  const hasNok =
    checklistItems.some(
      item =>
        state.answers[item.id] === "nok"
    );


  const allNokHaveReason =
    checklistItems.every(
      hasNokReason
    );


  const vehicleOk =
    /^\d{6}$/.test(
      vehicleNumber.value
    );


  const complete =
    answered === total &&
    allNokHaveReason &&
    vehicleOk;


  const finalOk =
    complete &&
    !hasNok;


  progressText.textContent =
    `${answered} / ${total}`;


  progressBar.style.width =
    `${(answered / total) * 100}%`;


  if (finalOk) {

    overallStatusText.textContent =
      "OK";

    inspectionSummary.classList.add(
      "good"
    );

    headerStatus.textContent =
      "INSPECCIÓN OK";

    headerStatus.className =
      "status-pill green";

  } else {

    overallStatusText.textContent =
      hasNok
        ? "NOK"
        : "PENDIENTE";


    inspectionSummary.classList.remove(
      "good"
    );


    headerStatus.textContent =
      hasNok
        ? "NOK"
        : "PENDIENTE";


    headerStatus.className =
      "status-pill red";

  }


  saveBtn.disabled =
    !complete;

}


// ================================
// VALIDAR VEHÍCULO
// ================================

function validateVehicle() {

  const value =
    vehicleNumber.value.trim();


  if (!value) {

    vehicleError.textContent =
      "El número de vehículo es obligatorio.";

    return false;

  }


  if (!/^\d{6}$/.test(value)) {

    vehicleError.textContent =
      "Debe contener exactamente 6 dígitos.";

    return false;

  }


  vehicleError.textContent =
    "";

  return true;

}


// ================================
// CREAR DATOS PARA FIREBASE
// ================================

function buildInspectionData() {

  const hasNok =
    checklistItems.some(
      item =>
        state.answers[item.id] === "nok"
    );


  const puntos = {};


  checklistItems.forEach(item => {

    const isNok =
      state.answers[item.id] === "nok";


    puntos[item.id] = {

      estado:
        isNok
          ? "NOK"
          : "OK",

      opcionesNok:
        item.options && isNok
          ? (state.reasons[item.id] || [])
          : [],

      motivo:
        !item.options && isNok
          ? (state.reasons[item.id] || "")
          : ""

    };

  });


  return {

    vehiculo:
      vehicleNumber.value.trim(),

    fecha:
      serverTimestamp(),

    estadoFinal:
      hasNok
        ? "NOK"
        : "OK",

    puntos

  };

}


// ================================
// GUARDAR EN FIREBASE
// ================================

async function saveInspection() {

  const data =
    buildInspectionData();


  saveBtn.disabled =
    true;

  saveBtn.textContent =
    "Guardando...";


  try {

    const docRef =
      await addDoc(
        collection(
          db,
          "inspecciones"
        ),
        data
      );


    console.log(
      "Inspección guardada:",
      docRef.id
    );


    showToast(
      "Inspección guardada correctamente en Firebase."
    );


    setTimeout(() => {

      resetInspection();

      showScreen(
        homeScreen
      );

    }, 1200);


  } catch (error) {

    console.error(
      "Error guardando:",
      error
    );


    if (
      error.code ===
      "permission-denied"
    ) {

      showToast(
        "Firebase ha rechazado la escritura. Revisa las reglas de Firestore."
      );

    } else {

      showToast(
        "No se pudo guardar la inspección."
      );

    }


    saveBtn.disabled =
      false;

    saveBtn.textContent =
      "Guardar inspección";

  }

}


// ================================
// BOTÓN GUARDAR
// ================================

document
  .getElementById("inspectionForm")
  .addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      if (!validateVehicle()) {
        return;
      }


      const incomplete =
        checklistItems.find(
          item =>
            !state.answers[item.id]
        );


      if (incomplete) {

        showToast(
          `Falta cerrar el punto ${
            checklistItems.indexOf(
              incomplete
            ) + 1
          }.`
        );

        return;

      }


      const missingReason =
        checklistItems.find(
          item =>
            !hasNokReason(item)
        );


      if (missingReason) {

        showToast(
          `Indica qué ha fallado en el punto ${
            checklistItems.indexOf(
              missingReason
            ) + 1
          }.`
        );

        return;

      }


      await saveInspection();

    }
  );


// ================================
// NAVEGACIÓN
// ================================

function resetInspection() {

  state.answers = {};

  state.reasons = {};

  vehicleNumber.value = "";

  vehicleError.textContent = "";

  saveBtn.disabled = true;

  saveBtn.textContent =
    "Guardar inspección";

  renderChecklist();

  updateSummary();

}


function showScreen(screen) {

  [
    homeScreen,
    inspectionScreen,
    historyScreen
  ].forEach(item => {

    item.classList.remove(
      "active"
    );

  });


  screen.classList.add(
    "active"
  );


  if (screen === homeScreen) {

    headerStatus.textContent =
      "SIN INSPECCIÓN";

    headerStatus.className =
      "status-pill neutral";

  }

}


// ================================
// BOTONES PRINCIPALES
// ================================

document
  .getElementById("newInspectionBtn")
  .addEventListener(
    "click",
    () => {

      resetInspection();

      showScreen(
        inspectionScreen
      );

      vehicleNumber.focus();

    }
  );


document
  .getElementById("historyBtn")
  .addEventListener(
    "click",
    () => {

      showScreen(
        historyScreen
      );

    }
  );


document
  .getElementById("backHomeBtn")
  .addEventListener(
    "click",
    () => {

      resetInspection();

      showScreen(
        homeScreen
      );

    }
  );


document
  .getElementById("backHistoryBtn")
  .addEventListener(
    "click",
    () => {

      showScreen(
        homeScreen
      );

    }
  );


document
  .getElementById("cancelBtn")
  .addEventListener(
    "click",
    () => {

      resetInspection();

      showScreen(
        homeScreen
      );

    }
  );


// ================================
// VEHÍCULO
// ================================

vehicleNumber.addEventListener(
  "input",
  () => {

    vehicleNumber.value =
      vehicleNumber.value
        .replace(/\D/g, "")
        .slice(0, 6);


    validateVehicle();

    updateSummary();

  }
);


// ================================
// MENSAJES
// ================================

function showToast(message) {

  toast.textContent =
    message;

  toast.classList.add(
    "show"
  );


  clearTimeout(
    showToast.timer
  );


  showToast.timer =
    setTimeout(
      () => {

        toast.classList.remove(
          "show"
        );

      },
      3500
    );

}


// ================================
// INICIALIZAR
// ================================

renderChecklist();

updateSummary();