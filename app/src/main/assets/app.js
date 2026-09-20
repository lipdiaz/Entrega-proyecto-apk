(() => {
  const IS_ANDROID = typeof window.Android !== "undefined" && window.Android.isAndroid?.();
  const LS = {
    people: "bunker_people_v1",
    access: "bunker_access_v1",
    admins: "bunker_admins_v1",
    reportSettings: "bunker_report_settings_v1"
  };

  const MOTIVES = [
    "Mantención",
    "Limpieza",
    "Visita técnica",
    "Proveedor",
    "Médico externo",
    "Alumno / Interno",
    "Acompañamiento",
    "Inspección",
    "Emergencia",
    "Otro"
  ];

  const defaultPeople = [
    { id: crypto.randomUUID(), rut: "11111111-1", name: "Ana Pérez", role: "Tecnólogo Médico", authorized: true, active: true },
    { id: crypto.randomUUID(), rut: "22222222-2", name: "Carlos Soto", role: "Físico Médico", authorized: true, active: true },
    { id: crypto.randomUUID(), rut: "33333333-3", name: "María González", role: "Enfermera", authorized: true, active: true }
  ];

  const defaultAdmins = [];

  const state = {
    view: "kiosk",
    adminTab: "dashboard",
    admin: null,
    people: load(LS.people, defaultPeople),
    access: load(LS.access, []),
    admins: load(LS.admins, defaultAdmins),
    reportSettings: load(LS.reportSettings, {
      enabled: false,
      recipient: "",
      host: "",
      port: "587",
      security: "STARTTLS",
      sender: "",
      username: "",
      scheduleType: "last-day",
      dayOfMonth: "1",
      weekday: "1",
      time: "08:00",
      pdf: true,
      excel: true
    }),
    lookup: null,
    lookupRut: "",
    message: null,
    modal: null
  };

  if (state.admins.length === 0) state.view = "setup";

  function load(key, fallback) {
    try {
      const raw = IS_ANDROID ? window.Android.getItem(key) : localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function save() {
    const values = {
      [LS.people]: state.people,
      [LS.access]: state.access,
      [LS.admins]: state.admins,
      [LS.reportSettings]: state.reportSettings
    };
    Object.entries(values).forEach(([key, value]) => {
      const json = JSON.stringify(value);
      if (IS_ANDROID) window.Android.setItem(key, json);
      else localStorage.setItem(key, json);
    });
  }

  function normalizeRut(value) {
    return String(value || "")
      .replace(/\./g, "")
      .replace(/\s/g, "")
      .toUpperCase();
  }

  function formatRut(value) {
    let rut = normalizeRut(value).replace(/-/g, "");
    if (rut.length < 2) return rut;
    const dv = rut.slice(-1);
    let body = rut.slice(0, -1);
    body = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${body}-${dv}`;
  }

  function validRut(value) {
    const rut = normalizeRut(value);
    if (!/^\d{7,8}-[\dK]$/.test(rut)) return false;
    const [body, dv] = rut.split("-");
    let sum = 0;
    let mul = 2;
    for (let i = body.length - 1; i >= 0; i--) {
      sum += Number(body[i]) * mul;
      mul = mul === 7 ? 2 : mul + 1;
    }
    const res = 11 - (sum % 11);
    const expected = res === 11 ? "0" : res === 10 ? "K" : String(res);
    return dv === expected;
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function humanDate(iso) {
    return new Date(iso).toLocaleString("es-CL", {
      dateStyle: "short",
      timeStyle: "short"
    });
  }

  function duration(entry, exit) {
    if (!exit) return "En curso";
    const ms = new Date(exit) - new Date(entry);
    const totalMin = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h ? `${h}h ${m}m` : `${m} min`;
  }

  function activeRecordForRut(rut) {
    const normalized = normalizeRut(rut);
    return [...state.access]
      .reverse()
      .find(r => normalizeRut(r.rut) === normalized && !r.exitAt);
  }

  function peopleInside() {
    return state.access.filter(r => !r.exitAt);
  }

  function recordEntry(person, type, motive = "", organization = "") {
    const rec = {
      id: crypto.randomUUID(),
      personId: person.id || null,
      rut: normalizeRut(person.rut),
      name: person.name,
      role: person.role || "",
      type,
      motive,
      organization,
      entryAt: nowISO(),
      exitAt: null
    };
    state.access.push(rec);
    save();
    state.message = {
      type: "success",
      title: "Entrada registrada",
      body: `${person.name} · ${humanDate(rec.entryAt)}`
    };
    state.lookup = null;
    state.lookupRut = "";
    render();
  }

  function recordExit(rut) {
    const active = activeRecordForRut(rut);
    if (!active) {
      state.message = {
        type: "error",
        title: "No hay una entrada abierta",
        body: "Esta persona no figura actualmente dentro del búnker."
      };
      render();
      return;
    }
    active.exitAt = nowISO();
    save();
    state.message = {
      type: "success",
      title: "Salida registrada",
      body: `${active.name} · ${humanDate(active.exitAt)}`
    };
    state.lookup = null;
    state.lookupRut = "";
    render();
  }

  function lookupRut() {
    const rutInput = document.querySelector("#rutInput");
    const rut = normalizeRut(rutInput.value);
    state.lookupRut = rut;

    if (!validRut(rut)) {
      state.lookup = null;
      state.message = {
        type: "error",
        title: "RUT inválido",
        body: "Revise el formato y dígito verificador."
      };
      render();
      return;
    }

    const person = state.people.find(p => normalizeRut(p.rut) === rut && p.active);
    const active = activeRecordForRut(rut);
    state.message = null;
    state.lookup = active
      ? { kind: "inside", person: person || active, active }
      : person
      ? { kind: person.authorized ? "authorized" : "not-authorized", person }
      : { kind: "unknown", rut };
    render();
  }

  function escapeHtml(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function kioskView() {
    const inside = peopleInside();
    const today = new Date().toDateString();
    const todayRows = state.access.filter(r => new Date(r.entryAt).toDateString() === today);
    const externalToday = todayRows.filter(r => r.type === "Externo").length;

    let lookupHtml = "";
    if (state.lookup) {
      if (state.lookup.kind === "inside") {
        const active = state.lookup.active;
        lookupHtml = `
          <div class="result success">
            <strong>${escapeHtml(active.name)}</strong>
            <div class="muted">Entrada registrada: ${humanDate(active.entryAt)}</div>
            <p><span class="badge green">Actualmente dentro</span></p>
            <button class="btn btn-danger btn-block" data-action="exit" data-rut="${escapeHtml(active.rut)}">Registrar salida</button>
          </div>`;
      } else if (state.lookup.kind === "authorized") {
        const p = state.lookup.person;
        const active = activeRecordForRut(p.rut);
        lookupHtml = `
          <div class="result success">
            <strong>${escapeHtml(p.name)}</strong>
            <div class="muted">${escapeHtml(p.role || "Personal autorizado")}</div>
            <p><span class="badge green">Autorizado</span></p>
            ${
              active
                ? `<button class="btn btn-danger btn-block" data-action="exit" data-rut="${escapeHtml(p.rut)}">Registrar salida</button>`
                : `<button class="btn btn-success btn-block" data-action="entry-authorized" data-id="${p.id}">Registrar entrada</button>`
            }
          </div>`;
      } else {
        lookupHtml = `
          <div class="result warning">
            <strong>Persona no autorizada</strong>
            <p class="muted">Para ingresar debe completar sus datos y el motivo de acceso.</p>
            <button class="btn btn-primary btn-block" data-action="visitor-form">Completar registro de ingreso</button>
          </div>`;
      }
    }

    const list = inside.length
      ? inside.slice().reverse().map(r => `
          <div class="inside-item">
            <strong>${escapeHtml(r.name)}</strong>
            <span class="muted">${escapeHtml(r.type)} · ${humanDate(r.entryAt)}</span>
          </div>`).join("")
      : `<div class="empty">No hay personas registradas dentro.</div>`;

    return `
      <div class="grid">
        <section class="card hero">
          <h2>Registro de acceso</h2>
          <p>Ingrese su RUT para registrar entrada o salida.</p>
          <input id="rutInput" class="big-input" autocomplete="off" inputmode="text"
                 placeholder="12.345.678-5" value="${escapeHtml(formatRut(state.lookupRut))}" />
          <div class="actions">
            <button class="btn btn-primary btn-block" data-action="lookup">Continuar</button>
          </div>

          ${state.message ? `
            <div class="result ${state.message.type}">
              <strong>${escapeHtml(state.message.title)}</strong>
              <div>${escapeHtml(state.message.body)}</div>
            </div>` : ""}

          ${lookupHtml}

          <p class="note">
            Demo local: la información queda guardada únicamente en este navegador.
          </p>
        </section>

        <aside class="card">
          <h3 class="section-title">Estado actual</h3>
          <div class="stats">
            <div class="stat">
              <span class="muted">Dentro</span>
              <strong>${inside.length}</strong>
            </div>
            <div class="stat">
              <span class="muted">Ingresos hoy</span>
              <strong>${todayRows.length}</strong>
            </div>
            <div class="stat">
              <span class="muted">Externos hoy</span>
              <strong>${externalToday}</strong>
            </div>
            <div class="stat">
              <span class="muted">Autorizados</span>
              <strong>${state.people.filter(p => p.authorized && p.active).length}</strong>
            </div>
          </div>

          <h3 class="section-title" style="margin-top:20px">Actualmente dentro</h3>
          <div class="inside-list">${list}</div>
        </aside>
      </div>
    `;
  }

  function loginView() {
    return `
      <section class="card" style="max-width:520px;margin:30px auto">
        <h2>Acceso administrador</h2>
        <p class="muted">Use las credenciales de prueba para acceder al panel.</p>
        <form id="loginForm" class="form-grid">
          <label>Usuario
            <input name="username" required autocomplete="username" />
          </label>
          <label>Contraseña
            <input type="password" name="password" required autocomplete="current-password" />
          </label>
          <button class="btn btn-primary">Ingresar</button>
          <button type="button" class="btn btn-secondary" data-action="back-kiosk">Volver al registro</button>
        </form>
        ${state.message ? `
          <div class="result ${state.message.type}">
            <strong>${escapeHtml(state.message.title)}</strong>
            <div>${escapeHtml(state.message.body)}</div>
          </div>` : ""}
      </section>
    `;
  }

  function setupView() {
    return `
      <section class="card" style="max-width:560px;margin:30px auto">
        <h2>Configuración inicial</h2>
        <p class="muted">Cree la cuenta que administrará personas, informes, correo y respaldos en este dispositivo.</p>
        <form id="setupForm" class="form-grid">
          <label>Nombre del administrador
            <input name="name" required autocomplete="name" />
          </label>
          <label>Usuario
            <input name="username" value="admin" required autocomplete="username" />
          </label>
          <label>Contraseña
            <input type="password" name="password" minlength="8" required autocomplete="new-password" />
          </label>
          <label>Confirmar contraseña
            <input type="password" name="confirmation" minlength="8" required autocomplete="new-password" />
          </label>
          <button class="btn btn-primary">Crear cuenta administrativa</button>
        </form>
        <p class="note">Esta cuenta quedará cifrada en la tablet. Guarde la contraseña en un medio institucional seguro.</p>
      </section>
    `;
  }

  function adminView() {
    const tabs = [
      ["dashboard", "Resumen"],
      ["people", "Autorizados"],
      ["records", "Registros"],
      ["reports", "Informes"],
      ["email", "Correo e informes"],
      ["backup", "Respaldo"],
      ["security", "Seguridad"]
    ];
    return `
      <div class="admin-shell">
        <section class="card">
          <div class="row" style="align-items:center">
            <div>
              <h2 style="margin:0">Panel administrador</h2>
              <div class="muted">${escapeHtml(state.admin?.name || "")}</div>
            </div>
            <div style="text-align:right">
              <button class="btn btn-secondary" data-action="logout">Cerrar sesión</button>
            </div>
          </div>
          <div class="admin-nav" style="margin-top:16px">
            ${tabs.map(([id,label]) => `
              <button data-action="admin-tab" data-tab="${id}" class="${state.adminTab === id ? "active" : ""}">${label}</button>
            `).join("")}
          </div>
        </section>
        ${adminTabContent()}
      </div>
    `;
  }

  function adminTabContent() {
    if (state.adminTab === "dashboard") {
      const inside = peopleInside();
      const today = new Date().toDateString();
      const todayRows = state.access.filter(r => new Date(r.entryAt).toDateString() === today);
      return `
        <section class="card">
          <h3 class="section-title">Resumen</h3>
          <div class="stats">
            <div class="stat"><span class="muted">Dentro actualmente</span><strong>${inside.length}</strong></div>
            <div class="stat"><span class="muted">Ingresos hoy</span><strong>${todayRows.length}</strong></div>
            <div class="stat"><span class="muted">Externos hoy</span><strong>${todayRows.filter(r => r.type==="Externo").length}</strong></div>
            <div class="stat"><span class="muted">Personas autorizadas</span><strong>${state.people.filter(p=>p.authorized && p.active).length}</strong></div>
          </div>
        </section>
      `;
    }

    if (state.adminTab === "people") {
      const rows = state.people.map(p => `
        <tr>
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(formatRut(p.rut))}</td>
          <td>${escapeHtml(p.role || "")}</td>
          <td><span class="badge ${p.authorized ? "green" : "orange"}">${p.authorized ? "Autorizado" : "No autorizado"}</span></td>
          <td><span class="badge ${p.active ? "green" : "red"}">${p.active ? "Activo" : "Inactivo"}</span></td>
          <td><button class="btn btn-danger" data-action="delete-person" data-id="${p.id}">Eliminar</button></td>
        </tr>`).join("");
      return `
        <section class="card">
          <div class="row" style="align-items:center">
            <div><h3 class="section-title">Personas registradas</h3></div>
            <div style="text-align:right"><button class="btn btn-primary" data-action="add-person">Agregar persona</button></div>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Nombre</th><th>RUT</th><th>Cargo</th><th>Acceso</th><th>Estado</th><th></th></tr></thead>
              <tbody>${rows || `<tr><td colspan="6" class="empty">Sin registros</td></tr>`}</tbody>
            </table>
          </div>
        </section>
      `;
    }

    if (state.adminTab === "records") {
      return recordsTable(state.access.slice().reverse(), "Historial de accesos");
    }

    if (state.adminTab === "reports") {
      return `
        <section class="card">
          <h3 class="section-title">Generar informe</h3>
          <form id="reportForm" class="form-grid">
            <div class="row">
              <label>Desde
                <input type="date" name="from" required />
              </label>
              <label>Hasta
                <input type="date" name="to" required />
              </label>
            </div>
            <label>Tipo
              <select name="type">
                <option value="">Todos</option>
                <option>Autorizado</option>
                <option>Externo</option>
              </select>
            </label>
            <label>Buscar nombre o RUT
              <input name="q" placeholder="Opcional" />
            </label>
            <button class="btn btn-primary">Generar vista previa</button>
          </form>
          <div id="reportResults" style="margin-top:18px"></div>
        </section>
      `;
    }

    if (state.adminTab === "email") {
      const s = state.reportSettings;
      const hasPassword = IS_ANDROID && window.Android.hasMailPassword?.();
      return `
        <section class="card">
          <h3 class="section-title">Correo institucional e informes mensuales</h3>
          <p class="muted">Estos datos pueden completarse después de instalar la APK. La contraseña se almacena cifrada en el dispositivo.</p>
          <form id="emailSettingsForm" class="form-grid">
            <div class="settings-group">
              <h4>Servidor de correo</h4>
              <div class="row">
                <label>Servidor SMTP
                  <input name="host" value="${escapeHtml(s.host)}" placeholder="smtp.hegc.cl" />
                </label>
                <label>Puerto
                  <input type="number" min="1" max="65535" name="port" value="${escapeHtml(s.port || "587")}" />
                </label>
              </div>
              <label>Seguridad
                <select name="security">
                  <option value="STARTTLS" ${s.security === "STARTTLS" ? "selected" : ""}>STARTTLS</option>
                  <option value="SSL/TLS" ${s.security === "SSL/TLS" ? "selected" : ""}>SSL/TLS</option>
                </select>
              </label>
              <label>Correo remitente autorizado
                <input type="email" name="sender" value="${escapeHtml(s.sender)}" placeholder="radioterapia@hegc.cl" />
              </label>
              <label>Usuario SMTP
                <input name="username" value="${escapeHtml(s.username)}" autocomplete="off" />
              </label>
              <label>Contraseña SMTP
                <input type="password" name="smtpPassword" value="" autocomplete="new-password" placeholder="${hasPassword ? "Contraseña ya guardada; déjela vacía para conservarla" : "Ingrese la contraseña cuando la reciba"}" />
              </label>
              <label>Correo(s) destinatario(s)
                <input name="recipient" value="${escapeHtml(s.recipient)}" placeholder="jefatura@hegc.cl; respaldo@hegc.cl" />
              </label>
            </div>
            <div class="settings-group">
              <h4>Programación mensual</h4>
            <label>Fecha de envío
              <select name="scheduleType" id="scheduleType">
                <option value="last-day" ${s.scheduleType === "last-day" ? "selected" : ""}>Último día del mes</option>
                <option value="day" ${s.scheduleType === "day" ? "selected" : ""}>Día específico del mes</option>
                <option value="last-weekday" ${s.scheduleType === "last-weekday" ? "selected" : ""}>Último día de semana seleccionado</option>
              </select>
            </label>
            <label id="dayOfMonthWrap">Día del mes (1 al 28)
              <input type="number" min="1" max="28" name="dayOfMonth" value="${escapeHtml(s.dayOfMonth)}" />
            </label>
            <label id="weekdayWrap">Día de la semana
              <select name="weekday">
                ${[[1,"Lunes"],[2,"Martes"],[3,"Miércoles"],[4,"Jueves"],[5,"Viernes"],[6,"Sábado"],[0,"Domingo"]].map(([v,l]) => `<option value="${v}" ${String(s.weekday) === String(v) ? "selected" : ""}>${l}</option>`).join("")}
              </select>
            </label>
            <label>Hora
              <input type="time" name="time" value="${escapeHtml(s.time)}" required />
            </label>
            <fieldset class="check-group">
              <legend>Formatos adjuntos</legend>
              <label class="check"><input type="checkbox" name="pdf" ${s.pdf ? "checked" : ""} /> PDF</label>
              <label class="check"><input type="checkbox" name="excel" ${s.excel ? "checked" : ""} /> Excel</label>
            </fieldset>
            <label class="check"><input type="checkbox" name="enabled" ${s.enabled ? "checked" : ""} /> Activar programación mensual</label>
            </div>
            <button class="btn btn-primary">Guardar configuración</button>
            <button type="button" class="btn btn-secondary" data-action="test-monthly-report">Enviar informe del mes actual</button>
          </form>
          ${state.message ? `<div class="result ${state.message.type}"><strong>${escapeHtml(state.message.title)}</strong><div>${escapeHtml(state.message.body)}</div></div>` : ""}
          <div class="prototype-notice">
            <strong>Importante</strong>
            <p>El envío automático se activará cuando todos los datos institucionales estén completos. Android puede aplazar una tarea si el dispositivo está apagado, sin conexión o en ahorro de batería; se enviará al recuperar las condiciones necesarias.</p>
          </div>
        </section>
      `;
    }

    if (state.adminTab === "backup") {
      return `
        <section class="card">
          <h3 class="section-title">Respaldo local</h3>
          <p>Guarde periódicamente una copia de personas, accesos y configuración. El archivo contiene RUT y registros, por lo que debe almacenarse en una ubicación institucional segura.</p>
          <div class="backup-actions">
            <button class="btn btn-primary" data-action="create-backup">Crear respaldo</button>
            <button class="btn btn-secondary" data-action="restore-backup">Restaurar respaldo</button>
          </div>
          ${state.message ? `<div class="result ${state.message.type}"><strong>${escapeHtml(state.message.title)}</strong><div>${escapeHtml(state.message.body)}</div></div>` : ""}
        </section>
      `;
    }

    if (state.adminTab === "security") {
      return `
        <section class="card">
          <h3 class="section-title">Seguridad administrativa</h3>
          <form id="passwordForm" class="form-grid" style="margin-top:18px">
            <label>Contraseña actual
              <input type="password" name="currentPassword" required autocomplete="current-password" />
            </label>
            <label>Nueva contraseña
              <input type="password" name="newPassword" minlength="8" required autocomplete="new-password" />
            </label>
            <label>Confirmar nueva contraseña
              <input type="password" name="confirmPassword" minlength="8" required autocomplete="new-password" />
            </label>
            <button class="btn btn-primary">Cambiar contraseña</button>
          </form>
          ${state.message ? `<div class="result ${state.message.type}"><strong>${escapeHtml(state.message.title)}</strong><div>${escapeHtml(state.message.body)}</div></div>` : ""}
        </section>
      `;
    }
    return "";
  }

  function recordsTable(rows, title, allowExport = false) {
    const body = rows.map(r => `
      <tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(formatRut(r.rut))}</td>
        <td>${escapeHtml(r.type)}</td>
        <td>${escapeHtml(r.motive || "—")}</td>
        <td>${escapeHtml(r.organization || "—")}</td>
        <td>${humanDate(r.entryAt)}</td>
        <td>${r.exitAt ? humanDate(r.exitAt) : "Dentro"}</td>
        <td>${duration(r.entryAt, r.exitAt)}</td>
      </tr>`).join("");

    return `
      <section class="card">
        <div class="row" style="align-items:center">
          <div><h3 class="section-title">${escapeHtml(title)}</h3></div>
          ${allowExport ? `<div class="export-actions"><button class="btn btn-secondary" data-action="export-pdf">Exportar PDF</button><button class="btn btn-secondary" data-action="export-excel">Exportar Excel</button>${IS_ANDROID ? `<button class="btn btn-primary" data-action="send-email">Enviar por correo</button>` : ""}</div>` : ""}
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>RUT</th><th>Tipo</th><th>Motivo</th><th>Empresa / servicio</th><th>Entrada</th><th>Salida</th><th>Permanencia</th></tr></thead>
            <tbody>${body || `<tr><td colspan="8" class="empty">No hay registros para mostrar.</td></tr>`}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  function visitorModal() {
    const existing = state.lookup?.person;
    return `
      <div class="modal-backdrop">
        <div class="modal">
          <h3>Registro de persona no autorizada</h3>
          <p class="muted">Complete los datos requeridos antes de registrar el ingreso.</p>
          <form id="visitorForm" class="form-grid">
            <label>Nombre completo
              <input name="name" value="${escapeHtml(existing?.name || "")}" required />
            </label>
            <label>RUT
              <input name="rut" value="${escapeHtml(formatRut(existing?.rut || state.lookupRut))}" required />
            </label>
            <label>Motivo de ingreso
              <select name="motive" id="motiveSelect" required>
                <option value="">Seleccione...</option>
                ${MOTIVES.map(m => `<option>${escapeHtml(m)}</option>`).join("")}
              </select>
            </label>
            <label id="otherMotiveWrap" style="display:none">Especifique motivo
              <input name="otherMotive" />
            </label>
            <label id="organizationWrap" style="display:none">Empresa o servicio de procedencia
              <input name="organization" placeholder="Ej.: Siemens Healthineers" />
            </label>
            <div class="row">
              <button type="button" class="btn btn-secondary" data-action="close-modal">Cancelar</button>
              <button class="btn btn-primary">Registrar ingreso</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function addPersonModal() {
    return `
      <div class="modal-backdrop">
        <div class="modal">
          <h3>Agregar persona</h3>
          <form id="personForm" class="form-grid">
            <label>Nombre completo
              <input name="name" required />
            </label>
            <label>RUT
              <input name="rut" required />
            </label>
            <label>Cargo / función
              <input name="role" />
            </label>
            <label>Tipo de acceso
              <select name="authorized">
                <option value="true">Autorizado</option>
                <option value="false">No autorizado</option>
              </select>
            </label>
            <div class="row">
              <button type="button" class="btn btn-secondary" data-action="close-modal">Cancelar</button>
              <button class="btn btn-primary">Guardar</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function shell(content) {
    return `
      <div class="app-shell">
        <header class="topbar">
          <div class="brand">
            <img class="brand-logo" src="logo-hegc.jpeg" alt="Logo Hospital de Niños Dr. Exequiel González Cortés" />
            <div>
              <h1>Centro de Radioterapia Infantojuvenil HEGC</h1>
              <small>Control de acceso al búnker</small>
            </div>
          </div>
          <div class="top-actions">
            ${state.view === "kiosk"
              ? `<button class="icon-btn" data-action="admin-login">⚙ <span class="label">Administración</span></button>`
              : state.view === "admin"
              ? `<button class="icon-btn" data-action="back-kiosk">← <span class="label">Registro</span></button>`
              : ""}
          </div>
        </header>
        <main class="main">${content}</main>
      </div>
      ${state.modal === "visitor" ? visitorModal() : ""}
      ${state.modal === "add-person" ? addPersonModal() : ""}
    `;
  }

  function render() {
    const app = document.querySelector("#app");
    const content = state.view === "kiosk" ? kioskView()
                  : state.view === "login" ? loginView()
                  : state.view === "setup" ? setupView()
                  : adminView();
    app.innerHTML = shell(content);
    bind();
  }

  function bind() {
    document.querySelectorAll("[data-action]").forEach(el => {
      el.addEventListener("click", () => handleAction(el.dataset));
    });

    document.querySelector("#rutInput")?.addEventListener("keydown", e => {
      if (e.key === "Enter") lookupRut();
    });

    document.querySelector("#loginForm")?.addEventListener("submit", e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const admin = state.admins.find(a =>
        a.username === fd.get("username") && a.password === fd.get("password"));
      if (!admin) {
        state.message = { type: "error", title: "Acceso denegado", body: "Usuario o contraseña incorrectos." };
        render();
        return;
      }
      state.admin = admin;
      state.view = "admin";
      state.message = null;
      render();
    });

    document.querySelector("#setupForm")?.addEventListener("submit", e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const password = String(fd.get("password") || "");
      if (password.length < 8) {
        alert("La contraseña debe tener al menos 8 caracteres.");
        return;
      }
      if (password !== String(fd.get("confirmation") || "")) {
        alert("Las contraseñas no coinciden.");
        return;
      }
      const admin = {
        id: crypto.randomUUID(),
        username: String(fd.get("username") || "").trim(),
        password,
        name: String(fd.get("name") || "").trim()
      };
      state.admins = [admin];
      state.admin = admin;
      state.view = "admin";
      state.adminTab = "dashboard";
      save();
      render();
    });

    document.querySelector("#visitorForm")?.addEventListener("submit", e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const rut = normalizeRut(fd.get("rut"));
      if (!validRut(rut)) {
        alert("El RUT ingresado no es válido.");
        return;
      }
      const motiveSelected = String(fd.get("motive") || "");
      const other = String(fd.get("otherMotive") || "").trim();
      const organization = String(fd.get("organization") || "").trim();
      if (motiveSelected === "Otro" && !other) {
        alert("Debe especificar el motivo.");
        return;
      }
      if (["Mantención", "Visita técnica"].includes(motiveSelected) && !organization) {
        alert("Debe indicar la empresa o servicio de procedencia.");
        return;
      }
      const motive = motiveSelected === "Otro" ? `Otro: ${other}` : motiveSelected;
      const person = {
        id: state.lookup?.person?.id || crypto.randomUUID(),
        rut,
        name: String(fd.get("name")).trim(),
        role: "",
        authorized: false,
        active: true
      };
      if (!state.lookup?.person) {
        state.people.push(person);
      }
      state.modal = null;
      recordEntry(person, "Externo", motive, organization);
    });

    document.querySelector("#personForm")?.addEventListener("submit", e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const rut = normalizeRut(fd.get("rut"));
      if (!validRut(rut)) {
        alert("El RUT ingresado no es válido.");
        return;
      }
      if (state.people.some(p => normalizeRut(p.rut) === rut)) {
        alert("Ya existe una persona registrada con este RUT.");
        return;
      }
      state.people.push({
        id: crypto.randomUUID(),
        name: String(fd.get("name")).trim(),
        rut,
        role: String(fd.get("role") || "").trim(),
        authorized: fd.get("authorized") === "true",
        active: true
      });
      state.modal = null;
      save();
      render();
    });

    const motiveSelect = document.querySelector("#motiveSelect");
    motiveSelect?.addEventListener("change", e => {
      const wrap = document.querySelector("#otherMotiveWrap");
      const organizationWrap = document.querySelector("#organizationWrap");
      wrap.style.display = e.target.value === "Otro" ? "grid" : "none";
      organizationWrap.style.display = ["Mantención", "Visita técnica"].includes(e.target.value) ? "grid" : "none";
    });

    const scheduleType = document.querySelector("#scheduleType");
    const syncScheduleFields = () => {
      const value = scheduleType?.value;
      const dayWrap = document.querySelector("#dayOfMonthWrap");
      const weekdayWrap = document.querySelector("#weekdayWrap");
      if (dayWrap) dayWrap.style.display = value === "day" ? "grid" : "none";
      if (weekdayWrap) weekdayWrap.style.display = value === "last-weekday" ? "grid" : "none";
    };
    scheduleType?.addEventListener("change", syncScheduleFields);
    syncScheduleFields();

    document.querySelector("#emailSettingsForm")?.addEventListener("submit", e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      if (!fd.get("pdf") && !fd.get("excel")) {
        alert("Seleccione al menos un formato de informe.");
        return;
      }
      const settings = {
        enabled: fd.get("enabled") === "on",
        recipient: String(fd.get("recipient") || "").trim(),
        host: String(fd.get("host") || "").trim(),
        port: String(fd.get("port") || "587"),
        security: String(fd.get("security") || "STARTTLS"),
        sender: String(fd.get("sender") || "").trim(),
        username: String(fd.get("username") || "").trim(),
        scheduleType: String(fd.get("scheduleType")),
        dayOfMonth: String(fd.get("dayOfMonth") || "1"),
        weekday: String(fd.get("weekday") || "1"),
        time: String(fd.get("time") || "08:00"),
        pdf: fd.get("pdf") === "on",
        excel: fd.get("excel") === "on"
      };
      if (settings.enabled && (!settings.host || !settings.sender || !settings.recipient)) {
        alert("Para activar la programación debe completar servidor, remitente y destinatario.");
        return;
      }
      const newPassword = String(fd.get("smtpPassword") || "");
      const hasStoredPassword = IS_ANDROID && window.Android.hasMailPassword?.();
      if (settings.enabled && settings.username && !newPassword && !hasStoredPassword) {
        alert("Debe ingresar la contraseña SMTP antes de activar la programación.");
        return;
      }
      state.reportSettings = settings;
      save();
      if (IS_ANDROID) {
        window.Android.saveMailConfig(JSON.stringify(settings), newPassword);
      } else {
        state.message = {type: "success", title: "Configuración guardada", body: "La programación quedó almacenada en este navegador de prueba."};
      }
      render();
    });

    document.querySelector("#passwordForm")?.addEventListener("submit", e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const current = String(fd.get("currentPassword") || "");
      const next = String(fd.get("newPassword") || "");
      const confirmation = String(fd.get("confirmPassword") || "");
      const admin = state.admins.find(a => a.id === state.admin?.id);
      if (!admin || admin.password !== current) {
        alert("La contraseña actual es incorrecta.");
        return;
      }
      if (next.length < 8) {
        alert("La nueva contraseña debe tener al menos 8 caracteres.");
        return;
      }
      if (next !== confirmation) {
        alert("Las contraseñas nuevas no coinciden.");
        return;
      }
      admin.password = next;
      state.admin.password = next;
      save();
      state.message = {type: "success", title: "Contraseña actualizada", body: "La nueva contraseña quedó almacenada cifrada en este dispositivo."};
      render();
    });

    document.querySelector("#reportForm")?.addEventListener("submit", e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const from = new Date(`${fd.get("from")}T00:00:00`);
      const to = new Date(`${fd.get("to")}T23:59:59`);
      const type = String(fd.get("type") || "");
      const q = String(fd.get("q") || "").toLowerCase().trim();

      const rows = state.access.filter(r => {
        const d = new Date(r.entryAt);
        const matchesDate = d >= from && d <= to;
        const matchesType = !type || r.type === type;
        const hay = `${r.name} ${r.rut}`.toLowerCase();
        const matchesQ = !q || hay.includes(q);
        return matchesDate && matchesType && matchesQ;
      }).slice().reverse();

      state.reportRows = rows;
      document.querySelector("#reportResults").innerHTML = recordsTable(rows, `Resultados (${rows.length})`, true);
      document.querySelector("[data-action='export-pdf']")?.addEventListener("click", exportPdf);
      document.querySelector("[data-action='export-excel']")?.addEventListener("click", exportExcel);
      document.querySelector("[data-action='send-email']")?.addEventListener("click", sendCurrentReport);
    });
  }

  function handleAction(ds) {
    switch (ds.action) {
      case "lookup":
        lookupRut();
        break;
      case "entry-authorized": {
        const person = state.people.find(p => p.id === ds.id);
        if (person) recordEntry(person, "Autorizado");
        break;
      }
      case "exit":
        recordExit(ds.rut);
        break;
      case "visitor-form":
        state.modal = "visitor";
        render();
        break;
      case "close-modal":
        state.modal = null;
        render();
        break;
      case "admin-login":
        state.view = "login";
        state.message = null;
        render();
        break;
      case "back-kiosk":
        state.view = "kiosk";
        state.message = null;
        render();
        break;
      case "logout":
        state.admin = null;
        state.view = "kiosk";
        render();
        break;
      case "admin-tab":
        state.adminTab = ds.tab;
        render();
        break;
      case "add-person":
        state.modal = "add-person";
        render();
        break;
      case "delete-person": {
        const person = state.people.find(p => p.id === ds.id);
        if (!person) break;
        const active = activeRecordForRut(person.rut);
        const warning = active
          ? " Esta persona aún figura dentro del búnker; podrá registrar su salida igualmente."
          : "";
        if (!confirm(`¿Eliminar a ${person.name} de las personas registradas? Sus accesos históricos se conservarán.${warning}`)) break;
        state.people = state.people.filter(p => p.id !== ds.id);
        save();
        state.message = {
          type: "success",
          title: "Persona eliminada",
          body: "Se eliminó de la lista y se conservaron todos sus registros históricos."
        };
        render();
        break;
      }
      case "export-pdf":
        exportPdf();
        break;
      case "export-excel":
        exportExcel();
        break;
      case "test-monthly-report":
        generateCurrentMonthReport();
        break;
      case "send-email":
        sendCurrentReport();
        break;
      case "create-backup":
        if (IS_ANDROID) window.Android.createBackup();
        else alert("El respaldo estará disponible en la aplicación Android.");
        break;
      case "restore-backup":
        if (IS_ANDROID) window.Android.restoreBackup();
        else alert("La restauración estará disponible en la aplicación Android.");
        break;
    }
  }

  function reportMatrix() {
    const rows = state.reportRows || [];
    const header = ["Nombre","RUT","Tipo","Motivo","Empresa / servicio","Entrada","Salida","Permanencia"];
    return [header, ...rows.map(r => [
      r.name,
      formatRut(r.rut),
      r.type,
      r.motive || "",
      r.organization || "",
      humanDate(r.entryAt),
      r.exitAt ? humanDate(r.exitAt) : "",
      duration(r.entryAt, r.exitAt)
    ])];
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function exportExcel() {
    if (IS_ANDROID) {
      window.Android.exportReport(JSON.stringify(state.reportRows || []), "Informe de registros de acceso", "excel");
      return;
    }
    const lines = reportMatrix();
    const table = lines.map((row, index) => `<tr>${row.map(v => `<${index ? "td" : "th"}>${escapeHtml(v)}</${index ? "td" : "th"}>`).join("")}</tr>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><h2>Centro de Radioterapia Infantojuvenil HEGC</h2><h3>Informe de accesos</h3><table border="1">${table}</table></body></html>`;
    downloadBlob(new Blob(["\ufeff" + html], {type: "application/vnd.ms-excel;charset=utf-8;"}), `informe-accesos-${new Date().toISOString().slice(0,10)}.xls`);
  }

  function exportPdf() {
    if (IS_ANDROID) {
      window.Android.exportReport(JSON.stringify(state.reportRows || []), "Informe de registros de acceso", "pdf");
      return;
    }
    const lines = reportMatrix();
    const win = window.open("", "_blank");
    if (!win) {
      alert("El navegador bloqueó la ventana del informe. Permita las ventanas emergentes e intente nuevamente.");
      return;
    }
    const table = lines.map((row, index) => `<tr>${row.map(v => `<${index ? "td" : "th"}>${escapeHtml(v)}</${index ? "td" : "th"}>`).join("")}</tr>`).join("");
    win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Informe de accesos</title><style>body{font-family:Arial,sans-serif;color:#172033;padding:24px}header{display:flex;gap:16px;align-items:center;border-bottom:3px solid #234b82;padding-bottom:12px}img{width:72px;height:72px;object-fit:contain}h1{font-size:19px;margin:0}h2{font-size:15px;margin:6px 0 0;color:#555}table{border-collapse:collapse;width:100%;margin-top:22px;font-size:10px}th,td{border:1px solid #bbb;padding:6px;text-align:left}th{background:#e8eff8}@page{size:landscape;margin:12mm}.hint{margin:16px 0;padding:10px;background:#fff6d6}@media print{.hint{display:none}}</style></head><body><header><img src="logo-hegc.jpeg"><div><h1>Centro de Radioterapia Infantojuvenil HEGC</h1><h2>Informe de registros de acceso · ${new Date().toLocaleDateString("es-CL")}</h2></div></header><p class="hint">Seleccione <strong>Guardar como PDF</strong> en el cuadro de impresión.</p><table>${table}</table><script>window.onload=()=>window.print()<\/script></body></html>`);
    win.document.close();
  }

  function generateCurrentMonthReport() {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    state.reportRows = state.access.filter(r => {
      const d = new Date(r.entryAt);
      return d >= from && d < to;
    }).slice().reverse();
    if (IS_ANDROID) sendCurrentReport();
    else {
      const settings = state.reportSettings;
      if (settings.pdf) exportPdf();
      if (settings.excel) exportExcel();
      state.message = {type: "success", title: "Informe mensual generado", body: `${state.reportRows.length} registro(s) incluidos.`};
      render();
    }
  }

  function sendCurrentReport() {
    if (!IS_ANDROID) {
      alert("El envío directo está disponible en la APK Android.");
      return;
    }
    const now = new Date();
    const month = now.toLocaleDateString("es-CL", {month: "long", year: "numeric"});
    const title = state.adminTab === "reports"
      ? "Informe de registros de acceso"
      : `Informe mensual de accesos - ${month}`;
    window.Android.sendReport(JSON.stringify(state.reportRows || []), title);
    if (state.adminTab === "email") {
      state.message = {type: "success", title: "Enviando informe", body: "Espere la confirmación del servidor de correo."};
      render();
    }
  }

  window.onNativeResult = (success, message) => {
    if (state.adminTab === "reports") {
      alert(String(message || ""));
      return;
    }
    state.message = {
      type: success ? "success" : "error",
      title: success ? "Operación completada" : "No se pudo completar",
      body: String(message || "")
    };
    render();
  };

  render();
})();
