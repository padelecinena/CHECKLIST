import { initializeApp } from "https://[Log in to view URL]";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy
} from "https://[Log in to view URL]";

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
        </div>

        <div class="check-options">
          <button
            type="button"
            class="check-btn ok"
            data-action="ok"
            data-id="${item.id}">
            OK
          </button>

          <button
            type="button"
            class="check-btn nok"
            data-action="nok"
            data-id="${item.id}">
            NOK
          </button>
        </div>

      </div>

      <div class="nok-details" id="details-${item.id}">

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

                    <span>${option}</span>

                  </label>
                `).join("")}

              </div>
            `
            : `
              <label
                class="reason-label"
                for="reasonInput-${item.id}">
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


  document.querySelectorAll(".check-btn").forEach(button => {

    button.addEventListener("click", () => {
      setAnswer(
        button.dataset.id,
        button.dataset.action
      );
    });

  });


  document.querySelectorAll("textarea[data-reason]").forEach(textarea => {

    textarea.addEventListener("input", () => {

      state.reasons[textarea.dataset.reason] =
        textarea.value.trim();

      updateSummary();

    });

  });


  document.querySelectorAll("input[data-nok-option]").forEach(checkbox => {

    checkbox.addEventListener("change", () => {

      const id = checkbox.dataset.nokOption;

      if (!Array.isArray(state.reasons[id])) {
        state.reasons[id] = [];
      }

      const values = state.reasons[id];

      if (
        checkbox.checked &&
        !values.includes(checkbox.dataset.option)
      ) {
        values.push(checkbox.dataset.option);
      }

      if (!checkbox.checked) {

        state.reasons[id] = values.filter(
          value => value !== checkbox.dataset.option
        );

      }

      updateSummary();

    });

  });

}


function setAnswer(id, answer) {

  state.answers[id] = answer;

  const item = document.querySelector(
    `[data-item="${id}"]`
  );

  const okButton = item.querySelector(
    '[data-action="ok"]'
  );

  const nokButton = item.querySelector(
    '[data-action="nok"]'
  );

  const details = item.querySelector(
    ".nok-details"
  );


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


  if (answer !== "nok") {

    if (
      item.querySelectorAll(
        'input[data-nok-option]'
      ).length
    ) {
      state.reasons[id] = [];
    } else {
      state.reasons[id] = "";
    }


    item.querySelectorAll(
      'input[data-nok-option]'
    ).forEach(input => {

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


function hasNokReason(item) {

  if (state.answers[item.id] !== "nok") {
    return true;
  }


  if (item.options) {

    return (
      Array.isArray(state.reasons[item.id]) &&
      state.reasons[item.id].length > 0
    );

  }


  return (
    typeof state.reasons[item.id] === "string" &&
    state.reasons[item.id].trim().length > 0
  );

}


function updateSummary() {

  const total = checklistItems.length;

  const answered =
    checklistItems.filter(
      item => state.answers[item.id]
    ).length;

  const hasNok =
    checklistItems.some(
      item => state.answers[item.id] === "nok"
    );

  const allNokHaveReason =
    checklistItems.every(hasNokReason);

  const vehicleOk =
    /^\d{6}$/.test(
      vehicleNumber.value
    );

  const complete =
    answered === total &&
    allNokHaveReason &&
    vehicleOk;

  const finalOk =
    complete && !hasNok;


  progressText.textContent =
    `${answered} / ${total}`;

  progressBar.style.width =
    `${(answered / total) * 100}%`;


  if (finalOk) {

    overallStatusText.textContent = "OK";

    inspectionSummary.classList.add(
      "good"
    );

    headerStatus.textContent =
      "INSPECCIÓN OK";

    headerStatus.className =
      "status-pill green";

  } else {

    overallStatusText.textContent =
      hasNok ? "NOK" : "PENDIENTE";

    inspectionSummary.classList.remove(
      "good"
    );

    headerStatus.textContent =
      hasNok ? "NOK" : "PENDIENTE";

    headerStatus.className =
      "status-pill red";

  }


  saveBtn.disabled = !complete;

}


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


  vehicleError.textContent = "";

  return true;

}


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
          item => !state.answers[item.id]
        );


      if (incomplete) {

        showToast(
          `Falta cerrar el punto ${
            checklistItems.indexOf(incomplete) + 1
          }.`
        );

        return;

      }


      const missingReason =
        checklistItems.find(
          item =>
            state.answers[item.id] === "nok" &&
            !hasNokReason(item)
        );


      if (missingReason) {

        showToast(
          `Indica el motivo o elemento NOK del punto ${
            checklistItems.indexOf(missingReason) + 1
          }.`
        );

        return;

      }


      const result = {

        vehicleNumber:
          vehicleNumber.value,

        timestamp:
          new Date().toISOString(),

        finalStatus:
          checklistItems.some(
            item =>
              state.answers[item.id] === "nok"
          )
            ? "NOK"
            : "OK",

        points:
          Object.fromEntries(
            checklistItems.map(item => [

              item.id,

              {
                status:
                  state.answers[item.id]
                    .toUpperCase(),

                reason:
                  Array.isArray(
                    state.reasons[item.id]
                  )
                    ? state.reasons[item.id].join(", ")
                    : (
                        state.reasons[item.id] ||
                        ""
                      )
              }

            ])
          )

      };


      try {

        saveBtn.disabled = true;


        await addDoc(
          collection(
            db,
            "inspecciones"
          ),
          {

            vehiculo:
              result.vehicleNumber,

            fecha:
              serverTimestamp(),

            estadoFinal:
              result.finalStatus,

            puntos:
              Object.fromEntries(
                checklistItems.map(item => [

                  item.id,

                  {

                    estado:
                      state.answers[item.id]
                        .toUpperCase(),

                    opcionesNok:
                      Array.isArray(
                        state.reasons[item.id]
                      )
                        ? state.reasons[item.id]
                        : [],

                    motivo:
                      Array.isArray(
                        state.reasons[item.id]
                      )
                        ? ""
                        : (
                            state.reasons[item.id] ||
                            ""
                          )

                  }

                ])
              )

          }
        );


        showToast(
          "Inspección guardada correctamente en Firebase."
        );


        setTimeout(() => {

          resetInspection();

          showScreen(homeScreen);

        }, 1200);


      } catch (error) {

        console.error(
          "Error guardando en Firebase:",
          error
        );

        showToast(
          "No se pudo guardar en Firebase. Revisa las reglas de Firestore."
        );

        updateSummary();

      }

    }
  );


function resetInspection() {

  state.answers = {};

  state.reasons = {};

  vehicleNumber.value = "";

  vehicleError.textContent = "";

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
    async () => {

      showScreen(
        historyScreen
      );

      await loadHistory();

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


async function loadHistory() {

  const container =
    document.getElementById(
      "historyList"
    ) ||
    document.querySelector(
      "#historyScreen .history-list"
    ) ||
    document.querySelector(
      "#historyScreen .history-content"
    );


  if (!container) {
    return;
  }


  container.innerHTML =
    '<div class="history-empty">Cargando historial...</div>';


  try {

    const snapshot =
      await getDocs(
        query(
          collection(
            db,
            "inspecciones"
          ),
          orderBy(
            "fecha",
            "desc"
          )
        )
      );


    if (snapshot.empty) {

      container.innerHTML =
        '<div class="history-empty">No hay inspecciones guardadas.</div>';

      return;

    }


    container.innerHTML =
      snapshot.docs.map(
        doc => {

          const data =
            doc.data();


          const date =
            data.fecha?.toDate
              ? data.fecha
                  .toDate()
                  .toLocaleString(
                    "es-ES"
                  )
              : "Fecha pendiente";


          const status =
            data.estadoFinal ||
            "NOK";


          const nokDetails =
            Object.entries(
              data.puntos || {}
            )
            .filter(
              ([, p]) =>
                p.estado === "NOK"
            )
            .map(
              ([id, p]) => {

                const item =
                  checklistItems.find(
                    x => x.id === id
                  );


                const detail =
                  p.opcionesNok?.length
                    ? p.opcionesNok.join(
                        ", "
                      )
                    : (
                        p.motivo ||
                        "Sin motivo"
                      );


                return `
                  <div>
                    <strong>
                      ${item?.title || id}:
                    </strong>
                    ${detail}
                  </div>
                `;

              }
            )
            .join("");


          return `
            <article class="history-card">

              <div class="history-card-top">

                <div>

                  <strong>
                    Vehículo ${
                      data.vehiculo || "—"
                    }
                  </strong>

                  <div class="history-date">
                    ${date}
                  </div>

                </div>

                <span
                  class="status-pill ${
                    status === "OK"
                      ? "green"
                      : "red"
                  }"
                >
                  ${status}
                </span>

              </div>

              ${
                nokDetails
                  ? `
                    <div class="history-details">
                      ${nokDetails}
                    </div>
                  `
                  : ""
              }

            </article>
          `;

        }
      ).join("");


  } catch (error) {

    console.error(
      "Error cargando historial:",
      error
    );


    container.innerHTML =
      '<div class="history-empty">No se pudo cargar el historial. Revisa Firebase y las reglas de Firestore.</div>';

  }

}


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
      () =>
        toast.classList.remove(
          "show"
        ),
      3200
    );

}


renderChecklist();

updateSummary();