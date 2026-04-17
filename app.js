const SECRET_CODE = "gimoya";
const STORAGE_KEYS = {
  users: "huerto_users_v1",
  session: "huerto_session_v1",
  plants: "huerto_plants_v1",
  weatherCache: "huerto_weather_cache_v1"
};

// Si quieres usar Firebase, rellena estos datos con tus credenciales.
// La app funciona tambien en modo localStorage si los dejas vacios.
const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// OpenWeatherMap API key: https://openweathermap.org/api
const OPENWEATHER_API_KEY = "";
const CIEZA_COORDS = { lat: 38.23998, lon: -1.41987 };

let firebaseDb = null;
let currentUser = null;
let plants = [];
let lastWeather = null;

const refs = {
  authSection: document.querySelector("#authSection"),
  appSection: document.querySelector("#appSection"),
  authError: document.querySelector("#authError"),
  tabs: document.querySelectorAll(".tab"),
  loginForm: document.querySelector("#loginForm"),
  registerForm: document.querySelector("#registerForm"),
  logoutBtn: document.querySelector("#logoutBtn"),
  showPlantFormBtn: document.querySelector("#showPlantFormBtn"),
  plantForm: document.querySelector("#plantForm"),
  plantList: document.querySelector("#plantList"),
  refreshWeatherBtn: document.querySelector("#refreshWeatherBtn"),
  weatherIcon: document.querySelector("#weatherIcon"),
  weatherState: document.querySelector("#weatherState"),
  weatherTemp: document.querySelector("#weatherTemp"),
  weatherFeels: document.querySelector("#weatherFeels"),
  weatherHumidity: document.querySelector("#weatherHumidity"),
  weatherWind: document.querySelector("#weatherWind"),
  weatherDate: document.querySelector("#weatherDate"),
  weatherAdvice: document.querySelector("#weatherAdvice"),
  plantCount: document.querySelector("#plantCount"),
  pendingIrrigation: document.querySelector("#pendingIrrigation"),
  lastActivity: document.querySelector("#lastActivity")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  await initFirebase();
  bindEvents();
  restoreSession();
  if (currentUser) {
    await loadPlants();
    await updateWeather(false);
    runAutoWateringCycle();
    render();
  }
}

function bindEvents() {
  refs.tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      refs.tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const key = tab.dataset.tab;
      refs.loginForm.classList.toggle("active", key === "login");
      refs.registerForm.classList.toggle("active", key === "register");
      refs.authError.textContent = "";
    })
  );

  refs.registerForm.addEventListener("submit", onRegister);
  refs.loginForm.addEventListener("submit", onLogin);
  refs.logoutBtn.addEventListener("click", logout);

  refs.showPlantFormBtn.addEventListener("click", () => {
    refs.plantForm.classList.toggle("hidden");
  });
  refs.plantForm.addEventListener("submit", onCreatePlant);
  refs.refreshWeatherBtn.addEventListener("click", () => updateWeather(true));
}

function getUsers() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || "[]");
}

function saveUsers(users) {
  localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
}

function restoreSession() {
  const session = localStorage.getItem(STORAGE_KEYS.session);
  if (!session) return;
  currentUser = session;
  refs.authSection.classList.add("hidden");
  refs.appSection.classList.remove("hidden");
  refs.logoutBtn.classList.remove("hidden");
}

function onRegister(e) {
  e.preventDefault();
  const username = document.querySelector("#registerUsername").value.trim();
  const password = document.querySelector("#registerPassword").value.trim();
  const secretCode = document.querySelector("#secretCode").value.trim();

  if (secretCode !== SECRET_CODE) {
    refs.authError.textContent = "Codigo secreto incorrecto";
    return;
  }

  if (!username || !password) {
    refs.authError.textContent = "Completa usuario y contrasena";
    return;
  }

  const users = getUsers();
  if (users.some((u) => u.username === username)) {
    refs.authError.textContent = "Ese usuario ya existe";
    return;
  }

  users.push({ username, password });
  saveUsers(users);
  refs.authError.textContent = "Usuario creado. Ya puedes iniciar sesion.";
  refs.registerForm.reset();
}

async function onLogin(e) {
  e.preventDefault();
  const username = document.querySelector("#loginUsername").value.trim();
  const password = document.querySelector("#loginPassword").value.trim();
  const users = getUsers();
  const user = users.find((u) => u.username === username && u.password === password);
  if (!user) {
    refs.authError.textContent = "Usuario o contrasena invalidos";
    return;
  }

  currentUser = username;
  localStorage.setItem(STORAGE_KEYS.session, currentUser);
  refs.authSection.classList.add("hidden");
  refs.appSection.classList.remove("hidden");
  refs.logoutBtn.classList.remove("hidden");
  refs.authError.textContent = "";

  await loadPlants();
  await updateWeather(false);
  runAutoWateringCycle();
  render();
}

function logout() {
  currentUser = null;
  plants = [];
  localStorage.removeItem(STORAGE_KEYS.session);
  refs.authSection.classList.remove("hidden");
  refs.appSection.classList.add("hidden");
  refs.logoutBtn.classList.add("hidden");
  refs.loginForm.reset();
  refs.registerForm.reset();
}

function normalizePlantsByUser(store) {
  if (!store || typeof store !== "object") return {};
  return store;
}

async function loadPlants() {
  if (!currentUser) return;
  const fromDb = await readPlantsFromFirebase();
  if (fromDb) {
    plants = fromDb;
    savePlantsLocal();
    return;
  }

  const all = normalizePlantsByUser(JSON.parse(localStorage.getItem(STORAGE_KEYS.plants) || "{}"));
  plants = Array.isArray(all[currentUser]) ? all[currentUser] : [];
}

async function persistPlants() {
  savePlantsLocal();
  await writePlantsToFirebase();
}

function savePlantsLocal() {
  const all = normalizePlantsByUser(JSON.parse(localStorage.getItem(STORAGE_KEYS.plants) || "{}"));
  all[currentUser] = plants;
  localStorage.setItem(STORAGE_KEYS.plants, JSON.stringify(all));
}

async function onCreatePlant(e) {
  e.preventDefault();
  const plant = {
    id: crypto.randomUUID(),
    name: document.querySelector("#plantName").value.trim(),
    type: document.querySelector("#plantType").value.trim(),
    location: document.querySelector("#plantLocation").value.trim(),
    status: document.querySelector("#plantStatus").value.trim(),
    frequencyDays: Number(document.querySelector("#plantFrequency").value || 2),
    createdAt: new Date().toISOString(),
    autoWatering: { enabled: false, time: "08:00", mode: "daily", everyXDays: 2, lastAutoRunDate: "" },
    wateringHistory: [],
    photos: [],
    journal: []
  };
  plants.unshift(plant);
  refs.plantForm.reset();
  refs.plantForm.classList.add("hidden");
  await persistPlants();
  render();
}

function render() {
  refs.plantList.innerHTML = "";
  const template = document.querySelector("#plantTemplate");
  plants.forEach((plant) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector(".plant-name").textContent = plant.name;
    node.querySelector(".plant-type").textContent = plant.type;
    node.querySelector(".plant-location").textContent = plant.location;
    node.querySelector(".plant-status").textContent = plant.status;
    node.querySelector(".plant-frequency").textContent = plant.frequencyDays;
    node.querySelector(".auto-text").textContent = autoWateringText(plant);

    const autoEnabled = node.querySelector(".auto-enabled");
    const autoTime = node.querySelector(".auto-time");
    const autoMode = node.querySelector(".auto-mode");
    const autoEveryXGroup = node.querySelector(".auto-everyx-group");
    const autoEveryX = node.querySelector(".auto-everyx");
    autoEnabled.checked = !!plant.autoWatering?.enabled;
    autoTime.value = plant.autoWatering?.time || "08:00";
    autoMode.value = plant.autoWatering?.mode || "daily";
    autoEveryX.value = plant.autoWatering?.everyXDays || 2;
    autoEveryXGroup.classList.toggle("hidden", autoMode.value !== "everyX");
    autoMode.addEventListener("change", () => autoEveryXGroup.classList.toggle("hidden", autoMode.value !== "everyX"));

    node.querySelector(".water-btn").addEventListener("click", async () => {
      await addWateringEvent(plant.id, "Manual");
    });

    node.querySelector(".auto-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      plant.autoWatering = {
        ...plant.autoWatering,
        enabled: autoEnabled.checked,
        time: autoTime.value || "08:00",
        mode: autoMode.value,
        everyXDays: Math.max(1, Number(autoEveryX.value || 1))
      };
      await persistPlants();
      render();
    });

    const historyList = node.querySelector(".watering-history");
    (plant.wateringHistory || []).slice().reverse().forEach((entry) => {
      const li = document.createElement("li");
      li.textContent = `${toDisplayDate(entry.datetime)} - ${entry.type}`;
      historyList.appendChild(li);
    });
    if (!historyList.children.length) {
      const li = document.createElement("li");
      li.textContent = "Sin riegos registrados";
      historyList.appendChild(li);
    }

    const photoInput = node.querySelector(".photo-input");
    const photoTimeline = node.querySelector(".photo-timeline");
    photoInput.addEventListener("change", async (e) => {
      const files = [...e.target.files];
      for (const file of files) {
        const base64 = await fileToDataUrl(file);
        plant.photos.push({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), url: base64 });
      }
      await persistPlants();
      render();
    });
    (plant.photos || []).slice().reverse().forEach((photo) => {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = `<small>${toDisplayDate(photo.createdAt)}</small><br/>`;
      const img = document.createElement("img");
      img.src = photo.url;
      img.alt = `Foto de ${plant.name}`;
      wrapper.appendChild(img);
      photoTimeline.appendChild(wrapper);
    });

    const journalForm = node.querySelector(".journal-form");
    journalForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      plant.journal.unshift({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        notes: node.querySelector(".journal-notes").value.trim(),
        fertilizer: node.querySelector(".journal-fertilizer").value.trim(),
        issues: node.querySelector(".journal-issues").value.trim(),
        observations: node.querySelector(".journal-observations").value.trim()
      });
      await persistPlants();
      render();
    });

    const journalList = node.querySelector(".journal-list");
    (plant.journal || []).slice(0, 6).forEach((entry) => {
      const div = document.createElement("div");
      div.innerHTML = `<small>${toDisplayDate(entry.createdAt)}</small><p><strong>Notas:</strong> ${safe(entry.notes)}</p><p><strong>Fertilizantes:</strong> ${safe(entry.fertilizer)}</p><p><strong>Problemas:</strong> ${safe(entry.issues)}</p><p><strong>Observaciones:</strong> ${safe(entry.observations)}</p>`;
      journalList.appendChild(div);
    });

    refs.plantList.appendChild(node);
  });

  updateDashboard();
}

function autoWateringText(plant) {
  const aw = plant.autoWatering || {};
  if (!aw.enabled) return "Riego automatico desactivado";
  const freq = aw.mode === "daily" ? "diario" : `cada ${aw.everyXDays || 1} dia(s)`;
  return `Riego automatico programado a las ${aw.time} (${freq})`;
}

async function addWateringEvent(plantId, type) {
  const plant = plants.find((p) => p.id === plantId);
  if (!plant) return;
  plant.wateringHistory.push({
    id: crypto.randomUUID(),
    type,
    datetime: new Date().toISOString()
  });
  await persistPlants();
  render();
}

function updateDashboard() {
  refs.plantCount.textContent = String(plants.length);
  const pending = plants.filter(isPlantPendingWatering).length;
  refs.pendingIrrigation.textContent = String(pending);
  const latest = getLatestActivity();
  refs.lastActivity.textContent = latest ? toDisplayDate(latest.datetime) : "-";

  if (pending > 0 && "Notification" in window && Notification.permission === "granted") {
    new Notification("HuertoAscoy", { body: `Tienes ${pending} riego(s) pendiente(s).` });
  }
}

function isPlantPendingWatering(plant) {
  const history = plant.wateringHistory || [];
  if (!history.length) return true;
  const last = history[history.length - 1];
  const diffDays = (Date.now() - new Date(last.datetime).getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= (plant.frequencyDays || 1);
}

function getLatestActivity() {
  const all = plants.flatMap((p) => (p.wateringHistory || []).map((w) => ({ ...w, plantId: p.id })));
  if (!all.length) return null;
  return all.sort((a, b) => new Date(b.datetime) - new Date(a.datetime))[0];
}

async function runAutoWateringCycle() {
  if (!currentUser) return;
  await maybeRunAutoWatering();
  setInterval(maybeRunAutoWatering, 60 * 1000);
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

async function maybeRunAutoWatering() {
  const now = new Date();
  const hhmm = now.toTimeString().slice(0, 5);
  let changed = false;
  for (const plant of plants) {
    const aw = plant.autoWatering || {};
    if (!aw.enabled || !aw.time || aw.time !== hhmm) continue;

    const lastAuto = aw.lastAutoRunDate ? new Date(aw.lastAutoRunDate) : null;
    const sameDay = lastAuto && lastAuto.toDateString() === now.toDateString();
    if (sameDay) continue;

    if (aw.mode === "everyX" && lastAuto) {
      const diffDays = Math.floor((now - lastAuto) / (1000 * 60 * 60 * 24));
      if (diffDays < (aw.everyXDays || 1)) continue;
    }

    plant.wateringHistory.push({
      id: crypto.randomUUID(),
      type: "Automatico",
      datetime: now.toISOString()
    });
    plant.autoWatering.lastAutoRunDate = now.toISOString();
    changed = true;
  }
  if (changed) {
    await persistPlants();
    render();
  }
}

async function updateWeather(forceFetch) {
  const cached = JSON.parse(localStorage.getItem(STORAGE_KEYS.weatherCache) || "null");
  const maxAgeMs = 20 * 60 * 1000;
  if (!forceFetch && cached && Date.now() - cached.timestamp < maxAgeMs) {
    lastWeather = cached.data;
    renderWeather(cached.data);
    updateSmartAdvice(cached.data);
    return;
  }

  if (!OPENWEATHER_API_KEY) {
    if (cached) {
      renderWeather(cached.data);
      updateSmartAdvice(cached.data);
      return;
    }
    refs.weatherAdvice.textContent = "Anade OPENWEATHER_API_KEY en app.js para activar el clima real.";
    return;
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${CIEZA_COORDS.lat}&lon=${CIEZA_COORDS.lon}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=es`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "No se pudo leer el clima");
    lastWeather = data;
    localStorage.setItem(STORAGE_KEYS.weatherCache, JSON.stringify({ timestamp: Date.now(), data }));
    renderWeather(data);
    updateSmartAdvice(data);
  } catch (err) {
    refs.weatherAdvice.textContent = `Error clima: ${err.message}`;
  }
}

function renderWeather(data) {
  const weatherMain = data?.weather?.[0]?.main || "";
  refs.weatherIcon.textContent = iconFromWeather(weatherMain);
  refs.weatherState.textContent = data?.weather?.[0]?.description || "Sin datos";
  refs.weatherTemp.textContent = `${Math.round(data?.main?.temp ?? 0)} C`;
  refs.weatherFeels.textContent = `${Math.round(data?.main?.feels_like ?? 0)} C`;
  refs.weatherHumidity.textContent = `${data?.main?.humidity ?? 0}%`;
  refs.weatherWind.textContent = `${data?.wind?.speed ?? 0} m/s`;
  refs.weatherDate.textContent = new Date().toLocaleString("es-ES");
}

function iconFromWeather(main) {
  const txt = String(main || "").toLowerCase();
  if (txt.includes("rain") || txt.includes("drizzle") || txt.includes("thunderstorm")) return "🌧️";
  if (txt.includes("cloud")) return "☁️";
  return "☀️";
}

function updateSmartAdvice(weather) {
  const temp = Number(weather?.main?.temp ?? 0);
  const weatherMain = String(weather?.weather?.[0]?.main || "").toLowerCase();
  const messages = [];
  if (temp > 30) messages.push("Hace calor, revisa el riego");
  if (weatherMain.includes("rain") || weatherMain.includes("drizzle")) messages.push("Hoy puede llover, reduce el riego");
  if (plants.some(isPlantPendingWatering)) messages.push("Hay plantas sin regar, revisa el panel de riegos");
  refs.weatherAdvice.textContent = messages.length ? messages.join(" | ") : "Condiciones estables para tu huerto.";
}

function toDisplayDate(iso) {
  return new Date(iso).toLocaleString("es-ES");
}

function safe(txt) {
  return (txt || "-").replace(/[<>]/g, "");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function initFirebase() {
  if (!FIREBASE_CONFIG.apiKey) return;
  try {
    const [{ initializeApp }, { getFirestore, doc, getDoc, setDoc }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
    ]);
    const app = initializeApp(FIREBASE_CONFIG);
    const db = getFirestore(app);
    firebaseDb = { db, doc, getDoc, setDoc };
  } catch (err) {
    console.error("Firebase desactivado:", err);
  }
}

async function readPlantsFromFirebase() {
  if (!firebaseDb || !currentUser) return null;
  const ref = firebaseDb.doc(firebaseDb.db, "huerto_users", currentUser);
  const snap = await firebaseDb.getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  return Array.isArray(data.plants) ? data.plants : [];
}

async function writePlantsToFirebase() {
  if (!firebaseDb || !currentUser) return;
  const ref = firebaseDb.doc(firebaseDb.db, "huerto_users", currentUser);
  await firebaseDb.setDoc(ref, { plants, updatedAt: new Date().toISOString() }, { merge: true });
}
