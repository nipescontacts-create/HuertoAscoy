const SECRET_CODE = "gimoya";
const ADMIN_CODE = "2803";
const STORAGE_KEYS = {
  users: "huerto_users_v2",
  session: "huerto_session_v2",
  plants: "huerto_plants_v2",
  weatherCache: "huerto_weather_cache_v2"
};

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBrjX55vfO295mzXnBWaMrT0L_j4a9VZek",
  authDomain: "huertoascoy.firebaseapp.com",
  databaseURL: "https://huertoascoy-default-rtdb.firebaseio.com",
  projectId: "huertoascoy",
  storageBucket: "huertoascoy.firebasestorage.app",
  messagingSenderId: "1014287375289",
  appId: "1:1014287375289:web:e8037532cec7856ea6f468"
};

const OPENWEATHER_API_KEY = "";
const CIEZA_COORDS = { lat: 38.23998, lon: -1.41987 };

let firebaseDb = null;
let currentUser = null;
let plants = [];
let usersCache = [];
let autoWateringInterval = null;
let inboxUnsubscribe = null;
let deferredInstallPrompt = null;

const refs = {
  authSection: document.querySelector("#authSection"),
  appSection: document.querySelector("#appSection"),
  authError: document.querySelector("#authError"),
  tabs: document.querySelectorAll(".tab"),
  loginForm: document.querySelector("#loginForm"),
  registerForm: document.querySelector("#registerForm"),
  logoutBtn: document.querySelector("#logoutBtn"),
  adminAccessBtn: document.querySelector("#adminAccessBtn"),
  installBtn: document.querySelector("#installBtn"),
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
  lastActivity: document.querySelector("#lastActivity"),
  inboxList: document.querySelector("#inboxList"),
  adminModal: document.querySelector("#adminModal"),
  closeAdminBtn: document.querySelector("#closeAdminBtn"),
  adminCodeForm: document.querySelector("#adminCodeForm"),
  adminCodeInput: document.querySelector("#adminCodeInput"),
  adminError: document.querySelector("#adminError"),
  adminPanelContent: document.querySelector("#adminPanelContent"),
  adminUsersList: document.querySelector("#adminUsersList"),
  adminMessageForm: document.querySelector("#adminMessageForm"),
  messageToUser: document.querySelector("#messageToUser"),
  messageBody: document.querySelector("#messageBody")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  setupInstallPrompt();
  registerServiceWorker();
  restoreSession();
  await initFirebase();
  await loadUsers();
  if (currentUser) {
    await enterAppForUser(currentUser);
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
  refs.adminAccessBtn.addEventListener("click", openAdminModal);
  refs.closeAdminBtn.addEventListener("click", closeAdminModal);
  refs.adminCodeForm.addEventListener("submit", onAdminCodeSubmit);
  refs.adminMessageForm.addEventListener("submit", onSendAdminMessage);
  refs.installBtn.addEventListener("click", onInstallClick);
  refs.showPlantFormBtn.addEventListener("click", () => refs.plantForm.classList.toggle("hidden"));
  refs.plantForm.addEventListener("submit", onCreatePlant);
  refs.refreshWeatherBtn.addEventListener("click", () => updateWeather(true));
}

async function onRegister(e) {
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

  await loadUsers();
  if (usersCache.some((u) => u.username === username)) {
    refs.authError.textContent = "Ese usuario ya existe";
    return;
  }

  usersCache.push({ username, password, createdAt: new Date().toISOString() });
  const result = await saveUsers(usersCache);
  refs.authError.textContent = result.synced
    ? "Usuario creado. Ya puedes iniciar sesion."
    : "Usuario creado en este dispositivo. Firebase no sincronizo (revisa reglas/permisos).";
  refs.registerForm.reset();
  switchAuthTab("login");
  document.querySelector("#loginUsername").value = username;
}

async function onLogin(e) {
  e.preventDefault();
  const username = document.querySelector("#loginUsername").value.trim();
  const password = document.querySelector("#loginPassword").value.trim();
  await loadUsers();
  const user = usersCache.find((u) => u.username === username && u.password === password);
  if (!user) {
    refs.authError.textContent = "Usuario o contrasena invalidos";
    return;
  }
  await enterAppForUser(username);
  refs.authError.textContent = "";
}

async function enterAppForUser(username) {
  currentUser = username;
  localStorage.setItem(STORAGE_KEYS.session, currentUser);
  refs.authSection.classList.add("hidden");
  refs.appSection.classList.remove("hidden");
  refs.logoutBtn.classList.remove("hidden");
  refs.adminAccessBtn.classList.remove("hidden");
  refs.installBtn.classList.remove("hidden");

  await loadPlants();
  await updateWeather(false);
  startAutoWateringLoop();
  startInboxListener();
  render();
}

function restoreSession() {
  const session = localStorage.getItem(STORAGE_KEYS.session);
  if (!session) return;
  currentUser = session;
}

function logout() {
  currentUser = null;
  plants = [];
  localStorage.removeItem(STORAGE_KEYS.session);
  refs.authSection.classList.remove("hidden");
  refs.appSection.classList.add("hidden");
  refs.logoutBtn.classList.add("hidden");
  refs.adminAccessBtn.classList.add("hidden");
  refs.installBtn.classList.add("hidden");
  refs.loginForm.reset();
  refs.registerForm.reset();
  refs.inboxList.innerHTML = "";
  closeAdminModal();
  if (autoWateringInterval) clearInterval(autoWateringInterval);
  if (inboxUnsubscribe) inboxUnsubscribe();
}

async function loadUsers() {
  const localUsers = JSON.parse(localStorage.getItem(STORAGE_KEYS.users) || "[]");
  usersCache = Array.isArray(localUsers) ? localUsers : [];
  if (!firebaseDb) return usersCache;
  try {
    const remote = await firebaseDb.read("users");
    if (remote && typeof remote === "object") {
      usersCache = Object.values(remote);
      localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(usersCache));
    } else if (usersCache.length) {
      await firebaseDb.write("users", indexUsersByName(usersCache));
    }
  } catch (error) {
    console.warn("No se pudo leer usuarios en Firebase, usando local:", error);
  }
  return usersCache;
}

async function saveUsers(users) {
  localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users));
  if (firebaseDb) {
    try {
      await firebaseDb.write("users", indexUsersByName(users));
      return { synced: true };
    } catch (error) {
      console.warn("No se pudo guardar usuarios en Firebase:", error);
      return { synced: false };
    }
  }
  return { synced: false };
}

function indexUsersByName(users) {
  return users.reduce((acc, user) => {
    acc[user.username] = user;
    return acc;
  }, {});
}

async function loadPlants() {
  if (!currentUser) return;
  const localStore = JSON.parse(localStorage.getItem(STORAGE_KEYS.plants) || "{}");
  plants = Array.isArray(localStore[currentUser]) ? localStore[currentUser] : [];

  if (firebaseDb) {
    const remotePlants = await firebaseDb.read(`plantsByUser/${sanitizeKey(currentUser)}`);
    if (Array.isArray(remotePlants)) {
      plants = remotePlants;
      savePlantsLocal();
    } else if (plants.length) {
      await firebaseDb.write(`plantsByUser/${sanitizeKey(currentUser)}`, plants);
    }
  }
}

async function persistPlants() {
  savePlantsLocal();
  if (firebaseDb && currentUser) {
    await firebaseDb.write(`plantsByUser/${sanitizeKey(currentUser)}`, plants);
  }
}

function savePlantsLocal() {
  const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.plants) || "{}");
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

    node.querySelector(".water-btn").addEventListener("click", async () => addWateringEvent(plant.id, "Manual"));
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
  plant.wateringHistory.push({ id: crypto.randomUUID(), type, datetime: new Date().toISOString() });
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

function startAutoWateringLoop() {
  if (autoWateringInterval) clearInterval(autoWateringInterval);
  maybeRunAutoWatering();
  autoWateringInterval = setInterval(maybeRunAutoWatering, 60 * 1000);
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
    if (!aw.enabled || aw.time !== hhmm) continue;

    const lastAuto = aw.lastAutoRunDate ? new Date(aw.lastAutoRunDate) : null;
    const sameDay = lastAuto && lastAuto.toDateString() === now.toDateString();
    if (sameDay) continue;
    if (aw.mode === "everyX" && lastAuto) {
      const diffDays = Math.floor((now - lastAuto) / (1000 * 60 * 60 * 24));
      if (diffDays < (aw.everyXDays || 1)) continue;
    }

    plant.wateringHistory.push({ id: crypto.randomUUID(), type: "Automatico", datetime: now.toISOString() });
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

function openAdminModal() {
  refs.adminModal.classList.remove("hidden");
  refs.adminPanelContent.classList.add("hidden");
  refs.adminCodeForm.classList.remove("hidden");
  refs.adminError.textContent = "";
  refs.adminCodeInput.value = "";
}

function closeAdminModal() {
  refs.adminModal.classList.add("hidden");
}

async function onAdminCodeSubmit(e) {
  e.preventDefault();
  if (refs.adminCodeInput.value.trim() !== ADMIN_CODE) {
    refs.adminError.textContent = "Codigo incorrecto";
    return;
  }
  refs.adminCodeForm.classList.add("hidden");
  refs.adminPanelContent.classList.remove("hidden");
  await loadUsers();
  renderAdminUsers();
}

function renderAdminUsers() {
  refs.adminUsersList.innerHTML = "";
  refs.messageToUser.innerHTML = "";
  usersCache.forEach((user) => {
    const row = document.createElement("div");
    row.className = "admin-user-row";
    row.textContent = user.username;
    refs.adminUsersList.appendChild(row);

    if (user.username !== currentUser) {
      const opt = document.createElement("option");
      opt.value = user.username;
      opt.textContent = user.username;
      refs.messageToUser.appendChild(opt);
    }
  });
}

async function onSendAdminMessage(e) {
  e.preventDefault();
  const toUser = refs.messageToUser.value;
  const text = refs.messageBody.value.trim();
  if (!toUser || !text || !currentUser) return;

  const message = {
    id: crypto.randomUUID(),
    from: currentUser,
    to: toUser,
    text,
    createdAt: new Date().toISOString()
  };

  if (firebaseDb) {
    const path = `messages/${sanitizeKey(toUser)}/${message.id}`;
    await firebaseDb.write(path, message);
  } else {
    const localInbox = JSON.parse(localStorage.getItem("huerto_messages_local") || "{}");
    localInbox[toUser] = localInbox[toUser] || [];
    localInbox[toUser].push(message);
    localStorage.setItem("huerto_messages_local", JSON.stringify(localInbox));
  }

  refs.messageBody.value = "";
  refs.adminError.textContent = "Mensaje enviado";
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    refs.installBtn.classList.remove("hidden");
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    refs.installBtn.classList.add("hidden");
  });
}

async function onInstallClick() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  refs.installBtn.classList.add("hidden");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

function switchAuthTab(key) {
  refs.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === key));
  refs.loginForm.classList.toggle("active", key === "login");
  refs.registerForm.classList.toggle("active", key === "register");
}

function startInboxListener() {
  refs.inboxList.innerHTML = "";
  if (!currentUser) return;
  if (inboxUnsubscribe) inboxUnsubscribe();

  if (firebaseDb) {
    const path = `messages/${sanitizeKey(currentUser)}`;
    inboxUnsubscribe = firebaseDb.subscribe(path, (value) => {
      const list = value ? Object.values(value) : [];
      renderInbox(list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    });
  } else {
    const localInbox = JSON.parse(localStorage.getItem("huerto_messages_local") || "{}");
    renderInbox(localInbox[currentUser] || []);
  }
}

function renderInbox(messages) {
  refs.inboxList.innerHTML = "";
  if (!messages.length) {
    refs.inboxList.innerHTML = "<p class='muted-text'>Sin mensajes por ahora.</p>";
    return;
  }
  messages.forEach((message) => {
    const card = document.createElement("article");
    card.className = "message-item";
    card.innerHTML = `<p><strong>${safe(message.from)}</strong> te envio:</p><p>${safe(message.text)}</p><small>${toDisplayDate(message.createdAt)}</small>`;
    refs.inboxList.appendChild(card);
  });
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

function sanitizeKey(value) {
  return String(value).replace(/[.#$/\[\]]/g, "_");
}

async function initFirebase() {
  try {
    const imports = Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js")
    ]);
    const [{ initializeApp }, { getDatabase, ref, get, set, onValue, off }] = await withTimeout(imports, 6000);
    const app = initializeApp(FIREBASE_CONFIG);
    const db = getDatabase(app);
    firebaseDb = {
      async read(path) {
        const snapshot = await get(ref(db, path));
        return snapshot.exists() ? snapshot.val() : null;
      },
      async write(path, value) {
        await set(ref(db, path), value);
      },
      subscribe(path, callback) {
        const dbRef = ref(db, path);
        const handler = (snapshot) => callback(snapshot.exists() ? snapshot.val() : null);
        onValue(dbRef, handler);
        return () => off(dbRef, "value", handler);
      }
    };
  } catch (err) {
    console.error("Firebase no disponible:", err);
  }
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Timeout al iniciar Firebase")), timeoutMs);
    })
  ]);
}
