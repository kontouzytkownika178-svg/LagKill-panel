// Panel admina LagKill — statystyki z Supabase (lagkill_panel) po podaniu hasła, polecenia i własne kody.
const cfg = window.LK_SUPABASE || {};
const TWEAK_NAMES = window.LK_TWEAKS || {};
const $ = (id) => document.getElementById(id);
const fmt = (n) => (n ?? 0).toLocaleString("pl-PL");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let password = sessionStorage.getItem("lk-panel-pass");
let timer = null;

async function fetchStats() {
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
    <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:rgba(255,255,255,0.03); border-radius:6px;">
      <span style="font-size:13px; color:var(--text-muted);">${l}</span>
      <b style="font-size:16px;">${fmt(v)}</b>
    </div>
  `).join("");

  bars($("top-tweaks"), s.top_tweaks.map((x) => ({ name: TWEAK_NAMES[x.id] || x.id, n: x.count })));
  bars($("top-apps"), s.top_apps.map((x) => ({ name: x.id, n: x.count })));
  bars($("versions"), s.versions.map((x) => ({ name: `LagKill ${x.v}`, n: x.count })));
  bars($("windows"), s.windows.map((x) => ({ name: x.v, n: x.count })));

  levels = s.levels || {};
  users(s.users || []);
  presets(s.presets || []);
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
      <div class="glass-row clickable" data-install="${esc(u.install_id)}" title="Pokaż szczegóły">
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
        <div class="row-stat" title="${esc(levels[u.install_id]?.gpu || "")}">
          <b>${levels[u.install_id]?.score ?? "–"}</b>
          <span>aktywnych</span>
        </div>
        <div class="row-stat" style="width:120px;" title="${new Date(u.last_seen).toLocaleString("pl-PL")}">
          <b>${ago(u.last_seen)}</b>
          <span>ostatnio</span>
        </div>
      </div>
    `;
  }).join("");
}

/* ───────── zestawy od graczy ───────── */

let levels = {};

function presets(list) {
  $("nav-count-presets").textContent = fmt(list.filter((p) => !p.hidden).length);
  $("presets-hint").textContent = `${fmt(list.length)} zestawów · ${fmt(list.reduce((a, p) => a + p.imports, 0))} importów`;
  $("presets").innerHTML = list.length
    ? list
        .map(
          (p) => `
    <div class="glass-row" style="${p.hidden ? "opacity:.5" : ""}">
      <div class="user-info">
        <div class="user-meta">
          <b>${esc(p.name)}${p.hidden ? " · ukryty" : ""}</b>
          <span>od ${esc(p.author || "?")} · ${esc(p.author_id || "")}${p.game ? " · " + esc(p.game) : ""}</span>
        </div>
      </div>
      <div class="row-stat"><code style="background:var(--accent-soft); color:var(--accent); padding:4px 8px; border-radius:6px; font-weight:700;">${esc(p.code)}</code></div>
      <div class="row-stat"><b>${fmt(p.tweaks)}</b><span>tweaków</span></div>
      <div class="row-stat"><b>${fmt(p.imports)}</b><span>importów</span></div>
      <div class="row-stat" style="display:flex; gap:6px;">
        <button class="btn-side" data-preset="${esc(p.code)}" data-act="${p.hidden ? "show" : "hide"}">${p.hidden ? "Pokaż" : "Ukryj"}</button>
        <button class="btn-side" style="color:var(--danger)" data-preset="${esc(p.code)}" data-act="delete">Usuń</button>
      </div>
    </div>`,
        )
        .join("")
    : `<div class="glass-row empty-row">Nikt jeszcze nie udostępnił zestawu</div>`;
}

// Ukrywanie / przywracanie / usuwanie zestawu (spam, obraźliwe nazwy)
$("presets").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-preset]");
  if (!b) return;
  if (b.dataset.act === "delete" && !confirm(`Usunąć zestaw ${b.dataset.preset}? Kod przestanie działać.`)) return;
  const r = await fetch(`${cfg.url}/rest/v1/rpc/lagkill_admin_preset`, {
    method: "POST",
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password, code: b.dataset.preset, action: b.dataset.act }),
  });
  const res = await r.json().catch(() => ({}));
  if (res.error) alert(res.error === "locked" ? "Za dużo błędnych haseł — spróbuj za 15 minut." : res.error);
  load();
});

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

  const until = (u) => (u && new Date(u) > Date.now() ? ` · Premium do ${new Date(u).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}` : "");
  bars($("top-referrers"), top.map((t) => ({ name: `${t.name || "?"} · ${t.code}${until(t.premium_until)}`, n: t.count })));
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
      <div style="height:4px; background:rgba(255,255,255,0.06); border-radius:2px; overflow:hidden;">
        <div style="height:100%; width:${(i.n / max) * 100}%; background:var(--accent); border-radius:2px;"></div>
      </div>
    </div>
  `).join("");
}

function plans(p) {
  const parts = [
    { k: "Premium", v: p.premium, c: "#ffd338" },
    { k: "Follower", v: p.follow, c: "#b39a3e" },
    { k: "Owner", v: p.owner, c: "#ececec" },
    { k: "Free", v: p.locked, c: "#4a4c51" },
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
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
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

/* ───────── admin: kody Premium ───────── */

const PREM_ERR = {
  ...CODE_ERR,
  bad_count: "Od 1 do 500 kodów naraz.",
  bad_days: "Dni: od 1 do 3650 albo puste (na zawsze).",
  no_title: "Wpisz tytuł.",
  no_discord: "Ten użytkownik nie logował się przez Discord.",
  no_device: "Brak powiązanego urządzenia — użytkownik musi uruchomić aplikację po zalogowaniu przez Discord.",
  bad_link: "Link musi zaczynać się od https://",
};

async function premRpc(fn, body) {
  const r = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password, ...body }),
  });
  const res = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(res.message || `Błąd ${r.status}`);
  if (res.error) throw new Error(PREM_ERR[res.error] || res.error);
  return res;
}

const daysLabel = (d) => (d == null ? "na zawsze" : `${d} dni`);

async function loadPremium() {
  const list = $("prem-list");
  try {
    const p = await premRpc("lagkill_admin_premium", {});
    $("prem-trials").textContent = `Okres próbny: ${fmt(p.trials)} (7 dni: ${fmt(p.trials_7d)})`;
    list.innerHTML = p.codes.length
      ? p.codes
          .map(
            (c) => `<div class="glass-row">
              <div class="user-info"><div class="user-meta"><b style="font-family: var(--mono);">${esc(c.code)}</b>
                <span>${daysLabel(c.days)}${c.note ? ` · ${esc(c.note)}` : ""} · ${new Date(c.created_at).toLocaleDateString("pl-PL")}</span></div></div>
              <div class="row-stat"><b>${fmt(c.uses)} / ${fmt(c.max_uses)}</b><span>użyć</span></div>
              <button class="btn-side" data-prem-del="${esc(c.code)}" style="margin-left: 12px;">Usuń</button>
            </div>`,
          )
          .join("")
      : `<div class="glass-row empty-row">Brak kodów — utwórz pierwszy powyżej</div>`;
  } catch (err) {
    list.innerHTML = `<div class="glass-row empty-row">${esc(err.message)}</div>`;
  }
}

$("prem-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("prem-msg");
  msg.className = "admin-msg";
  msg.textContent = "";
  const days = $("prem-days").value.trim();
  try {
    const res = await premRpc("lagkill_admin_premium_create", {
      count: Number($("prem-count").value) || 1,
      days: days ? Number(days) : null,
      max_uses: Number($("prem-uses").value) || 1,
      note: $("prem-note").value.trim() || null,
    });
    $("prem-new").classList.remove("hidden");
    $("prem-new-list").value = res.codes.join("\n");
    msg.textContent = `Utworzono ${res.codes.length} ${res.codes.length === 1 ? "kod" : "kodów"} (${daysLabel(days ? Number(days) : null)}).`;
    loadPremium();
  } catch (err) {
    msg.className = "admin-msg err";
    msg.textContent = err.message;
  }
});

$("prem-copy").addEventListener("click", () => navigator.clipboard.writeText($("prem-new-list").value));

$("prem-list").addEventListener("click", async (e) => {
  const code = e.target.dataset?.premDel;
  if (!code || !confirm(`Usunąć kod ${code}? Osoby, które go użyły, stracą Premium z tego kodu.`)) return;
  try {
    await premRpc("lagkill_admin_premium_delete", { code });
    loadPremium();
  } catch (err) {
    alert(err.message);
  }
});

/* ───────── szczegóły użytkownika (kliknięcie na liście) ───────── */

/** Czytelne nazwy zdarzeń z aplikacji (src/lib/telemetry.ts). */
const EVENT_LABEL = {
  first_run: "Pierwsze uruchomienie", app_open: "Uruchomienie", heartbeat: "Status konta", discord_login: "Logowanie Discord",
  follow_unlock: "Odblokowanie za obserwację", tweak_on: "Włączył tweak", tweak_off: "Wyłączył tweak", quick_boost: "Szybki boost",
  app_install: "Instalacja aplikacji", backup_created: "Kopia zapasowa", ram_clean: "Czyszczenie RAM", game_launch: "Uruchomił grę",
  deep_uninstall: "Głęboka deinstalacja", game_profile: "Ustawienia pod grę", preset_create: "Utworzył zestaw", preset_import: "Zaimportował zestaw",
  crosshair_on: "Włączył celownik", cloud_save: "Kopia w chmurze", cloud_restore: "Przywrócił z chmury", driver_update: "Aktualizacja sterownika",
  lag_scan: "Skaner „Czemu mi laguje?”", game_ping: "Ping do serwerów gier", bufferbloat: "Test bufferbloat", bench: "Raport przed i po",
  ram_auto: "Auto-czyszczenie RAM", overlay_on: "Włączył overlay", startup_toggle: "Zmienił autostart", stretched_res: "Rozciągnięta rozdzielczość",
  premium_code: "Użył kodu Premium", premium_trial: "Okres próbny Premium", premium_revert: "Koniec Premium (cofnięto tweaki)",
  announcement_click: "Kliknął ogłoszenie", setup_install: "Instalator: instalacja", setup_update: "Instalator: aktualizacja",
};

const dt = (s) => (s ? new Date(s).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" }) : "–");
const yesNo = (v) => (v ? "tak" : "nie");

/** Problemy ze skanera (id z src/pages/Scan.tsx). */
const SCAN_LABEL = {
  hz: "monitor na niskim Hz", xmp: "XMP wyłączone", chan: "RAM jednokanałowo", bat: "na baterii", plan: "plan zasilania",
  syshdd: "Windows na HDD", hdd: "gry na HDD", space: "mało miejsca", wu: "Windows Update w tle", od: "OneDrive w tle",
  cpu: "CPU zajęty w tle", reboot: "czeka na restart", temp: "gorące GPU", tweaks: "wyłączone tweaki",
};
const scanIssues = (ids) => (Array.isArray(ids) && ids.length ? ids.map((i) => SCAN_LABEL[i] || i).join(", ") : "bez problemów");
const REGION = { fra: "Frankfurt", sto: "Sztokholm", par: "Paryż", lon: "Londyn", dub: "Dublin", mil: "Mediolan" };
let currentUser = null;
const tweakName = (id) => TWEAK_NAMES[id] || id;

/** Krótki opis szczegółów zdarzenia (np. nazwa tweaka, gry, kodu). */
function eventDetail(e) {
  const p = e.props || {};
  if (p.id && (e.event === "tweak_on" || e.event === "tweak_off")) return tweakName(p.id);
  if (e.event === "game_launch" && p.name) return p.name;
  if (e.event === "startup_toggle" && p.name) return `${p.name} → ${p.on ? "wł." : "wył."}`;
  if (e.event === "stretched_res" && p.res) return p.res;
  if (e.event === "quick_boost") return `${p.ok ?? 0} tweaków`;
  if (e.event === "ram_clean" && p.freedMb != null) return `${fmt(p.freedMb)} MB`;
  if (e.event === "heartbeat") return p.owner ? "Owner" : p.premium ? "Premium" : p.follow ? "Follower" : "Free";
  return "";
}

function userModal(d) {
  const name = d.discord?.name || d.discord?.user || "Niezalogowany";
  const plan = d.plan?.owner ? "owner" : d.plan?.premium ? "premium" : d.plan?.follow ? "follow" : "locked";
  const until = d.referral?.premium_until;
  const max = Math.max(1, ...(d.daily || []).map((x) => x.n));
  const box = (k, v) => `<div class="ud-box"><span>${k}</span><b>${v}</b></div>`;
  const list = (rows, empty) => (rows.length ? rows.join("") : `<div class="ud-empty">${empty}</div>`);
  // Sprzęt i ustawienia przychodzą w ostatnim heartbeacie (src/lib/useProgress.ts, od 1.1.2)
  const hw = d.plan && (d.plan.cpu || d.plan.gpu) ? d.plan : null;
  const app = d.plan?.app ?? null;
  const tools = d.tools || {};
  currentUser = d.install_id;

  $("user-modal-body").innerHTML = `
    <div class="ud-head">
      <div class="user-avatar" style="width: 44px; height: 44px; font-size: 15px;">${esc(name.slice(0, 2).toUpperCase())}</div>
      <div class="user-meta">
        <b style="font-size: 17px;">${esc(name)} <span class="pill ${plan}" style="margin-left: 6px; vertical-align: 2px;">${PLAN[plan]}</span></b>
        <span>${d.discord ? `@${esc(d.discord.user || "")} · ID ${esc(d.discord.id)}` : "Bez konta Discord"} · instalacja ${esc(String(d.install_id).slice(0, 8))}</span>
      </div>
    </div>

    <div class="ud-grid">
      ${box("Pierwsze uruchomienie", dt(d.first_seen))}
      ${box("Ostatnio", dt(d.last_seen))}
      ${box("Uruchomień", fmt(d.launches))}
      ${box("Aktywnych dni", fmt(d.active_days))}
      ${box("Wersja", esc(d.app_version || "–"))}
      ${box("Windows (build)", esc(d.os_build || "–"))}
    </div>

    <h3>Aktywność — ostatnie 30 dni</h3>
    <div class="ud-chart">${(d.daily || []).map((x) => `<div title="${x.day}: ${x.n}" style="height: ${Math.round((x.n / max) * 100)}%"></div>`).join("")}</div>

    <div class="ud-cols">
      <div>
        <h3>Sprzęt</h3>
        <div class="ud-list">
          ${hw ? `
          <div class="ud-line"><span>Procesor</span><b>${esc(hw.cpu || "–")}</b></div>
          <div class="ud-line"><span>Karta graficzna</span><b>${esc(hw.gpu || "–")}</b></div>
          <div class="ud-line"><span>RAM</span><b>${esc(hw.ram || "–")}</b></div>
          <div class="ud-line"><span>Monitor</span><b>${esc((hw.screen || "–").replace("x", "×").replace("@", " · ") + (hw.screen ? " Hz" : ""))}</b></div>
          <div class="ud-line"><span>Włączonych tweaków</span><b>${fmt(hw.score ?? 0)}</b></div>` : `<div class="ud-empty">Brak — wysyłane od wersji 1.1.2</div>`}
        </div>
      </div>
      <div>
        <h3>Ustawienia aplikacji</h3>
        <div class="ud-list">
          ${app ? `
          <div class="ud-line"><span>Język</span><b>${app.lang === "pl" ? "polski" : "angielski"}</b></div>
          <div class="ud-line"><span>Zamykanie do traya</span><b>${yesNo(app.tray)}</b></div>
          <div class="ud-line"><span>Smart Game Boost</span><b>${yesNo(app.gameBoost)}</b></div>
          <div class="ud-line"><span>Auto-czyszczenie RAM</span><b>${app.autoRam ? `tak (poniżej ${fmt(app.autoRam)} MB)` : "nie"}</b></div>
          <div class="ud-line"><span>Overlay pokazuje</span><b>${esc(app.overlay || "nic")}</b></div>
          <div class="ud-line"><span>Gier z własną rozdzielczością</span><b>${fmt(app.gameRes ?? 0)}</b></div>` : `<div class="ud-empty">Brak — wysyłane od wersji 1.1.2</div>`}
        </div>
      </div>
    </div>

    <h3>Wyniki narzędzi</h3>
    <div class="ud-list">
      <div class="ud-line"><span>Skaner „Czemu mi laguje?”</span><b>${tools.scan ? `${scanIssues(tools.scan.issues)} · ${dt(tools.scan.at)}` : "nie używał"}</b></div>
      <div class="ud-line"><span>Test bufferbloat</span><b>${tools.bufferbloat ? `ocena ${esc(tools.bufferbloat.grade || "?")} · ${fmt(tools.bufferbloat.mbps)} Mb/s · ${dt(tools.bufferbloat.at)}` : "nie używał"}</b></div>
      <div class="ud-line"><span>Najlepszy ping do serwerów</span><b>${tools.ping?.best ? `${esc(REGION[tools.ping.best] || tools.ping.best)} · ${fmt(tools.ping.ms)} ms` : "nie używał"}</b></div>
      <div class="ud-line"><span>Raport przed i po</span><b>${tools.bench ? `lepiej w ${fmt(tools.bench.better)} wskaźnikach · ${dt(tools.bench.at)}` : "nie używał"}</b></div>
      <div class="ud-line"><span>Rozciągnięta rozdzielczość</span><b>${tools.res?.res ? `${esc(tools.res.res.replace("x", "×"))}${tools.res.auto ? " (pod grę)" : ""} · ${dt(tools.res.at)}` : "nie używał"}</b></div>
      <div class="ud-line"><span>Zmian w autostarcie / czyszczeń RAM</span><b>${fmt(tools.startup ?? 0)} / ${fmt(tools.ram ?? 0)}</b></div>
    </div>

    <div class="ud-cols">
      <div>
        <h3>Premium</h3>
        ${d.can_grant ? `
        <div class="ud-grant">
          <input type="number" id="ud-days" min="1" max="3650" value="30" title="Puste = na zawsze" />
          <span>dni (puste = na zawsze)</span>
          <button class="btn-primary" data-grant>Daj Premium</button>
          <button class="btn-side" data-revoke>Zabierz Premium od admina</button>
        </div>
        <div class="admin-msg" id="ud-grant-msg"></div>` : `<div class="ud-empty">Dać Premium można dopiero, gdy użytkownik zaloguje się przez Discord w aplikacji.</div>`}
        <div class="ud-list">
          <div class="ud-line"><span>Premium teraz (ostatni status z aplikacji)</span><b>${d.plan?.owner ? "Owner" : d.plan?.premium ? "Tak" : "Nie"}</b></div>
          <div class="ud-line"><span>Premium (kody / próbne / polecenia) do</span><b>${until && new Date(until) > new Date() ? dt(until) : "brak"}</b></div>
          <div class="ud-line"><span>3 dni próbne</span><b>${d.trial ? dt(d.trial.started_at) : "nie użył"}</b></div>
          ${(d.codes || []).map((c) => `<div class="ud-line"><span>Kod <code>${esc(c.code)}</code>${c.note ? ` · ${esc(c.note)}` : ""}</span><b>${c.days ? `${c.days} dni` : "na zawsze"} · ${dt(c.created_at)}</b></div>`).join("")}
        </div>
        <h3>Polecenia</h3>
        <div class="ud-list">
          <div class="ud-line"><span>Jego kod</span><b>${d.referral?.code ? `<code>${esc(d.referral.code)}</code>` : "–"}</b></div>
          <div class="ud-line"><span>Polecił osób</span><b>${fmt(d.referral?.referrals ?? 0)}</b></div>
          <div class="ud-line"><span>Polecony przez</span><b>${d.referral?.referred_by ? `${esc(d.referral.referred_by.name || "?")} (<code>${esc(d.referral.referred_by.code)}</code>)` : "–"}</b></div>
        </div>
      </div>
      <div>
        <h3>Najczęściej włączane tweaki</h3>
        <div class="ud-list">${list((d.top_tweaks || []).map((t) => `<div class="ud-line"><span>${esc(tweakName(t.id))}</span><b>${fmt(t.n)}×</b></div>`), "Brak")}</div>
        <h3>Gry uruchamiane z LagKill</h3>
        <div class="ud-list">${list((d.games || []).map((g) => `<div class="ud-line"><span>${esc(g.name)}</span><b>${fmt(g.n)}× · ${dt(g.last)}</b></div>`), "Brak")}</div>
      </div>
    </div>

    <h3>Ostatnie akcje</h3>
    <div class="ud-list">${list((d.recent || []).map((e) => `<div class="ud-line"><span>${esc(EVENT_LABEL[e.event] || e.event)}${eventDetail(e) ? ` <i>${esc(eventDetail(e))}</i>` : ""}</span><b>${dt(e.created_at)}</b></div>`), "Brak")}</div>
  `;
}

async function openUser(install) {
  $("user-modal").classList.remove("hidden");
  $("user-modal-body").innerHTML = `<div class="ud-empty">Wczytywanie…</div>`;
  try {
    const d = await premRpc("lagkill_admin_user", { install });
    userModal(d);
  } catch (err) {
    $("user-modal-body").innerHTML = `<div class="ud-empty">${esc(err.message === "not_found" ? "Brak danych o tym użytkowniku" : err.message)}</div>`;
  }
}

$("users").addEventListener("click", (e) => {
  const row = e.target.closest("[data-install]");
  if (row) openUser(row.dataset.install);
});
$("user-modal").addEventListener("click", async (e) => {
  if (e.target.id === "user-modal" || e.target.closest("[data-close]")) return $("user-modal").classList.add("hidden");
  const grant = e.target.closest("[data-grant]");
  const revoke = e.target.closest("[data-revoke]");
  if (!(grant || revoke) || !currentUser) return;
  const msg = $("ud-grant-msg");
  const daysTxt = $("ud-days").value.trim();
  const days = daysTxt ? Number(daysTxt) : null;
  if (grant && !confirm(`Dać Premium ${days ? `na ${days} dni` : "na zawsze"}?`)) return;
  if (revoke && !confirm("Zabrać Premium dane z panelu? Kupione kody i rola na Discordzie zostają.")) return;
  try {
    const r = grant
      ? await premRpc("lagkill_admin_grant_premium", { install: currentUser, days })
      : await premRpc("lagkill_admin_revoke_premium", { install: currentUser });
    await openUser(currentUser);
    const m = $("ud-grant-msg");
    if (m) m.textContent = grant
      ? `Dano Premium — aktywne do ${dt(r.premium_until)}. Użytkownik zobaczy je w ciągu 30 minut.`
      : `Zabrano ${fmt(r.removed)} ${r.removed === 1 ? "przydział" : "przydziałów"} Premium od admina.`;
  } catch (err) {
    msg.className = "admin-msg err";
    msg.textContent = err.message;
  }
});
document.addEventListener("keydown", (e) => e.key === "Escape" && $("user-modal").classList.add("hidden"));

/* ───────── admin: reset statystyk ───────── */

$("reset-stats").addEventListener("click", async () => {
  const msg = $("reset-msg");
  msg.className = "admin-msg";
  msg.textContent = "";
  if (!confirm("Wyzerować statystyki? Liczniki zaczną od zera, a stare dane trafią do archiwum.")) return;
  try {
    const res = await premRpc("lagkill_admin_reset_stats", {});
    msg.textContent = `Wyzerowano — ${fmt(res.archived)} zdarzeń przeniesiono do archiwum.`;
    load();
  } catch (err) {
    msg.className = "admin-msg err";
    msg.textContent = err.message;
  }
});

/* ───────── admin: ogłoszenia ───────── */

const ANN_KIND = { promo: "Promocja", info: "Informacja", warn: "Ważne" };

async function loadAnnouncements() {
  const list = $("ann-list");
  try {
    const { items } = await premRpc("lagkill_admin_announcements", {});
    list.innerHTML = items.length
      ? items
          .map(
            (a) => `<div class="glass-row">
              <div class="user-info"><div class="user-meta"><b>${esc(a.title)}</b>
                <span>${ANN_KIND[a.kind] || a.kind} · ${a.live ? "<span style='color: var(--success)'>widoczne</span>" : "wyłączone"} · od ${new Date(a.starts_at).toLocaleString("pl-PL")}${a.ends_at ? ` do ${new Date(a.ends_at).toLocaleString("pl-PL")}` : ""}</span></div></div>
              ${a.live ? `<button class="btn-side" data-ann-off="${a.id}">Wyłącz</button>` : ""}
            </div>`,
          )
          .join("")
      : `<div class="glass-row empty-row">Brak ogłoszeń</div>`;
  } catch (err) {
    list.innerHTML = `<div class="glass-row empty-row">${esc(err.message)}</div>`;
  }
}

$("ann-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("ann-msg");
  msg.className = "admin-msg";
  msg.textContent = "";
  const title = $("ann-title").value.trim();
  const link = $("ann-link").value.trim();
  if (!title) return ((msg.className = "admin-msg err"), (msg.textContent = "Wpisz tytuł."));
  if (link && !/^https:\/\//.test(link)) return ((msg.className = "admin-msg err"), (msg.textContent = "Link musi zaczynać się od https://"));
  const ends = $("ann-ends").value;
  try {
    await premRpc("lagkill_admin_announce", {
      title,
      body: $("ann-body").value.trim() || null,
      link_url: link || null,
      link_label: $("ann-label").value.trim() || null,
      kind: $("ann-kind").value,
      ends_at: ends ? new Date(ends).toISOString() : null,
    });
    msg.textContent = "Opublikowano — użytkownicy zobaczą je w ciągu 30 minut.";
    ["ann-title", "ann-body", "ann-link", "ann-label", "ann-ends"].forEach((id) => ($(id).value = ""));
    loadAnnouncements();
  } catch (err) {
    msg.className = "admin-msg err";
    msg.textContent = err.message;
  }
});

$("ann-list").addEventListener("click", async (e) => {
  const id = e.target.dataset?.annOff;
  if (!id) return;
  try {
    await premRpc("lagkill_admin_announce_off", { id: Number(id) });
    loadAnnouncements();
  } catch (err) {
    alert(err.message);
  }
});

/* ───────── nawigacja ───────── */

function showView(name) {
  document.querySelectorAll(".nav-item").forEach(i => i.classList.toggle("active", i.dataset.view === name));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
  $("view-title").textContent = {
    overview: "Przegląd", users: "Użytkownicy", referrals: "Polecenia", presets: "Zestawy", charts: "Analityka", tweaks: "Tweaki & Apps", admin: "Zarządzanie"
  }[name];
  if (name === "admin") {
    loadAnnouncements();
    loadPremium();
  }
  
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

/* ───────── init ───────── */

$("login-form").addEventListener("submit", e => {
  e.preventDefault();
  password = $("pass").value;
  sessionStorage.setItem("lk-panel-pass", password);
  load().then(() => timer = setInterval(load, 60000));
});

$("refresh").addEventListener("click", load);
$("logout").addEventListener("click", () => { sessionStorage.removeItem("lk-panel-pass"); location.reload(); });

if (password) load().then(() => timer = setInterval(load, 60000));
