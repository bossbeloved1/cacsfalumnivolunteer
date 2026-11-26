
/* CACSF ALUMNI FELLOWSHIP MEDIA UNIT — ADMIN DASHBOARD */
(() => {
  "use strict";

  const config = window.CACSF_CONFIG || {};
  const cloud = Boolean(
    config.supabaseUrl &&
    config.supabaseAnonKey &&
    window.supabase
  );

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

  const $ = selector => document.querySelector(selector);
  const PAGE_SIZE = 10;
  const WHATSAPP_GROUP_LINK =
    "https://chat.whatsapp.com/Df0SCyWpSGv0tpBpkdslbt";

  let rows = [];
  let selectedIds = new Set();
  let currentPage = 1;
  let currentFiles = [];
  let currentFileIndex = 0;
  let pendingDeleteIds = [];
  let adminRole = null;
  let toastTimer = null;
  let touchStartX = 0;
  let savedScrollY = 0;
  let modalCount = 0;

  /* GENERAL HELPERS */

  const esc = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  const pad = number => String(number).padStart(3, "0");

  const regNo = row =>
    row.registration_number == null
      ? "Pending"
      : pad(row.registration_number);

  const safeName = value =>
    String(value || "applicant")
      .replace(/[^a-z0-9-_]/gi, "_")
      .replace(/_+/g, "_");

  function getApplicationStatus(row) {
    const status = String(row.application_status || "Pending");

    return ["Pending", "Accepted", "Rejected"].includes(status)
      ? status
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

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 3600);
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

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(
        script => script.src === src
      );

      if (existing?.dataset.loaded === "true") {
        resolve();
        return;
      }

      if (existing && window.XLSX && src.includes("xlsx")) {
        resolve();
        return;
      }

      if (existing && window.html2canvas && src.includes("html2canvas")) {
        resolve();
        return;
      }

      if (existing && window.jspdf && src.includes("jspdf")) {
        resolve();
        return;
      }

      const script = existing ||
        Object.assign(document.createElement("script"), { src });

      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        resolve();
      }, { once: true });

      script.addEventListener("error", () => {
        reject(new Error("Could not load an export library."));
      }, { once: true });

      if (!existing) document.head.appendChild(script);
    });
  }

  async function exportLibraries() {
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

  /* MODAL SCROLL LOCKING */

  function openOverlay(selector) {
    const modal = $(selector);

    if (!modal || !modal.hidden) return;

    if (modalCount === 0) {
      savedScrollY = window.scrollY || window.pageYOffset;

      document.body.classList.add("modal-open");
      document.body.style.position = "fixed";
      document.body.style.top = `-${savedScrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
    }

    modalCount++;
    modal.hidden = false;
  }

  function closeOverlay(selector) {
    const modal = $(selector);

    if (!modal || modal.hidden) return;

    modal.hidden = true;
    modalCount = Math.max(0, modalCount - 1);

    if (modalCount === 0) {
      document.body.classList.remove("modal-open");

      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.width = "";

      window.scrollTo(0, savedScrollY);
    }
  }

  /* AUTHENTICATION */

  function showLogin(message = "") {
    $("#login").hidden = false;
    $("#dashboard").hidden = true;
    $("#loginHint").textContent = message;
  }

  function showDashboard() {
    $("#login").hidden = true;
    $("#dashboard").hidden = false;
    render();
  }

  async function authoriseAdmin() {
    $("#loginHint").textContent =
      "Verifying administrator access…";

    const { data: userData, error: userError } =
      await db.auth.getUser();

    if (userError || !userData.user) {
      await db.auth.signOut();

      showLogin("Could not verify your administrator account.");
      return;
    }

    const { data: admin, error } = await db
      .from("media_admins")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();

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
      showLogin("Could not restore your session: " + error.message);
    }
  }

  $("#loginBtn").addEventListener("click", async () => {
    if (!cloud) {
      showLogin("Supabase is not configured.");
      return;
    }

    const email = $("#email").value.trim();
    const password = $("#password").value;
    const button = $("#loginBtn");

    if (!email || !password) {
      $("#loginHint").textContent =
        "Enter your email address and password.";
      return;
    }

    button.disabled = true;
    button.textContent = "Signing in…";

    $("#loginHint").textContent =
      "Checking administrator access…";

    try {
      const { error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      await authoriseAdmin();

    } catch (error) {
      $("#loginHint").textContent = error.message;

    } finally {
      button.disabled = false;
      button.textContent = "Sign in";
    }
  });

  $("#password").addEventListener("keydown", event => {
    if (event.key === "Enter") $("#loginBtn").click();
  });

  $("#togglePassword").addEventListener("click", () => {
    const input = $("#password");
    const visible = input.type === "password";

    input.type = visible ? "text" : "password";
    $("#togglePassword").textContent = visible ? "Hide" : "Show";

    $("#togglePassword").setAttribute(
      "aria-label",
      visible ? "Hide password" : "Show password"
    );

    $("#togglePassword").setAttribute(
      "aria-pressed",
      String(visible)
    );
  });

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

  /* LOAD APPLICANTS */

  async function loadApplicants() {
    $("#loginHint").textContent = "Loading applicants…";

    const { data, error } = await db
      .from("applications")
      .select("*")
      .order("registration_number", { ascending: true });

    if (error) {
      $("#login").hidden = true;
      $("#dashboard").hidden = false;

      $("#applicants").innerHTML = `
        <div class="empty">
          <h3>Unable to load applicants</h3>
          <p>${esc(error.message)}</p>
          <button class="outline" id="retryLoad" type="button">
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

  /* CONTACT AND FILE HELPERS */

  function normalisePhone(number) {
    let value = String(number || "").replace(/\D/g, "");

    if (!value) return "";

    if (value.startsWith("0")) {
      value = "234" + value.slice(1);
    } else if (!value.startsWith("234") && value.length === 10) {
      value = "234" + value;
    }

    return value;
  }

  function contactLinks(row) {
    const number = String(row.whatsapp || "").trim();
    const wa = normalisePhone(number);

    return `
      <div class="contact-link">
        <strong>WhatsApp:</strong>
        ${
          wa
            ? `<a href="https://wa.me/${esc(wa)}"
                 target="_blank"
                 rel="noopener noreferrer">${esc(number)}</a>`
            : "—"
        }
      </div>
    `;
  }

  function whatsappInvitationLink(row) {
    const number = normalisePhone(row.whatsapp);

    if (!number) return "";

    const firstName = String(row.full_name || "there")
      .trim()
      .split(/\s+/)[0];

    const title = String(row.title || "").trim();

    const salutation = title
      ? `${title} ${firstName}`
      : firstName;

    const message =
      `Hello ${salutation}, congratulations! Your application to volunteer with the CACSF Alumni Fellowship Media Unit has been accepted. We would love to welcome you into the team. Please use this link to join the CACSF Alumni Media Unit Onboarding Group: ${WHATSAPP_GROUP_LINK}`;

    return `https://wa.me/${encodeURIComponent(number)}?text=${encodeURIComponent(message)}`;
  }

  function getApplicantFiles(row) {
    return Array.isArray(row.portfolio_files)
      ? row.portfolio_files
          .filter(file => file?.path)
          .map(file => ({
            name: file.name || "Uploaded work sample",
            path: file.path,
            type: file.type || ""
          }))
      : [];
  }

  async function signedUrl(path) {
    const { data, error } = await db.storage
      .from("applicant-portfolio")
      .createSignedUrl(path, 3600);

    if (error) throw error;

    return data.signedUrl;
  }

  /* APPLICATION STATUS CONTROL */

  async function setApplicationStatus(row, value, selectElement = null) {
    const allowed = ["Pending", "Accepted", "Rejected"];

    if (!allowed.includes(value)) {
      notify("Invalid application status.");
      render();
      return;
    }

    if (row.reviewed !== true) {
      notify("Mark this application as reviewed before making a decision.");
      render();
      return;
    }

    const previousStatus = getApplicationStatus(row);

    if (previousStatus === value) return;

    if (selectElement) {
      selectElement.disabled = true;
    }

    try {
      const { data, error } = await db
        .from("applications")
        .update({ application_status: value })
        .eq("id", row.id)
        .select("id, application_status");

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error(
          "Supabase did not confirm the status update. Check your administrator permissions."
        );
      }

      row.application_status = data[0].application_status || value;

      render();

      notify(`Application status changed to ${value}.`);

    } catch (error) {
      notify("Could not update application status: " + error.message);
      render();
    }
  }

  /* APPLICANT CARD */

  function applicantCard(row) {
    const id = String(row.id);
    const checked = selectedIds.has(id) ? "checked" : "";

    const skills = Array.isArray(row.skills)
      ? row.skills
      : [];

    const files = getApplicantFiles(row);
    const reviewed = row.reviewed === true;
    const applicationStatus = getApplicationStatus(row);

    const portfolio = row.portfolio
      ? `<a href="${esc(row.portfolio)}"
           target="_blank"
           rel="noopener noreferrer">${esc(row.portfolio)}</a>`
      : "—";

    const inviteLink =
      reviewed && applicationStatus === "Accepted"
        ? whatsappInvitationLink(row)
        : "";

    return `
      <article class="applicant" data-id="${esc(id)}">

        <div class="applicant-head">

          <div class="applicant-title">

            <label class="round-select" title="Select applicant">
              <input
                type="checkbox"
                class="applicant-check"
                data-id="${esc(id)}"
                ${checked}
              >
              <span></span>
            </label>

            <div>
              <h3>${esc(row.title ? row.title + " " : "")}${esc(row.full_name || "Unnamed applicant")}</h3>
            </div>

          </div>

          <div class="applicant-identifiers">

            <span class="applicant-number">
              REGISTRATION #${esc(regNo(row))}
            </span>

            <span class="review-badge ${reviewed ? "is-reviewed" : "is-unreviewed"}">
              ${reviewed ? "✓ Reviewed" : "Not reviewed"}
            </span>

          </div>

        </div>

        <div class="meta">

          <div><strong>Title:</strong> ${esc(row.title || "—")}</div>

          <div><strong>Set:</strong> ${esc(row.set_year || "—")}</div>

          <div><strong>Gender:</strong> ${esc(row.gender || "—")}</div>

          <div>
            <strong>Location:</strong>
            ${esc(row.city || row.location || "—")}
            ${row.state ? ", " + esc(row.state) : ""}
          </div>

          <div>
            <strong>Email:</strong>
            ${
              row.email
                ? `<a href="mailto:${esc(row.email)}">${esc(row.email)}</a>`
                : "—"
            }
          </div>

          <div>
            <strong>Phone number:</strong>
            ${esc(row.phone || "—")}
          </div>

          ${contactLinks(row)}

        </div>

        <p><b>Bio:</b> ${esc(row.bio || "—")}</p>

        <p><b>Experience:</b> ${esc(row.experience || "—")}</p>

        <p><b>Portfolio:</b> ${portfolio}</p>

        <p>
          <b>Uploaded work samples:</b>
          ${files.length ? `${files.length} file(s) uploaded` : "None"}
        </p>

        <div class="application-decision">

          ${
            reviewed
              ? `
                <strong>Application decision:</strong>

                <select
                  class="application-status-select"
                  data-id="${esc(id)}"
                  aria-label="Application decision for ${esc(row.full_name || "applicant")}">

                  <option value="Pending" ${applicationStatus === "Pending" ? "selected" : ""}>
                    Pending
                  </option>

                  <option value="Accepted" ${applicationStatus === "Accepted" ? "selected" : ""}>
                    Accepted
                  </option>

                  <option value="Rejected" ${applicationStatus === "Rejected" ? "selected" : ""}>
                    Rejected
                  </option>

                </select>

                ${
                  applicationStatus === "Accepted"
                    ? inviteLink
                      ? `<a
                           class="applicant-action whatsapp-invite"
                           href="${esc(inviteLink)}"
                           target="_blank"
                           rel="noopener noreferrer">
                           Send WhatsApp invitation
                         </a>`
                      : `<span class="whatsapp-missing">
                           No WhatsApp number provided
                         </span>`
                    : ""
                }
              `
              : `
                <strong>Application decision:</strong>
                <span class="awaiting-review">Awaiting review</span>
              `
          }

        </div>

        ${
          skills.length
            ? `<div class="tags">
                ${skills.map(skill =>
                  `<span class="tag">${esc(skill)}</span>`
                ).join("")}
              </div>`
            : ""
        }

        <div class="submitted-line">
          <strong>Submitted:</strong>
          ${row.created_at
            ? esc(new Date(row.created_at).toLocaleString())
            : "—"}
        </div>

        <div class="applicant-actions">

          ${
            files.length
              ? `<button class="applicant-action preview-files"
                   data-id="${esc(id)}"
                   type="button">
                   Preview uploaded files
                 </button>`
              : ""
          }

          <button
            class="applicant-action preview-details"
            data-id="${esc(id)}"
            type="button">
            View applicant details
          </button>

          <button
            class="review-button ${reviewed ? "is-unreviewed" : "is-reviewed"} toggle-review"
            data-id="${esc(id)}"
            type="button">
            ${reviewed ? "Mark as not reviewed" : "Mark as reviewed"}
          </button>

          <div class="dropdown-wrap">

            <button
              class="applicant-action individual-export"
              data-id="${esc(id)}"
              type="button"
              aria-expanded="false">
              <span>Download</span>
              <span class="dropdown-arrow" aria-hidden="true"></span>
            </button>

            <div class="dropdown-menu" hidden>
              <button data-export="excel" data-id="${esc(id)}">
                Microsoft Excel (.xlsx)
              </button>

              <button data-export="word" data-id="${esc(id)}">
                Microsoft Word (.doc)
              </button>

              <button data-export="image" data-id="${esc(id)}">
                Designed applicant image
              </button>

              <button data-export="pdf" data-id="${esc(id)}">
                PDF document
              </button>
            </div>

          </div>

          <button
            class="applicant-action delete-one"
            data-id="${esc(id)}"
            type="button">
            Delete applicant
          </button>

        </div>

      </article>
    `;
  }

  /* SEARCH, SELECTION AND PAGINATION */

  function filteredRows() {
    const query = ($("#search").value || "")
      .trim()
      .toLowerCase();

    if (!query) return rows;

    return rows.filter(row => {
      const values = [
        row.title,
        row.full_name,
        row.registration_number,
        row.set_year,
        row.gender,
        row.email,
        row.phone,
        row.whatsapp,
        row.state,
        row.city,
        row.location,
        row.bio,
        row.experience,
        getApplicationStatus(row),
        ...(Array.isArray(row.skills) ? row.skills : [])
      ];

      return values.join(" ").toLowerCase().includes(query);
    });
  }

  function selectedRows() {
    return rows.filter(row =>
      selectedIds.has(String(row.id))
    );
  }

  function renderPagination(total, totalPages, start, count) {
    $("#pagination").hidden = total <= PAGE_SIZE;

    $("#resultInfo").textContent = total
      ? `Showing ${start + 1}–${start + count} of ${total} applicants`
      : "No applicants";

    $("#paginationInfo").textContent =
      `Page ${currentPage} of ${totalPages}`;

    $("#prevPage").disabled = currentPage <= 1;
    $("#nextPage").disabled = currentPage >= totalPages;

    const box = $("#pageNumbers");
    box.innerHTML = "";

    for (let page = 1; page <= totalPages; page++) {
      const button = document.createElement("button");

      button.className =
        "page-btn" + (page === currentPage ? " active" : "");

      button.textContent = page;

      button.onclick = () => {
        currentPage = page;
        render();

        window.scrollTo({
          top: 0,
          behavior: "smooth"
        });
      };

      box.appendChild(button);
    }

    $("#pageInput").max = totalPages;
    $("#pageInput").value = currentPage;
  }

  function render() {
    const filtered = filteredRows();

    const pages = Math.max(
      1,
      Math.ceil(filtered.length / PAGE_SIZE)
    );

    currentPage = Math.min(currentPage, pages);

    const start = (currentPage - 1) * PAGE_SIZE;

    const pageRows = filtered.slice(
      start,
      start + PAGE_SIZE
    );

    const reviewedTotal = rows.filter(
      row => row.reviewed === true
    ).length;

    const notReviewedTotal = rows.length - reviewedTotal;

    // Decision counters only include applicants who have been reviewed.
    const reviewedRows = rows.filter(
      row => row.reviewed === true
    );

    const pendingTotal = reviewedRows.filter(
      row => getApplicationStatus(row) === "Pending"
    ).length;

    const acceptedTotal = reviewedRows.filter(
      row => getApplicationStatus(row) === "Accepted"
    ).length;

    const rejectedTotal = reviewedRows.filter(
      row => getApplicationStatus(row) === "Rejected"
    ).length;

    $("#count").textContent = rows.length;
    $("#reviewedCount").textContent = reviewedTotal;
    $("#notReviewedCount").textContent = notReviewedTotal;

    $("#pendingCount").textContent = pendingTotal;
    $("#acceptedCount").textContent = acceptedTotal;
    $("#rejectedCount").textContent = rejectedTotal;

    $("#downloadSelected").disabled = !selectedIds.size;
    $("#deleteSelected").disabled = !selectedIds.size;

    $("#applicants").innerHTML = filtered.length
      ? pageRows.map(applicantCard).join("")
      : '<div class="empty">No applicants found.</div>';

    renderPagination(
      filtered.length,
      pages,
      start,
      pageRows.length
    );

    $("#selectAll").checked =
      pageRows.length > 0 &&
      pageRows.every(row =>
        selectedIds.has(String(row.id))
      );

    $("#selectAll").indeterminate =
      pageRows.some(row =>
        selectedIds.has(String(row.id))
      ) && !$("#selectAll").checked;
  }

  $("#search").addEventListener("input", () => {
    currentPage = 1;
    render();
  });

  $("#prevPage").onclick = () => {
    if (currentPage > 1) {
      currentPage--;
      render();
    }
  };

  $("#nextPage").onclick = () => {
    if (currentPage < Math.ceil(
      filteredRows().length / PAGE_SIZE
    )) {
      currentPage++;
      render();
    }
  };

  $("#goPage").onclick = () => {
    const number = Number($("#pageInput").value);

    const max = Math.max(
      1,
      Math.ceil(filteredRows().length / PAGE_SIZE)
    );

    if (
      !Number.isInteger(number) ||
      number < 1 ||
      number > max
    ) {
      notify(`Enter a page number between 1 and ${max}.`);
      return;
    }

    currentPage = number;
    render();
  };

  $("#pageInput").addEventListener("keydown", event => {
    if (event.key === "Enter") $("#goPage").click();
  });

  $("#applicants").addEventListener("change", event => {
    if (event.target.matches(".applicant-check")) {
      const id = String(event.target.dataset.id);

      if (event.target.checked) {
        selectedIds.add(id);
      } else {
        selectedIds.delete(id);
      }

      render();
      return;
    }

    if (event.target.matches(".application-status-select")) {
      const id = String(event.target.dataset.id);

      const row = rows.find(
        item => String(item.id) === id
      );

      if (row) {
        setApplicationStatus(
          row,
          event.target.value,
          event.target
        );
      }
    }
  });

  $("#selectAll").onchange = event => {
    const list = filteredRows().slice(
      (currentPage - 1) * PAGE_SIZE,
      currentPage * PAGE_SIZE
    );

    list.forEach(row => {
      const id = String(row.id);

      if (event.target.checked) {
        selectedIds.add(id);
      } else {
        selectedIds.delete(id);
      }
    });

    render();
  };

  /* REVIEWED / NOT REVIEWED AND DECISION POPUPS */

  function openStatusList(type) {
    let list = [];
    let title = "";
    let description = "";
    let badgeClass = "";
    let badgeText = "";

    if (type === "reviewed") {
      list = rows.filter(row => row.reviewed === true);
      title = "Reviewed Applicants";
      description = "Applicants whose applications have been reviewed.";
      badgeClass = "reviewed";
      badgeText = "✓ Reviewed";

    } else if (type === "not-reviewed") {
      list = rows.filter(row => row.reviewed !== true);
      title = "Not Reviewed Applicants";
      description = "Applicants still awaiting their initial review.";
      badgeClass = "not-reviewed";
      badgeText = "Not reviewed";

    } else {
      list = rows.filter(
        row =>
          row.reviewed === true &&
          getApplicationStatus(row) === type
      );

      title = `${type} Applicants`;
      description = `Applicants with the ${type.toLowerCase()} decision.`;
      badgeClass = type.toLowerCase();
      badgeText = type;
    }

    $("#statusListTitle").textContent = title;

    $("#statusListSubtitle").textContent =
      `${list.length} applicant${list.length === 1 ? "" : "s"} in this list`;

    const content = $("#statusListContent");

    if (!list.length) {
      content.innerHTML = `
        <div class="status-empty">
          <h3>No applicants found</h3>
          <p>${esc(description)}</p>
        </div>
      `;
    } else {
      content.innerHTML = list.map(row => `
        <button
          class="status-applicant"
          type="button"
          data-applicant-id="${esc(row.id)}">

          <span class="status-applicant-info">
            <strong>${esc(row.title ? row.title + " " : "")}${esc(row.full_name || "Unnamed applicant")}</strong>
            <small>
              Registration #${esc(regNo(row))}
              · ${esc(row.set_year || "Set not provided")}
            </small>
          </span>

          <span class="status-applicant-badge ${esc(badgeClass)}">
            ${esc(badgeText)}
          </span>

        </button>
      `).join("");
    }

    openOverlay("#statusListModal");
  }

  $("#reviewedStatBtn").addEventListener("click", () => {
    openStatusList("reviewed");
  });

  $("#notReviewedStatBtn").addEventListener("click", () => {
    openStatusList("not-reviewed");
  });

  $("#pendingStatBtn").addEventListener("click", () => {
    openStatusList("Pending");
  });

  $("#acceptedStatBtn").addEventListener("click", () => {
    openStatusList("Accepted");
  });

  $("#rejectedStatBtn").addEventListener("click", () => {
    openStatusList("Rejected");
  });

  $("#closeStatusList").onclick = () => {
    closeOverlay("#statusListModal");
  };

  $("#statusListContent").addEventListener("click", event => {
    const button = event.target.closest("[data-applicant-id]");

    if (!button) return;

    const row = rows.find(
      applicant =>
        String(applicant.id) === button.dataset.applicantId
    );

    if (!row) return;

    closeOverlay("#statusListModal");
    openDetails(row);
  });

  /* DROPDOWN MENUS */

  function closeMenus(except = null) {
    document.querySelectorAll(".dropdown-menu").forEach(menu => {
      if (menu !== except) menu.hidden = true;
    });

    document.querySelectorAll('[aria-expanded="true"]').forEach(button => {
      if (!except || !button.parentElement.contains(except)) {
        button.setAttribute("aria-expanded", "false");
      }
    });
  }

  function toggleMenu(button, menu) {
    const shouldOpen = menu.hidden;

    closeMenus();

    menu.hidden = !shouldOpen;

    button.setAttribute(
      "aria-expanded",
      String(shouldOpen)
    );
  }

  $("#exportAllBtn").onclick = () => {
    toggleMenu($("#exportAllBtn"), $("#exportAllMenu"));
  };

  $("#downloadSelected").onclick = () => {
    if (!selectedIds.size) {
      notify("Select at least one applicant first.");
      return;
    }

    toggleMenu($("#downloadSelected"), $("#selectedExportMenu"));
  };

  /* APPLICANT ACTIONS */

  $("#applicants").addEventListener("click", async event => {
    const exportButton = event.target.closest(".individual-export");

    if (exportButton) {
      const menu = exportButton.parentElement.querySelector(
        ".dropdown-menu"
      );

      toggleMenu(exportButton, menu);
      return;
    }

    const preview = event.target.closest(".preview-files");
    const details = event.target.closest(".preview-details");
    const review = event.target.closest(".toggle-review");
    const del = event.target.closest(".delete-one");

    if (review) {
      const row = rows.find(
        item => String(item.id) === review.dataset.id
      );

      if (row) await setReviewed(row, !row.reviewed);
      return;
    }

    if (del) {
      const row = rows.find(
        item => String(item.id) === del.dataset.id
      );

      if (row) {
        confirmDelete(
          [String(row.id)],
          `Delete ${row.full_name || "this applicant"}?`
        );
      }

      return;
    }

    if (preview || details) {
      const button = preview || details;

      const row = rows.find(
        item => String(item.id) === button.dataset.id
      );

      if (!row) return;

      if (preview) {
        await openFilePreview(row);
      } else {
        openDetails(row);
      }
    }
  });

  /* SAVE REVIEW STATUS */

  async function setReviewed(row, value) {
    const { data, error } = await db
      .from("applications")
      .update({
        reviewed: value,
        application_status: "Pending"
      })
      .eq("id", row.id)
      .select("id, reviewed, application_status");

    if (error) {
      notify("Could not save review status. " + error.message);
      return;
    }

    if (!data || data.length === 0) {
      notify(
        "Review status was not changed. Supabase did not confirm the update."
      );
      return;
    }

    row.reviewed = data[0].reviewed;
    row.application_status =
      data[0].application_status || "Pending";

    render();

    notify(
      value
        ? "Applicant marked as reviewed. Decision set to Pending."
        : "Applicant marked as not reviewed. Decision reset to Pending."
    );
  }

  /* FILE PREVIEW */

  function closePreview() {
    closeOverlay("#previewModal");

    $("#previewContent").innerHTML = "";

    currentFiles = [];
    currentFileIndex = 0;
  }

  async function openFilePreview(row) {
    const files = getApplicantFiles(row);

    if (!files.length) {
      notify("This applicant has no uploaded files.");
      return;
    }

    currentFiles = [];
    currentFileIndex = 0;

    $("#previewTitle").textContent =
      row.full_name || "Applicant files";

    $("#previewSubtitle").textContent =
      `Registration #${regNo(row)}`;

    $("#previewCounter").textContent = "";

    $("#previewContent").innerHTML =
      "<p>Loading uploaded files…</p>";

    $("#prevFile").hidden = false;
    $("#nextFile").hidden = false;

    openOverlay("#previewModal");

    try {
      for (const file of files) {
        currentFiles.push({
          ...file,
          url: await signedUrl(file.path)
        });
      }

      displayPreviewFile();

    } catch (error) {
      $("#previewContent").innerHTML = `
        <p>Could not load uploaded file: ${esc(error.message)}</p>
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
      (file.type || "").startsWith("image/") ||
      ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(extension);

    const isPdf =
      file.type === "application/pdf" ||
      extension === "pdf";

    $("#previewContent").innerHTML = isImage
      ? `<img src="${esc(file.url)}" alt="${esc(file.name)}">`
      : isPdf
        ? `<iframe src="${esc(file.url)}" title="${esc(file.name)}"></iframe>`
        : `
          <div>
            <h3>${esc(file.name)}</h3>
            <p>This file format may not preview in the browser.</p>
            <a href="${esc(file.url)}" target="_blank" rel="noopener">
              Open file
            </a>
          </div>
        `;

    $("#previewCounter").textContent =
      `${currentFileIndex + 1} of ${currentFiles.length}`;

    $("#prevFile").disabled = currentFileIndex <= 0;

    $("#nextFile").disabled =
      currentFileIndex >= currentFiles.length - 1;

    $("#prevFile").hidden =
      $("#nextFile").hidden =
      currentFiles.length <= 1;
  }

  function moveFile(direction) {
    const next = currentFileIndex + direction;

    if (next >= 0 && next < currentFiles.length) {
      currentFileIndex = next;
      displayPreviewFile();
    }
  }

  $("#prevFile").onclick = () => moveFile(-1);
  $("#nextFile").onclick = () => moveFile(1);

  $("#previewContent").addEventListener("touchstart", event => {
    touchStartX = event.changedTouches[0].screenX;
  }, { passive: true });

  $("#previewContent").addEventListener("touchend", event => {
    const difference =
      event.changedTouches[0].screenX - touchStartX;

    if (Math.abs(difference) > 45) {
      moveFile(difference < 0 ? 1 : -1);
    }
  }, { passive: true });

  $("#closePreview").onclick = closePreview;

  /* APPLICANT DETAILS */

  function linkifyDetail(label, value) {
    const text = String(value ?? "").trim();

    if (!text) return "—";

    if (label === "Email") {
      return `<a href="mailto:${esc(text)}">${esc(text)}</a>`;
    }

    if (label === "WhatsApp number") {
      const number = normalisePhone(text);

      return number
        ? `<a href="https://wa.me/${esc(number)}"
             target="_blank"
             rel="noopener noreferrer">${esc(text)}</a>`
        : esc(text);
    }

    if (
      label === "Portfolio" &&
      /^https?:\/\//i.test(text)
    ) {
      return `
        <a href="${esc(text)}"
           target="_blank"
           rel="noopener noreferrer">${esc(text)}</a>
      `;
    }

    return esc(text);
  }

  function openDetails(row) {
    const fields = [
      ["Registration number", regNo(row)],
      ["Title", row.title],
      ["Full name", row.full_name],
      ["Set / graduation year", row.set_year],
      ["Gender", row.gender],
      ["Email", row.email],
      ["Phone number", row.phone],
      ["WhatsApp number", row.whatsapp],
      ["State", row.state],
      ["City", row.city || row.location],
      ["Bio", row.bio],
      ["Experience", row.experience],
      ["Portfolio", row.portfolio],
      ["Application decision", getApplicationStatus(row)],
      [
        "Review status",
        row.reviewed ? "Reviewed" : "Not reviewed"
      ],
      [
        "Skills selected",
        Array.isArray(row.skills)
          ? row.skills.join(", ")
          : row.skills
      ],
      [
        "Submitted",
        row.created_at
          ? new Date(row.created_at).toLocaleString()
          : ""
      ]
    ];

    $("#previewTitle").textContent =
      `${row.title ? row.title + " " : ""}${row.full_name || "Applicant details"}`;

    $("#previewSubtitle").textContent =
      `Registration #${regNo(row)}`;

    $("#previewContent").innerHTML = `
      <div class="details-grid">

        ${fields
          .filter(([, value]) =>
            value !== null &&
            value !== undefined &&
            String(value).trim() !== ""
          )
          .map(([label, value]) => `
            <div class="detail-card ${
              ["Bio", "Experience", "Portfolio", "Skills selected", "Submitted"].includes(label)
                ? "wide"
                : ""
            }">
              <small>${esc(label)}</small>
              <div>${linkifyDetail(label, value)}</div>
            </div>
          `)
          .join("")}

      </div>
    `;

    $("#previewCounter").textContent = "";

    $("#prevFile").hidden = true;
    $("#nextFile").hidden = true;

    openOverlay("#previewModal");
  }

  /* DELETE APPLICANTS */

  function confirmDelete(ids, message) {
    pendingDeleteIds = ids.map(String);

    $("#deleteMessage").textContent =
      message ||
      `You are about to permanently delete ${ids.length} applicant record(s). This cannot be undone.`;

    openOverlay("#deleteModal");
  }

  $("#deleteSelected").onclick = () => {
    if (!selectedIds.size) {
      notify("Select applicants you want to delete.");
      return;
    }

    confirmDelete(
      [...selectedIds],
      `You are about to permanently delete ${selectedIds.size} applicant record(s). This cannot be undone.`
    );
  };

  $("#cancelDelete").onclick = () => {
    closeOverlay("#deleteModal");
    pendingDeleteIds = [];
  };

  $("#confirmDelete").onclick = async () => {
    if (!pendingDeleteIds.length) return;

    const button = $("#confirmDelete");

    button.disabled = true;
    button.textContent = "Deleting…";

    try {
      const targets = rows.filter(row =>
        pendingDeleteIds.includes(String(row.id))
      );

      const paths = targets.flatMap(row =>
        getApplicantFiles(row).map(file => file.path)
      );

      if (paths.length) {
        const { error: storageError } = await db.storage
          .from("applicant-portfolio")
          .remove(paths);

        if (storageError) {
          throw new Error(
            "Storage deletion failed: " + storageError.message
          );
        }
      }

      const { data, error } = await db
        .from("applications")
        .delete()
        .in("id", pendingDeleteIds)
        .select("id");

      if (error) {
        throw new Error(
          "Applicant deletion failed: " + error.message
        );
      }

      const deletedIds = new Set(
        (data || []).map(row => String(row.id))
      );

      if (deletedIds.size !== pendingDeleteIds.length) {
        throw new Error(
          "Supabase did not confirm deletion of every selected applicant. Refresh the dashboard and check the records."
        );
      }

      rows = rows.filter(
        row => !deletedIds.has(String(row.id))
      );

      deletedIds.forEach(id => selectedIds.delete(id));

      closeOverlay("#deleteModal");

      pendingDeleteIds = [];
      currentPage = 1;

      render();

      notify("Applicant record(s) and uploaded files deleted.");

    } catch (error) {
      notify(error.message);

    } finally {
      button.disabled = false;
      button.textContent = "Yes, delete";
    }
  };

  /* EXPORT DATA */

  function exportFields(row) {
    const fields = [
      ["Registration Number", regNo(row)],
      ["Title", row.title],
      ["Full Name", row.full_name],
      ["Set / Graduation Year", row.set_year],
      ["Gender", row.gender],
      ["Phone Number", row.phone],
      ["WhatsApp Number", row.whatsapp],
      ["Email Address", row.email],
      ["State", row.state],
      ["City", row.city || row.location],
      [
        "Skills",
        Array.isArray(row.skills)
          ? row.skills.join(", ")
          : row.skills
      ],
      ["Bio", row.bio],
      ["Experience", row.experience],
      ["Portfolio", row.portfolio],
      ["Application Decision", getApplicationStatus(row)],
      [
        "Review Status",
        row.reviewed ? "Reviewed" : "Not reviewed"
      ]
    ];

    return fields.filter(([, value]) =>
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
    );
  }

  function exportDesign(row) {
    return `
      <section class="export-page">

        <header>
          <b>CACSF</b>
          <span>ALUMNI FELLOWSHIP<br>MEDIA UNIT</span>
        </header>

        <div class="export-heading">
          <small>VOLUNTEER APPLICATION</small>
          <h1>${esc(row.title ? row.title + " " : "")}${esc(row.full_name || "Applicant")}</h1>
          <p>Registration #${esc(regNo(row))}</p>
        </div>

        <div class="export-fields">

          ${exportFields(row)
            .filter(([key]) =>
              !["Full Name", "Registration Number"].includes(key)
            )
            .map(([key, value]) => `
              <article>
                <small>${esc(key)}</small>
                <p>${esc(value)}</p>
              </article>
            `)
            .join("")}

        </div>

        <footer>
          CACSF Alumni Fellowship Media Unit
        </footer>

      </section>
    `;
  }

  const exportCss = `
    .export-page {
      box-sizing:border-box;
      width:800px;
      min-height:1050px;
      padding:52px;
      background:#fff;
      color:#29243a;
      font-family:Arial,sans-serif;
    }

    .export-page header {
      display:flex;
      justify-content:space-between;
      align-items:center;
      border-bottom:4px solid #c7ff32;
      padding-bottom:20px;
    }

    .export-page header b {
      font-size:34px;
      color:#6415f5;
    }

    .export-page header span {
      text-align:right;
      color:#6415f5;
      font-size:12px;
      font-weight:bold;
    }

    .export-heading {
      background:#6415f5;
      color:#fff;
      padding:32px;
      margin:32px 0;
      border-radius:16px;
    }

    .export-heading small {
      color:#c7ff32;
      font-weight:bold;
      letter-spacing:2px;
    }

    .export-heading h1 {
      font-size:34px;
      margin:14px 0;
    }

    .export-fields {
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:13px;
    }

    .export-fields article {
      border:1px solid #e8e0f3;
      border-radius:10px;
      padding:14px;
      overflow-wrap:anywhere;
    }

    .export-fields small {
      color:#6415f5;
      font-weight:bold;
      text-transform:uppercase;
    }

    .export-fields p {
      font-size:14px;
      line-height:1.5;
    }

    .export-page footer {
      margin-top:40px;
      border-top:1px solid #ddd;
      padding-top:15px;
      color:#777;
      font-size:12px;
    }
  `;

  async function makeCanvas(row) {
    await exportLibraries();

    const holder = document.createElement("div");

    holder.style.cssText =
      "position:fixed;left:-10000px;top:0;width:800px";

    holder.innerHTML = `
      <style>${exportCss}</style>
      ${exportDesign(row)}
    `;

    document.body.appendChild(holder);

    try {
      return await html2canvas(
        holder.querySelector(".export-page"),
        {
          scale:2,
          backgroundColor:"#fff"
        }
      );

    } finally {
      holder.remove();
    }
  }

  async function exportPdf(
    records,
    filename = "CACSF-Alumni-Applicants.pdf"
  ) {
    await exportLibraries();

    const { jsPDF } = window.jspdf;

    const pdf = new jsPDF({
      orientation:"portrait",
      unit:"mm",
      format:"a4"
    });

    for (let index = 0; index < records.length; index++) {
      const canvas = await makeCanvas(records[index]);
      const image = canvas.toDataURL("image/png");

      const width = 190;
      const height = 280;

      const ratio = Math.min(
        width / canvas.width,
        height / canvas.height
      );

      const imageWidth = canvas.width * ratio;
      const imageHeight = canvas.height * ratio;

      if (index) pdf.addPage();

      pdf.addImage(
        image,
        "PNG",
        (210 - imageWidth) / 2,
        8,
        imageWidth,
        imageHeight
      );
    }

    pdf.save(filename);
  }

  async function runExport(format, records) {
    if (!records.length) {
      notify("There are no applicants to export.");
      return;
    }

    const stem = records.length === 1
      ? `CACSF-${safeName(records[0].full_name)}-${regNo(records[0])}`
      : "CACSF-Alumni-Applicants";

    if (format === "excel") {
      await exportLibraries();

      const data = records.map(row =>
        Object.fromEntries(exportFields(row))
      );

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "Applicants"
      );

      XLSX.writeFile(workbook, `${stem}.xlsx`);

    } else if (format === "word") {
      const sections = records.map(row => `
        <h2>
          ${esc(row.title ? row.title + " " : "")}${esc(row.full_name || "Applicant")}
          — #${esc(regNo(row))}
        </h2>

        <table>
          ${exportFields(row).map(([key, value]) => `
            <tr>
              <th>${esc(key)}</th>
              <td>${esc(value)}</td>
            </tr>
          `).join("")}
        </table>
      `);

      const doc = `
        <!doctype html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family:Arial;
              padding:25px;
              color:#29243a;
            }

            h1,h2 {
              color:#6415f5;
            }

            table {
              border-collapse:collapse;
              width:100%;
              margin-bottom:30px;
            }

            th,td {
              border:1px solid #ddd;
              padding:9px;
              text-align:left;
              vertical-align:top;
            }

            th {
              background:#f0eaff;
              width:32%;
            }
          </style>
        </head>

        <body>
          <h1>CACSF Alumni Fellowship Media Unit</h1>
          <h2>Volunteer Applicants</h2>
          ${sections.join("")}
        </body>
        </html>
      `;

      downloadBlob(
        new Blob(["\ufeff", doc], {
          type:"application/msword"
        }),
        `${stem}.doc`
      );

    } else if (format === "image") {
      if (records.length > 1) {
        await exportPdf(records);
      } else {
        const canvas = await makeCanvas(records[0]);

        const blob = await new Promise(resolve => {
          canvas.toBlob(resolve, "image/png");
        });

        if (!blob) {
          throw new Error("Could not create PNG image.");
        }

        downloadBlob(blob, `${stem}.png`);
      }

    } else if (format === "pdf") {
      await exportPdf(records, `${stem}.pdf`);
    }

    closeMenus();
    notify("Export prepared successfully.");
  }

  document.addEventListener("click", async event => {
    const choice = event.target.closest("[data-export]");

    if (choice) {
      const scope = choice.dataset.scope;
      const id = choice.dataset.id;

      const records = id
        ? rows.filter(row => String(row.id) === String(id))
        : scope === "selected"
          ? selectedRows()
          : rows;

      closeMenus();

      try {
        await runExport(choice.dataset.export, records);

      } catch (error) {
        notify("Export failed: " + error.message);
      }

      return;
    }

    if (!event.target.closest(".dropdown-wrap")) {
      closeMenus();
    }
  });

  /* MODAL CLOSE CONTROLS */

  document.querySelectorAll(".overlay-modal").forEach(modal => {
    modal.addEventListener("click", event => {
      if (event.target !== modal) return;

      if (modal.id === "previewModal") {
        closePreview();

      } else if (modal.id === "deleteModal") {
        closeOverlay("#deleteModal");
        pendingDeleteIds = [];

      } else if (modal.id === "statusListModal") {
        closeOverlay("#statusListModal");
      }
    });
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      if (!$("#previewModal").hidden) closePreview();

      if (!$("#deleteModal").hidden) {
        closeOverlay("#deleteModal");
        pendingDeleteIds = [];
      }

      if (!$("#statusListModal").hidden) {
        closeOverlay("#statusListModal");
      }
    }

    if (!$("#previewModal").hidden) {
      if (event.key === "ArrowLeft") moveFile(-1);
      if (event.key === "ArrowRight") moveFile(1);
    }
  });

  /* SIGN OUT */

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

  /* START ADMIN DASHBOARD */

  if (cloud) {
    checkAdminSession();
  } else {
    showLogin(
      "Supabase is not configured. Live administrator sign-in is unavailable."
    );
  }

})();
