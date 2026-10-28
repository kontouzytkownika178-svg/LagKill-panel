// Panel admina LagKill — statystyki z Supabase (lagkill_panel) po podaniu hasła, polecenia i własne kody.
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
  if (!cfg.url || !cfg.key) throw new Error("Brak konfiguracji Supabase");
  const r = await fetch(`${cfg.url}/rest/v1/rpc/lagkill_panel`, {
    method: "POST",
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || `Błąd ${r.status}`);
  if (data.error === "bad_password") throw new Error("Nieprawidłowe hasło");
  if (data.error === "locked") throw new Error("Panel zablokowany (limit prób)");
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

const ICON = {
  installs: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  launches: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  active: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
};

let lastStats = null;
window.addEventListener("resize", () => lastStats && render(lastStats));

function render(s) {
  lastStats = s;
  const t = s.totals, a = s.active, p = s.plans;
  $("demo-badge").classList.toggle("hidden", !demo);
  $("updated").textContent = new Date(s.generated_at).toLocaleString("pl-PL");
  $("nav-count-users").textContent = fmt(t.users);
  $("nav-count-ref").textContent = fmt((s.referrals || []).length);

  $("kpis").innerHTML = `
    <div class="stat-card">
      <div class="stat-icon">${ICON.installs}</div>
      <h3>Instalacje</h3>
      <div class="stat-val">${fmt(t.installs)}</div>
      <div class="stat-sub">+ ${fmt(t.updates)} aktualizacji</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">${ICON.users}</div>
      <h3>Użytkownicy</h3>
      <div class="stat-val">${fmt(t.users)}</div>
      <div class="stat-sub">unikalne systemy</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">${ICON.launches}</div>
      <h3>Uruchomienia</h3>
      <div class="stat-val">${fmt(t.launches)}</div>
      <div class="stat-sub">łączna aktywność</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">${ICON.active}</div>
      <h3>Dziś Aktywni</h3>
      <div class="stat-val">${fmt(a.today)}</div>
      <div class="stat-sub">${fmt(a.d30)} w tym miesiącu</div>
    </div>
  `;

  lineChart($("chart-active"), s.daily.map((d) => ({ x: d.day, y: d.active })), "aktywnych");
  barChart($("chart-installs"), s.daily.map((d) => ({ x: d.day, y: d.installs })), "instalacji");
  plans(p);

  $("counters").innerHTML = [
    ["Włączone tweaki", t.tweaks_enabled, "settings"],
    ["Zainstalowane aplikacje", t.apps_installed, "download"],
    ["Czyszczenia RAM", t.ram_cleans, "zap"],
    ["Uruchomione gry", t.games_launched, "play"],
    ["Polecenia", (s.referrals || []).length, "users"],
    ["Kody polecające", s.referral_codes ?? 0, "link"],
  ].map(([l, v, ico]) => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:rgba(255,255,255,0.03); border-radius:12px;">
      <span style="font-size:13px; color:var(--text-muted);">${l}</span>
      <b style="font-size:16px;">${fmt(v)}</b>
    </div>
  `).join("");

  bars($("top-tweaks"), s.top_tweaks.map((x) => ({ name: TWEAK_NAMES[x.id] || x.id, n: x.count })));
  bars($("top-apps"), s.top_apps.map((x) => ({ name: x.id, n: x.count })));
  bars($("versions"), s.versions.map((x) => ({ name: `LagKill ${x.v}`, n: x.count })));
  bars($("windows"), s.windows.map((x) => ({ name: x.v, n: x.count })));

  users(s.users || []);
  recent(s.recent || []);
  referrals(s.referrals || [], s.top_referrers || [], s.referral_codes ?? 0);
}

/* ───────── użytkownicy ───────── */

const PLAN = { owner: "Owner", premium: "Premium", follow: "Follower", locked: "Free" };
let allUsers = [];
$("user-search").addEventListener("input", () => users(allUsers));

function users(list) {
  allUsers = list;
  const q = $("user-search").value.trim().toLowerCase();
  const rows = q ? list.filter((u) => [u.discord_name, u.discord_user, u.discord_id].some(v => v && v.toLowerCase().includes(q))) : list;
  
  if (!rows.length) return ($("users").innerHTML = `<div class="glass-row empty-row">${q ? "Brak wyników" : "Brak danych"}</div>`);
  
  $("users").innerHTML = rows.slice(0, 100).map(u => {
    const nick = u.discord_name || u.discord_user || "Niezalogowany";
    const sub = u.discord_id ? `@${u.discord_user}` : `id: ${u.install_id.slice(0,8)}`;
    const initials = esc((u.discord_name || u.discord_user || "?").slice(0, 2).toUpperCase());
    
    return `
      <div class="glass-row">
        <div class="user-info">
          <div class="user-avatar">${initials}</div>
          <div class="user-meta">
            <b>${esc(nick)}</b>
            <span>${esc(sub)}</span>
          </div>
        </div>
        <div class="row-stat" style="min-width:100px; text-align:left;">
          <span class="pill ${u.plan || 'locked'}">${PLAN[u.plan] || 'Free'}</span>
        </div>
        <div class="row-stat">
          <b>${fmt(u.launches)}</b>
          <span>startów</span>
        </div>
        <div class="row-stat">
          <b>${fmt(u.tweaks)}</b>
          <span>tweaków</span>
        </div>
        <div class="row-stat" style="width:120px;" title="${new Date(u.last_seen).toLocaleString("pl-PL")}">
          <b>${ago(u.last_seen)}</b>
          <span>ostatnio</span>
        </div>
      </div>
    `;
  }).join("");
}

/* ───────── polecenia ───────── */

function referrals(list, top, codes) {
  $("ref-hint").textContent = `${fmt(list.length)} poleceń łącznych`;
  $("referrals").innerHTML = list.length ? list.map(r => `
    <div class="glass-row">
      <div class="user-info">
        <div class="user-meta">
          <b>${esc(r.referrer_name || "Ktoś")}</b>
          <span>zaprosił ${esc(r.referred_name || "kogoś")}${r.referred_id ? ` · ${esc(r.referred_id)}` : ""}</span>
        </div>
      </div>
      <div class="row-stat">
        <code style="background:var(--accent-soft); color:var(--accent); padding:4px 8px; border-radius:6px; font-weight:700;">${esc(r.code)}</code>
      </div>
      <div class="row-stat" title="${new Date(r.created_at).toLocaleString("pl-PL")}">
        <b>${ago(r.created_at)}</b>
        <span>kiedy</span>
      </div>
    </div>
  `).join("") : `<div class="glass-row empty-row">Nikt jeszcze nie użył kodu polecenia</div>`;

  const days = (u) => (u ? Math.max(0, Math.ceil((new Date(u) - Date.now()) / 86400000)) : 0);
  bars($("top-referrers"), top.map((t) => ({ name: `${t.name || "?"} · ${t.code}${days(t.premium_until) ? ` · ${days(t.premium_until)} dni Premium` : ""}`, n: t.count })));
}

/* ───────── aktywność ───────── */

const EVENT = {
  first_run: () => "pierwsze uruchomienie",
  app_open: () => "uruchomił aplikację",
  discord_login: () => "zalogował się przez Discord",
  follow_unlock: () => "odblokował tweaki (follow)",
  tweak_on: (p) => `włączył tweak „${TWEAK_NAMES[p.id] || p.id}”`,
  tweak_off: (p) => `wyłączył tweak „${TWEAK_NAMES[p.id] || p.id}”`,
  ram_clean: (p) => `wyczyścił RAM (${p.freedMb} MB)`,
  game_launch: (p) => `odpalił grę${p.name ? `: ${p.name}` : ""}`,
  quick_boost: () => "użył Szybkiego boostu",
  app_install: (p) => `zainstalował ${p.id || "aplikację"}`,
  backup_created: () => "utworzył kopię zapasową",
  deep_uninstall: (p) => `odinstalował ${p.name || "program"}`,
  setup_install: () => "zainstalował LagKill",
  setup_update: () => "zaktualizował LagKill",
};

function recent(list) {
  if (!list.length) return ($("recent").innerHTML = `<div style="padding:20px; color:var(--text-dim); text-align:center;">Brak danych</div>`);
  $("recent").innerHTML = list.slice(0, 30).map(e => {
    const who = e.discord_name || "Ktoś";
    const what = (EVENT[e.event] || (() => e.event))(e.props || {});
    return `
      <div class="feed-item">
        <div class="feed-dot"></div>
        <div class="feed-content">
          <b>${esc(who)}</b>
          <p>${esc(what)}</p>
        </div>
        <div class="feed-time">${ago(e.created_at)}</div>
      </div>
    `;
  }).join("");
}

/* ───────── analityka (wykresy i słupki) ───────── */

function bars(el, items) {
  if (!items.length) return (el.innerHTML = `<div style="padding:20px; color:var(--text-dim); text-align:center;">Brak danych</div>`);
  const max = Math.max(...items.map((i) => i.n), 1);
  el.innerHTML = items.map(i => `
    <div style="margin-bottom:15px;">
      <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;">
        <span style="color:var(--text-muted);">${esc(i.name)}</span>
        <b>${fmt(i.n)}</b>
      </div>
      <div style="height:6px; background:rgba(255,255,255,0.05); border-radius:10px; overflow:hidden;">
        <div style="height:100%; width:${(i.n / max) * 100}%; background:var(--grad); border-radius:10px; box-shadow:0 0 10px var(--accent-glow);"></div>
      </div>
    </div>
  `).join("");
}

function plans(p) {
  const parts = [
    { k: "Premium", v: p.premium, c: "#3b82f6" },
    { k: "Follower", v: p.follow, c: "#93c5fd" },
    { k: "Owner", v: p.owner, c: "#ffffff" },
    { k: "Free", v: p.locked, c: "#64748b" },
  ];
  const total = parts.reduce((s, x) => s + x.v, 0);
  $("plans").innerHTML = `
    <div style="display:flex; height:12px; border-radius:10px; overflow:hidden; margin-bottom:20px;">
      ${parts.filter(x => x.v).map(x => `<div style="flex:${x.v}; background:${x.c};" title="${x.k}"></div>`).join("")}
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
      ${parts.map(x => `
        <div style="display:flex; align-items:center; gap:8px; font-size:13px;">
          <i style="width:8px; height:8px; border-radius:50%; background:${x.c};"></i>
          <span style="color:var(--text-muted);">${x.k}</span>
          <b style="margin-left:auto;">${fmt(x.v)}</b>
        </div>
      `).join("")}
    </div>
  `;
}

/* ───────── Wykresy SVG (Redesign) ───────── */

const H = 260, PAD = { l: 40, r: 10, t: 20, b: 30 };
const dayLabel = (d) => new Date(d).toLocaleDateString("pl-PL", { day: "numeric", month: "short" });

function scaffold(el, data, unit) {
  const W = el.clientWidth || 600;
  const max = Math.max(...data.map((d) => d.y), 1);
  const nice = Math.ceil(max / 5) * 5;
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const x = (i) => PAD.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v) => PAD.t + ih - (v / nice) * ih;
  
  const grid = [0, nice/2, nice].map(t => `
    <line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
    <text x="${PAD.l - 10}" y="${y(t) + 4}" fill="var(--text-dim)" font-size="10" text-anchor="end">${fmt(t)}</text>
  `).join("");
  
  // co 7 dni + ostatni dzień, chyba że ostatni byłby za blisko poprzedniej etykiety
  const labels = data.filter((_, i) => (i % 7 === 0 && data.length - 1 - i >= 4) || i === data.length - 1).map(d => `
    <text x="${x(data.indexOf(d))}" y="${H - 10}" fill="var(--text-dim)" font-size="10" text-anchor="middle">${dayLabel(d.day || d.x)}</text>
  `).join("");

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%; height:100%; overflow:visible;">
    <g class="grid">${grid}${labels}</g>
    <g class="plot"></g>
  </svg>`;
  return { svg: el.querySelector("svg"), x, y, nice, W };
}

function lineChart(el, data, unit) {
  const c = scaffold(el, data, unit);
  const pts = data.map((d, i) => `${c.x(i)},${c.y(d.y)}`).join(" ");
  const base = c.y(0);
  el.querySelector(".plot").innerHTML = `
    <defs>
      <linearGradient id="grad-${el.id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--accent)" stop-opacity="0.3"/>
        <stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="M${c.x(0)},${base} L${pts} L${c.x(data.length-1)},${base} Z" fill="url(#grad-${el.id})"/>
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  `;
}

function barChart(el, data, unit) {
  const c = scaffold(el, data, unit);
  const bw = Math.max(4, (c.W / data.length) * 0.6);
  const base = c.y(0);
  el.querySelector(".plot").innerHTML = data.map((d, i) => {
    const h = base - c.y(d.y);
    return h > 0 ? `<rect x="${c.x(i) - bw/2}" y="${c.y(d.y)}" width="${bw}" height="${h}" rx="2" fill="var(--accent)" opacity="0.8"/>` : "";
  }).join("");
}

/* ───────── admin: własne kody ───────── */

const CODE_ERR = {
  bad_password: "Nieprawidłowe hasło — zaloguj się ponownie.",
  locked: "Za dużo błędnych haseł — spróbuj za 15 minut.",
  bad_format: "Kod musi mieć 3–20 znaków: małe litery, cyfry i _.",
  taken: "Ten kod jest już zajęty.",
  ambiguous: "Kilku użytkowników ma taki nick — podaj ID Discord.",
};

$("admin-code-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("admin-code-msg");
  const custom = $("admin-custom-code").value.trim().toLowerCase();
  const owner = $("admin-owner").value.trim();
  msg.className = "admin-msg";
  msg.textContent = "";
  if (!/^[a-z0-9_]{3,20}$/.test(custom)) {
    msg.className = "admin-msg err";
    msg.textContent = CODE_ERR.bad_format;
    return;
  }
  if (demo) {
    msg.textContent = "Tryb demonstracyjny — kod nie został zapisany.";
    return;
  }

  const btn = e.target.querySelector("button");
  const oldTxt = btn.textContent;
  btn.textContent = "Tworzenie…";
  btn.disabled = true;
  try {
    const r = await fetch(`${cfg.url}/rest/v1/rpc/lagkill_admin_create_code`, {
      method: "POST",
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password, custom_code: custom, owner: owner || null }),
    });
    const res = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(res.message || `Błąd ${r.status}`);
    if (res.error) throw new Error(CODE_ERR[res.error] || res.error);

    $("admin-code-result").classList.remove("hidden");
    $("admin-code-display").textContent = res.code;
    $("admin-code-owner").textContent =
      res.kind === "user"
        ? `Kod użytkownika ${res.owner} zmieniony z ${res.old_code} na ${res.code}. Zobaczy go w aplikacji w ciągu 30 minut.`
        : `Kod partnerski „${res.owner}” — wpisany przy starcie aplikacji liczy się jako polecenie.`;
    $("admin-custom-code").value = "";
    $("admin-owner").value = "";
    load();
  } catch (err) {
    msg.className = "admin-msg err";
    msg.textContent = err.message;
  } finally {
    btn.textContent = oldTxt;
    btn.disabled = false;
  }
});

/* ───────── nawigacja ───────── */

function showView(name) {
  document.querySelectorAll(".nav-item").forEach(i => i.classList.toggle("active", i.dataset.view === name));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
  $("view-title").textContent = {
    overview: "Przegląd", users: "Użytkownicy", referrals: "Polecenia", charts: "Analityka", tweaks: "Tweaki & Apps", admin: "Zarządzanie"
  }[name];
  
  if (lastStats) {
    lineChart($("chart-active"), lastStats.daily.map((d) => ({ x: d.day, y: d.active })), "aktywnych");
    barChart($("chart-installs"), lastStats.daily.map((d) => ({ x: d.day, y: d.installs })), "instalacji");
  }
}

document.querySelectorAll(".nav-item").forEach((i) =>
  i.addEventListener("click", () => {
    showView(i.dataset.view);
    $("app").classList.remove("menu-open");
  }),
);
$("menu-toggle").addEventListener("click", () => $("app").classList.toggle("menu-open"));
$("menu-shade").addEventListener("click", () => $("app").classList.remove("menu-open"));

/* ───────── helpers ───────── */

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
  if (s < 60) return "teraz";
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return new Date(iso).toLocaleDateString("pl-PL", {day:'numeric', month:'short'});
}

function demoData() {
  const days = [...Array(30)].map((_, i) => ({ day: `2024-01-${i+1}`, active: 40 + Math.random()*20, installs: Math.random()*10 }));
  return {
    generated_at: new Date().toISOString(),
    totals: { installs: 1284, updates: 312, users: 1097, launches: 9842, tweaks_enabled: 18430, apps_installed: 2210, ram_cleans: 3105, games_launched: 4021 },
    active: { today: 214, d30: 1003 },
    plans: { premium: 87, follow: 596, owner: 2, locked: 318 },
    daily: days,
    top_tweaks: [{id:"net-nagle", count:812}, {id:"gpu-gamedvr", count:755}],
    top_apps: [{id:"Discord", count:402}],
    versions: [{v:"1.0.0", count:1003}],
    windows: [{v:"Windows 11", count:642}, {v:"Windows 10", count:361}],
    users: [{discord_name:"Kacper", plan:"premium", launches:142, tweaks:61, last_seen:new Date().toISOString(), install_id:"uuid-1"}],
    recent: [{discord_name:"Kacper", event:"tweak_on", props:{id:"net-nagle"}, created_at:new Date().toISOString()}],
    referrals: [{referrer_name:"Kacper", referred_name:"Ola", code:"PROMO1", created_at:new Date().toISOString()}],
    top_referrers: [{name:"Kacper", count:5}],
    referral_codes: 42
  };
}

/* ───────── init ───────── */

$("login-form").addEventListener("submit", e => {
  e.preventDefault();
  password = $("pass").value;
  demo = false;
  sessionStorage.setItem("lk-panel-pass", password);
  load().then(() => timer = setInterval(load, 60000));
});

$("demo").addEventListener("click", () => { demo = true; load(); });
$("refresh").addEventListener("click", load);
$("logout").addEventListener("click", () => { sessionStorage.removeItem("lk-panel-pass"); location.reload(); });

if (password) load().then(() => timer = setInterval(load, 60000));
