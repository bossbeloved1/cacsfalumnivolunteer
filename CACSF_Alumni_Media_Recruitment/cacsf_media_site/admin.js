
/* ==========================================
   CACSF ALUMNI FELLOWSHIP MEDIA UNIT
   ADMIN DASHBOARD
========================================== */

const config = window.CACSF_CONFIG || {};

const cloud = Boolean(
  config.supabaseUrl &&
  config.supabaseAnonKey &&
  window.supabase
);

/* ==========================================
   SUPABASE CONNECTION
========================================== */

const db = cloud
  ? window.supabase.createClient(
      config.supabaseUrl,
      config.supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    )
  : null;

/* ==========================================
   ELEMENTS AND VARIABLES
========================================== */

const $ = selector => document.querySelector(selector);

const login = $("#login");
const dash = $("#dashboard");
const hint = $("#loginHint");

const PAGE_SIZE = 10;

let rows = [];
let selectedIds = new Set();
let currentPage = 1;
let currentFiles = [];
let currentFileIndex = 0;
let pendingDeleteIds = [];
let adminRole = null;
let exportScope = "all";

/* ==========================================
   GENERAL HELPERS
========================================== */

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatNumber(number) {
  return String(number).padStart(3, "0");
}

function registrationNumber(row) {
  return row.registration_number !== null &&
         row.registration_number !== undefined
    ? formatNumber(row.registration_number)
    : "Pending";
}

function notify(message) {
  const toast = $("#adminToast");

  if (!toast) {
    alert(message);
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(notify.timer);

  notify.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function safeFileName(value) {
  return String(value || "applicant")
    .replace(/[^a-z0-9-_]/gi, "_")
    .replace(/_+/g, "_");
}

/* ==========================================
   LOAD EXTERNAL EXPORT LIBRARIES
========================================== */

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(
      script => script.src === src
    );

    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }

      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });

      return;
    }

    const script = document.createElement("script");

    script.src = src;

    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };

    script.onerror = () => reject(
      new Error("Could not load an export library.")
    );

    document.head.appendChild(script);
  });
}

async function loadExportLibraries() {
  await loadScript(
    "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
  );

  await loadScript(
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
  );

  await loadScript(
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
  );
}

/* ==========================================
   AUTHENTICATION AND SESSION RESTORATION
========================================== */

function showLogin(message = "") {
  login.hidden = false;
  dash.hidden = true;

  if (hint) hint.textContent = message;
}

function showDashboard() {
  login.hidden = true;
  dash.hidden = false;

  render();
}

/*
  IMPORTANT:
  Supabase stores the authenticated session in browser storage.
  getSession() restores that session when the page is refreshed.
*/

async function checkAdminSession() {
  if (!cloud) {
    showLogin(
      "Supabase is not configured. Live administrator sign-in is unavailable."
    );
    return;
  }

  showLogin("Restoring your administrator session…");

  try {
    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    if (!data.session) {
      showLogin("Please sign in to access the admin dashboard.");
      return;
    }

    await authoriseAdmin();

  } catch (error) {
    showLogin(
      "Could not restore your session. Please sign in again. " +
      error.message
    );
  }
}

/*
  Verify that the signed-in Supabase user is an authorised admin.
*/

async function authoriseAdmin() {
  if (hint) hint.textContent = "Verifying administrator access…";

  const { data: admin, error } = await db
    .from("media_admins")
    .select("role")
    .single();

  if (error || !admin) {
    await db.auth.signOut();

    showLogin(
      "This account is not authorised to access the CACSF Media Unit dashboard."
    );

    return;
  }

  adminRole = admin.role;
  window.CACSF_ADMIN_ROLE = adminRole;

  await loadApplicants();
}

/*
  Sign-in button.
*/

$("#loginBtn").onclick = async () => {
  if (!cloud) {
    showLogin(
      "Supabase is not configured. Live administrator sign-in is unavailable."
    );
    return;
  }

  const email = $("#email").value.trim();
  const password = $("#password").value;

  if (!email || !password) {
    hint.textContent = "Enter your email address and password.";
    return;
  }

  const button = $("#loginBtn");

  button.disabled = true;
  button.textContent = "Signing in…";

  hint.textContent = "Checking administrator access…";

  try {
    const { error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      hint.textContent = error.message;
      return;
    }

    await authoriseAdmin();

  } catch (error) {
    hint.textContent = error.message;

  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
};

$("#password").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    $("#loginBtn").click();
  }
});

/*
  If the user signs out from another tab, update this tab too.
  Do not run database queries inside this authentication callback.
*/

if (cloud) {
  db.auth.onAuthStateChange(event => {
    if (event === "SIGNED_OUT") {
      rows = [];
      selectedIds.clear();
      adminRole = null;

      showLogin("Your administrator session has ended.");
    }
  });
}

/* ==========================================
   LOAD APPLICANTS
========================================== */

async function loadApplicants() {
  if (hint) hint.textContent = "Loading applicants…";

  const { data, error } = await db
    .from("applications")
    .select("*")
    .order("registration_number", { ascending: true });

  /*
    Do not sign the administrator out because of a database
    loading error. Keep the authenticated session active.
  */

  if (error) {
    login.hidden = true;
    dash.hidden = false;

    $("#applicants").innerHTML = `
      <div class="empty">
        <h3>Unable to load applicants</h3>
        <p>${esc(error.message)}</p>
        <button class="outline" id="retryLoad">
          Try again
        </button>
      </div>
    `;

    $("#retryLoad").onclick = loadApplicants;

    return;
  }

  rows = data || [];

  selectedIds.clear();
  currentPage = 1;

  showDashboard();
}

/* ==========================================
   PHONE AND WHATSAPP LINKS
========================================== */

function normalisePhone(number) {
  let value = String(number || "").replace(/\D/g, "");

  if (value.startsWith("0")) {
    value = "234" + value.slice(1);
  } else if (!value.startsWith("234") && value.length === 10) {
    value = "234" + value;
  }

  return value;
}

function contactLinks(row) {
  const phone = String(row.phone || "").replace(/\D/g, "");
  const whatsapp = normalisePhone(row.whatsapp || row.phone);

  return `
    <div class="contact-link">
      ${
        phone
          ? `<a href="tel:${esc(phone)}">☎ Call ${esc(row.phone)}</a>`
          : ""
      }

      ${
        whatsapp
          ? `<a href="https://wa.me/${esc(whatsapp)}"
               target="_blank"
               rel="noopener noreferrer">
               WhatsApp ${esc(row.whatsapp || row.phone)}
             </a>`
          : ""
      }
    </div>
  `;
}

/* ==========================================
   APPLICANT FILES
========================================== */

function getApplicantFiles(row) {
  const files = [];

  if (Array.isArray(row.portfolio_files)) {
    row.portfolio_files.forEach(file => {
      if (file && file.path) {
        files.push({
          name: file.name || "Uploaded work sample",
          path: file.path,
          type: file.type || ""
        });
      }
    });
  }

  return files;
}

async function getSignedFileUrl(path) {
  const { data, error } = await db.storage
    .from("applicant-portfolio")
    .createSignedUrl(path, 3600);

  if (error) throw error;

  return data.signedUrl;
}

/* ==========================================
   APPLICANT CARD
========================================== */

function applicantCard(row) {
  const checked = selectedIds.has(row.id) ? "checked" : "";
  const skills = Array.isArray(row.skills) ? row.skills : [];
  const files = getApplicantFiles(row);

  const portfolio = row.portfolio
    ? `<a href="${esc(row.portfolio)}"
          target="_blank"
          rel="noopener noreferrer">
          Open portfolio link
       </a>`
    : "—";

  return `
    <article class="applicant" data-id="${esc(row.id)}">

      <div class="applicant-top">

        <label class="applicant-select">
          <input
            type="checkbox"
            class="applicant-check"
            data-id="${esc(row.id)}"
            ${checked}
          >
          Select
        </label>

        <span class="applicant-number">
          REGISTRATION #${esc(registrationNumber(row))}
        </span>

      </div>

      <h3>${esc(row.full_name || "Unnamed applicant")}</h3>

      <div class="meta">
        Set: ${esc(row.set_year || "—")}
        <br>

        Location:
        ${esc(row.city || row.location || "—")}
        ${row.state ? ", " + esc(row.state) : ""}

        <br>
        Email: ${esc(row.email || "—")}
        <br>

        ${contactLinks(row)}

        <br>
        Submitted:
        ${
          row.created_at
            ? esc(new Date(row.created_at).toLocaleString())
            : "—"
        }
      </div>

      <div class="tags">
        ${skills.map(skill =>
          `<span class="tag">${esc(skill)}</span>`
        ).join("")}
      </div>

      <p><b>Bio:</b> ${esc(row.bio || "—")}</p>

      <p><b>Experience:</b> ${esc(row.experience || "—")}</p>

      <p><b>Portfolio:</b> ${portfolio}</p>

      <p>
        <b>Uploaded work samples:</b>
        ${files.length ? `${files.length} file(s) uploaded` : "None"}
      </p>

      <div class="applicant-actions">

        ${
          files.length
            ? `<button class="outline preview-files"
                       data-id="${esc(row.id)}">
                 Preview uploaded files
               </button>`
            : ""
        }

        <button class="outline preview-details"
                data-id="${esc(row.id)}">
          View applicant details
        </button>

      </div>

    </article>
  `;
}

/* ==========================================
   SEARCH
========================================== */

function filteredRows() {
  const query = ($("#search").value || "")
    .trim()
    .toLowerCase();

  if (!query) return rows;

  return rows.filter(row => {
    const searchable = [
      row.full_name,
      row.registration_number,
      row.set_year,
      row.email,
      row.phone,
      row.whatsapp,
      row.state,
      row.city,
      row.location,
      row.bio,
      row.experience,
      ...(row.skills || [])
    ].join(" ").toLowerCase();

    return searchable.includes(query);
  });
}

/* ==========================================
   PAGINATION
========================================== */

function renderPagination(total, totalPages, start, visibleCount) {
  const container = $("#pagination");

  if (!container) return;

  container.hidden = total <= PAGE_SIZE;

  $("#resultInfo").textContent = total
    ? `Showing ${start + 1}–${start + visibleCount} of ${total} applicants`
    : "No applicants";

  $("#paginationInfo").textContent =
    `Page ${currentPage} of ${totalPages}`;

  $("#prevPage").disabled = currentPage <= 1;
  $("#nextPage").disabled = currentPage >= totalPages;

  const numbers = $("#pageNumbers");
  numbers.innerHTML = "";

  for (let page = 1; page <= totalPages; page++) {
    const button = document.createElement("button");

    button.className =
      "page-btn" + (page === currentPage ? " active" : "");

    button.textContent = page;
    button.type = "button";

    button.onclick = () => {
      currentPage = page;
      render();

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    };

    numbers.appendChild(button);
  }

  $("#pageInput").max = totalPages;
  $("#pageInput").value = currentPage;
}

function updateSelectAll(pageRows) {
  const selectAll = $("#selectAll");

  if (!selectAll) return;

  selectAll.checked =
    pageRows.length > 0 &&
    pageRows.every(row => selectedIds.has(row.id));

  selectAll.indeterminate =
    pageRows.some(row => selectedIds.has(row.id)) &&
    !selectAll.checked;
}

function render() {
  const filtered = filteredRows();

  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / PAGE_SIZE)
  );

  currentPage = Math.min(currentPage, totalPages);

  const start = (currentPage - 1) * PAGE_SIZE;

  const pageRows = filtered.slice(
    start,
    start + PAGE_SIZE
  );

  $("#count").textContent = rows.length;

  $("#skillCount").textContent = new Set(
    rows.flatMap(row => row.skills || [])
  ).size;

  $("#selectedCount").textContent = selectedIds.size;

  const area = $("#applicants");

  if (!filtered.length) {
    area.innerHTML =
      '<div class="empty">No applicants found.</div>';
  } else {
    area.innerHTML = pageRows
      .map(row => applicantCard(row))
      .join("");
  }

  renderPagination(
    filtered.length,
    totalPages,
    start,
    pageRows.length
  );

  updateSelectAll(pageRows);
}

$("#search").oninput = () => {
  currentPage = 1;
  render();
};

$("#prevPage").onclick = () => {
  if (currentPage > 1) {
    currentPage--;
    render();
  }
};

$("#nextPage").onclick = () => {
  const totalPages = Math.max(
    1,
    Math.ceil(filteredRows().length / PAGE_SIZE)
  );

  if (currentPage < totalPages) {
    currentPage++;
    render();
  }
};

$("#goPage").onclick = () => {
  const requested = Number($("#pageInput").value);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRows().length / PAGE_SIZE)
  );

  if (
    !Number.isInteger(requested) ||
    requested < 1 ||
    requested > totalPages
  ) {
    notify(`Enter a page number between 1 and ${totalPages}.`);
    return;
  }

  currentPage = requested;
  render();
};

$("#pageInput").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    $("#goPage").click();
  }
});

/* ==========================================
   SELECT APPLICANTS
========================================== */

$("#applicants").addEventListener("change", event => {
  if (!event.target.classList.contains("applicant-check")) {
    return;
  }

  const id = event.target.dataset.id;

  if (event.target.checked) {
    selectedIds.add(id);
  } else {
    selectedIds.delete(id);
  }

  render();
});

$("#selectAll").onchange = event => {
  const filtered = filteredRows();

  const start = (currentPage - 1) * PAGE_SIZE;

  const pageRows = filtered.slice(
    start,
    start + PAGE_SIZE
  );

  pageRows.forEach(row => {
    if (event.target.checked) {
      selectedIds.add(row.id);
    } else {
      selectedIds.delete(row.id);
    }
  });

  render();
};

function selectedRows() {
  return rows.filter(row => selectedIds.has(row.id));
}

/* ==========================================
   OPEN EXPORT WINDOW
========================================== */

function openExportModal(scope) {
  exportScope = scope;

  const records = exportRecords();

  if (!records.length) {
    notify("There are no applicants to export.");
    return;
  }

  $("#exportModal").hidden = false;
}

$("#export").onclick = () => {
  openExportModal("all");
};

$("#downloadSelected").onclick = () => {
  if (!selectedIds.size) {
    notify("Select at least one applicant first.");
    return;
  }

  openExportModal("selected");
};

function exportRecords() {
  return exportScope === "selected"
    ? selectedRows()
    : rows;
}

/* ==========================================
   FILE PREVIEW
========================================== */

async function openFilePreview(row) {
  const files = getApplicantFiles(row);

  if (!files.length) {
    notify("This applicant has no uploaded files.");
    return;
  }

  currentFiles = [];

  $("#previewTitle").textContent =
    row.full_name || "Applicant files";

  $("#previewSubtitle").textContent =
    `Registration #${registrationNumber(row)}`;

  $("#prevFile").hidden = false;
  $("#nextFile").hidden = false;

  $("#previewModal").hidden = false;

  $("#previewContent").innerHTML =
    '<p class="empty">Loading uploaded files…</p>';

  try {
    for (const file of files) {
      const url = await getSignedFileUrl(file.path);

      currentFiles.push({
        ...file,
        url
      });
    }

    currentFileIndex = 0;

    displayPreviewFile();

  } catch (error) {
    $("#previewContent").innerHTML = `
      <p class="empty">
        Could not load this file: ${esc(error.message)}
      </p>
    `;
  }
}

function displayPreviewFile() {
  const file = currentFiles[currentFileIndex];

  if (!file) return;

  const extension = file.name
    .split(".")
    .pop()
    .toLowerCase();

  const isImage =
    file.type.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(extension);

  const isPdf =
    file.type === "application/pdf" ||
    extension === "pdf";

  let content = "";

  if (isImage) {
    content = `
      <img
        src="${esc(file.url)}"
        alt="${esc(file.name)}"
        class="preview-image"
      >
    `;
  } else if (isPdf) {
    content = `
      <iframe
        src="${esc(file.url)}"
        class="preview-frame"
        title="${esc(file.name)}"
      ></iframe>
    `;
  } else {
    content = `
      <div class="empty">
        <h3>${esc(file.name)}</h3>
        <p>This file format may not display directly in your browser.</p>
        <a href="${esc(file.url)}"
           target="_blank"
           rel="noopener noreferrer">
          Open file
        </a>
      </div>
    `;
  }

  $("#previewContent").innerHTML = content;

  $("#previewCounter").textContent =
    `${currentFileIndex + 1} of ${currentFiles.length}`;

  $("#prevFile").disabled = currentFileIndex === 0;

  $("#nextFile").disabled =
    currentFileIndex >= currentFiles.length - 1;
}

$("#prevFile").onclick = () => {
  if (currentFileIndex > 0) {
    currentFileIndex--;
    displayPreviewFile();
  }
};

$("#nextFile").onclick = () => {
  if (currentFileIndex < currentFiles.length - 1) {
    currentFileIndex++;
    displayPreviewFile();
  }
};

$("#closePreview").onclick = () => {
  $("#previewModal").hidden = true;
  $("#previewContent").innerHTML = "";

  currentFiles = [];
  currentFileIndex = 0;
};

function openApplicantDetails(row) {
  const fields = [
    ["Registration number", registrationNumber(row)],
    ["Full name", row.full_name],
    ["Set / graduation year", row.set_year],
    ["Email", row.email],
    ["Phone number", row.phone],
    ["WhatsApp number", row.whatsapp],
    ["State", row.state],
    ["City", row.city],
    ["Skills", (row.skills || []).join(", ")],
    ["Bio", row.bio],
    ["Experience", row.experience],
    ["Portfolio", row.portfolio]
  ];

  $("#previewTitle").textContent =
    row.full_name || "Applicant details";

  $("#previewSubtitle").textContent =
    `Registration #${registrationNumber(row)}`;

  $("#previewContent").innerHTML = `
    <div class="details-preview">
      ${fields
        .filter(([label, value]) =>
          value !== null &&
          value !== undefined &&
          String(value).trim() !== ""
        )
        .map(([label, value]) => `
          <div class="detail-row">
            <b>${esc(label)}</b>
            <span>${esc(value)}</span>
          </div>
        `).join("")}
    </div>
  `;

  $("#previewCounter").textContent = "";

  $("#prevFile").hidden = true;
  $("#nextFile").hidden = true;

  $("#previewModal").hidden = false;
}

$("#applicants").addEventListener("click", event => {
  const fileButton = event.target.closest(".preview-files");
  const detailsButton = event.target.closest(".preview-details");

  if (!fileButton && !detailsButton) return;

  const id = (fileButton || detailsButton).dataset.id;

  const row = rows.find(item =>
    String(item.id) === String(id)
  );

  if (!row) return;

  if (fileButton) {
    openFilePreview(row);
  } else {
    openApplicantDetails(row);
  }
});

/* ==========================================
   DELETE APPLICANTS
========================================== */

$("#deleteSelected").onclick = () => {
  if (!selectedIds.size) {
    notify("Select applicants you want to delete.");
    return;
  }

  pendingDeleteIds = [...selectedIds];

  $("#deleteMessage").textContent =
    `You are about to permanently delete ${pendingDeleteIds.length} applicant record(s). This action cannot be undone.`;

  $("#deleteModal").hidden = false;
};

$("#cancelDelete").onclick = () => {
  $("#deleteModal").hidden = true;
  pendingDeleteIds = [];
};

$("#confirmDelete").onclick = async () => {
  if (!pendingDeleteIds.length) return;

  const button = $("#confirmDelete");

  button.disabled = true;
  button.textContent = "Deleting…";

  try {
    const targets = rows.filter(row =>
      pendingDeleteIds.includes(row.id)
    );

    const filePaths = targets.flatMap(row =>
      getApplicantFiles(row).map(file => file.path)
    );

    if (filePaths.length) {
      const { error: storageError } = await db.storage
        .from("applicant-portfolio")
        .remove(filePaths);

      if (storageError) {
        throw new Error(
          "Could not delete uploaded files. Check Storage delete permissions. " +
          storageError.message
        );
      }
    }

    const { error } = await db
      .from("applications")
      .delete()
      .in("id", pendingDeleteIds);

    if (error) {
      throw new Error(
        "Could not delete applicant records. Check the applications DELETE policy. " +
        error.message
      );
    }

    rows = rows.filter(row =>
      !pendingDeleteIds.includes(row.id)
    );

    pendingDeleteIds.forEach(id => selectedIds.delete(id));

    $("#deleteModal").hidden = true;

    pendingDeleteIds = [];
    currentPage = 1;

    render();

    notify("Selected applicant records deleted.");

  } catch (error) {
    notify(error.message);

  } finally {
    button.disabled = false;
    button.textContent = "Delete permanently";
  }
};

/* ==========================================
   EXPORT FIELD HELPERS
========================================== */

function exportFields(row) {
  const fields = [
    ["Registration Number", registrationNumber(row)],
    ["Full Name", row.full_name],
    ["Set / Graduation Year", row.set_year],
    ["Phone Number", row.phone],
    ["WhatsApp Number", row.whatsapp],
    ["Email Address", row.email],
    ["State", row.state],
    ["City", row.city],
    [
      "Skills",
      Array.isArray(row.skills)
        ? row.skills.join(", ")
        : row.skills
    ],
    ["Bio", row.bio],
    ["Experience", row.experience],
    ["Portfolio", row.portfolio]
  ];

  return fields.filter(([label, value]) =>
    value !== null &&
    value !== undefined &&
    String(value).trim() !== ""
  );
}

/* ==========================================
   EXCEL EXPORT
========================================== */

$("#exportExcel").onclick = async () => {
  const records = exportRecords();

  if (!records.length) {
    notify("There are no applicants to export.");
    return;
  }

  try {
    await loadExportLibraries();

    const data = records.map(row =>
      Object.fromEntries(exportFields(row))
    );

    const worksheet = XLSX.utils.json_to_sheet(data);

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "CACSF Applicants"
    );

    XLSX.writeFile(
      workbook,
      "CACSF-Alumni-Applicants.xlsx"
    );

    $("#exportModal").hidden = true;

    notify("Excel file prepared.");

  } catch (error) {
    notify("Excel export failed: " + error.message);
  }
};

/* ==========================================
   MICROSOFT WORD EXPORT
========================================== */

$("#exportWord").onclick = () => {
  const records = exportRecords();

  if (!records.length) {
    notify("There are no applicants to export.");
    return;
  }

  const tables = records.map(row => `
    <h2>${esc(row.full_name || "Applicant")}</h2>

    <p>
      <b>Registration #${esc(registrationNumber(row))}</b>
    </p>

    <table>
      ${exportFields(row).map(([label, value]) => `
        <tr>
          <th>${esc(label)}</th>
          <td>${esc(value)}</td>
        </tr>
      `).join("")}
    </table>

    <br>
  `).join("<hr>");

  const documentHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">

      <title>CACSF Alumni Applicants</title>

      <style>
        body {
          font-family: Arial, sans-serif;
          color: #29243a;
          padding: 25px;
        }

        h1, h2 {
          color: #6415f5;
        }

        table {
          border-collapse: collapse;
          width: 100%;
          margin-bottom: 20px;
        }

        th, td {
          border: 1px solid #ddd;
          padding: 9px;
          text-align: left;
          vertical-align: top;
        }

        th {
          background: #f0eaff;
          width: 32%;
        }
      </style>
    </head>

    <body>
      <h1>CACSF Alumni Fellowship Media Unit</h1>

      <h2>Volunteer Applicants</h2>

      ${tables}
    </body>
    </html>
  `;

  const blob = new Blob(
    ["\ufeff", documentHtml],
    { type: "application/msword" }
  );

  downloadBlob(
    blob,
    "CACSF-Alumni-Applicants.doc"
  );

  $("#exportModal").hidden = true;

  notify("Word document prepared.");
};

/* ==========================================
   DESIGNED APPLICANT DOCUMENT
========================================== */

function applicantDesign(row) {
  const fields = exportFields(row);

  return `
    <div class="export-page">

      <div class="export-top">
        <div class="export-brand">CACSF</div>

        <div class="export-unit">
          ALUMNI FELLOWSHIP<br>
          MEDIA UNIT
        </div>
      </div>

      <div class="export-heading">

        <span>VOLUNTEER APPLICATION</span>

        <h1>${esc(row.full_name || "Applicant")}</h1>

        <p>
          Registration #${esc(registrationNumber(row))}
        </p>

      </div>

      <div class="export-details">

        ${fields
          .filter(([label]) =>
            label !== "Full Name" &&
            label !== "Registration Number"
          )
          .map(([label, value]) => `
            <div class="export-field">
              <div>${esc(label)}</div>
              <p>${esc(value)}</p>
            </div>
          `).join("")}

      </div>

      <div class="export-footer">
        CACSF Alumni Fellowship Media Unit
      </div>

    </div>
  `;
}

function exportStyles() {
  return `
    .export-page {
      width: 800px;
      min-height: 1050px;
      box-sizing: border-box;
      padding: 55px;
      background: #fff;
      color: #29243a;
      font-family: Arial, sans-serif;
      border: 1px solid #eee;
    }

    .export-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 22px;
      border-bottom: 4px solid #c7ff32;
    }

    .export-brand {
      font-size: 34px;
      font-weight: 900;
      color: #6415f5;
    }

    .export-unit {
      font-size: 12px;
      line-height: 1.5;
      font-weight: bold;
      text-align: right;
      color: #6415f5;
    }

    .export-heading {
      background: #6415f5;
      color: #fff;
      padding: 35px;
      margin: 35px 0;
      border-radius: 18px;
    }

    .export-heading span {
      color: #c7ff32;
      font-size: 12px;
      font-weight: bold;
      letter-spacing: 2px;
    }

    .export-heading h1 {
      font-size: 36px;
      line-height: 1.2;
      margin: 16px 0 10px;
      color: #fff;
    }

    .export-heading p {
      margin: 0;
      color: #e4d7ff;
      font-size: 15px;
    }

    .export-details {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
    }

    .export-field {
      padding: 17px;
      border: 1px solid #e8e4f0;
      border-radius: 10px;
      overflow-wrap: anywhere;
    }

    .export-field div {
      color: #6415f5;
      font-size: 11px;
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .export-field p {
      margin: 0;
      font-size: 14px;
      line-height: 1.5;
    }

    .export-footer {
      margin-top: 45px;
      padding-top: 15px;
      border-top: 1px solid #e8e4f0;
      color: #777083;
      font-size: 12px;
    }
  `;
}

async function createExportCanvas(row) {
  await loadExportLibraries();

  const wrapper = document.createElement("div");

  wrapper.style.position = "fixed";
  wrapper.style.left = "-10000px";
  wrapper.style.top = "0";
  wrapper.style.width = "800px";

  wrapper.innerHTML = `
    <style>${exportStyles()}</style>
    ${applicantDesign(row)}
  `;

  document.body.appendChild(wrapper);

  try {
    return await html2canvas(
      wrapper.querySelector(".export-page"),
      {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true
      }
    );

  } finally {
    wrapper.remove();
  }
}

/* ==========================================
   INDIVIDUAL IMAGE EXPORT
========================================== */

$("#exportImages").onclick = async () => {
  const records = exportRecords();

  if (!records.length) {
    notify("There are no applicants to export.");
    return;
  }

  try {
    /*
      For multiple applicants, prepare one PDF with each
      applicant on a separate page instead of triggering
      multiple browser downloads.
    */

    if (records.length > 1) {
      await exportRecordsAsPDF(records);
      return;
    }

    const row = records[0];

    const canvas = await createExportCanvas(row);

    const blob = await new Promise(resolve =>
      canvas.toBlob(resolve, "image/png")
    );

    if (!blob) {
      throw new Error("Could not create applicant image.");
    }

    downloadBlob(
      blob,
      `CACSF-${safeFileName(row.full_name)}-${registrationNumber(row)}.png`
    );

    $("#exportModal").hidden = true;

    notify("Applicant image prepared.");

  } catch (error) {
    notify("Image export failed: " + error.message);
  }
};

/* ==========================================
   PDF EXPORT
========================================== */

async function exportRecordsAsPDF(records) {
  await loadExportLibraries();

  const { jsPDF } = window.jspdf;

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  for (let index = 0; index < records.length; index++) {
    const canvas = await createExportCanvas(records[index]);

    const image = canvas.toDataURL("image/png");

    const pageWidth = 210;
    const pageHeight = 297;

    const ratio = Math.min(
      pageWidth / canvas.width,
      pageHeight / canvas.height
    );

    const width = canvas.width * ratio;
    const height = canvas.height * ratio;

    if (index > 0) {
      pdf.addPage();
    }

    pdf.addImage(
      image,
      "PNG",
      (pageWidth - width) / 2,
      5,
      width,
      height
    );
  }

  pdf.save("CACSF-Alumni-Applicants.pdf");
}

$("#exportPDF").onclick = async () => {
  const records = exportRecords();

  if (!records.length) {
    notify("There are no applicants to export.");
    return;
  }

  try {
    await exportRecordsAsPDF(records);

    $("#exportModal").hidden = true;

    notify("PDF file prepared.");

  } catch (error) {
    notify("PDF export failed: " + error.message);
  }
};

/* ==========================================
   CLOSE EXPORT MODAL
========================================== */

$("#closeExport").onclick = () => {
  $("#exportModal").hidden = true;
};

/* ==========================================
   LOGOUT
========================================== */

$("#logout").onclick = async () => {
  if (db) {
    const { error } = await db.auth.signOut();

    if (error) {
      notify("Could not sign out: " + error.message);
      return;
    }
  }

  rows = [];
  selectedIds.clear();
  adminRole = null;

  $("#email").value = "";
  $("#password").value = "";

  showLogin("You have signed out.");
};

/* ==========================================
   START DASHBOARD
========================================== */

if (cloud) {
  /*
    This runs every time the page loads.
    It checks for the previously saved Supabase session.
  */
  checkAdminSession();

} else {
  showLogin(
    "Supabase is not configured. Live administrator sign-in is unavailable."
  );
}
