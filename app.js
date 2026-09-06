// Formly — app.js
const { createClient } = supabase;
const sb = createClient(window.FORMLY_CONFIG.SUPABASE_URL, window.FORMLY_CONFIG.SUPABASE_ANON_KEY);

const QUESTION_TYPES = [
  { value: "short_text", label: "Short answer" },
  { value: "long_text", label: "Paragraph" },
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "checkboxes", label: "Checkboxes" },
  { value: "dropdown", label: "Dropdown" },
  { value: "email", label: "Email" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
];

let currentUser = null;
let responsesChannel = null;
const root = document.getElementById("app-root");

// ---------------------------------------------------------------- utils
const uid = () => "q_" + Math.random().toString(36).slice(2, 10);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};
function toast(title, body, kind = "info", onClick) {
  const rootEl = document.getElementById("toast-root");
  const el = document.createElement("div");
  el.className = "toast" + (kind === "notify" ? " notify" : "");
  el.innerHTML = `<strong>${esc(title)}</strong><span>${esc(body)}</span>`;
  if (onClick) el.addEventListener("click", onClick);
  rootEl.appendChild(el);
  setTimeout(() => el.remove(), 5500);
}
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// ---------------------------------------------------------------- router
window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", init);

async function init() {
  const { data } = await sb.auth.getSession();
  currentUser = data.session?.user || null;
  sb.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    renderTopbar();
  });
  renderTopbar();
  await route();
}

function renderTopbar() {
  const bar = document.getElementById("topbar-actions");
  if (currentUser) {
    bar.innerHTML = `
      <span class="user-chip">${esc(currentUser.email)}</span>
      <button class="btn ghost" id="signout-btn">Sign out</button>`;
    document.getElementById("signout-btn").onclick = async () => {
      await sb.auth.signOut();
      teardownRealtime();
      location.hash = "#/";
    };
  } else {
    bar.innerHTML = `<button class="btn secondary" id="login-nav-btn">Log in</button>`;
    document.getElementById("login-nav-btn").onclick = () => (location.hash = "#/login");
  }
}

async function route() {
  const hash = location.hash || "#/";
  const parts = hash.replace(/^#\//, "").split("/").filter(Boolean);

  // Public fill page needs no auth check at all
  if (parts[0] === "form" && parts[1]) {
    return renderFillPage(parts[1]);
  }

  if (parts[0] === "login") return renderAuth("login");
  if (parts[0] === "signup") return renderAuth("signup");

  // everything else requires a session
  if (!currentUser) {
    const { data } = await sb.auth.getSession();
    currentUser = data.session?.user || null;
  }

  if (!currentUser) {
    if (parts.length === 0) return renderLanding();
    location.hash = "#/login";
    return;
  }

  if (parts[0] === "builder") return renderBuilder(parts[1]);
  if (parts[0] === "responses" && parts[1]) return renderResponses(parts[1]);
  return renderDashboard();
}

// ---------------------------------------------------------------- landing
function renderLanding() {
  root.innerHTML = `
    <section class="hero">
      <div>
        <h1>Ask anything.<br/>
          <span class="squiggle-wrap">Skip the busywork
            <svg viewBox="0 0 300 14" preserveAspectRatio="none"><path d="M2 8 Q 20 2, 40 8 T 80 8 T 120 8 T 160 8 T 200 8 T 240 8 T 280 8" fill="none" stroke="#F4C94B" stroke-width="6" stroke-linecap="round"/></svg>
          </span>.
        </h1>
        <p class="lede">Formly is a small, fast way to build a form, send the link, and know the moment someone answers. No spreadsheets to babysit.</p>
        <div class="hero-actions">
          <button class="btn" id="cta-signup">Start building — it's free</button>
          <button class="btn secondary" id="cta-login">I have an account</button>
        </div>
      </div>
      <div class="hero-card">
        <div class="q"><div class="label">What should we call you?</div><div class="fake-input"></div></div>
        <div class="q">
          <div class="label">Pick a time that works</div>
          <div class="fake-choice"><span class="fake-radio"></span> Tuesday morning</div>
          <div class="fake-choice"><span class="fake-radio"></span> Thursday afternoon</div>
        </div>
      </div>
    </section>
    <section class="feature-row">
      <div class="feature"><h3>Build in minutes</h3><p>Drag questions into place and watch the preview update as you type.</p></div>
      <div class="feature"><h3>Share one link</h3><p>Publish and send the link anywhere — no account needed to answer.</p></div>
      <div class="feature"><h3>Hear it land</h3><p>Keep the dashboard open and get a live nudge the second a reply comes in.</p></div>
    </section>
  `;
  document.getElementById("cta-signup").onclick = () => (location.hash = "#/signup");
  document.getElementById("cta-login").onclick = () => (location.hash = "#/login");
}

// ---------------------------------------------------------------- auth
function renderAuth(mode) {
  const isLogin = mode === "login";
  root.innerHTML = `
    <div class="auth-shell">
      <h2>${isLogin ? "Welcome back" : "Create your account"}</h2>
      <p class="sub">${isLogin ? "Log in to see your forms." : "Takes about ten seconds."}</p>
      <div id="auth-msg"></div>
      <form id="auth-form">
        <div class="field"><label for="email">Email</label><input type="email" id="email" required autocomplete="email"/></div>
        <div class="field"><label for="password">Password</label><input type="password" id="password" required minlength="6" autocomplete="${isLogin ? "current-password" : "new-password"}"/></div>
        <button class="btn block" type="submit">${isLogin ? "Log in" : "Sign up"}</button>
      </form>
      <div class="auth-toggle">
        ${isLogin ? `New here? <button id="switch">Create an account</button>` : `Already have one? <button id="switch">Log in</button>`}
      </div>
    </div>
  `;
  document.getElementById("switch").onclick = () => (location.hash = isLogin ? "#/signup" : "#/login");
  document.getElementById("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const msg = document.getElementById("auth-msg");
    msg.innerHTML = "";
    const { data, error } = isLogin
      ? await sb.auth.signInWithPassword({ email, password })
      : await sb.auth.signUp({ email, password });
    if (error) {
      msg.innerHTML = `<div class="auth-error">${esc(error.message)}</div>`;
      return;
    }
    if (!isLogin && !data.session) {
      msg.innerHTML = `<div class="auth-notice">Check your inbox to confirm your email, then log in.</div>`;
      return;
    }
    currentUser = data.session?.user || data.user;
    renderTopbar();
    location.hash = "#/";
  });
}

// ---------------------------------------------------------------- dashboard
async function renderDashboard() {
  root.innerHTML = `
    <div class="container">
      <div class="dash-head">
        <div><h1>Your forms</h1><p>Everything you've built, all in one place.</p></div>
      </div>
      <div id="dash-body" class="loading-line">Loading your forms…</div>
    </div>`;
  setupRealtime();

  const { data: forms, error } = await sb
    .from("forms")
    .select("id, title, is_published, created_at, responses(count)")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  const body = document.getElementById("dash-body");
  if (error) {
    body.innerHTML = `<div class="empty-state"><h3>Couldn't load your forms</h3><p>${esc(error.message)}</p></div>`;
    return;
  }

  const cards = (forms || [])
    .map((f) => {
      const count = f.responses?.[0]?.count ?? 0;
      return `
      <div class="form-card" data-id="${f.id}">
        <div class="meta">
          <span class="status-pill ${f.is_published ? "live" : "draft"}">${f.is_published ? "Live" : "Draft"}</span>
          <span>${fmtDate(f.created_at)}</span>
        </div>
        <h3>${esc(f.title || "Untitled form")}</h3>
        <div class="meta"><span class="resp-count">${count}</span> response${count === 1 ? "" : "s"}</div>
      </div>`;
    })
    .join("");

  body.outerHTML = `
    <div id="dash-body" class="form-grid">
      <div class="new-form-card" id="new-form-card">＋ New form</div>
      ${cards}
    </div>`;

  document.getElementById("new-form-card").onclick = createForm;
  document.querySelectorAll(".form-card").forEach((el) => {
    el.onclick = () => (location.hash = `#/builder/${el.dataset.id}`);
  });

  if ((forms || []).length === 0) {
    const grid = document.getElementById("dash-body");
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.style.gridColumn = "1 / -1";
    empty.innerHTML = `<h3>No forms yet</h3><p>Click "New form" to build your first one.</p>`;
    grid.appendChild(empty);
  }
}

async function createForm() {
  const { data, error } = await sb
    .from("forms")
    .insert({ user_id: currentUser.id, title: "Untitled form", questions: [] })
    .select()
    .single();
  if (error) return toast("Couldn't create form", error.message);
  location.hash = `#/builder/${data.id}`;
}

// ---------------------------------------------------------------- realtime notifications
function setupRealtime() {
  if (responsesChannel) return;
  responsesChannel = sb
    .channel("responses-watch")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "responses" }, async (payload) => {
      const formId = payload.new.form_id;
      const { data: f } = await sb.from("forms").select("title").eq("id", formId).single();
      const title = f?.title || "Your form";
      toast("New response", `Someone just filled in "${title}"`, "notify", () => {
        location.hash = `#/responses/${formId}`;
      });
      if (Notification?.permission === "granted") {
        new Notification("New Formly response", { body: `Someone just filled in "${title}"` });
      }
      if (location.hash === "#/" || location.hash === "") renderDashboard();
    })
    .subscribe();

  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission();
  }
}
function teardownRealtime() {
  if (responsesChannel) {
    sb.removeChannel(responsesChannel);
    responsesChannel = null;
  }
}

// ---------------------------------------------------------------- builder
let builderState = null; // { id, title, description, questions, is_published }
let saveTimer = null;

async function renderBuilder(formId) {
  setupRealtime();
  root.innerHTML = `<div class="loading-line">Loading builder…</div>`;
  const { data: form, error } = await sb.from("forms").select("*").eq("id", formId).single();
  if (error || !form) {
    root.innerHTML = `<div class="container"><div class="empty-state"><h3>Form not found</h3><p><a href="#/">Back to your forms</a></p></div></div>`;
    return;
  }
  builderState = { ...form, questions: form.questions?.length ? form.questions : [] };

  root.innerHTML = `
    <div class="builder-bar">
      <input class="builder-title-input" id="b-title" value="${esc(builderState.title)}" placeholder="Untitled form"/>
      <div class="builder-bar-actions">
        <span id="save-indicator" style="font-size:0.82rem;color:var(--ink-soft);">Saved</span>
        <button class="btn ghost" id="b-responses">Responses</button>
        <button class="btn secondary" id="b-share">Share</button>
        <button class="btn" id="b-publish">${builderState.is_published ? "Unpublish" : "Publish"}</button>
      </div>
    </div>
    <div class="builder-layout">
      <div class="builder-pane editor">
        <div class="field form-desc-field">
          <label for="b-desc">Description (optional)</label>
          <textarea id="b-desc" placeholder="Tell people what this form is for">${esc(builderState.description || "")}</textarea>
        </div>
        <div id="question-list"></div>
        <div class="add-question-bar">
          <button class="btn secondary small" data-add="short_text">＋ Short answer</button>
          <button class="btn secondary small" data-add="multiple_choice">＋ Multiple choice</button>
          <button class="btn secondary small" data-add="checkboxes">＋ Checkboxes</button>
          <button class="btn secondary small" data-add="long_text">＋ Paragraph</button>
        </div>
      </div>
      <div class="builder-pane preview"><div id="preview-mount"></div></div>
    </div>
  `;

  document.getElementById("b-title").addEventListener("input", (e) => {
    builderState.title = e.target.value;
    queueSave();
    renderPreview();
  });
  document.getElementById("b-desc").addEventListener("input", (e) => {
    builderState.description = e.target.value;
    queueSave();
    renderPreview();
  });
  document.getElementById("b-responses").onclick = () => (location.hash = `#/responses/${formId}`);
  document.getElementById("b-share").onclick = () => openShareModal(formId, builderState.is_published);
  document.getElementById("b-publish").onclick = async () => {
    builderState.is_published = !builderState.is_published;
    await saveForm(true);
    renderBuilder(formId);
    if (builderState.is_published) openShareModal(formId, true);
  };
  document.querySelectorAll("[data-add]").forEach((btn) => {
    btn.onclick = () => addQuestion(btn.dataset.add);
  });

  renderQuestionList();
  renderPreview();
}

function queueSave() {
  const ind = document.getElementById("save-indicator");
  if (ind) ind.textContent = "Saving…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveForm(false), 700);
}

async function saveForm(immediate) {
  const ind = document.getElementById("save-indicator");
  const { error } = await sb
    .from("forms")
    .update({
      title: builderState.title,
      description: builderState.description,
      questions: builderState.questions,
      is_published: builderState.is_published,
    })
    .eq("id", builderState.id);
  if (ind) ind.textContent = error ? "Couldn't save" : "Saved";
  if (error) toast("Couldn't save", error.message);
}

function addQuestion(type) {
  const q = { id: uid(), type, title: "", required: false };
  if (["multiple_choice", "checkboxes", "dropdown"].includes(type)) q.options = ["Option 1"];
  builderState.questions.push(q);
  renderQuestionList();
  renderPreview();
  queueSave();
}

function renderQuestionList() {
  const list = document.getElementById("question-list");
  if (builderState.questions.length === 0) {
    list.innerHTML = `<div class="empty-state" style="padding:40px 0;"><p>Add your first question below.</p></div>`;
    return;
  }
  list.innerHTML = builderState.questions
    .map(
      (q, i) => `
    <div class="question-card" draggable="true" data-idx="${i}">
      <div class="q-top-row">
        <span class="q-drag" title="Drag to reorder">⠿</span>
        <input class="q-title-input" data-field="title" data-idx="${i}" placeholder="Question ${i + 1}" value="${esc(q.title)}"/>
        <select class="q-type-select" data-field="type" data-idx="${i}">
          ${QUESTION_TYPES.map((t) => `<option value="${t.value}" ${t.value === q.type ? "selected" : ""}>${t.label}</option>`).join("")}
        </select>
        <button class="icon-btn" data-delete="${i}" title="Delete question">✕</button>
      </div>
      ${renderOptionsEditor(q, i)}
      <div class="q-bottom-row">
        <label class="q-required-toggle"><input type="checkbox" data-field="required" data-idx="${i}" ${q.required ? "checked" : ""}/> Required</label>
      </div>
    </div>`
    )
    .join("");

  list.querySelectorAll("[data-field]").forEach((el) => {
    el.addEventListener("input", onQuestionFieldChange);
    if (el.tagName === "SELECT" || el.type === "checkbox") el.addEventListener("change", onQuestionFieldChange);
  });
  list.querySelectorAll("[data-delete]").forEach((el) => {
    el.addEventListener("click", () => {
      builderState.questions.splice(Number(el.dataset.delete), 1);
      renderQuestionList();
      renderPreview();
      queueSave();
    });
  });
  list.querySelectorAll("[data-add-option]").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = Number(el.dataset.addOption);
      builderState.questions[idx].options.push(`Option ${builderState.questions[idx].options.length + 1}`);
      renderQuestionList();
      renderPreview();
      queueSave();
    });
  });
  list.querySelectorAll("[data-opt-input]").forEach((el) => {
    el.addEventListener("input", (e) => {
      const [qIdx, oIdx] = el.dataset.optInput.split(":").map(Number);
      builderState.questions[qIdx].options[oIdx] = e.target.value;
      renderPreview();
      queueSave();
    });
  });
  list.querySelectorAll("[data-opt-delete]").forEach((el) => {
    el.addEventListener("click", () => {
      const [qIdx, oIdx] = el.dataset.optDelete.split(":").map(Number);
      builderState.questions[qIdx].options.splice(oIdx, 1);
      renderQuestionList();
      renderPreview();
      queueSave();
    });
  });

  setupDragReorder(list);
}

function renderOptionsEditor(q, i) {
  if (!["multiple_choice", "checkboxes", "dropdown"].includes(q.type)) return "";
  const marker = q.type === "checkboxes" ? "square" : "round";
  return `
    <div class="q-options">
      ${q.options
        .map(
          (opt, oi) => `
        <div class="q-option-row">
          <span class="q-option-marker ${marker}"></span>
          <input type="text" data-opt-input="${i}:${oi}" value="${esc(opt)}"/>
          <button class="icon-btn" data-opt-delete="${i}:${oi}" title="Remove option">✕</button>
        </div>`
        )
        .join("")}
      <button class="add-option-btn" data-add-option="${i}">＋ Add option</button>
    </div>`;
}

function onQuestionFieldChange(e) {
  const idx = Number(e.target.dataset.idx);
  const field = e.target.dataset.field;
  const q = builderState.questions[idx];
  if (field === "required") q.required = e.target.checked;
  else q[field] = e.target.value;
  if (field === "type" && ["multiple_choice", "checkboxes", "dropdown"].includes(e.target.value) && !q.options) {
    q.options = ["Option 1"];
    renderQuestionList();
  }
  renderPreview();
  queueSave();
}

function setupDragReorder(list) {
  let dragIdx = null;
  list.querySelectorAll(".question-card").forEach((card) => {
    card.addEventListener("dragstart", () => {
      dragIdx = Number(card.dataset.idx);
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("dragover", (e) => e.preventDefault());
    card.addEventListener("drop", () => {
      const dropIdx = Number(card.dataset.idx);
      if (dragIdx === null || dragIdx === dropIdx) return;
      const [moved] = builderState.questions.splice(dragIdx, 1);
      builderState.questions.splice(dropIdx, 0, moved);
      renderQuestionList();
      renderPreview();
      queueSave();
    });
  });
}

function renderPreview() {
  const mount = document.getElementById("preview-mount");
  if (!mount) return;
  mount.innerHTML = `
    <div class="preview-frame">
      <h2>${esc(builderState.title || "Untitled form")}</h2>
      ${builderState.description ? `<p class="pf-desc">${esc(builderState.description)}</p>` : ""}
      ${builderState.questions.map(renderPreviewQuestion).join("") || `<p class="pf-desc">Your questions will show up here.</p>`}
    </div>`;
}

function renderPreviewQuestion(q) {
  const label = `<label class="pf-label">${esc(q.title || "Untitled question")}${q.required ? '<span class="req-star">*</span>' : ""}</label>`;
  let field = "";
  switch (q.type) {
    case "long_text":
      field = `<textarea disabled rows="3"></textarea>`;
      break;
    case "email":
      field = `<input type="email" disabled placeholder="name@example.com"/>`;
      break;
    case "number":
      field = `<input type="number" disabled/>`;
      break;
    case "date":
      field = `<input type="date" disabled/>`;
      break;
    case "multiple_choice":
    case "checkboxes":
      field = (q.options || [])
        .map(
          (o) =>
            `<div class="pf-choice-row"><span class="q-option-marker ${q.type === "checkboxes" ? "square" : "round"}"></span>${esc(o)}</div>`
        )
        .join("");
      break;
    case "dropdown":
      field = `<select disabled><option>${(q.options || []).map(esc).join("</option><option>")}</option></select>`;
      break;
    default:
      field = `<input type="text" disabled placeholder="Their answer"/>`;
  }
  return `<div class="pf-question">${label}${field}</div>`;
}

// ---------------------------------------------------------------- share modal
function openShareModal(formId, isPublished) {
  const url = `${location.origin}${location.pathname}#/form/${formId}`;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h3>${isPublished ? "Share your form" : "Publish first"}</h3>
      ${
        isPublished
          ? `<p style="color:var(--ink-soft);margin-bottom:14px;">Anyone with this link can fill it in. No account needed.</p>
             <div class="share-link-row"><input readonly value="${url}" id="share-url"/><button class="btn small" id="copy-link">Copy</button></div>`
          : `<p style="color:var(--ink-soft);">Publish the form first, then this link becomes shareable.</p>`
      }
      <div class="modal-actions"><button class="btn secondary" id="close-modal">Close</button></div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
  backdrop.querySelector("#close-modal").onclick = () => backdrop.remove();
  const copyBtn = backdrop.querySelector("#copy-link");
  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(url);
      copyBtn.textContent = "Copied";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
    };
  }
}

// ---------------------------------------------------------------- fill page (public)
async function renderFillPage(formId) {
  root.innerHTML = `<div class="loading-line">Loading form…</div>`;
  const { data: form, error } = await sb.from("forms").select("*").eq("id", formId).eq("is_published", true).single();
  if (error || !form) {
    root.innerHTML = `<div class="fill-shell"><div class="unavailable"><h2>This form isn't available</h2><p>It may be unpublished or the link is incorrect.</p></div></div>`;
    return;
  }
  root.innerHTML = `
    <div class="fill-shell">
      <div class="fill-card">
        <h1>${esc(form.title || "Untitled form")}</h1>
        ${form.description ? `<p class="fill-desc">${esc(form.description)}</p>` : ""}
        <form id="fill-form">
          ${form.questions.map(renderFillQuestion).join("")}
          <div class="fill-footer"><button class="btn" type="submit">Submit</button></div>
        </form>
      </div>
    </div>`;

  document.getElementById("fill-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const answers = {};
    for (const q of form.questions) {
      if (q.type === "checkboxes") {
        answers[q.id] = Array.from(document.querySelectorAll(`[name="${q.id}"]:checked`)).map((el) => el.value);
      } else {
        const el = document.querySelector(`[name="${q.id}"]`);
        answers[q.id] = el ? el.value : "";
      }
    }
    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";
    const { error: insErr } = await sb.from("responses").insert({ form_id: form.id, answers });
    if (insErr) {
      toast("Couldn't submit", insErr.message);
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit";
      return;
    }
    root.innerHTML = `
      <div class="fill-shell">
        <div class="fill-card thanks">
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none"><circle cx="28" cy="28" r="26" stroke="#6F9A8D" stroke-width="3"/><path d="M17 29l7 7 15-15" stroke="#6F9A8D" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <h2>Got it, thanks.</h2>
          <p style="color:var(--ink-soft);">Your response has been recorded.</p>
        </div>
      </div>`;
  });
}

function renderFillQuestion(q) {
  const req = q.required ? "required" : "";
  const label = `<label class="pf-label">${esc(q.title || "Untitled question")}${q.required ? '<span class="req-star">*</span>' : ""}</label>`;
  let field = "";
  switch (q.type) {
    case "long_text":
      field = `<textarea name="${q.id}" rows="3" ${req}></textarea>`;
      break;
    case "email":
      field = `<input type="email" name="${q.id}" placeholder="name@example.com" ${req}/>`;
      break;
    case "number":
      field = `<input type="number" name="${q.id}" ${req}/>`;
      break;
    case "date":
      field = `<input type="date" name="${q.id}" ${req}/>`;
      break;
    case "multiple_choice":
      field = (q.options || [])
        .map(
          (o, oi) =>
            `<label class="pf-choice-row"><input type="radio" name="${q.id}" value="${esc(o)}" ${oi === 0 ? req : ""}/> ${esc(o)}</label>`
        )
        .join("");
      break;
    case "checkboxes":
      field = (q.options || [])
        .map((o) => `<label class="pf-choice-row"><input type="checkbox" name="${q.id}" value="${esc(o)}"/> ${esc(o)}</label>`)
        .join("");
      break;
    case "dropdown":
      field = `<select name="${q.id}" ${req}><option value="" disabled selected>Choose…</option>${(q.options || [])
        .map((o) => `<option value="${esc(o)}">${esc(o)}</option>`)
        .join("")}</select>`;
      break;
    default:
      field = `<input type="text" name="${q.id}" ${req}/>`;
  }
  return `<div class="pf-question">${label}${field}</div>`;
}

// ---------------------------------------------------------------- responses
async function renderResponses(formId) {
  setupRealtime();
  root.innerHTML = `<div class="loading-line">Loading responses…</div>`;
  const { data: form } = await sb.from("forms").select("*").eq("id", formId).eq("user_id", currentUser?.id).single();
  if (!form) {
    root.innerHTML = `<div class="container"><div class="empty-state"><h3>Form not found</h3></div></div>`;
    return;
  }
  const { data: responses, error } = await sb
    .from("responses")
    .select("*")
    .eq("form_id", formId)
    .order("created_at", { ascending: false });

  root.innerHTML = `
    <div class="container">
      <div class="dash-head">
        <div>
          <p style="margin-bottom:6px;"><a href="#/builder/${formId}" style="color:var(--ink-soft);">← Back to editor</a></p>
          <h1>${esc(form.title)}</h1>
          <p>${(responses || []).length} response${(responses || []).length === 1 ? "" : "s"}</p>
        </div>
      </div>
      <div class="resp-tabs">
        <button class="resp-tab active" data-tab="summary">Summary</button>
        <button class="resp-tab" data-tab="table">Individual responses</button>
      </div>
      <div id="resp-body"></div>
    </div>`;

  const body = document.getElementById("resp-body");
  const tabs = document.querySelectorAll(".resp-tab");
  tabs.forEach((t) => (t.onclick = () => {
    tabs.forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    body.innerHTML = t.dataset.tab === "summary" ? renderSummary(form, responses || []) : renderTable(form, responses || []);
  }));

  if (error) {
    body.innerHTML = `<p>${esc(error.message)}</p>`;
    return;
  }
  body.innerHTML = renderSummary(form, responses || []);
}

function renderSummary(form, responses) {
  if (responses.length === 0) return `<div class="no-responses"><h3 style="color:var(--ink);">No responses yet</h3><p>Share your form's link to start collecting answers.</p></div>`;
  return form.questions
    .map((q) => {
      if (["multiple_choice", "checkboxes", "dropdown"].includes(q.type)) {
        const counts = {};
        (q.options || []).forEach((o) => (counts[o] = 0));
        responses.forEach((r) => {
          const a = r.answers[q.id];
          if (Array.isArray(a)) a.forEach((v) => (counts[v] = (counts[v] || 0) + 1));
          else if (a) counts[a] = (counts[a] || 0) + 1;
        });
        const max = Math.max(1, ...Object.values(counts));
        return `
        <div class="summary-block">
          <h4>${esc(q.title || "Untitled question")}</h4>
          ${Object.entries(counts)
            .map(
              ([label, count]) => `
            <div class="bar-row">
              <span>${esc(label)}</span>
              <div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%"></div></div>
              <span>${count}</span>
            </div>`
            )
            .join("")}
        </div>`;
      }
      const answers = responses.map((r) => r.answers[q.id]).filter((a) => a !== undefined && a !== "");
      return `
        <div class="summary-block">
          <h4>${esc(q.title || "Untitled question")}</h4>
          <p style="font-size:0.85rem;color:var(--ink-soft);margin-bottom:10px;">${answers.length} answer${answers.length === 1 ? "" : "s"}</p>
          ${answers
            .slice(0, 5)
            .map((a) => `<p style="font-size:0.9rem;border-bottom:1px solid var(--line);padding:8px 0;">${esc(a)}</p>`)
            .join("")}
        </div>`;
    })
    .join("");
}

function renderTable(form, responses) {
  if (responses.length === 0) return `<div class="no-responses"><h3 style="color:var(--ink);">No responses yet</h3></div>`;
  return `
    <div class="resp-table-wrap">
      <table class="resp-table">
        <thead><tr><th>Submitted</th>${form.questions.map((q) => `<th>${esc(q.title || "Untitled")}</th>`).join("")}</tr></thead>
        <tbody>
          ${responses
            .map(
              (r) => `
            <tr>
              <td>${fmtDate(r.created_at)}</td>
              ${form.questions
                .map((q) => {
                  const a = r.answers[q.id];
                  return `<td>${esc(Array.isArray(a) ? a.join(", ") : a)}</td>`;
                })
                .join("")}
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}
