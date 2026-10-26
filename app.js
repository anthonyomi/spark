(() => {
  const CFG = window.SPARK_CONFIG || {};
  const WINDOW_H = CFG.windowHours || 72;
  const WINDOW_MS = WINDOW_H * 3600e3;
  const HOUR = 3600e3;
  const DAY = 24 * HOUR;
  const RING_C = 2 * Math.PI * 88;

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const T = (e) => new Date(e.occurred_at).getTime();
  const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

  const state = {
    partners: [],
    entries: [], // newest first
    me: null,    // partner id of the signed-in person (null in demo mode)
    month: startOfMonth(new Date()),
    selectedDay: dayKey(new Date()),
  };

  // ---------- data stores ----------

  function demoStore() {
    const KEY = "spark-demo-entries";
    const partners = (CFG.demoPartners || ["You", "Partner"]).slice(0, 2)
      .map((name, i) => ({ id: i + 1, name, avatar: (CFG.demoAvatars || [])[i] || null }));
    const listeners = [];
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
    const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} listeners.forEach((f) => f()); };
    return {
      demo: true,
      async user() { return { email: "demo" }; },
      async signIn() {},
      async signOut() {},
      async partners() { return partners; },
      async list() { return read().sort((a, b) => T(b) - T(a)); },
      async add(e) { write([...read(), { ...e, id: Date.now() }]); },
      async remove(id) { write(read().filter((e) => e.id !== id)); },
      onChange(f) { listeners.push(f); },
    };
  }

  function supaStore() {
    const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
    const check = ({ data, error }) => { if (error) throw error; return data; };
    return {
      demo: false,
      async user() { return (await sb.auth.getSession()).data.session?.user || null; },
      async signIn(email, password) { check(await sb.auth.signInWithPassword({ email, password })); },
      async signOut() { await sb.auth.signOut(); },
      async partners() { return check(await sb.from("partners").select("*").order("id")); },
      async list() {
        return check(await sb.from("entries").select("id,occurred_at,initiator,note").order("occurred_at", { ascending: false }));
      },
      async add(e) { check(await sb.from("entries").insert(e)); },
      async remove(id) { check(await sb.from("entries").delete().eq("id", id)); },
      onChange(f) {
        sb.channel("entries")
          .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, () => f())
          .subscribe();
      },
    };
  }

  const live = CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase;
  const store = live ? supaStore() : demoStore();

  // ---------- helpers ----------

  const partner = (id) => state.partners.find((p) => p.id === id);
  const other = (id) => state.partners.find((p) => p.id !== id);
  const pClass = (id) => "p" + (state.partners.findIndex((p) => p.id === id) + 1);
  const nameOf = (id) => (id === state.me ? "You" : partner(id)?.name || "?");
  function avatar(id, cls = "av") {
    const p = partner(id);
    return p?.avatar
      ? `<img class="${cls}" src="${esc(p.avatar)}" alt="${esc(p.name)}">`
      : `<span class="${cls} av-fallback ${pClass(id)}">${esc((p?.name || "?")[0])}</span>`;
  }

  function fmtDuration(ms) {
    ms = Math.abs(ms);
    const h = Math.floor(ms / HOUR);
    const m = Math.floor((ms % HOUR) / 60e3);
    if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    return `${h}h ${String(m).padStart(2, "0")}m`;
  }
  const fmtWhen = (d) => new Date(d).toLocaleString(undefined,
    { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const fmtTime = (d) => new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  function toLocalInput(d) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 3500);
  }

  // ---------- rendering ----------

  function renderHero() {
    const last = state.entries[0];
    const fill = $("#ring-fill");
    fill.style.strokeDasharray = RING_C;
    const home = $("#home");
    const next = last ? other(last.initiator) : null;
    // the person whose turn it is gets highlighted; the other fades back a little
    state.partners.slice(0, 2).forEach((p, i) => {
      const el = $(i === 0 ? "#av-left" : "#av-right");
      const isNext = next && p.id === next.id;
      el.className = "hero-av" + (next ? (isNext ? " next" : " waiting") : "");
      el.innerHTML = avatar(p.id, "hero-img") +
        `<div class="av-name ${pClass(p.id)}">${esc(p.id === state.me ? "You" : p.name)}</div>` +
        (isNext ? `<div class="av-badge">♥ ${p.id === state.me ? "You're up" : "Next"}</div>` : "");
    });

    if (!last) {
      home.dataset.level = "ok";
      fill.style.strokeDashoffset = 0;
      $("#time-left").textContent = `${WINDOW_H}h`;
      $("#time-sub").textContent = "starts with your first entry";
      $("#turn").textContent = "Whoever goes first starts the clock";
      $("#last").textContent = "";
      return;
    }

    const remaining = T(last) + WINDOW_MS - Date.now();
    const frac = Math.max(0, Math.min(1, remaining / WINDOW_MS));
    fill.style.strokeDashoffset = RING_C * (1 - frac);
    home.dataset.level =
      remaining <= 0 ? "over" : remaining <= 6 * HOUR ? "urgent" : remaining <= 24 * HOUR ? "soon" : "ok";

    $("#time-left").textContent = fmtDuration(remaining);
    $("#time-sub").textContent = remaining > 0 ? "left" : "overdue";

    const cls = pClass(next?.id);
    $("#turn").innerHTML = next?.id === state.me
      ? `It's <b class="${cls}">your</b> turn to make the first move`
      : `It's <b class="${cls}">${esc(next?.name)}</b>'s turn to make the first move`;
    $("#last").textContent = `Last time: ${fmtWhen(last.occurred_at)} · ${nameOf(last.initiator)} initiated`;
  }

  function renderStats() {
    const e = state.entries;
    const now = Date.now();
    let longest = 0, missed = 0;
    for (let i = 0; i < e.length - 1; i++) {
      const gap = T(e[i]) - T(e[i + 1]);
      longest = Math.max(longest, gap);
      if (gap > WINDOW_MS) missed++;
    }
    if (e.length && now - T(e[0]) > WINDOW_MS) missed++;

    // streak = time since the start of the current unbroken chain
    let streakStart = null;
    if (e.length && now - T(e[0]) <= WINDOW_MS) {
      streakStart = T(e[0]);
      for (let i = 0; i < e.length - 1 && T(e[i]) - T(e[i + 1]) <= WINDOW_MS; i++) streakStart = T(e[i + 1]);
    }
    const streakDays = streakStart ? Math.floor((now - streakStart) / DAY) : 0;

    const m = state.month;
    const inMonth = e.filter((x) => {
      const d = new Date(x.occurred_at);
      return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
    }).length;
    const monthName = m.toLocaleString(undefined, { month: "long" });

    const stat = (v, k) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`;
    $("#stats").innerHTML =
      stat(`🔥 ${streakDays}`, `day streak`) +
      stat(inMonth, `times in ${esc(monthName)}`) +
      stat(e.length > 1 ? fmtDuration(longest) : "—", "longest gap") +
      stat(missed, "missed deadlines");

    const counts = state.partners.map((p) => e.filter((x) => x.initiator === p.id).length);
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    $("#split").innerHTML = `
      <h2>Who's been initiating</h2>
      <div class="bar">${state.partners.map((p, i) =>
        `<span style="width:${(counts[i] / total) * 100}%;background:var(--p${i + 1})"></span>`).join("")}</div>
      <div class="names">${state.partners.map((p, i) =>
        `<span class="who">${avatar(p.id, "av av-sm")} ${esc(p.name)} · <b>${counts[i]}</b></span>`).join("")}</div>`;
  }

  function renderCalendar() {
    const m = state.month;
    const y = m.getFullYear(), mo = m.getMonth();
    $("#month-label").textContent = m.toLocaleString(undefined, { month: "long", year: "numeric" });

    const byDay = {};
    for (const e of state.entries) (byDay[dayKey(new Date(e.occurred_at))] ||= []).push(e);

    const todayKey = dayKey(new Date());
    const deadlineKey = state.entries[0] ? dayKey(new Date(T(state.entries[0]) + WINDOW_MS)) : null;
    const offset = (m.getDay() + 6) % 7; // Monday first
    const daysIn = new Date(y, mo + 1, 0).getDate();
    const now = Date.now();

    let html = '<div class="day blank"></div>'.repeat(offset);
    for (let d = 1; d <= daysIn; d++) {
      const date = new Date(y, mo, d);
      const key = dayKey(date);
      const list = (byDay[key] || []).slice().reverse();
      const cls = ["day",
        key === todayKey && "today",
        key === state.selectedDay && "selected",
        date.getTime() > now && "future",
        key === deadlineKey && "deadline"].filter(Boolean).join(" ");
      const latest = list[list.length - 1];
      html += latest
        ? `<button class="${cls} stamped ${pClass(latest.initiator)}" data-day="${key}">
            ${avatar(latest.initiator, "stamp")}<span class="num">${d}</span>
            ${list.length > 1 ? `<span class="count">×${list.length}</span>` : ""}</button>`
        : `<button class="${cls}" data-day="${key}">${d}</button>`;
    }
    $("#cal").innerHTML = html;

    $("#legend").innerHTML =
      state.partners.map((p) => `<span>${avatar(p.id, "av av-xs")}${esc(p.name)} initiated</span>`).join("") +
      (deadlineKey ? `<span><span class="dl"></span>Deadline</span>` : "");

    renderDayDetail(byDay);
  }

  function renderDayDetail(byDay) {
    const key = state.selectedDay;
    const box = $("#day-detail");
    if (!key) { box.innerHTML = ""; return; }
    const [y, mo, d] = key.split("-").map(Number);
    const date = new Date(y, mo - 1, d);
    const list = (byDay[key] || []).slice().reverse();
    const label = date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    box.innerHTML = `<h3>${esc(label)}</h3>` + (list.length
      ? list.map((e) => `
        <div class="entry">
          ${avatar(e.initiator, "av av-md")}
          <div class="meta">
            <div>${esc(fmtTime(e.occurred_at))} · ${esc(nameOf(e.initiator))} initiated</div>
            ${e.note ? `<div class="note">${esc(e.note)}</div>` : ""}
          </div>
          <button class="ghost" data-del="${e.id}">Delete</button>
        </div>`).join("")
      : `<div class="muted small">Nothing logged.</div>`);
  }

  function render() {
    renderHero();
    renderStats();
    renderCalendar();
  }

  async function refresh() {
    try {
      state.entries = await store.list();
      render();
    } catch (err) {
      toast("Couldn't load: " + err.message);
    }
  }

  // ---------- log dialog ----------

  function openLog(when) {
    const last = state.entries[0];
    const defaultWho = last ? other(last.initiator)?.id : state.me ?? state.partners[0].id;
    $("#f-when").value = toLocalInput(when || new Date());
    $("#f-when").max = toLocalInput(new Date(Date.now() + 5 * 60e3));
    $("#f-note").value = "";
    $("#f-error").textContent = "";
    $("#f-who").innerHTML = state.partners.map((p) => `
      <label class="${pClass(p.id)}"><input type="radio" name="who" value="${p.id}" ${p.id === defaultWho ? "checked" : ""}>
        ${esc(p.id === state.me ? `${p.name} (me)` : p.name)}</label>`).join("");
    $("#log-dialog").showModal();
  }

  $("#log-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const when = new Date($("#f-when").value);
    const who = Number(document.querySelector('input[name="who"]:checked')?.value);
    if (isNaN(when)) return ($("#f-error").textContent = "Pick a date and time.");
    if (when.getTime() > Date.now() + 5 * 60e3) return ($("#f-error").textContent = "That's in the future 😉");
    if (!who) return ($("#f-error").textContent = "Who initiated?");
    const btn = ev.submitter;
    btn.disabled = true;
    try {
      await store.add({ occurred_at: when.toISOString(), initiator: who, note: $("#f-note").value.trim() || null });
      $("#log-dialog").close();
      state.month = startOfMonth(when);
      state.selectedDay = dayKey(when);
      await refresh();
      const next = other(who);
      toast(`Logged ❤️ Next up: ${next.id === state.me ? "you" : next.name}`);
    } catch (err) {
      $("#f-error").textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
  $("#f-cancel").addEventListener("click", () => $("#log-dialog").close());
  $("#log-btn").addEventListener("click", () => openLog());

  // ---------- calendar interactions ----------

  $("#prev").addEventListener("click", () => {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1);
    renderStats(); renderCalendar();
  });
  $("#next").addEventListener("click", () => {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1);
    renderStats(); renderCalendar();
  });
  $("#cal").addEventListener("click", (ev) => {
    const btn = ev.target.closest(".day[data-day]");
    if (!btn) return;
    state.selectedDay = btn.dataset.day;
    renderCalendar();
  });
  $("#day-detail").addEventListener("click", async (ev) => {
    const id = ev.target.closest("[data-del]")?.dataset.del;
    if (!id || !confirm("Delete this entry?")) return;
    try {
      await store.remove(isNaN(id) ? id : Number(id));
      await refresh();
    } catch (err) {
      toast("Couldn't delete: " + err.message);
    }
  });

  // ---------- auth & boot ----------

  $("#login-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    $("#l-error").textContent = "";
    try {
      await store.signIn($("#l-email").value.trim(), $("#l-pass").value);
      await enter(await store.user());
    } catch (err) {
      $("#l-error").textContent = err.message;
    }
  });
  $("#signout").addEventListener("click", async () => {
    await store.signOut();
    location.reload();
  });

  async function enter(user) {
    try {
      state.partners = await store.partners();
    } catch (err) {
      return toast("Couldn't load: " + err.message);
    }
    if (state.partners.length < 2) {
      $("#login").hidden = false;
      $("#l-error").textContent = "This account isn't linked to Spark yet — check the partners table.";
      await store.signOut();
      return;
    }
    state.me = store.demo ? null
      : state.partners.find((p) => p.email?.toLowerCase() === user.email?.toLowerCase())?.id ?? null;

    $("#login").hidden = true;
    $("#home").hidden = false;
    $("#demo-banner").hidden = !store.demo;
    $("#signout").hidden = store.demo;

    await refresh();
    store.onChange(refresh);
    setInterval(renderHero, 30e3);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  }

  (async () => {
    const user = await store.user();
    if (user) enter(user);
    else $("#login").hidden = false;
  })();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
