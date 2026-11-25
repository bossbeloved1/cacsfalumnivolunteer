/* CACSF ALUMNI FELLOWSHIP MEDIA UNIT — ADMIN DASHBOARD */
(() => {
  "use strict";

  const config = window.CACSF_CONFIG || {};
  const cloud = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);
  const db = cloud ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;

  const $ = s => document.querySelector(s);
  const PAGE_SIZE = 10;
  let rows = [], selectedIds = new Set(), currentPage = 1;
  let currentFiles = [], currentFileIndex = 0, pendingDeleteIds = [];
  let adminRole = null, toastTimer = null, touchStartX = 0;

  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[c]);
  const pad = n => String(n).padStart(3, "0");
  const regNo = row => row.registration_number == null ? "Pending" : pad(row.registration_number);
  const safeName = value => String(value || "applicant").replace(/[^a-z0-9-_]/gi, "_").replace(/_+/g, "_");
  function notify(message) {
    const toast = $("#adminToast");
    if (!toast) return alert(message);
    toast.textContent = message; toast.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 3600);
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(s => s.src === src);
      if (existing?.dataset.loaded === "true") return resolve();
      const script = existing || Object.assign(document.createElement("script"), {src});
      script.addEventListener("load", () => { script.dataset.loaded = "true"; resolve(); }, {once:true});
      script.addEventListener("error", () => reject(new Error("Could not load an export library.")), {once:true});
      if (!existing) document.head.appendChild(script);
    });
  }
  async function exportLibraries() {
    await loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  }
  function showLogin(message = "") { $("#login").hidden = false; $("#dashboard").hidden = true; $("#loginHint").textContent = message; }
  function showDashboard() { $("#login").hidden = true; $("#dashboard").hidden = false; render(); }

  async function authoriseAdmin() {
    $("#loginHint").textContent = "Verifying administrator access…";
    const {data: admin, error} = await db.from("media_admins").select("role").single();
    if (error || !admin) {
      await db.auth.signOut();
      showLogin("This account is not authorised to access the CACSF Media Unit dashboard.");
      return;
    }
    adminRole = admin.role; window.CACSF_ADMIN_ROLE = adminRole;
    await loadApplicants();
  }
  async function checkAdminSession() {
    if (!cloud) return showLogin("Supabase is not configured. Live administrator sign-in is unavailable.");
    showLogin("Restoring your administrator session…");
    try {
      const {data, error} = await db.auth.getSession();
      if (error) throw error;
      if (!data.session) return showLogin("Please sign in to access the admin dashboard.");
      await authoriseAdmin();
    } catch (error) { showLogin("Could not restore your session: " + error.message); }
  }
  $("#loginBtn").addEventListener("click", async () => {
    if (!cloud) return showLogin("Supabase is not configured.");
    const email = $("#email").value.trim(), password = $("#password").value, button = $("#loginBtn");
    if (!email || !password) return $("#loginHint").textContent = "Enter your email address and password.";
    button.disabled = true; button.textContent = "Signing in…"; $("#loginHint").textContent = "Checking administrator access…";
    try {
      const {error} = await db.auth.signInWithPassword({email, password});
      if (error) throw error;
      await authoriseAdmin();
    } catch (error) { $("#loginHint").textContent = error.message; }
    finally { button.disabled = false; button.textContent = "Sign in"; }
  });
  $("#password").addEventListener("keydown", e => { if (e.key === "Enter") $("#loginBtn").click(); });
  $("#togglePassword").addEventListener("click", () => {
    const input = $("#password"), visible = input.type === "password";
    input.type = visible ? "text" : "password";
    $("#togglePassword").textContent = visible ? "Hide" : "Show";
    $("#togglePassword").setAttribute("aria-label", visible ? "Hide password" : "Show password");
    $("#togglePassword").setAttribute("aria-pressed", String(visible));
  });
  if (cloud) db.auth.onAuthStateChange(event => {
    if (event === "SIGNED_OUT") { rows = []; selectedIds.clear(); adminRole = null; showLogin("Your administrator session has ended."); }
  });

  async function loadApplicants() {
    $("#loginHint").textContent = "Loading applicants…";
    const {data, error} = await db.from("applications").select("*").order("registration_number", {ascending:true});
    if (error) {
      $("#login").hidden = true; $("#dashboard").hidden = false;
      $("#applicants").innerHTML = `<div class="empty"><h3>Unable to load applicants</h3><p>${esc(error.message)}</p><button class="outline" id="retryLoad">Try again</button></div>`;
      $("#retryLoad").onclick = loadApplicants; return;
    }
    rows = data || []; selectedIds.clear(); currentPage = 1; showDashboard();
  }

  function normalisePhone(number) {
    let value = String(number || "").replace(/\D/g, "");
    if (value.startsWith("0")) value = "234" + value.slice(1);
    else if (!value.startsWith("234") && value.length === 10) value = "234" + value;
    return value;
  }
  function contactLinks(row) {
    const wa = normalisePhone(row.whatsapp || "");
    return `<div class="contact-link">${wa ? `<a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener noreferrer">WhatsApp: ${esc(row.whatsapp)}</a>` : `<span>WhatsApp: —</span>`}</div>`;
  }
  function getApplicantFiles(row) {
    return Array.isArray(row.portfolio_files) ? row.portfolio_files.filter(f => f?.path).map(f => ({
      name:f.name || "Uploaded work sample", path:f.path, type:f.type || ""
    })) : [];
  }
  async function signedUrl(path) {
    const {data,error} = await db.storage.from("applicant-portfolio").createSignedUrl(path, 3600);
    if (error) throw error; return data.signedUrl;
  }

  function applicantCard(row) {
    const id = String(row.id), checked = selectedIds.has(id) ? "checked" : "";
    const skills = Array.isArray(row.skills) ? row.skills : [];
    const files = getApplicantFiles(row);
    const reviewed = row.reviewed === true;
    const portfolio = row.portfolio ? `<a href="${esc(row.portfolio)}" target="_blank" rel="noopener noreferrer">${esc(row.portfolio)}</a>` : "—";
    return `<article class="applicant" data-id="${esc(id)}">
      <div class="applicant-head">
        <div class="applicant-title">
          <label class="round-select" title="Select applicant"><input type="checkbox" class="applicant-check" data-id="${esc(id)}" ${checked}><span></span></label>
          <div><h3>${esc(row.full_name || "Unnamed applicant")}</h3><span class="applicant-number">REGISTRATION #${esc(regNo(row))}</span></div>
        </div>
        <span class="review-button ${reviewed ? "is-reviewed" : "is-unreviewed"}">${reviewed ? "✓ Reviewed" : "Not reviewed"}</span>
      </div>
      <div class="meta">
        Set: ${esc(row.set_year || "—")}<br>
        Location: ${esc(row.city || row.location || "—")}${row.state ? ", " + esc(row.state) : ""}<br>
        Email: ${row.email ? `<a href="mailto:${esc(row.email)}">${esc(row.email)}</a>` : "—"}<br>
        Phone: ${esc(row.phone || "—")}<br>
        ${contactLinks(row)}
        Submitted: ${row.created_at ? esc(new Date(row.created_at).toLocaleString()) : "—"}
      </div>
      ${skills.length ? `<div class="tags">${skills.map(s => `<span class="tag">${esc(s)}</span>`).join("")}</div>` : ""}
      <p><b>Bio:</b> ${esc(row.bio || "—")}</p>
      <p><b>Experience:</b> ${esc(row.experience || "—")}</p>
      <p><b>Portfolio:</b> ${portfolio}</p>
      <p><b>Uploaded work samples:</b> ${files.length ? `${files.length} file(s) uploaded` : "None"}</p>
      <div class="applicant-actions">
        ${files.length ? `<button class="applicant-action preview-files" data-id="${esc(id)}" type="button">Preview uploaded files</button>` : ""}
        <button class="applicant-action preview-details" data-id="${esc(id)}" type="button">View applicant details</button>
        <button class="review-button ${reviewed ? "is-unreviewed" : "is-reviewed"} toggle-review" data-id="${esc(id)}" type="button">${reviewed ? "Mark as not reviewed" : "Mark as reviewed"}</button>
        <div class="dropdown-wrap">
          <button class="applicant-action individual-export" data-id="${esc(id)}" type="button" aria-expanded="false">Download ⌄</button>
          <div class="dropdown-menu" hidden>
            <button data-export="excel" data-id="${esc(id)}">Microsoft Excel (.xlsx)</button>
            <button data-export="word" data-id="${esc(id)}">Microsoft Word (.doc)</button>
            <button data-export="image" data-id="${esc(id)}">Designed applicant image</button>
            <button data-export="pdf" data-id="${esc(id)}">PDF document</button>
          </div>
        </div>
        <button class="applicant-action delete-one" data-id="${esc(id)}" type="button">Delete applicant</button>
      </div>
    </article>`;
  }

  function filteredRows() {
    const q = ($("#search").value || "").trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => [r.full_name,r.registration_number,r.set_year,r.email,r.phone,r.whatsapp,r.state,r.city,r.location,r.bio,r.experience,...(r.skills || [])].join(" ").toLowerCase().includes(q));
  }
  function selectedRows() { return rows.filter(r => selectedIds.has(String(r.id))); }
  function renderPagination(total, totalPages, start, count) {
    $("#pagination").hidden = total <= PAGE_SIZE;
    $("#resultInfo").textContent = total ? `Showing ${start+1}–${start+count} of ${total} applicants` : "No applicants";
    $("#paginationInfo").textContent = `Page ${currentPage} of ${totalPages}`;
    $("#prevPage").disabled = currentPage <= 1; $("#nextPage").disabled = currentPage >= totalPages;
    const box = $("#pageNumbers"); box.innerHTML = "";
    for (let p=1;p<=totalPages;p++) {
      const b=document.createElement("button"); b.className="page-btn"+(p===currentPage?" active":""); b.textContent=p;
      b.onclick=()=>{currentPage=p;render();window.scrollTo({top:0,behavior:"smooth"});}; box.appendChild(b);
    }
    $("#pageInput").max=totalPages; $("#pageInput").value=currentPage;
  }
  function render() {
    const filtered=filteredRows(), pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
    currentPage=Math.min(currentPage,pages);
    const start=(currentPage-1)*PAGE_SIZE, pageRows=filtered.slice(start,start+PAGE_SIZE);
    $("#count").textContent=rows.length;
    $("#reviewedCount").textContent=rows.filter(r=>r.reviewed===true).length;
    $("#selectedCount").textContent=selectedIds.size;
    $("#downloadSelected").disabled=!selectedIds.size;
    $("#deleteSelected").disabled=!selectedIds.size;
    $("#applicants").innerHTML=filtered.length?pageRows.map(applicantCard).join(""):'<div class="empty">No applicants found.</div>';
    renderPagination(filtered.length,pages,start,pageRows.length);
    $("#selectAll").checked=pageRows.length>0&&pageRows.every(r=>selectedIds.has(String(r.id)));
    $("#selectAll").indeterminate=pageRows.some(r=>selectedIds.has(String(r.id)))&&!$("#selectAll").checked;
  }
  $("#search").addEventListener("input",()=>{currentPage=1;render();});
  $("#prevPage").onclick=()=>{if(currentPage>1){currentPage--;render();}};
  $("#nextPage").onclick=()=>{if(currentPage<Math.ceil(filteredRows().length/PAGE_SIZE)){currentPage++;render();}};
  $("#goPage").onclick=()=>{const n=Number($("#pageInput").value),max=Math.max(1,Math.ceil(filteredRows().length/PAGE_SIZE));if(!Number.isInteger(n)||n<1||n>max)return notify(`Enter a page number between 1 and ${max}.`);currentPage=n;render();};
  $("#pageInput").addEventListener("keydown",e=>{if(e.key==="Enter")$("#goPage").click();});
  $("#applicants").addEventListener("change",e=>{
    if(!e.target.matches(".applicant-check"))return;
    const id=String(e.target.dataset.id); e.target.checked?selectedIds.add(id):selectedIds.delete(id); render();
  });
  $("#selectAll").onchange=e=>{
    const list=filteredRows().slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
    list.forEach(r=>e.target.checked?selectedIds.add(String(r.id)):selectedIds.delete(String(r.id))); render();
  };

  function closeMenus(except=null) {
    document.querySelectorAll(".dropdown-menu").forEach(m=>{if(m!==except)m.hidden=true;});
    document.querySelectorAll('[aria-expanded="true"]').forEach(b=>{if(!except || !b.parentElement.contains(except))b.setAttribute("aria-expanded","false");});
  }
  function toggleMenu(button,menu) {
    const open=menu.hidden; closeMenus(); menu.hidden=!open; button.setAttribute("aria-expanded",String(open));
  }
  $("#exportAllBtn").onclick=()=>toggleMenu($("#exportAllBtn"),$("#exportAllMenu"));
  $("#downloadSelected").onclick=()=>{
    if(!selectedIds.size)return notify("Select at least one applicant first.");
    toggleMenu($("#downloadSelected"),$("#selectedExportMenu"));
  };
  $("#applicants").addEventListener("click",async e=>{
    const exportBtn=e.target.closest(".individual-export");
    if(exportBtn){const menu=exportBtn.parentElement.querySelector(".dropdown-menu");toggleMenu(exportBtn,menu);return;}
    const preview=e.target.closest(".preview-files"), details=e.target.closest(".preview-details"), review=e.target.closest(".toggle-review"), del=e.target.closest(".delete-one");
    if(review){const row=rows.find(r=>String(r.id)===review.dataset.id);if(row)await setReviewed(row,!row.reviewed);return;}
    if(del){const row=rows.find(r=>String(r.id)===del.dataset.id);if(row)confirmDelete([String(row.id)],`Delete ${row.full_name || "this applicant"}?`);return;}
    if(preview||details){const row=rows.find(r=>String(r.id)===(preview||details).dataset.id);if(!row)return;preview?await openFilePreview(row):openDetails(row);}
  });

  async function setReviewed(row,value) {
    const {error}=await db.from("applications").update({reviewed:value}).eq("id",row.id);
    if(error){notify("Could not save review status. Check the applications UPDATE permission and reviewed column. "+error.message);return;}
    row.reviewed=value;render();notify(value?"Applicant marked as reviewed.":"Applicant marked as not reviewed.");
  }

  function openOverlay(id){$(id).hidden=false;}
  function closePreview(){ $("#previewModal").hidden=true;$("#previewContent").innerHTML="";currentFiles=[];currentFileIndex=0; }
  async function openFilePreview(row) {
    const files=getApplicantFiles(row); if(!files.length)return notify("This applicant has no uploaded files.");
    currentFiles=[];currentFileIndex=0;$("#previewTitle").textContent=row.full_name||"Applicant files";
    $("#previewSubtitle").textContent=`Registration #${regNo(row)}`;$("#previewCounter").textContent="";
    $("#previewContent").innerHTML='<p>Loading uploaded files…</p>';openOverlay("#previewModal");
    try{for(const f of files)currentFiles.push({...f,url:await signedUrl(f.path)});displayPreviewFile();}
    catch(error){$("#previewContent").innerHTML=`<p>Could not load uploaded file: ${esc(error.message)}</p>`;}
  }
  function displayPreviewFile() {
    const f=currentFiles[currentFileIndex];if(!f)return;
    const ext=f.name.split(".").pop().toLowerCase();
    const img=(f.type||"").startsWith("image/")||["jpg","jpeg","png","gif","webp","bmp"].includes(ext);
    const pdf=f.type==="application/pdf"||ext==="pdf";
    $("#previewContent").innerHTML=img?`<img src="${esc(f.url)}" alt="${esc(f.name)}">`:pdf?`<iframe src="${esc(f.url)}" title="${esc(f.name)}"></iframe>`:`<div><h3>${esc(f.name)}</h3><p>This file format may not preview in the browser.</p><a href="${esc(f.url)}" target="_blank" rel="noopener">Open file</a></div>`;
    $("#previewCounter").textContent=`${currentFileIndex+1} of ${currentFiles.length}`;
    $("#prevFile").disabled=currentFileIndex<=0;$("#nextFile").disabled=currentFileIndex>=currentFiles.length-1;
    $("#prevFile").hidden=$("#nextFile").hidden=currentFiles.length<=1;
  }
  function moveFile(direction){const next=currentFileIndex+direction;if(next>=0&&next<currentFiles.length){currentFileIndex=next;displayPreviewFile();}}
  $("#prevFile").onclick=()=>moveFile(-1);$("#nextFile").onclick=()=>moveFile(1);
  $("#previewContent").addEventListener("touchstart",e=>{touchStartX=e.changedTouches[0].screenX;},{passive:true});
  $("#previewContent").addEventListener("touchend",e=>{const dx=e.changedTouches[0].screenX-touchStartX;if(Math.abs(dx)>45)moveFile(dx<0?1:-1);},{passive:true});
  document.addEventListener("keydown",e=>{
    if(!$("#previewModal").hidden){if(e.key==="Escape")closePreview();if(e.key==="ArrowLeft")moveFile(-1);if(e.key==="ArrowRight")moveFile(1);}
    if(!$("#deleteModal").hidden&&e.key==="Escape")$("#deleteModal").hidden=true;
  });
  $("#closePreview").onclick=closePreview;

  function linkifyDetail(label,value) {
    const v=String(value??"").trim();if(!v)return "—";
    if(label==="Email")return `<a href="mailto:${esc(v)}">${esc(v)}</a>`;
    if(label==="WhatsApp number"){const n=normalisePhone(v);return n?`<a href="https://wa.me/${esc(n)}" target="_blank" rel="noopener noreferrer">${esc(v)}</a>`:esc(v);}
    if(label==="Portfolio" && /^https?:\/\//i.test(v))return `<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">${esc(v)}</a>`;
    return esc(v);
  }
  function openDetails(row) {
    const fields=[
      ["Registration number",regNo(row)],["Full name",row.full_name],["Set / graduation year",row.set_year],
      ["Email",row.email],["Phone number",row.phone],["WhatsApp number",row.whatsapp],
      ["State",row.state],["City",row.city||row.location],["Skills",Array.isArray(row.skills)?row.skills.join(", "):row.skills],
      ["Bio",row.bio],["Experience",row.experience],["Portfolio",row.portfolio],
      ["Review status",row.reviewed?"Reviewed":"Not reviewed"],["Submitted",row.created_at?new Date(row.created_at).toLocaleString():""]
    ];
    $("#previewTitle").textContent=row.full_name||"Applicant details";$("#previewSubtitle").textContent=`Registration #${regNo(row)}`;
    $("#previewContent").innerHTML=`<div class="details-grid">${fields.filter(([,v])=>v!==null&&v!==undefined&&String(v).trim()!=="").map(([k,v])=>`<div class="detail-card ${["Bio","Experience","Portfolio"].includes(k)?"wide":""}"><small>${esc(k)}</small><div>${linkifyDetail(k,v)}</div></div>`).join("")}</div>`;
    $("#previewCounter").textContent="";$("#prevFile").hidden=true;$("#nextFile").hidden=true;openOverlay("#previewModal");
  }

  function confirmDelete(ids,message) {
    pendingDeleteIds=ids.map(String);$("#deleteMessage").textContent=message||`You are about to permanently delete ${ids.length} applicant record(s). This cannot be undone.`;
    openOverlay("#deleteModal");
  }
  $("#deleteSelected").onclick=()=>{if(!selectedIds.size)return notify("Select applicants you want to delete.");confirmDelete([...selectedIds],`You are about to permanently delete ${selectedIds.size} applicant record(s). This cannot be undone.`);};
  $("#cancelDelete").onclick=()=>{$("#deleteModal").hidden=true;pendingDeleteIds=[];};
  $("#confirmDelete").onclick=async()=>{
    if(!pendingDeleteIds.length)return;
    const button=$("#confirmDelete");button.disabled=true;button.textContent="Deleting…";
    try{
      const targets=rows.filter(r=>pendingDeleteIds.includes(String(r.id)));
      const paths=targets.flatMap(r=>getApplicantFiles(r).map(f=>f.path));
      if(paths.length){const {error}=await db.storage.from("applicant-portfolio").remove(paths);if(error)throw new Error("Storage deletion failed (check bucket DELETE policy): "+error.message);}
      const {error}=await db.from("applications").delete().in("id",pendingDeleteIds);
      if(error)throw new Error("Applicant deletion failed (check applications DELETE policy): "+error.message);
      rows=rows.filter(r=>!pendingDeleteIds.includes(String(r.id)));pendingDeleteIds.forEach(id=>selectedIds.delete(id));
      $("#deleteModal").hidden=true;pendingDeleteIds=[];currentPage=1;render();notify("Applicant record(s) deleted.");
    }catch(error){notify(error.message);}
    finally{button.disabled=false;button.textContent="Yes, delete";}
  };

  function exportFields(row) {
    const fields=[["Registration Number",regNo(row)],["Full Name",row.full_name],["Set / Graduation Year",row.set_year],
      ["Phone Number",row.phone],["WhatsApp Number",row.whatsapp],["Email Address",row.email],["State",row.state],
      ["City",row.city||row.location],["Skills",Array.isArray(row.skills)?row.skills.join(", "):row.skills],
      ["Bio",row.bio],["Experience",row.experience],["Portfolio",row.portfolio],["Review Status",row.reviewed?"Reviewed":"Not reviewed"]];
    return fields.filter(([,v])=>v!==null&&v!==undefined&&String(v).trim()!=="");
  }
  function exportDesign(row) {
    return `<section class="export-page"><header><b>CACSF</b><span>ALUMNI FELLOWSHIP<br>MEDIA UNIT</span></header><div class="export-heading"><small>VOLUNTEER APPLICATION</small><h1>${esc(row.full_name||"Applicant")}</h1><p>Registration #${esc(regNo(row))}</p></div><div class="export-fields">${exportFields(row).filter(([k])=>!["Full Name","Registration Number"].includes(k)).map(([k,v])=>`<article><small>${esc(k)}</small><p>${esc(v)}</p></article>`).join("")}</div><footer>CACSF Alumni Fellowship Media Unit</footer></section>`;
  }
  const exportCss=`.export-page{box-sizing:border-box;width:800px;min-height:1050px;padding:52px;background:#fff;color:#29243a;font-family:Arial,sans-serif}.export-page header{display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid #c7ff32;padding-bottom:20px}.export-page header b{font-size:34px;color:#6415f5}.export-page header span{text-align:right;color:#6415f5;font-size:12px;font-weight:bold}.export-heading{background:#6415f5;color:#fff;padding:32px;margin:32px 0;border-radius:16px}.export-heading small{color:#c7ff32;font-weight:bold;letter-spacing:2px}.export-heading h1{font-size:34px;margin:14px 0}.export-fields{display:grid;grid-template-columns:1fr 1fr;gap:13px}.export-fields article{border:1px solid #e8e0f3;border-radius:10px;padding:14px;overflow-wrap:anywhere}.export-fields small{color:#6415f5;font-weight:bold;text-transform:uppercase}.export-fields p{font-size:14px;line-height:1.5}.export-page footer{margin-top:40px;border-top:1px solid #ddd;padding-top:15px;color:#777;font-size:12px}`;
  async function makeCanvas(row) {
    await exportLibraries();const holder=document.createElement("div");holder.style.cssText="position:fixed;left:-10000px;top:0;width:800px";
    holder.innerHTML=`<style>${exportCss}</style>${exportDesign(row)}`;document.body.appendChild(holder);
    try{return await html2canvas(holder.querySelector(".export-page"),{scale:2,backgroundColor:"#fff"});}finally{holder.remove();}
  }
  async function exportPdf(records,filename="CACSF-Alumni-Applicants.pdf") {
    await exportLibraries();const {jsPDF}=window.jspdf;const pdf=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
    for(let i=0;i<records.length;i++){const canvas=await makeCanvas(records[i]);const img=canvas.toDataURL("image/png");const w=190,h=280,ratio=Math.min(w/canvas.width,h/canvas.height),iw=canvas.width*ratio,ih=canvas.height*ratio;if(i)pdf.addPage();pdf.addImage(img,"PNG",(210-iw)/2,8,iw,ih);}
    pdf.save(filename);
  }
  async function runExport(format,records) {
    if(!records.length)return notify("There are no applicants to export.");
    const stem=records.length===1?`CACSF-${safeName(records[0].full_name)}-${regNo(records[0])}`:"CACSF-Alumni-Applicants";
    if(format==="excel"){
      await exportLibraries();const data=records.map(r=>Object.fromEntries(exportFields(r)));const ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Applicants");XLSX.writeFile(wb,`${stem}.xlsx`);
    } else if(format==="word"){
      const sections=records.map(r=>`<h2>${esc(r.full_name||"Applicant")} — #${esc(regNo(r))}</h2><table>${exportFields(r).map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`);
      const doc=`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:25px;color:#29243a}h1,h2{color:#6415f5}table{border-collapse:collapse;width:100%;margin-bottom:30px}th,td{border:1px solid #ddd;padding:9px;text-align:left;vertical-align:top}th{background:#f0eaff;width:32%}</style></head><body><h1>CACSF Alumni Fellowship Media Unit</h1><h2>Volunteer Applicants</h2>${sections}</body></html>`;
      downloadBlob(new Blob(["\ufeff",doc],{type:"application/msword"}),`${stem}.doc`);
    } else if(format==="image"){
      if(records.length>1)return exportPdf(records);
      const canvas=await makeCanvas(records[0]);const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));if(!blob)throw new Error("Could not create PNG image.");downloadBlob(blob,`${stem}.png`);
    } else if(format==="pdf") await exportPdf(records,`${stem}.pdf`);
    closeMenus();notify("Export prepared successfully.");
  }
  document.addEventListener("click",async e=>{
    const choice=e.target.closest("[data-export]");
    if(choice){
      const scope=choice.dataset.scope, id=choice.dataset.id;
      const records=id?rows.filter(r=>String(r.id)===String(id)):scope==="selected"?selectedRows():rows;
      closeMenus();
      try{await runExport(choice.dataset.export,records);}catch(error){notify("Export failed: "+error.message);}
      return;
    }
    if(!e.target.closest(".dropdown-wrap"))closeMenus();
  });

  document.querySelectorAll(".overlay-modal").forEach(modal=>{
    modal.addEventListener("click",e=>{if(e.target!==modal)return;modal.hidden=true;if(modal.id==="previewModal")closePreview();if(modal.id==="deleteModal")pendingDeleteIds=[];});
  });
  $("#logout").onclick=async()=>{
    if(db){const {error}=await db.auth.signOut();if(error)return notify("Could not sign out: "+error.message);}
    rows=[];selectedIds.clear();adminRole=null;$("#email").value="";$("#password").value="";showLogin("You have signed out.");
  };
  if(cloud)checkAdminSession();else showLogin("Supabase is not configured. Live administrator sign-in is unavailable.");
})();
