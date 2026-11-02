// Set this to the deployed Worker URL before publishing the GitHub Pages site.
const API_BASE = "https://robux-friends-queue-api.duckdose.workers.dev";
const EXPIRY_NOTICE = "Requests expire one month after they are created.";
const accessCard = document.querySelector("#access-card");
const queueContent = document.querySelector("#queue-content");
const boardRows = document.querySelector("#board-rows");
const adminRows = document.querySelector("#admin-rows");
let inviteCode = sessionStorage.getItem("friendsQueueInvite") || "";
let adminToken = sessionStorage.getItem("friendsQueueAdmin") || "";

function message(target, text, kind = "") {
  target.textContent = text;
  target.className = `form-message ${kind}`.trim();
}

function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (inviteCode) headers.set("X-Invite-Code", inviteCode);
  if (adminToken) headers.set("Authorization", `Bearer ${adminToken}`);
  if (options.body) headers.set("Content-Type", "application/json");
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

function prettyDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function showStatus(status) {
  const label = status[0].toUpperCase() + status.slice(1);
  return `<span class="status status-${status}">${label}</span>`;
}

async function loadBoard() {
  boardRows.innerHTML = '<p class="empty-state">Loading requests…</p>';
  try {
    const response = await api("/api/requests");
    if (!response.ok)
      throw new Error(
        response.status === 403
          ? "Invite code is no longer valid. Please enter it again."
          : "Could not load the board. Try refreshing.",
      );
    const requests = await response.json();
    if (!requests.length) {
      boardRows.innerHTML =
        '<p class="empty-state">No requests yet. Be the first to join!</p>';
      return;
    }
    boardRows.replaceChildren(
      ...requests.map((item) => {
        const row = document.createElement("div");
        row.className = "request-row";
        const username = document.createElement("span");
        username.className = "username";
        username.textContent = item.username;
        const date = document.createElement("span");
        date.className = "date";
        date.textContent = prettyDate(item.created_at);
        const status = document.createElement("span");
        status.innerHTML = showStatus(item.status);
        row.append(username, date, status);
        return row;
      }),
    );
    if (adminToken) await loadAdminRows();
  } catch (error) {
    boardRows.innerHTML = "";
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = error.message.includes("Failed to fetch")
      ? "The queue service is not configured yet. Please try again later."
      : error.message;
    boardRows.append(p);
    if (error.message.includes("Invite code")) clearInvite();
  }
}

function clearInvite() {
  inviteCode = "";
  sessionStorage.removeItem("friendsQueueInvite");
  accessCard.hidden = false;
  queueContent.hidden = true;
}

function enterQueue() {
  accessCard.hidden = true;
  queueContent.hidden = false;
  loadBoard();
}

document
  .querySelector("#access-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = document.querySelector("#invite-code").value.trim();
    const target = document.querySelector("#access-message");
    inviteCode = code;
    try {
      const response = await api("/api/requests");
      if (!response.ok)
        throw new Error(
          "That invite code did not work. Please check it and try again.",
        );
      sessionStorage.setItem("friendsQueueInvite", code);
      message(target, "You’re in. The board is ready.", "success");
      enterQueue();
    } catch (error) {
      message(
        target,
        error.message.includes("Failed to fetch")
          ? "Queue service is unavailable. Please try again later."
          : error.message,
        "error",
      );
    }
  });

document
  .querySelector("#request-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.querySelector("#roblox-username");
    const target = document.querySelector("#request-message");
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      const response = await api("/api/requests", {
        method: "POST",
        body: JSON.stringify({ username: input.value.trim() }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not add your request.");
      input.value = "";
      message(target, "Request added to the board!", "success");
      await loadBoard();
    } catch (error) {
      message(target, error.message, "error");
    } finally {
      button.disabled = false;
    }
  });

document.querySelector("#refresh-button").addEventListener("click", loadBoard);
document.querySelector("#admin-toggle").addEventListener("click", () => {
  document.querySelector("#admin-card").hidden =
    !document.querySelector("#admin-card").hidden;
  if (adminToken) loadAdminRows();
});
document.querySelector("#admin-close").addEventListener("click", () => {
  document.querySelector("#admin-card").hidden = true;
});

document
  .querySelector("#admin-login")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const passwordInput = document.querySelector("#admin-password");
    const target = document.querySelector("#admin-message");
    try {
      const response = await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password: passwordInput.value }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Sign in failed.");
      adminToken = result.token;
      sessionStorage.setItem("friendsQueueAdmin", adminToken);
      passwordInput.value = "";
      message(target, "Signed in.", "success");
      await loadAdminRows();
    } catch (error) {
      message(
        target,
        error.message.includes("Failed to fetch")
          ? "Queue service is unavailable."
          : error.message,
        "error",
      );
    }
  });

async function loadAdminRows() {
  const response = await api("/api/admin/requests");
  if (response.status === 401) {
    adminToken = "";
    sessionStorage.removeItem("friendsQueueAdmin");
    document.querySelector("#admin-controls").hidden = true;
    document.querySelector("#admin-login").hidden = false;
    message(document.querySelector("#admin-message"), "Your session expired. Sign in again.", "error");
    return;
  }
  if (!response.ok) {
    message(document.querySelector("#admin-message"), "Could not load admin requests.", "error");
    return;
  }
  const requests = await response.json();
  document.querySelector("#admin-login").hidden = true;
  document.querySelector("#admin-controls").hidden = false;
  adminRows.replaceChildren(
    ...requests.map((item) => {
      const row = document.createElement("div");
      row.className = "admin-row";
      const name = document.createElement("span");
      name.textContent = `${item.username} · ${prettyDate(item.created_at)}`;
      const select = document.createElement("select");
      select.setAttribute("aria-label", `Status for ${item.username}`);
      for (const status of ["pending", "accepted", "rejected", "fulfilled"]) {
        const option = document.createElement("option");
        option.value = status;
        option.textContent = status[0].toUpperCase() + status.slice(1);
        option.selected = status === item.status;
        select.append(option);
      }
      select.addEventListener("change", () =>
        updateRequest(item.id, { status: select.value }),
      );
      const remove = document.createElement("button");
      remove.className = "delete-button";
      remove.type = "button";
      remove.textContent = "Delete";
      remove.addEventListener("click", () =>
        deleteRequest(item.id, item.username),
      );
      row.append(name, select, remove);
      return row;
    }),
  );
}

async function updateRequest(id, changes) {
  const response = await api(`/api/admin/requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
  if (!response.ok)
    message(
      document.querySelector("#admin-message"),
      "Could not update this request.",
      "error",
    );
  else {
    await loadAdminRows();
    await loadBoard();
  }
}

async function deleteRequest(id, username) {
  if (!window.confirm(`Delete ${username}’s request? This cannot be undone.`))
    return;
  const response = await api(`/api/admin/requests/${id}`, { method: "DELETE" });
  if (!response.ok)
    message(
      document.querySelector("#admin-message"),
      "Could not delete this request.",
      "error",
    );
  else {
    await loadAdminRows();
    await loadBoard();
  }
}

document.querySelector("#admin-logout").addEventListener("click", () => {
  adminToken = "";
  sessionStorage.removeItem("friendsQueueAdmin");
  document.querySelector("#admin-controls").hidden = true;
  document.querySelector("#admin-login").hidden = false;
  message(document.querySelector("#admin-message"), "Signed out.");
});

// Let the page render without a network request until friends provide their invite code.
if (inviteCode) enterQueue();
void EXPIRY_NOTICE;
