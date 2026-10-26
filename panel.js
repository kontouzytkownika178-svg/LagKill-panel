// Panel statystyk LagKill — pobiera podsumowania z funkcji lagkill_stats (Supabase) po podaniu hasła.
const cfg = window.LK_SUPABASE || {};
const TWEAK_NAMES = window.LK_TWEAKS || {};
const $ = (id) => document.getElementById(id);
const fmt = (n) => (n ?? 0).toLocaleString("pl-PL");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let password = sessionStorage.getItem("lk-panel-pass");
let demo = false;
let timer = null;

async function fetchStats() {
  if (demo) return demoData();
  if (!cfg.url || !cfg.key) throw new Error("Brak konfiguracji Supabase w config.js");
  // lagkill_panel pilnuje prób hasła: po 10 błędnych w 15 min blokuje panel na 15 min
  const r = await fetch(`${cfg.url}/rest/v1/rpc/lagkill_panel`, {
    method: "POST",
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || `Błąd ${r.status}`);
  if (data.error === "bad_password") throw new Error("Nieprawidłowe hasło");
  if (data.error === "locked") throw new Error("Za dużo błędnych haseł — panel zablokowany na 15 minut");
  return data;
}

async function load() {
  try {
    const s = await fetchStats();
    $("login").classList.add("hidden");
    $("app").classList.remove("hidden");
    render(s);
  } catch (e) {
    showLogin(e.message);
  }
}

function showLogin(msg) {
  clearInterval(timer);
  $("app").classList.add("hidden");
  $("login").classList.remove("hidden");
  $("err").textContent = msg || "";
}

/* ───────── render ───────── */

let lastStats = null;
window.addEventListener("resize", () => lastStats && render(lastStats));

function render(s) {
  lastStats = s;
  const t = s.totals, a = s.active, p = s.plans;
  $("demo-badge").classList.toggle("hidden", !demo);
  $("updated").textContent = `Zaktualizowano ${new Date(s.generated_at).toLocaleString("pl-PL")} · odświeża się co minutę`;

  $("kpis").innerHTML = `
    <div class="card kpi hero"><div class="label">Instalacje</div><div class="val">${fmt(t.installs)}</div><div class="sub">+ ${fmt(t.updates)} aktualizacji</div></div>
    <div class="card kpi"><div class="label">Użytkownicy</div><div class="val">${fmt(t.users)}</div><div class="sub">unikalne instalacje aplikacji</div></div>
    <div class="card kpi"><div class="label">Uruchomienia</div><div class="val">${fmt(t.launches)}</div><div class="sub">łącznie</div></div>
    <div class="card kpi"><div class="label">Aktywni</div>
      <div class="active3"><div><b>${fmt(a.today)}</b><span>dziś</span></div><div><b>${fmt(a.d7)}</b><span>7 dni</span></div><div><b>${fmt(a.d30)}</b><span>30 dni</span></div></div></div>
    <div class="card kpi"><div class="label">Logowania Discord</div><div class="val">${fmt(t.discord_users)}</div><div class="sub">unikalni użytkownicy</div></div>
    <div class="card kpi"><div class="label">Premium</div><div class="val">${fmt(p.premium)}</div><div class="sub">aktywni z rangą · 30 dni</div></div>`;

  lineChart($("chart-active"), s.daily.map((d) => ({ x: d.day, y: d.active })), "aktywnych");
  barChart($("chart-installs"), s.daily.map((d) => ({ x: d.day, y: d.installs })), "instalacji");
  plans(p);

  $("counters").innerHTML = [
    ["Włączone tweaki", t.tweaks_enabled],
    ["Zainstalowane aplikacje", t.apps_installed],
    ["Czyszczenia RAM", t.ram_cleans],
    ["Uruchomione gry", t.games_launched],
    ["Odblokowania za obserwację", t.follow_unlocks],
    ["Aktualizacje LagKill", t.updates],
  ].map(([l, v]) => `<div><b>${fmt(v)}</b><span>${l}</span></div>`).join("");

  bars($("top-tweaks"), s.top_tweaks.map((x) => ({ name: TWEAK_NAMES[x.id] || x.id, n: x.count })));
  bars($("top-apps"), s.top_apps.map((x) => ({ name: x.id, n: x.count })));
  bars($("versions"), s.versions.map((x) => ({ name: `LagKill ${x.v}`, n: x.count })));
  bars($("windows"), s.windows.map((x) => ({ name: x.v, n: x.count })));

  users(s.users || []);
  recent(s.recent || []);
}

/* ───────── użytkownicy i aktywność ───────── */

const PLAN = { premium: "Premium", owner: "Owner", follow: "Follower", locked: "Free" };
const EVENT = {
  first_run: () => "pierwsze uruchomienie",
  app_open: () => "uruchomił LagKill",
  discord_login: () => "zalogował się przez Discord",
  follow_unlock: () => "odblokował tweaki za obserwację",
  tweak_on: (p) => `włączył tweak „${TWEAK_NAMES[p.id] || p.id}”`,
  tweak_off: (p) => `wyłączył tweak „${TWEAK_NAMES[p.id] || p.id}”`,
  quick_boost: () => "użył Szybkiego boostu",
  app_install: (p) => `zainstalował ${p.id || "aplikację"}`,
  backup_created: () => "utworzył kopię zapasową",
  ram_clean: (p) => `wyczyścił RAM${p.freedMb ? ` (${fmt(p.freedMb)} MB)` : ""}`,
  game_launch: (p) => `uruchomił grę${p.name || p.id ? ` ${p.name || p.id}` : ""}`,
  deep_uninstall: (p) => `odinstalował ${p.name || p.id || "program"}`,
  setup_install: () => "zainstalował LagKill",
  setup_update: () => "zaktualizował LagKill",
};

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
  if (s < 60) return "przed chwilą";
  if (s < 3600) return `${Math.floor(s / 60)} min temu`;
  if (s < 86400) return `${Math.floor(s / 3600)} godz. temu`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} dni temu`;
  return new Date(iso).toLocaleDateString("pl-PL");
}
const fullDate = (iso) => new Date(iso).toLocaleString("pl-PL");
const winName = (b) => (!b || !/^\d+$/.test(b) ? "?" : `${+b >= 22000 ? "Windows 11" : "Windows 10"} (${b})`);
const nick = (r) => r.discord_name || r.discord_user || null;

let allUsers = [];
$("user-search").addEventListener("input", () => users(allUsers));

function users(list) {
  allUsers = list;
  const q = $("user-search").value.trim().toLowerCase();
  const rows = q
    ? list.filter((u) => [u.discord_name, u.discord_user, u.discord_id, u.install_id].some((v) => v && String(v).toLowerCase().includes(q)))
    : list;
  const named = list.filter((u) => u.discord_id).length;
  $("users-hint").textContent = `${fmt(list.length)} instalacji · ${fmt(named)} z kontem Discord · ostatnio aktywni na górze`;
  if (!rows.length) return ($("users").innerHTML = `<tr><td colspan="8" class="empty">${q ? "Nikt nie pasuje" : "Brak danych"}</td></tr>`);
  $("users").innerHTML = rows
    .map((u) => {
      const online = Date.now() - new Date(u.last_seen) < 15 * 60 * 1000;
      const who = nick(u)
        ? `<b>${online ? `<i class="online" title="Aktywny w ostatnich 15 min"></i>` : ""}${esc(nick(u))}</b><span title="ID Discord: ${esc(u.discord_id)}">@${esc(u.discord_user || "?")} · ${esc(u.discord_id)}</span>`
        : `<b>${online ? `<i class="online"></i>` : ""}Niezalogowany</b><span title="${esc(u.install_id)}">instalacja ${esc(u.install_id.slice(0, 8))}</span>`;
      return `<tr>
        <td class="who">${who}</td>
        <td><span class="pill ${u.plan || "none"}">${PLAN[u.plan] || "—"}</span></td>
        <td class="num">${fmt(u.launches)}</td>
        <td class="num">${fmt(u.tweaks)}</td>
        <td class="num">${fmt(u.games)}</td>
        <td title="${fullDate(u.last_seen)}">${ago(u.last_seen)}</td>
        <td title="${fullDate(u.first_seen)}">${new Date(u.first_seen).toLocaleDateString("pl-PL")}</td>
        <td class="dim">${esc(winName(u.os_build))}${u.app_version ? ` · v${esc(u.app_version)}` : ""}</td>
      </tr>`;
    })
    .join("");
}

function recent(list) {
  if (!list.length) return ($("recent").innerHTML = `<div class="empty" style="padding: 8px 18px">Brak danych</div>`);
  $("recent").innerHTML = list
    .map((e) => {
      const who = nick(e) ? esc(nick(e)) : e.event.startsWith("setup_") ? "Ktoś" : "Niezalogowany";
      const what = (EVENT[e.event] || (() => e.event))(e.props || {});
      return `<div class="feed-row"><div class="what"><b>${who}</b> ${esc(what)}</div><time title="${fullDate(e.created_at)}">${ago(e.created_at)}</time></div>`;
    })
    .join("");
}

function bars(el, items) {
  if (!items.length) return (el.innerHTML = `<div class="empty">Brak danych</div>`);
  const max = Math.max(...items.map((i) => i.n), 1);
  el.innerHTML = items
    .map((i) => `<div class="bar-row"><div><div class="name" title="${esc(i.name)}">${esc(i.name)}</div><div class="bar-track"><div class="bar-fill" style="width:${(i.n / max) * 100}%"></div></div></div><span class="n">${fmt(i.n)}</span></div>`)
    .join("");
}

function plans(p) {
  const parts = [
    { k: "Premium", v: p.premium, c: "var(--c-premium)" },
    { k: "Follower", v: p.follow, c: "var(--c-follow)" },
    { k: "Owner", v: p.owner, c: "var(--c-owner)" },
    { k: "Free", v: p.locked, c: "var(--c-locked)" },
  ];
  const total = parts.reduce((s, x) => s + x.v, 0);
  $("plans").innerHTML = `
    <div class="stack" role="img" aria-label="Podział planów">${total ? parts.filter((x) => x.v).map((x) => `<div title="${x.k}: ${x.v}" style="flex:${x.v};background:${x.c}"></div>`).join("") : ""}</div>
    <div class="legend">${parts.map((x) => `<div><i style="background:${x.c}"></i>${x.k}<b>${fmt(x.v)}${total ? `<small>${Math.round((x.v / total) * 100)}%</small>` : ""}</b></div>`).join("")}</div>`;
}

/* ───────── wykresy SVG (jedna seria, jedna oś, tooltip po najechaniu) ───────── */

const H = 200, PAD = { l: 34, r: 8, t: 10, b: 24 };
const dayLabel = (d) => new Date(d).toLocaleDateString("pl-PL", { day: "numeric", month: "short" });

function scaffold(el, data, unit) {
  // szerokość w jednostkach SVG = szerokość karty w pikselach, więc kropki i linie się nie rozciągają
  const W = Math.max(320, el.clientWidth || 640);
  const max = Math.max(...data.map((d) => d.y), 1);
  // „ładny” krok osi (np. 25, 50, 60, 100…), cztery przedziały bez dużego zapasu
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const stepY = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const nice = stepY * 4;
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const x = (i) => PAD.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v) => PAD.t + ih - (v / nice) * ih;
  const ticks = [0, nice / 4, nice / 2, (3 * nice) / 4, nice];
  const grid = ticks.map((t) => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}" stroke="var(--grid)" stroke-width="1"/><text x="${PAD.l - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(Math.round(t))}</text>`).join("");
  // co 7 dni + ostatni dzień, chyba że ostatni byłby za blisko poprzedniej etykiety
  const showLabel = (i) => (i % 7 === 0 && data.length - 1 - i >= 4) || i === data.length - 1;
  const labels = data.map((d, i) => (showLabel(i) ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${dayLabel(d.x)}</text>` : "")).join("");
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="height:${H}px"><g class="axis">${grid}${labels}</g><g class="plot"></g><g class="hover"></g><rect class="hit" x="${PAD.l}" y="${PAD.t}" width="${iw}" height="${ih}" fill="transparent"/></svg><div class="tip"></div>`;
  const svg = el.querySelector("svg"), tip = el.querySelector(".tip");
  const hit = el.querySelector(".hit");
  return { svg, tip, hit, x, y, iw, ih, unit, data, W };
}

function attachHover(c, onIndex) {
  const { svg, tip, hit, x, data, unit, W } = c;
  hit.addEventListener("mousemove", (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let i = Math.round(((px - PAD.l) / c.iw) * (data.length - 1));
    i = Math.max(0, Math.min(data.length - 1, i));
    onIndex(i);
    tip.style.opacity = 1;
    tip.style.left = `${(x(i) / W) * 100}%`;
    tip.style.top = `${PAD.t}px`;
    tip.innerHTML = `<b>${fmt(data[i].y)}</b>${unit} · ${dayLabel(data[i].x)}`;
  });
  hit.addEventListener("mouseleave", () => {
    tip.style.opacity = 0;
    onIndex(-1);
  });
}

function lineChart(el, data, unit) {
  const c = scaffold(el, data, unit);
  const pts = data.map((d, i) => `${c.x(i)},${c.y(d.y)}`).join(" ");
  const base = c.y(0);
  c.svg.querySelector(".plot").innerHTML = `
    <defs><linearGradient id="fill-${el.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e7bff" stop-opacity=".28"/><stop offset="1" stop-color="#1e7bff" stop-opacity="0"/></linearGradient></defs>
    <polygon points="${c.x(0)},${base} ${pts} ${c.x(data.length - 1)},${base}" fill="url(#fill-${el.id})"/>
    <polyline points="${pts}" fill="none" stroke="var(--series)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  const hov = c.svg.querySelector(".hover");
  attachHover(c, (i) => {
    hov.innerHTML = i < 0 ? "" : `<line x1="${c.x(i)}" x2="${c.x(i)}" y1="${PAD.t}" y2="${base}" stroke="#3a4a6a" stroke-width="1" vector-effect="non-scaling-stroke"/><circle cx="${c.x(i)}" cy="${c.y(data[i].y)}" r="4.5" fill="var(--series)" stroke="var(--card)" stroke-width="2"/>`;
  });
}

function barChart(el, data, unit) {
  const c = scaffold(el, data, unit);
  const step = c.iw / data.length;
  const bw = Math.max(2, step - 3);
  const base = c.y(0);
  c.svg.querySelector(".plot").innerHTML = data
    .map((d, i) => {
      const h = base - c.y(d.y);
      const x0 = PAD.l + i * step + (step - bw) / 2;
      return h > 0 ? `<path class="b" data-i="${i}" d="M${x0},${base} v${-(h - 3)} q0,-3 3,-3 h${bw - 6} q3,0 3,3 v${h - 3} z" fill="var(--series)"/>` : "";
    })
    .join("");
  // słupki: pozycja tooltipa liczona na środek słupka
  c.x = (i) => PAD.l + i * step + step / 2;
  attachHover(c, (i) => {
    c.svg.querySelectorAll(".b").forEach((b) => (b.style.opacity = i < 0 || +b.dataset.i === i ? 1 : 0.45));
  });
}

/* ───────── przykładowe dane (podgląd przed podłączeniem Supabase) ───────── */

function demoData() {
  const days = [...Array(30)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 29 + i);
    const base = 40 + i * 6 + Math.round(Math.sin(i / 2.3) * 14);
    return { day: d.toISOString().slice(0, 10), active: base, launches: base * 3, installs: Math.max(0, Math.round(base / 5 + Math.cos(i) * 4)), new_users: Math.round(base / 6) };
  });
  return {
    generated_at: new Date().toISOString(),
    totals: { installs: 1284, updates: 312, users: 1097, launches: 9842, discord_users: 1012, follow_unlocks: 664, tweaks_enabled: 18430, apps_installed: 2210, ram_cleans: 3105, games_launched: 4021 },
    active: { today: 214, d7: 702, d30: 1003 },
    plans: { premium: 87, follow: 596, owner: 2, locked: 318 },
    daily: days,
    top_tweaks: [["net-nagle", 812], ["in-mouse-accel", 790], ["gpu-gamedvr", 755], ["cpu-priority-sep", 701], ["dbl-telemetry", 688], ["win-visual-fx", 640], ["net-throttling", 602], ["gpu-hags", 311]].map(([id, count]) => ({ id, count })),
    top_apps: [["Discord.Discord", 402], ["Valve.Steam", 377], ["Brave.Brave", 240], ["OBSProject.OBSStudio", 188], ["7zip.7zip", 160]].map(([id, count]) => ({ id, count })),
    versions: [{ v: "1.0.0", count: 1003 }],
    windows: [{ v: "Windows 11", count: 642 }, { v: "Windows 10", count: 361 }],
    users: [
      ["Kacper", "kacperfn", "premium", 5, 142, 61, "26100"], ["zmora", "zmora_pl", "follow", 40, 38, 12, "22631"],
      ["Bartek", "bartas", "locked", 180, 4, 0, "19045"], ["xNeo", "xneo", "premium", 600, 77, 40, "26100"],
      [null, null, null, 2000, 1, 0, "19045"], ["Ola", "ola.gg", "follow", 4000, 21, 3, "22631"],
    ].map(([name, user, plan, minAgo, launches, tweaks, os], i) => ({
      install_id: `${i}a1b2c3d-0000-4000-8000-000000000000`, discord_id: user ? `80247919837066${1000 + i}` : null,
      discord_user: user, discord_name: name, plan, launches, tweaks, games: Math.round(launches / 3), os_build: os, app_version: "1.0.0",
      last_seen: new Date(Date.now() - minAgo * 60000).toISOString(), first_seen: new Date(Date.now() - (10 + i) * 86400000).toISOString(),
    })),
    recent: [
      ["Kacper", "tweak_on", { id: "net-nagle" }, 1], ["Kacper", "app_open", {}, 5], ["zmora", "follow_unlock", {}, 40],
      ["xNeo", "game_launch", { name: "Fortnite" }, 600], [null, "setup_install", {}, 900], ["Ola", "ram_clean", {}, 4000],
    ].map(([name, event, props, minAgo]) => ({ discord_name: name, event, props, created_at: new Date(Date.now() - minAgo * 60000).toISOString() })),
  };
}

/* ───────── zdarzenia ───────── */

$("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  password = $("pass").value;
  demo = false;
  sessionStorage.setItem("lk-panel-pass", password);
  $("err").textContent = "";
  load().then(() => (timer = setInterval(load, 60000)));
});
$("demo").addEventListener("click", () => {
  demo = true;
  load();
});
$("refresh").addEventListener("click", load);
$("logout").addEventListener("click", () => {
  sessionStorage.removeItem("lk-panel-pass");
  password = null;
  demo = false;
  showLogin("");
});

if (password) load().then(() => (timer = setInterval(load, 60000)));
