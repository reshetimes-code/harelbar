// ===== ADMIN PANEL LOGIC (Multi-Tenant) =====
(function() {
  // The admin password is never stored client-side - login always goes through
  // subAdminLogin, which checks it server-side and never exposes it back.
  const SCREEN_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
  // Photos from a professional camera routinely arrive far above the server's 3MB
  // limit, so every uploaded image is auto-resized/compressed client-side first,
  // down to a size that still looks sharp on a big screen but is light for the DB.
  const SCREEN_IMAGE_MAX_DIMENSION = 2200; // px on the longer side - plenty for a hall screen/TV
  const SCREEN_IMAGE_TARGET_BYTES = SCREEN_IMAGE_MAX_BYTES - 250 * 1024; // safety margin under the server limit
  const SCREEN_IMAGES_API = 'https://us-central1-harelbar-ca7dd.cloudfunctions.net/screenImages';
  const SUB_ADMIN_LOGIN_API = 'https://us-central1-harelbar-ca7dd.cloudfunctions.net/subAdminLogin';
  const GET_LEADS_API = 'https://us-central1-harelbar-ca7dd.cloudfunctions.net/getLeads';
  const GET_EVENTS_API = 'https://us-central1-harelbar-ca7dd.cloudfunctions.net/getEvents';
  const GET_EVENT_PASSWORD_API = 'https://us-central1-harelbar-ca7dd.cloudfunctions.net/getEventPassword';
  const SET_EVENT_PASSWORD_API = 'https://us-central1-harelbar-ca7dd.cloudfunctions.net/setEventPassword';
  const APPROVE_BLESSING_API = 'https://approvblessing-ayhgolerzq-uc.a.run.app';
  const MANAGE_TRASH_API = 'https://us-central1-harelbar-ca7dd.cloudfunctions.net/manageTrash';
  const GET_MANAGER_EVENTS_API = 'https://us-central1-harelbar-ca7dd.cloudfunctions.net/getManagerEvents';
  const CREATE_MANAGER_EVENT_API = 'https://us-central1-harelbar-ca7dd.cloudfunctions.net/createManagerEvent';
  const CREATE_EVENT_MANAGER_API = 'https://us-central1-harelbar-ca7dd.cloudfunctions.net/createEventManager';
  const GET_EVENT_MANAGERS_API = 'https://us-central1-harelbar-ca7dd.cloudfunctions.net/getEventManagers';
  const DELETE_EVENT_MANAGER_API = 'https://us-central1-harelbar-ca7dd.cloudfunctions.net/deleteEventManager';
  const RESET_MANAGER_PASSWORD_API = 'https://us-central1-harelbar-ca7dd.cloudfunctions.net/resetManagerPassword';
  const UPDATE_EVENT_MANAGER_API = 'https://us-central1-harelbar-ca7dd.cloudfunctions.net/updateEventManager';
  const GET_MANAGER_LEADS_API = 'https://us-central1-harelbar-ca7dd.cloudfunctions.net/getManagerLeads';

  const loginScreen = document.getElementById('login-screen');
  const adminPanel = document.getElementById('admin-panel');
  const loginForm = document.getElementById('login-form');
  const usernameInput = document.getElementById('admin-username');
  const passwordInput = document.getElementById('admin-password');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');

  // Views
  const eventsView = document.getElementById('events-view');
  const eventDetailView = document.getElementById('event-detail-view');
  const leadsView = document.getElementById('leads-view');

  // Current selected event
  let currentEventId = null;
  let blessingsUnsubscribe = null;
  let trashUnsubscribe = null;
  let leadsUnsubscribe = null;
  let isMainAdmin = false;
  let isManager = false;
  let managerId = null;
  let managerName = '';

  // Wipes every role's session state before a fresh login writes its own -
  // without this, a stale admin_auth/manager_auth flag left over from an
  // earlier login in the same browser tab could combine with the new
  // login's data (e.g. a manager's password ending up in admin_access_password
  // while isMainAdmin is still true from before), showing the wrong panel.
  function clearRoleSession() {
    localStorage.removeItem('admin_auth');
    localStorage.removeItem('sub_admin_event');
    localStorage.removeItem('manager_auth');
    localStorage.removeItem('manager_id');
    localStorage.removeItem('manager_name');
    isMainAdmin = false;
    isManager = false;
    managerId = null;
    managerName = '';
  }

  // Check URL param for sub-admin event
  var urlEvent = new URLSearchParams(window.location.search).get('event');
  if (urlEvent) {
    localStorage.setItem('sub_admin_event', urlEvent);
  }

  // Check session
  if (localStorage.getItem('admin_auth') === 'true') {
    isMainAdmin = true;
    showPanel();
  } else if (localStorage.getItem('manager_auth') === 'true') {
    isManager = true;
    managerId = localStorage.getItem('manager_id');
    managerName = localStorage.getItem('manager_name') || '';
    showPanel();
  } else if (localStorage.getItem('sub_admin_event')) {
    isMainAdmin = false;
    showPanel();
  }

  // Login - main admin AND sub-admin passwords are both checked server-side.
  // The password never lives in the client source, so viewing the page's
  // source can no longer hand anyone admin access.
  loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    var pwd = passwordInput.value.trim();
    var uname = usernameInput ? usernameInput.value.trim() : '';

    var body = { password: pwd };
    if (uname) body.username = uname;

    fetch(SUB_ADMIN_LOGIN_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function(res) {
      return res.json().catch(function() { return {}; });
    }).then(function(data) {
      if (data && data.ok && data.role === 'manager') {
        clearRoleSession();
        localStorage.setItem('manager_auth', 'true');
        localStorage.setItem('manager_id', data.managerId);
        localStorage.setItem('manager_name', data.name || uname);
        localStorage.setItem('admin_access_password', pwd);
        isManager = true;
        managerId = data.managerId;
        managerName = data.name || uname;
        loginError.classList.remove('show');
        showPanel();
      } else if (data && data.ok && data.isMainAdmin) {
        clearRoleSession();
        localStorage.setItem('admin_auth', 'true');
        localStorage.setItem('admin_access_password', pwd);
        isMainAdmin = true;
        loginError.classList.remove('show');
        showPanel();
      } else if (data && data.ok && data.eventId) {
        clearRoleSession();
        localStorage.setItem('sub_admin_event', data.eventId);
        localStorage.setItem('admin_access_password', pwd);
        isMainAdmin = false;
        loginError.classList.remove('show');
        showPanel();
      } else {
        loginError.classList.add('show');
        passwordInput.value = '';
        passwordInput.focus();
      }
    }).catch(function() {
      loginError.classList.add('show');
      passwordInput.value = '';
    });
  });

  // Logout
  logoutBtn.addEventListener('click', function() {
    localStorage.removeItem('admin_auth');
    localStorage.removeItem('sub_admin_event');
    localStorage.removeItem('admin_access_password');
    localStorage.removeItem('manager_auth');
    localStorage.removeItem('manager_id');
    localStorage.removeItem('manager_name');
    isMainAdmin = false;
    isManager = false;
    managerId = null;
    managerName = '';
    urlEvent = null;
    history.pushState({}, '', window.location.pathname);
    adminPanel.style.display = 'none';
    loginScreen.style.display = 'flex';
    passwordInput.value = '';
    if (usernameInput) usernameInput.value = '';
    if (blessingsUnsubscribe) blessingsUnsubscribe();
    if (trashUnsubscribe) { trashUnsubscribe(); trashUnsubscribe = null; }
    if (leadsUnsubscribe) { leadsUnsubscribe(); leadsUnsubscribe = null; }
  });

  function showPanel() {
    loginScreen.style.display = 'none';
    adminPanel.style.display = 'block';

    if (isMainAdmin || isManager) {
      // If the URL still points at a specific event (e.g. the browser
      // reloaded admin.html after navigating back from book.html/qr.html),
      // land back on that event's detail view instead of the events list.
      if (urlEvent) {
        showEventDetail(urlEvent);
      } else {
        showEventsView();
      }
    } else {
      // Sub-admin: go directly to their event
      var subEventId = localStorage.getItem('sub_admin_event');
      if (subEventId) {
        showEventDetail(subEventId);
      }
    }
  }

  // Keep the URL's ?event= param in sync with the visible view so that
  // leaving to another page (book.html, qr.html...) and coming back -
  // via browser back or a fresh reload - restores the same event instead
  // of dropping to the main events list.
  function syncEventUrl(eventId) {
    if (!isMainAdmin && !isManager) return;
    var basePath = window.location.pathname;
    var newUrl = eventId ? (basePath + '?event=' + encodeURIComponent(eventId)) : basePath;
    if (window.location.pathname + window.location.search !== newUrl) {
      history.pushState({ eventId: eventId || null }, '', newUrl);
    }
  }

  // Opens another same-site page inside a large modal (iframe) instead of
  // navigating to it, so the admin stays on this exact event's panel.
  function openInModal(url, title) {
    Swal.fire({
      title: title,
      html: '<iframe src="' + url + '"></iframe>',
      width: '95vw',
      showConfirmButton: false,
      showCloseButton: true,
      customClass: { popup: 'modal-iframe-popup' }
    });
  }

  window.addEventListener('popstate', function() {
    if (adminPanel.style.display === 'none') return;
    var evId = new URLSearchParams(window.location.search).get('event');
    if (evId) {
      showEventDetail(evId);
    } else if (isMainAdmin || isManager) {
      showEventsView();
    }
  });

  // ===== EVENTS LIST VIEW =====
  function showEventsView() {
    eventsView.style.display = 'block';
    eventDetailView.style.display = 'none';
    if (leadsView) leadsView.style.display = 'none';
    var sideBackBtn = document.getElementById('back-to-events-side');
    if (sideBackBtn) sideBackBtn.style.display = 'none';
    if (blessingsUnsubscribe) {
      blessingsUnsubscribe();
      blessingsUnsubscribe = null;
    }
    if (trashUnsubscribe) {
      trashUnsubscribe();
      trashUnsubscribe = null;
    }
    if (leadsUnsubscribe) {
      leadsUnsubscribe();
      leadsUnsubscribe = null;
    }
    currentEventId = null;
    syncEventUrl(null);
    applyRoleVisibility();
    loadEvents();
    if (isMainAdmin) loadManagers();
  }

  // Event manager sees only their own events and their own leads, can't
  // manage other event managers - only the super admin gets the full panel.
  function applyRoleVisibility() {
    var newEventLink = document.getElementById('new-event-link');
    var sectionNewEventLink = document.getElementById('section-new-event-link');
    var managerNewEventBtn = document.getElementById('manager-new-event-btn');
    var managersSection = document.getElementById('managers-section');
    if (newEventLink) newEventLink.style.display = isManager ? 'none' : '';
    if (sectionNewEventLink) sectionNewEventLink.style.display = isManager ? 'none' : '';
    if (managerNewEventBtn) managerNewEventBtn.style.display = isManager ? '' : 'none';
    if (managersSection) managersSection.style.display = isMainAdmin ? 'block' : 'none';
    var eventsViewTitle = document.getElementById('events-view-title');
    if (eventsViewTitle) eventsViewTitle.textContent = (isManager && managerName) ? ('פאנל ניהול - ' + managerName) : (isMainAdmin ? 'פאנל ניהול - סופר אדמין' : 'פאנל ניהול');
  }

  // ===== LEADS VIEW =====
  function showLeadsView() {
    eventsView.style.display = 'none';
    eventDetailView.style.display = 'none';
    leadsView.style.display = 'block';
    var sideBackBtn = document.getElementById('back-to-events-side');
    if (sideBackBtn) sideBackBtn.style.display = 'none';
    currentEventId = null;
    syncEventUrl(null);
    loadLeads();
  }

  function loadLeads() {
    var loader = document.getElementById('leads-loader');
    if (loader) loader.style.display = 'flex';
    var url = isManager ? GET_MANAGER_LEADS_API : GET_LEADS_API;
    var body = isManager
      ? { managerId: managerId, password: localStorage.getItem('admin_access_password') }
      : { password: localStorage.getItem('admin_access_password') };
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function(res) {
      return res.json().catch(function() { return {}; });
    }).then(function(data) {
      renderLeads((data && data.ok && data.leads) || []);
    }).catch(function() {
      renderLeads([]);
    });
  }

  function renderLeads(leads) {
      var loader = document.getElementById('leads-loader');
      if (loader) loader.style.display = 'none';

      document.getElementById('stat-leads-total').textContent = leads.length;
      document.getElementById('stat-leads-new').textContent = leads.filter(function(l) { return !l.contacted; }).length;
      document.getElementById('leads-count').textContent = leads.length;

      if (leads.length === 0) {
        document.getElementById('leads-table').style.display = 'none';
        document.getElementById('empty-leads').style.display = 'block';
        return;
      }

      document.getElementById('empty-leads').style.display = 'none';
      document.getElementById('leads-table').style.display = 'table';

      var tbody = document.getElementById('leads-tbody');
      tbody.innerHTML = leads.map(function(lead) {
        var dateStr = '';
        if (lead.createdAt) {
          try { dateStr = new Date(lead.createdAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) {}
        }
        var sourceLabel = escapeHtml(lead.celebrantName || '') + (lead.eventDate ? ' (' + escapeHtml(lead.eventDate) + ')' : '');
        var contacted = !!lead.contacted;
        return '<tr>' +
          '<td>' + escapeHtml(lead.name || '') + '</td>' +
          '<td dir="ltr" style="text-align:right;">' + escapeHtml(lead.phone || '') + '</td>' +
          '<td>' + sourceLabel + '</td>' +
          '<td>' + dateStr + '</td>' +
          '<td><span class="event-badge ' + (contacted ? 'active' : 'archived') + '">' + (contacted ? 'טופל' : 'ממתין') + '</span></td>' +
          '<td>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
              '<a href="tel:' + escapeHtml(lead.phone || '') + '" style="background:none;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.7);padding:4px 10px;border-radius:6px;font-size:0.8rem;font-family:Assistant,sans-serif;text-decoration:none;">📞 חיוג</a>' +
              '<button class="lead-whatsapp-btn" data-name="' + escapeHtml(lead.name || '') + '" data-phone="' + escapeHtml(lead.phone || '') + '" style="background:none;border:1px solid rgba(37,211,102,0.3);color:#25D366;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;font-family:Assistant,sans-serif;">📱 וואטסאפ</button>' +
              '<button class="lead-toggle-btn" data-lead-id="' + lead.id + '" data-contacted="' + contacted + '" style="background:none;border:1px solid rgba(184,149,62,0.3);color:var(--gold-light);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;font-family:Assistant,sans-serif;">' + (contacted ? 'סמן כלא טופל' : 'סמן כטופל') + '</button>' +
              '<button class="lead-delete-btn" data-lead-id="' + lead.id + '" style="background:none;border:1px solid rgba(229,85,85,0.3);color:#e55;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;font-family:Assistant,sans-serif;">🗑</button>' +
            '</div>' +
          '</td>' +
          '</tr>';
      }).join('');
  }

  var leadsBtn = document.getElementById('leads-btn');
  if (leadsBtn) leadsBtn.addEventListener('click', showLeadsView);

  var backToEventsFromLeadsBtn = document.getElementById('back-to-events-from-leads');
  if (backToEventsFromLeadsBtn) backToEventsFromLeadsBtn.addEventListener('click', showEventsView);

  var leadsTbody = document.getElementById('leads-tbody');
  if (leadsTbody) {
    leadsTbody.addEventListener('click', function(e) {
      var waBtn = e.target.closest('.lead-whatsapp-btn');
      if (waBtn) {
        var name = waBtn.dataset.name;
        var phone = waBtn.dataset.phone.replace(/[-\s]/g, '');
        if (phone.startsWith('0')) phone = '972' + phone.slice(1);
        var msg = encodeURIComponent('שלום ' + name + ', נעים מאוד! אנחנו חוזרים אליכם בעקבות הפרטים שהשארתם, במערכת הברכות, לגבי אירוע שאתם חוגגים בקרוב. האם תרצו לקבל פרטים מלאים מאיתנו?');
        window.open('https://wa.me/' + phone + '?text=' + msg, '_blank');
        return;
      }

      var toggleBtn = e.target.closest('.lead-toggle-btn');
      if (toggleBtn) {
        var leadId = toggleBtn.dataset.leadId;
        var isContacted = toggleBtn.dataset.contacted === 'true';
        setLeadContacted(leadId, !isContacted).then(loadLeads);
        return;
      }

      var delBtn = e.target.closest('.lead-delete-btn');
      if (delBtn) {
        var delId = delBtn.dataset.leadId;
        showConfirm('מחיקת ליד', 'למחוק את הליד הזה לצמיתות?', function() {
          deleteLead(delId).then(loadLeads);
        });
        return;
      }
    });
  }

  function loadEvents() {
    var url = isManager ? GET_MANAGER_EVENTS_API : GET_EVENTS_API;
    var body = isManager
      ? { managerId: managerId, password: localStorage.getItem('admin_access_password') }
      : { password: localStorage.getItem('admin_access_password') };
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function(res) {
      return res.json().catch(function() { return {}; });
    }).then(function(data) {
      renderEvents((data && data.ok && data.events) || []);
    }).catch(function() {
      renderEvents([]);
    });
  }

  function renderEvents(events) {
      const loader = document.getElementById('events-loader');
      if (loader) loader.style.display = 'none';

      document.getElementById('stat-events-total').textContent = events.length;
      document.getElementById('stat-events-active').textContent = events.filter(e => (e.meta.status || 'active') === 'active').length;
      document.getElementById('stat-blessings-total').textContent = events.reduce((sum, e) => sum + e.blessingCount, 0);
      document.getElementById('events-count').textContent = events.length;

      if (events.length === 0) {
        document.getElementById('events-table').style.display = 'none';
        document.getElementById('empty-events').style.display = 'block';
        return;
      }

      document.getElementById('empty-events').style.display = 'none';
      document.getElementById('events-table').style.display = 'table';

      const tbody = document.getElementById('events-tbody');
      tbody.innerHTML = events.map(function(ev) {
        var meta = ev.meta;
        var dateStr = '';
        var isPast = null;
        if (meta.eventDate) {
          var rawDate = new Date(meta.eventDate);
          if (!isNaN(rawDate.getTime())) {
            dateStr = rawDate.toLocaleDateString('he-IL');
            var today = new Date(); today.setHours(0, 0, 0, 0);
            var evDay = new Date(rawDate); evDay.setHours(0, 0, 0, 0);
            isPast = evDay.getTime() < today.getTime();
          }
        }
        var statusClass = isPast === null ? 'unknown' : (isPast ? 'past' : 'upcoming');
        var statusLabel = isPast === null ? 'לא ידוע' : (isPast ? 'עבר' : 'עתידי');
        var createdStr = '';
        if (meta.createdAt) {
          try { createdStr = new Date(meta.createdAt).toLocaleDateString('he-IL', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }); } catch(e) {}
        }
        return '<tr class="event-row" data-event-id="' + ev.id + '">' +
            '<td><span class="event-celebrant">' + escapeHtml(meta.celebrantName || '') + '</span></td>' +
            '<td>' + escapeHtml(meta.organizerName || '—') + '</td>' +
            '<td>' + (dateStr || '—') + '</td>' +
            '<td>' + ev.blessingCount + ' ברכות</td>' +
            '<td><span class="event-badge ' + statusClass + '">' + statusLabel + '</span></td>' +
            '<td style="text-align:left;">' +
              '<span class="event-header-row" data-event-id="' + ev.id + '" style="cursor:pointer;display:inline-flex;">' +
                '<span class="event-arrow" style="color:var(--text-muted);font-size:1.2rem;transition:transform 0.3s;">▼</span>' +
              '</span>' +
            '</td>' +
          '</tr>' +
          '<tr class="event-details-row" data-event-id="' + ev.id + '">' +
            '<td colspan="6" style="padding:0;border-bottom:1px solid rgba(255,255,255,0.05);">' +
              '<div class="event-details" style="display:none;padding:0 16px 14px;">' +
                '<div style="display:flex;flex-wrap:wrap;gap:8px;">' +
                  '<button class="event-enter-btn" data-event-id="' + ev.id + '" style="background:var(--gold);color:#0c1425;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:0.85rem;font-family:Assistant,sans-serif;font-weight:700;">ניהול ברכות</button>' +
                  '<button class="event-qr-btn" data-event-id="' + ev.id + '" data-name="' + escapeHtml(meta.celebrantName || '') + '" style="background:none;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.6);padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;font-family:Assistant,sans-serif;">📥 QR</button>' +
                  '<button class="event-access-btn" data-event-id="' + ev.id + '" data-name="' + escapeHtml(meta.celebrantName || '') + '" data-phone="' + escapeHtml(meta.organizerPhone || '') + '" data-pwd="' + escapeHtml(meta.subAdminPassword || '') + '" style="background:none;border:1px solid rgba(37,211,102,0.3);color:#25D366;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;font-family:Assistant,sans-serif;">📤 שלח גישה</button>' +
                  '<button class="event-delete-btn" data-event-id="' + ev.id + '" data-name="' + escapeHtml(meta.celebrantName || '') + '" style="background:none;border:1px solid rgba(229,85,85,0.3);color:#e55;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;font-family:Assistant,sans-serif;">🗑 מחק</button>' +
                '</div>' +
              '</div>' +
            '</td>' +
          '</tr>';
      }).join('');
  }

  // Event row click handlers
  document.getElementById('events-tbody').addEventListener('click', function(e) {
    // Toggle dropdown
    var tr = e.target.closest('tr.event-row');
    if (tr && !e.target.closest('button')) {
      var detailsRow = tr.nextElementSibling;
      var details = detailsRow && detailsRow.querySelector('.event-details');
      var arrow = tr.querySelector('.event-arrow');
      if (!details) return;
      if (details.style.display === 'none') {
        details.style.display = 'block';
        arrow.style.transform = 'rotate(180deg)';
      } else {
        details.style.display = 'none';
        arrow.style.transform = 'rotate(0deg)';
      }
      return;
    }

    // Enter button -> drill down
    var enterBtn = e.target.closest('.event-enter-btn');
    if (enterBtn) {
      e.stopPropagation();
      showEventDetail(enterBtn.dataset.eventId);
      return;
    }

    // Delete button -> move to recycle bin
    var deleteBtn = e.target.closest('.event-delete-btn');
    if (deleteBtn) {
      e.stopPropagation();
      var evId = deleteBtn.dataset.eventId;
      var evName = deleteBtn.dataset.name;
      Swal.fire({
        html: '<div dir="rtl" style="text-align:center; padding:8px 0;">' +
          '<div style="width:56px; height:56px; border-radius:50%; background:rgba(229,85,85,0.12); display:flex; align-items:center; justify-content:center; margin:0 auto 20px; font-size:1.8rem; color:#e55;">🗑️</div>' +
          '<h2 style="color:#fff; font-family:Assistant,sans-serif; font-weight:800; font-size:1.4rem; margin:0 0 12px;">מחיקת האירוע של ' + evName + '</h2>' +
          '<p style="color:rgba(255,255,255,0.6); font-size:0.95rem; line-height:1.8; margin:0;">שים לב! מחיקת האירוע תגרום ל:<br>' +
          '• קוד ה-QR המודפס יפסיק לעבוד<br>' +
          '• כל הברכות ימחקו<br>' +
          '• אורחים לא יוכלו לשלוח ברכות<br><br>' +
          '<strong style="color:#ffc107;">האירוע יועבר לסל מחזור</strong></p></div>',
        background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
        border: '1px solid rgba(229,85,85,0.2)',
        confirmButtonText: 'מחק לסל מחזור',
        confirmButtonColor: '#e55',
        showCancelButton: true,
        cancelButtonText: 'ביטול',
        width: 420,
      }).then(function(result) {
        if (result.isConfirmed) {
          // Move to recycle bin instead of deleting
          db.ref('events/' + evId).once('value', function(snap) {
            var eventData = snap.val();
            if (eventData) {
              db.ref('recyclebin/' + evId).set(eventData).then(function() {
                db.ref('recyclebin/' + evId + '/deletedAt').set(new Date().toISOString());
                deleteEvent(evId);
              });
            }
          });
        }
      });
      return;
    }

    // Send access button
    var accessBtn = e.target.closest('.event-access-btn');
    if (accessBtn) {
      e.stopPropagation();
      var accEventId = accessBtn.dataset.eventId;
      var accName = accessBtn.dataset.name;
      var accPhone = accessBtn.dataset.phone;
      var accPwd = accessBtn.dataset.pwd;

      Swal.fire({
        html: '<div dir="rtl" style="text-align:center; padding:8px 0;">' +
          '<h2 style="color:#fff; font-family:Assistant,sans-serif; font-weight:800; font-size:1.4rem; margin:0 0 16px;">שליחת גישה - ' + accName + '</h2>' +
          '<div style="background:rgba(255,255,255,0.06); border-radius:8px; padding:12px; margin-bottom:16px;">' +
            '<p style="color:var(--text-muted); font-size:0.85rem; margin:0 0 4px;">סיסמת תת-מנהל:</p>' +
            '<p style="color:var(--gold-light); font-size:1.8rem; font-weight:800; letter-spacing:4px; margin:0;">' + accPwd + '</p>' +
          '</div>' +
          '<p style="color:rgba(255,255,255,0.5); font-size:0.85rem; margin:0 0 12px;">שנה סיסמה:</p>' +
          '<input type="text" id="swal-new-pwd" value="' + accPwd + '" maxlength="6" style="width:120px; padding:10px; border:1.5px solid rgba(255,255,255,0.15); border-radius:8px; font-family:Assistant,sans-serif; font-size:1.3rem; background:rgba(255,255,255,0.08); color:#fff; text-align:center; letter-spacing:3px;">' +
          '<div style="margin-top:16px;"><button id="swal-copy-link" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); color:rgba(255,255,255,0.7); padding:8px 16px; border-radius:8px; font-family:Assistant,sans-serif; font-size:0.85rem; cursor:pointer;">📋 העתק קישור + סיסמה</button></div>' +
          '</div>',
        background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
        border: '1px solid rgba(255,255,255,0.15)',
        showDenyButton: true,
        confirmButtonText: '📱 שלח בוואטסאפ',
        confirmButtonColor: '#25D366',
        denyButtonText: '✅ אשר שינוי סיסמה',
        denyButtonColor: '#b8953e',
        showCancelButton: true,
        cancelButtonText: 'סגור',
        width: 400,
        didOpen: function() {
          document.getElementById('swal-copy-link').addEventListener('click', function() {
            var pwd = document.getElementById('swal-new-pwd').value.trim() || accPwd;
            var copyText = 'ניהול האירוע של ' + accName + '\nכניסה: https://hchc.co.il/admin\nסיסמה: ' + pwd;
            navigator.clipboard.writeText(copyText).then(function() {
              document.getElementById('swal-copy-link').textContent = '✅ הועתק!';
              setTimeout(function() { document.getElementById('swal-copy-link').textContent = '📋 העתק קישור + סיסמה'; }, 2000);
            });
          });
        }
      }).then(function(result) {
        var newPwd = document.getElementById('swal-new-pwd') ? document.getElementById('swal-new-pwd').value.trim() : accPwd;

        if (result.isConfirmed) {
          // Save new password if changed
          if (newPwd !== accPwd) {
            getAdminCredential().then(function(password) { if (password) callSetEventPassword(accEventId, newPwd, password); });
          }
          // Send WhatsApp
          var phone = accPhone.replace(/[-\s]/g, '');
          if (phone.startsWith('0')) phone = '972' + phone.slice(1);
          var msg = encodeURIComponent('שלום! הגישה לניהול האירוע של ' + accName + ':\n\nכניסה: hchc.co.il/admin\nסיסמה: ' + (newPwd || accPwd) + '\n\nמזל טוב! 🎉');
          window.open('https://wa.me/' + phone + '?text=' + msg, '_blank');
        } else if (result.isDenied) {
          // Save new password and go to login
          if (newPwd && newPwd !== accPwd) {
            getAdminCredential().then(function(password) { if (password) callSetEventPassword(accEventId, newPwd, password); });
            Swal.fire({
              text: 'הסיסמה עודכנה! מעביר למסך התחברות...',
              icon: 'success',
              timer: 2000,
              showConfirmButton: false,
              background: '#0c1425',
              color: '#fff'
            }).then(function() {
              localStorage.removeItem('admin_auth');
              localStorage.removeItem('sub_admin_event');
              window.location.href = 'admin.html';
            });
          }
        }
      });
      return;
    }

    // QR download button
    var qrBtn = e.target.closest('.event-qr-btn');
    if (qrBtn) {
      e.stopPropagation();
      var qrEventId = qrBtn.dataset.eventId;
      var qrName = qrBtn.dataset.name;
      var qrImgUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=800x800&format=png&data=' + encodeURIComponent('https://hchc.co.il/e/' + qrEventId);
      var link = document.createElement('a');
      link.href = qrImgUrl;
      link.download = 'QR_' + qrName + '.png';
      link.click();
      return;
    }
  });

  // ===== EVENT MANAGERS (super admin only - creates/lists event managers,
  // each of whom owns a filtered subset of the events above) =====
  function loadManagers() {
    var loader = document.getElementById('managers-loader');
    if (loader) loader.style.display = 'flex';
    fetch(GET_EVENT_MANAGERS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: localStorage.getItem('admin_access_password') })
    }).then(function(res) {
      return res.json().catch(function() { return {}; });
    }).then(function(data) {
      renderManagers((data && data.ok && data.managers) || []);
    }).catch(function() {
      renderManagers([]);
    });
  }

  function renderManagers(managers) {
    var loader = document.getElementById('managers-loader');
    if (loader) loader.style.display = 'none';
    document.getElementById('managers-count').textContent = managers.length;

    if (managers.length === 0) {
      document.getElementById('managers-table').style.display = 'none';
      document.getElementById('empty-managers').style.display = 'block';
      return;
    }
    document.getElementById('empty-managers').style.display = 'none';
    document.getElementById('managers-table').style.display = 'table';

    var tbody = document.getElementById('managers-tbody');
    tbody.innerHTML = managers.map(function(mgr) {
      var eventsRows = (mgr.events || []).map(function(ev) {
        var meta = ev.meta;
        var dateStr = '';
        var isPast = null;
        if (meta.eventDate) {
          var rawDate = new Date(meta.eventDate);
          if (!isNaN(rawDate.getTime())) {
            dateStr = rawDate.toLocaleDateString('he-IL');
            var today = new Date(); today.setHours(0, 0, 0, 0);
            var evDay = new Date(rawDate); evDay.setHours(0, 0, 0, 0);
            isPast = evDay.getTime() < today.getTime();
          }
        }
        var statusClass = isPast === null ? 'unknown' : (isPast ? 'past' : 'upcoming');
        var statusLabel = isPast === null ? 'לא ידוע' : (isPast ? 'עבר' : 'עתידי');
        return '<tr>' +
            '<td><span class="event-celebrant">' + escapeHtml(meta.celebrantName || '') + '</span></td>' +
            '<td>' + escapeHtml(meta.organizerName || '—') + '</td>' +
            '<td>' + (dateStr || '—') + '</td>' +
            '<td>' + ev.blessingCount + ' ברכות</td>' +
            '<td><span class="event-badge ' + statusClass + '">' + statusLabel + '</span></td>' +
            '<td style="text-align:left;"><button class="manager-event-enter-btn" data-event-id="' + ev.id + '" style="background:var(--gold);color:#0c1425;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;font-family:Assistant,sans-serif;font-weight:700;">ניהול</button></td>' +
          '</tr>';
      }).join('');

      var eventsTableOrEmpty = eventsRows
        ? '<table class="events-table" style="margin-top:0;">' +
            '<thead><tr><th>שם חוגג</th><th>מארגן</th><th>תאריך</th><th>ברכות</th><th>סטטוס</th><th></th></tr></thead>' +
            '<tbody>' + eventsRows + '</tbody>' +
          '</table>'
        : '<p style="color:var(--text-muted);font-size:0.85rem;padding:8px 0;">אין עדיין אירועים למנהל הזה</p>';

      return '<tr class="event-row manager-row" data-manager-id="' + mgr.id + '">' +
          '<td>' + escapeHtml(mgr.username || '') + '</td>' +
          '<td>' + escapeHtml(mgr.name || '') + '</td>' +
          '<td>' + (mgr.events ? mgr.events.length : 0) + ' אירועים</td>' +
          '<td style="text-align:left;">' +
            '<div style="display:flex;gap:6px;justify-content:flex-end;align-items:center;">' +
              '<button class="manager-login-as-btn" data-manager-id="' + mgr.id + '" data-name="' + escapeHtml(mgr.name || '') + '" data-password="' + escapeHtml(mgr.password || '') + '" title="כניסה לחשבון המנהל" style="background:none;border:1px solid rgba(184,149,62,0.4);color:var(--gold-light);padding:5px 8px;border-radius:6px;cursor:pointer;font-size:0.8rem;">🔓</button>' +
              '<button class="manager-edit-btn" data-manager-id="' + mgr.id + '" data-username="' + escapeHtml(mgr.username || '') + '" data-name="' + escapeHtml(mgr.name || '') + '" data-email="' + escapeHtml(mgr.email || '') + '" title="עריכת מנהל" style="background:none;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.6);padding:5px 8px;border-radius:6px;cursor:pointer;font-size:0.8rem;">✏️</button>' +
              '<button class="manager-reset-btn" data-manager-id="' + mgr.id + '" data-username="' + escapeHtml(mgr.username || '') + '" title="איפוס סיסמה" style="background:none;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.6);padding:5px 8px;border-radius:6px;cursor:pointer;font-size:0.8rem;">🔑</button>' +
              '<button class="manager-delete-btn" data-manager-id="' + mgr.id + '" data-username="' + escapeHtml(mgr.username || '') + '" title="מחיקת מנהל" style="background:none;border:1px solid rgba(229,85,85,0.3);color:#e55;padding:5px 8px;border-radius:6px;cursor:pointer;font-size:0.8rem;">🗑</button>' +
              '<span class="manager-header-row" data-manager-id="' + mgr.id + '" style="cursor:pointer;display:inline-flex;">' +
                '<span class="event-arrow manager-arrow" style="color:var(--text-muted);font-size:1.2rem;transition:transform 0.3s;">▼</span>' +
              '</span>' +
            '</div>' +
          '</td>' +
        '</tr>' +
        '<tr class="event-details-row manager-details-row" data-manager-id="' + mgr.id + '">' +
          '<td colspan="4" style="padding:0;border-bottom:1px solid rgba(255,255,255,0.05);">' +
            '<div class="event-details manager-details" style="display:none;padding:4px 16px 14px;">' + eventsTableOrEmpty + '</div>' +
          '</td>' +
        '</tr>';
    }).join('');
  }

  var managersTbody = document.getElementById('managers-tbody');
  if (managersTbody) {
    managersTbody.addEventListener('click', function(e) {
      // Toggle dropdown - reveals this manager's own events
      var tr = e.target.closest('tr.manager-row');
      if (tr && !e.target.closest('button')) {
        var detailsRow = tr.nextElementSibling;
        var details = detailsRow && detailsRow.querySelector('.manager-details');
        var arrow = tr.querySelector('.manager-arrow');
        if (!details) return;
        if (details.style.display === 'none') {
          details.style.display = 'block';
          arrow.style.transform = 'rotate(180deg)';
        } else {
          details.style.display = 'none';
          arrow.style.transform = 'rotate(0deg)';
        }
        return;
      }

      // Enter one of this manager's events -> exact same full event panel
      // the super admin gets from the main events table.
      var enterBtn = e.target.closest('.manager-event-enter-btn');
      if (enterBtn) {
        e.stopPropagation();
        showEventDetail(enterBtn.dataset.eventId);
        return;
      }

      // Super-admin-only "view as" shortcut - switches this browser session
      // into that manager's own panel using the password getEventManagers
      // already merged in, no need to know/ask for it separately.
      var loginAsBtn = e.target.closest('.manager-login-as-btn');
      if (loginAsBtn) {
        e.stopPropagation();
        var laMgrId = loginAsBtn.dataset.managerId;
        var laName = loginAsBtn.dataset.name;
        var laPassword = loginAsBtn.dataset.password;
        showConfirm('כניסה כמנהל אירוע', 'להיכנס לפאנל של "' + laName + '"? תעבור/י לתצוגה שלו.', function() {
          clearRoleSession();
          localStorage.setItem('manager_auth', 'true');
          localStorage.setItem('manager_id', laMgrId);
          localStorage.setItem('manager_name', laName);
          localStorage.setItem('admin_access_password', laPassword);
          window.location.href = 'admin.html';
        });
        return;
      }

      var editBtn = e.target.closest('.manager-edit-btn');
      if (editBtn) {
        e.stopPropagation();
        var eMgrId = editBtn.dataset.managerId;
        // escapeHtml() doesn't escape quotes (fine for text nodes), but these
        // values are about to sit inside an HTML attribute, and a manager's
        // name/username can come from the public sign-up form.
        var eUsername = escapeHtml(editBtn.dataset.username).replace(/"/g, '&quot;');
        var eName = escapeHtml(editBtn.dataset.name).replace(/"/g, '&quot;');
        var eEmail = escapeHtml(editBtn.dataset.email || '').replace(/"/g, '&quot;');
        Swal.fire({
          html: '<div dir="rtl" style="text-align:right;">' +
            '<h2 style="color:#fff;font-family:Assistant,sans-serif;font-weight:800;font-size:1.2rem;margin:0 0 16px;text-align:center;">עריכת מנהל אירוע</h2>' +
            '<label style="color:var(--text-muted);font-size:0.85rem;">שם מנהל האירוע</label>' +
            '<input type="text" id="swal-edit-mgr-name" value="' + eName + '" style="width:100%;padding:10px;margin:4px 0 12px;border:1.5px solid rgba(255,255,255,0.15);border-radius:8px;font-family:Assistant,sans-serif;font-size:1rem;background:rgba(255,255,255,0.08);color:#fff;">' +
            '<label style="color:var(--text-muted);font-size:0.85rem;">שם משתמש</label>' +
            '<input type="text" id="swal-edit-mgr-username" value="' + eUsername + '" dir="ltr" style="width:100%;padding:10px;margin:4px 0 12px;border:1.5px solid rgba(255,255,255,0.15);border-radius:8px;font-family:Assistant,sans-serif;font-size:1rem;background:rgba(255,255,255,0.08);color:#fff;">' +
            '<label style="color:var(--text-muted);font-size:0.85rem;">אימייל</label>' +
            '<input type="email" id="swal-edit-mgr-email" value="' + eEmail + '" dir="ltr" style="width:100%;padding:10px;margin:4px 0;border:1.5px solid rgba(255,255,255,0.15);border-radius:8px;font-family:Assistant,sans-serif;font-size:1rem;background:rgba(255,255,255,0.08);color:#fff;">' +
            '</div>',
          background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
          border: '1px solid rgba(255,255,255,0.15)',
          confirmButtonText: 'שמירה',
          confirmButtonColor: '#b8953e',
          showCancelButton: true,
          cancelButtonText: 'ביטול',
          width: 380,
          showLoaderOnConfirm: true,
          preConfirm: function() {
            var newName = document.getElementById('swal-edit-mgr-name').value.trim();
            var newUsername = document.getElementById('swal-edit-mgr-username').value.trim();
            var newEmail = document.getElementById('swal-edit-mgr-email').value.trim();
            if (!newName || !newUsername) {
              Swal.showValidationMessage('נא למלא שם ושם משתמש');
              return false;
            }
            if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
              Swal.showValidationMessage('כתובת מייל לא תקינה');
              return false;
            }
            return fetch(UPDATE_EVENT_MANAGER_API, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                password: localStorage.getItem('admin_access_password'),
                managerId: eMgrId,
                name: newName,
                username: newUsername,
                email: newEmail
              })
            }).then(function(res) { return res.json().catch(function() { return {}; }); })
              .then(function(data) {
                if (!data || !data.ok) {
                  var msg = data && data.error === 'username_taken' ? 'שם המשתמש כבר תפוס' :
                    data && data.error === 'invalid_email' ? 'כתובת מייל לא תקינה' : 'שגיאה בעדכון הפרטים';
                  Swal.showValidationMessage(msg);
                  return false;
                }
                return true;
              }).catch(function() {
                Swal.showValidationMessage('שגיאת תקשורת, נסו שוב');
                return false;
              });
          }
        }).then(function(result) {
          if (result.isConfirmed) loadManagers();
        });
        return;
      }

      var resetBtn = e.target.closest('.manager-reset-btn');
      if (resetBtn) {
        e.stopPropagation();
        var rMgrId = resetBtn.dataset.managerId;
        var rUsername = resetBtn.dataset.username;
        Swal.fire({
          html: '<div dir="rtl" style="text-align:center;">' +
            '<h2 style="color:#fff;font-family:Assistant,sans-serif;font-weight:800;font-size:1.3rem;margin:0 0 14px;">איפוס סיסמה ל-' + rUsername + '</h2>' +
            '<input type="text" id="swal-manager-new-pwd" placeholder="סיסמה חדשה" style="width:100%;padding:12px;border:1.5px solid rgba(255,255,255,0.15);border-radius:8px;font-family:Assistant,sans-serif;font-size:1.1rem;background:rgba(255,255,255,0.08);color:#fff;text-align:center;">' +
            '</div>',
          background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
          border: '1px solid rgba(255,255,255,0.15)',
          confirmButtonText: 'עדכן סיסמה',
          confirmButtonColor: '#b8953e',
          showCancelButton: true,
          cancelButtonText: 'ביטול',
          width: 380
        }).then(function(result) {
          if (!result.isConfirmed) return;
          var newPwd = document.getElementById('swal-manager-new-pwd') ? document.getElementById('swal-manager-new-pwd').value.trim() : '';
          if (!newPwd) return;
          fetch(RESET_MANAGER_PASSWORD_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: localStorage.getItem('admin_access_password'), managerId: rMgrId, newPassword: newPwd })
          }).then(function(res) { return res.json().catch(function() { return {}; }); })
            .then(function(data) {
              if (data && data.ok) {
                Swal.fire({ text: 'הסיסמה עודכנה', icon: 'success', timer: 1500, showConfirmButton: false, background: '#0c1425', color: '#fff' });
              } else {
                Swal.fire({ text: 'שגיאה בעדכון הסיסמה', icon: 'error', confirmButtonColor: '#b8953e', background: '#0c1425', color: '#fff' });
              }
            });
        });
        return;
      }

      var delBtn = e.target.closest('.manager-delete-btn');
      if (delBtn) {
        e.stopPropagation();
        var dMgrId = delBtn.dataset.managerId;
        var dUsername = delBtn.dataset.username;
        showConfirm('מחיקת מנהל אירוע', 'למחוק את "' + dUsername + '"? האירועים שלו יישארו זמינים לסופר אדמין.', function() {
          fetch(DELETE_EVENT_MANAGER_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: localStorage.getItem('admin_access_password'), managerId: dMgrId })
          }).then(function(res) { return res.json().catch(function() { return {}; }); })
            .then(function() { loadManagers(); });
        });
        return;
      }
    });
  }

  // "+ מנהל אירוע חדש" (super admin creates a new event-manager account)
  var newManagerBtn = document.getElementById('new-manager-btn');
  if (newManagerBtn) {
    newManagerBtn.addEventListener('click', function() {
      Swal.fire({
        html: '<div dir="rtl" style="text-align:right;">' +
          '<h2 style="color:#fff;font-family:Assistant,sans-serif;font-weight:800;font-size:1.3rem;margin:0 0 16px;text-align:center;">מנהל אירוע חדש</h2>' +
          '<label style="color:var(--text-muted);font-size:0.85rem;">שם מנהל אירוע</label>' +
          '<input type="text" id="swal-mgr-name" style="width:100%;padding:10px;margin:4px 0 12px;border:1.5px solid rgba(255,255,255,0.15);border-radius:8px;font-family:Assistant,sans-serif;font-size:1rem;background:rgba(255,255,255,0.08);color:#fff;">' +
          '<label style="color:var(--text-muted);font-size:0.85rem;">שם משתמש</label>' +
          '<input type="text" id="swal-mgr-username" dir="ltr" style="width:100%;padding:10px;margin:4px 0 12px;border:1.5px solid rgba(255,255,255,0.15);border-radius:8px;font-family:Assistant,sans-serif;font-size:1rem;background:rgba(255,255,255,0.08);color:#fff;">' +
          '<label style="color:var(--text-muted);font-size:0.85rem;">אימייל</label>' +
          '<input type="email" id="swal-mgr-email" dir="ltr" style="width:100%;padding:10px;margin:4px 0 12px;border:1.5px solid rgba(255,255,255,0.15);border-radius:8px;font-family:Assistant,sans-serif;font-size:1rem;background:rgba(255,255,255,0.08);color:#fff;">' +
          '<label style="color:var(--text-muted);font-size:0.85rem;">סיסמה</label>' +
          '<input type="text" id="swal-mgr-password" style="width:100%;padding:10px;margin:4px 0;border:1.5px solid rgba(255,255,255,0.15);border-radius:8px;font-family:Assistant,sans-serif;font-size:1rem;background:rgba(255,255,255,0.08);color:#fff;">' +
          '</div>',
        background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
        border: '1px solid rgba(255,255,255,0.15)',
        confirmButtonText: 'יצירה',
        confirmButtonColor: '#b8953e',
        showCancelButton: true,
        cancelButtonText: 'ביטול',
        width: 380,
        preConfirm: function() {
          var name = document.getElementById('swal-mgr-name').value.trim();
          var username = document.getElementById('swal-mgr-username').value.trim();
          var email = document.getElementById('swal-mgr-email').value.trim();
          var pwd = document.getElementById('swal-mgr-password').value.trim();
          if (!username || !pwd) {
            Swal.showValidationMessage('נא למלא שם משתמש וסיסמה');
            return false;
          }
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            Swal.showValidationMessage('כתובת מייל לא תקינה');
            return false;
          }
          return { name: name, username: username, email: email, password: pwd };
        }
      }).then(function(result) {
        if (!result.isConfirmed) return;
        fetch(CREATE_EVENT_MANAGER_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            password: localStorage.getItem('admin_access_password'),
            username: result.value.username,
            name: result.value.name,
            email: result.value.email,
            managerPassword: result.value.password
          })
        }).then(function(res) { return res.json().catch(function() { return {}; }); })
          .then(function(data) {
            if (data && data.ok) {
              loadManagers();
            } else if (data && data.error === 'username_taken') {
              Swal.fire({ text: 'שם המשתמש כבר תפוס', icon: 'error', confirmButtonColor: '#b8953e', background: '#0c1425', color: '#fff' });
            } else if (data && data.error === 'invalid_email') {
              Swal.fire({ text: 'כתובת המייל לא תקינה', icon: 'error', confirmButtonColor: '#b8953e', background: '#0c1425', color: '#fff' });
            } else {
              Swal.fire({ text: 'שגיאה ביצירת מנהל האירוע', icon: 'error', confirmButtonColor: '#b8953e', background: '#0c1425', color: '#fff' });
            }
          });
      });
    });
  }

  // "+ אירוע חדש" (an event manager creating one of their own events)
  var managerNewEventBtn = document.getElementById('manager-new-event-btn');
  if (managerNewEventBtn) {
    managerNewEventBtn.addEventListener('click', function() {
      Swal.fire({
        html: '<div dir="rtl" style="text-align:right;">' +
          '<h2 style="color:#fff;font-family:Assistant,sans-serif;font-weight:800;font-size:1.3rem;margin:0 0 16px;text-align:center;">אירוע חדש</h2>' +
          '<label style="color:var(--text-muted);font-size:0.85rem;">שם החוגג/ת</label>' +
          '<input type="text" id="swal-ev-celebrant" style="width:100%;padding:10px;margin:4px 0 12px;border:1.5px solid rgba(255,255,255,0.15);border-radius:8px;font-family:Assistant,sans-serif;font-size:1rem;background:rgba(255,255,255,0.08);color:#fff;">' +
          '<label style="color:var(--text-muted);font-size:0.85rem;">שם בעל האירוע</label>' +
          '<input type="text" id="swal-ev-organizer" style="width:100%;padding:10px;margin:4px 0 12px;border:1.5px solid rgba(255,255,255,0.15);border-radius:8px;font-family:Assistant,sans-serif;font-size:1rem;background:rgba(255,255,255,0.08);color:#fff;">' +
          '<label style="color:var(--text-muted);font-size:0.85rem;">טלפון בעל האירוע</label>' +
          '<input type="text" id="swal-ev-phone" dir="ltr" style="width:100%;padding:10px;margin:4px 0 12px;border:1.5px solid rgba(255,255,255,0.15);border-radius:8px;font-family:Assistant,sans-serif;font-size:1rem;background:rgba(255,255,255,0.08);color:#fff;">' +
          '<label style="color:var(--text-muted);font-size:0.85rem;">תאריך האירוע</label>' +
          '<input type="date" id="swal-ev-date" style="width:100%;padding:10px;margin:4px 0;border:1.5px solid rgba(255,255,255,0.15);border-radius:8px;font-family:Assistant,sans-serif;font-size:1rem;background:rgba(255,255,255,0.08);color:#fff;">' +
          '</div>',
        background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
        border: '1px solid rgba(255,255,255,0.15)',
        confirmButtonText: 'יצירת אירוע',
        confirmButtonColor: '#b8953e',
        showCancelButton: true,
        cancelButtonText: 'ביטול',
        width: 380,
        showLoaderOnConfirm: true,
        preConfirm: function() {
          var celebrantName = document.getElementById('swal-ev-celebrant').value.trim();
          var organizerName = document.getElementById('swal-ev-organizer').value.trim();
          var organizerPhone = document.getElementById('swal-ev-phone').value.trim();
          var eventDate = document.getElementById('swal-ev-date').value;
          if (!celebrantName || !organizerName || !organizerPhone || !eventDate) {
            Swal.showValidationMessage('נא למלא את כל השדות');
            return false;
          }
          return fetch(CREATE_MANAGER_EVENT_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              managerId: managerId,
              password: localStorage.getItem('admin_access_password'),
              celebrantName: celebrantName,
              organizerName: organizerName,
              organizerPhone: organizerPhone,
              eventDate: eventDate
            })
          }).then(function(res) { return res.json().catch(function() { return {}; }); })
            .then(function(data) {
              if (!data || !data.ok) {
                Swal.showValidationMessage('שגיאה ביצירת האירוע');
                return false;
              }
              return true;
            }).catch(function() {
              Swal.showValidationMessage('שגיאת תקשורת, נסו שוב');
              return false;
            });
        }
      }).then(function(result) {
        if (!result.isConfirmed) return;
        loadEvents();
        Swal.fire({
          text: 'אירוע חדש הוקם',
          icon: 'success',
          timer: 1600,
          showConfirmButton: false,
          background: '#0c1425',
          color: '#fff'
        });
      });
    });
  }

  // ===== EVENT DETAIL VIEW (Blessings) =====
  function showEventDetail(eventId) {
    currentEventId = eventId;
    eventsView.style.display = 'none';
    eventDetailView.style.display = 'block';
    if (leadsView) leadsView.style.display = 'none';
    syncEventUrl(eventId);

    // Hide back button for sub-admin
    var backBtn = document.getElementById('back-to-events');
    if (backBtn) backBtn.style.display = (isMainAdmin || isManager) ? 'inline-flex' : 'none';
    var sideBackBtn = document.getElementById('back-to-events-side');
    if (sideBackBtn) sideBackBtn.style.display = (isMainAdmin || isManager) ? 'inline-flex' : 'none';

    // An event manager already has full access to every event they own via
    // their own login - the per-event sub-admin password is only meaningful
    // for private events with no manager account, so hide it for managers.
    var changePwdBtn = document.getElementById('change-pwd-btn');
    if (changePwdBtn) changePwdBtn.style.display = isManager ? 'none' : '';

    // Load event meta
    getEventMeta(eventId).then(function(meta) {
      if (!meta) return;
      var celebrant = meta.celebrantName || '';
      document.getElementById('detail-title').textContent = 'ניהול - ' + celebrant;
      document.getElementById('detail-subtitle').textContent = 'מארגן: ' + (meta.organizerName || '') + ' | תאריך: ' + (meta.eventDate || '');

      // Book/QR open in-page (a modal) instead of navigating away, so the
      // admin never loses their place in this event's panel.
      document.getElementById('detail-book-link').onclick = function() {
        openInModal('book.html?event=' + eventId, 'ספר ברכות');
      };
      document.getElementById('detail-qr-link').onclick = function() {
        openInModal('qr.html?event=' + eventId, 'QR');
      };
    });

    // Change sub-admin password button
    document.getElementById('change-pwd-btn').onclick = function() {
      getAdminCredential().then(function(callerPassword) {
        if (!callerPassword) return;
        return Promise.all([
          fetch(GET_EVENT_PASSWORD_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId: eventId, password: callerPassword })
          }).then(function(res) { return res.json().catch(function() { return {}; }); }),
          getEventMeta(eventId)
        ]).then(function(results) {
        var pwdData = results[0];
        var meta = results[1] || {};
        var currentPwd = (pwdData && pwdData.ok) ? (pwdData.password || '') : '';
        var evName = meta.celebrantName || '';
        var evPhone = meta.organizerPhone || '';

        Swal.fire({
          html: '<div dir="rtl" style="text-align:center; padding:8px 0;">' +
            '<h2 style="color:#fff; font-family:Assistant,sans-serif; font-weight:800; font-size:1.4rem; margin:0 0 16px;">סיסמת תת-מנהל - ' + evName + '</h2>' +
            '<div style="background:rgba(255,255,255,0.06); border-radius:8px; padding:12px; margin-bottom:16px;">' +
              '<p style="color:var(--text-muted); font-size:0.85rem; margin:0 0 4px;">סיסמה נוכחית:</p>' +
              '<p style="color:var(--gold-light); font-size:1.8rem; font-weight:800; letter-spacing:4px; margin:0;">' + (currentPwd || 'לא הוגדרה') + '</p>' +
            '</div>' +
            '<p style="color:rgba(255,255,255,0.5); font-size:0.85rem; margin:0 0 12px;">שנה סיסמה:</p>' +
            '<input type="text" id="swal-change-pwd" value="' + currentPwd + '" maxlength="6" style="width:120px; padding:10px; border:1.5px solid rgba(255,255,255,0.15); border-radius:8px; font-family:Assistant,sans-serif; font-size:1.3rem; background:rgba(255,255,255,0.08); color:#fff; text-align:center; letter-spacing:3px;">' +
            '<div style="margin-top:16px;"><button id="swal-copy-link2" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); color:rgba(255,255,255,0.7); padding:8px 16px; border-radius:8px; font-family:Assistant,sans-serif; font-size:0.85rem; cursor:pointer;">📋 העתק קישור + סיסמה</button></div>' +
            '</div>',
          background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
          border: '1px solid rgba(255,255,255,0.15)',
          showDenyButton: true,
          confirmButtonText: '📱 שלח בוואטסאפ',
          confirmButtonColor: '#25D366',
          denyButtonText: '✅ אשר שינוי סיסמה',
          denyButtonColor: '#b8953e',
          showCancelButton: true,
          cancelButtonText: 'סגור',
          width: 400,
          didOpen: function() {
            document.getElementById('swal-copy-link2').addEventListener('click', function() {
              var pwd = document.getElementById('swal-change-pwd').value.trim() || currentPwd;
              var copyText = 'ניהול האירוע של ' + evName + '\nכניסה: https://hchc.co.il/admin\nסיסמה: ' + pwd;
              navigator.clipboard.writeText(copyText).then(function() {
                document.getElementById('swal-copy-link2').textContent = '✅ הועתק!';
                setTimeout(function() { document.getElementById('swal-copy-link2').textContent = '📋 העתק קישור + סיסמה'; }, 2000);
              });
            });
          }
        }).then(function(result) {
          var newPwd = document.getElementById('swal-change-pwd') ? document.getElementById('swal-change-pwd').value.trim() : currentPwd;
          if (result.isConfirmed) {
            if (newPwd && newPwd !== currentPwd) {
              callSetEventPassword(eventId, newPwd, callerPassword);
            }
            var phone = evPhone.replace(/[-\s]/g, '');
            if (phone.startsWith('0')) phone = '972' + phone.slice(1);
            var msg = encodeURIComponent('שלום! הגישה לניהול האירוע של ' + evName + ':\n\nכניסה: hchc.co.il/admin\nסיסמה: ' + (newPwd || currentPwd) + '\n\nמזל טוב! 🎉');
            window.open('https://wa.me/' + phone + '?text=' + msg, '_blank');
          } else if (result.isDenied) {
            if (newPwd && newPwd !== currentPwd) {
              callSetEventPassword(eventId, newPwd, callerPassword);
              Swal.fire({ text: 'הסיסמה עודכנה! מעביר למסך התחברות...', icon: 'success', timer: 2000, showConfirmButton: false, background: '#0c1425', color: '#fff' }).then(function() {
                localStorage.removeItem('admin_auth');
                localStorage.removeItem('sub_admin_event');
                window.location.href = 'admin.html';
              });
            }
          }
        });
        });
      });
    };

    // Refresh screens button
    document.getElementById('refresh-screens-btn').onclick = function() {
      db.ref('events/' + eventId + '/screenControl/refresh').set(true);
      showConfirm('המסכים רועננו', 'כל המסכים המחוברים יטענו מחדש', null);
    };

    // Notification email button - where "new blessing pending review" emails get sent
    document.getElementById('notify-email-btn').onclick = function() {
      db.ref('events/' + eventId + '/meta/notifyEmail').once('value', function(snap) {
        var currentEmail = snap.val() || '';
        Swal.fire({
          html: '<div dir="rtl" style="text-align:center;">' +
            '<h2 style="color:#fff;font-family:Assistant,sans-serif;font-weight:800;font-size:1.35rem;margin:0 0 12px;">📧 מייל להתראות</h2>' +
            '<p style="color:rgba(255,255,255,0.55);font-size:0.9rem;margin:0 0 14px;">לכתובת הזו יישלח מייל בכל פעם שברכה חדשה ממתינה לאישור</p>' +
            (currentEmail
              ? '<p style="color:rgba(255,255,255,0.75);font-size:0.85rem;margin:0 0 10px;">זו כתובת המייל הקיימת - רוצים לשנות למייל אחר? פשוט ערכו אותה למטה</p>'
              : '') +
            '<input type="email" id="swal-notify-email" dir="ltr" value="' + escapeHtml(currentEmail) + '" placeholder="name@example.com" style="width:240px;padding:12px;border:1.5px solid rgba(255,255,255,0.15);border-radius:8px;font-family:Assistant,sans-serif;font-size:1.05rem;background:rgba(255,255,255,0.08);color:#fff;text-align:center;">' +
            '</div>',
          background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
          border: '1px solid rgba(255,255,255,0.15)',
          confirmButtonText: 'שמור',
          confirmButtonColor: '#b8953e',
          showCancelButton: true,
          cancelButtonText: 'ביטול',
          width: 380,
          preConfirm: function() {
            var val = document.getElementById('swal-notify-email').value.trim();
            if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
              Swal.showValidationMessage('כתובת מייל לא תקינה');
              return false;
            }
            return val;
          }
        }).then(function(result) {
          if (result.isConfirmed) {
            db.ref('events/' + eventId + '/meta/notifyEmail').set(result.value || '');
            updateModeEmailHint(result.value || '');
            showConfirm('נשמר', 'כתובת המייל עודכנה', null);
          }
        });
      });
    };

    document.getElementById('slider-settings-btn').onclick = function() {
      var screenControlRef = db.ref('events/' + eventId + '/screenControl');
      Promise.all([
        screenControlRef.child('slideIntervalSeconds').once('value'),
        screenControlRef.child('qrIntervalSeconds').once('value')
      ]).then(function(snaps) {
        var currentSeconds = Number(snaps[0].val()) || 13;
        if (!Number.isFinite(currentSeconds) || currentSeconds < 1 || currentSeconds > 60) currentSeconds = 13;

        var qrRaw = snaps[1].val();
        var qrNum = Number(qrRaw);
        var qrCustom = (qrRaw !== null && qrRaw !== undefined && Number.isFinite(qrNum) && qrNum >= 1 && qrNum <= 60);
        var currentQrSeconds = qrCustom ? Math.round(qrNum) : currentSeconds;

        Swal.fire({
          html: '<div dir="rtl" style="text-align:center;">' +
            '<h2 style="color:#fff;font-family:Assistant,sans-serif;font-weight:800;font-size:1.35rem;margin:0 0 12px;">הגדרת זמן סליידר</h2>' +
            '<p style="color:rgba(255,255,255,0.55);font-size:0.9rem;margin:0 0 14px;">כמה שניות להציג כל שקופית?</p>' +
            '<input type="number" id="swal-slider-seconds" min="1" max="60" value="' + currentSeconds + '" style="width:120px;padding:12px;border:1.5px solid rgba(255,255,255,0.15);border-radius:8px;font-family:Assistant,sans-serif;font-size:1.4rem;background:rgba(255,255,255,0.08);color:#fff;text-align:center;">' +
            '<p style="color:rgba(255,255,255,0.38);font-size:0.78rem;margin:10px 0 0;">טווח מומלץ: 1-60 שניות</p>' +
            '<div style="border-top:1px solid rgba(255,255,255,0.12);margin:18px 0 14px;"></div>' +
            '<label style="display:flex;align-items:center;justify-content:center;gap:8px;color:rgba(255,255,255,0.75);font-size:0.88rem;cursor:pointer;">' +
              '<input type="checkbox" id="swal-qr-different"' + (qrCustom ? ' checked' : '') + ' style="width:16px;height:16px;cursor:pointer;">' +
              'זמן שונה לשקופית ה-QR' +
            '</label>' +
            '<div id="swal-qr-wrap" style="margin-top:12px;' + (qrCustom ? '' : 'display:none;') + '">' +
              '<p style="color:rgba(255,255,255,0.55);font-size:0.85rem;margin:0 0 10px;">כמה שניות להציג את שקופית ה-QR?</p>' +
              '<input type="number" id="swal-qr-seconds" min="1" max="60" value="' + currentQrSeconds + '" style="width:120px;padding:12px;border:1.5px solid rgba(255,255,255,0.15);border-radius:8px;font-family:Assistant,sans-serif;font-size:1.4rem;background:rgba(255,255,255,0.08);color:#fff;text-align:center;">' +
            '</div>' +
            '</div>',
          background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
          border: '1px solid rgba(255,255,255,0.15)',
          confirmButtonText: 'שמור',
          confirmButtonColor: '#b8953e',
          showCancelButton: true,
          cancelButtonText: 'ביטול',
          width: 380,
          didOpen: function() {
            var checkbox = document.getElementById('swal-qr-different');
            var wrap = document.getElementById('swal-qr-wrap');
            checkbox.addEventListener('change', function() {
              wrap.style.display = checkbox.checked ? '' : 'none';
            });
          },
          preConfirm: function() {
            var seconds = Number(document.getElementById('swal-slider-seconds').value);
            if (!Number.isFinite(seconds) || seconds < 1 || seconds > 60) {
              Swal.showValidationMessage('נא לבחור מספר בין 1 ל-60 שניות עבור הסליידר');
              return false;
            }
            var qrDifferent = document.getElementById('swal-qr-different').checked;
            var qrSeconds = null;
            if (qrDifferent) {
              qrSeconds = Number(document.getElementById('swal-qr-seconds').value);
              if (!Number.isFinite(qrSeconds) || qrSeconds < 1 || qrSeconds > 60) {
                Swal.showValidationMessage('נא לבחור מספר בין 1 ל-60 שניות עבור שקופית ה-QR');
                return false;
              }
              qrSeconds = Math.round(qrSeconds);
            }
            return { seconds: Math.round(seconds), qrSeconds: qrSeconds };
          }
        }).then(function(result) {
          if (!result.isConfirmed) return;
          screenControlRef.update({
            slideIntervalSeconds: result.value.seconds,
            qrIntervalSeconds: result.value.qrSeconds
          }).then(function() {
            Swal.fire({
              text: 'הגדרת הסליידר נשמרה',
              icon: 'success',
              timer: 1400,
              showConfirmButton: false,
              background: '#0c1425',
              color: '#fff'
            });
          }).catch(function() {
            Swal.fire({
              text: 'שמירת ההגדרה נכשלה',
              icon: 'error',
              confirmButtonText: 'הבנתי',
              confirmButtonColor: '#b8953e',
              background: '#0c1425',
              color: '#fff'
            });
          });
        });
      });
    };

    document.getElementById('screen-images-btn').onclick = function() {
      openScreenImagesManager(eventId);
    };

    // Logout from event + disconnect screen
    document.getElementById('logout-event-btn').onclick = function() {
      db.ref('events/' + eventId + '/screenControl/disconnect').set(true);
      localStorage.removeItem('admin_auth');
      localStorage.removeItem('sub_admin_event');
      localStorage.removeItem('admin_access_password');
      window.location.href = '/';
    };

    // Blessing page link - same "open in new tab?" pattern as the screen
    // button, so clicking it never navigates the admin panel itself away.
    document.getElementById('detail-blessing-link').onclick = function() {
      var blessingUrl = 'https://hchc.co.il/e/' + eventId;
      Swal.fire({
        html: '<div dir="rtl" style="text-align:center;">' +
          '<h2 style="color:#fff; font-family:Assistant,sans-serif; font-weight:800; font-size:1.4rem; margin:0 0 12px;">דף הברכות</h2>' +
          '<p style="color:rgba(255,255,255,0.5); font-size:0.9rem; margin-bottom:16px;">הכתובת לאורחים לכתיבת ברכה:</p>' +
          '<div style="background:rgba(255,255,255,0.06); border-radius:8px; padding:12px; margin-bottom:16px; word-break:break-all;">' +
            '<p style="color:var(--gold-light); font-size:0.85rem; margin:0; direction:ltr;">' + blessingUrl + '</p>' +
          '</div>' +
          '<button id="swal-open-blessing-tab" style="background:rgba(212,176,101,0.15); border:1px solid rgba(212,176,101,0.4); color:var(--gold-light); padding:14px 24px; border-radius:10px; font-family:Assistant,sans-serif; font-size:1rem; font-weight:700; cursor:pointer; width:100%;">📝 פתח את דף הברכות בטאב חדש</button>' +
          '<button id="swal-copy-blessing-url" style="margin-top:12px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); color:rgba(255,255,255,0.7); padding:8px 16px; border-radius:8px; font-family:Assistant,sans-serif; font-size:0.85rem; cursor:pointer;">📋 העתק כתובת</button>' +
          '</div>',
        background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
        border: '1px solid rgba(255,255,255,0.15)',
        showConfirmButton: false,
        showCloseButton: true,
        width: 420,
        didOpen: function() {
          document.getElementById('swal-open-blessing-tab').addEventListener('click', function() {
            window.open(blessingUrl, '_blank');
          });
          document.getElementById('swal-copy-blessing-url').addEventListener('click', function() {
            navigator.clipboard.writeText(blessingUrl).then(function() {
              document.getElementById('swal-copy-blessing-url').textContent = '✅ הועתק!';
            });
          });
        }
      });
    };

    // Show screen URL/QR button
    document.getElementById('detail-screen-btn').onclick = function() {
      var screenUrl = 'https://hchc.co.il/screen.html?event=' + eventId;
      Swal.fire({
        html: '<div dir="rtl" style="text-align:center;">' +
          '<h2 style="color:#fff; font-family:Assistant,sans-serif; font-weight:800; font-size:1.4rem; margin:0 0 12px;">הפעלת מסך</h2>' +
          '<p style="color:rgba(255,255,255,0.5); font-size:0.9rem; margin-bottom:16px;">פתחו את הכתובת הזו בדפדפן של המסך/טלוויזיה:</p>' +
          '<div style="background:rgba(255,255,255,0.06); border-radius:8px; padding:12px; margin-bottom:16px; word-break:break-all;">' +
            '<p style="color:var(--gold-light); font-size:0.85rem; margin:0; direction:ltr;">' + screenUrl + '</p>' +
          '</div>' +
          '<button id="swal-open-screen-tab" style="background:rgba(212,176,101,0.15); border:1px solid rgba(212,176,101,0.4); color:var(--gold-light); padding:14px 24px; border-radius:10px; font-family:Assistant,sans-serif; font-size:1rem; font-weight:700; cursor:pointer; width:100%;">🖥 פתח את המסך בטאב חדש</button>' +
          '<button id="swal-copy-screen-url" style="margin-top:12px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); color:rgba(255,255,255,0.7); padding:8px 16px; border-radius:8px; font-family:Assistant,sans-serif; font-size:0.85rem; cursor:pointer;">📋 העתק כתובת</button>' +
          '</div>',
        background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
        border: '1px solid rgba(255,255,255,0.15)',
        showConfirmButton: false,
        showCloseButton: true,
        width: 420,
        didOpen: function() {
          document.getElementById('swal-open-screen-tab').addEventListener('click', function() {
            window.open(screenUrl, '_blank');
          });
          document.getElementById('swal-copy-screen-url').addEventListener('click', function() {
            navigator.clipboard.writeText(screenUrl).then(function() {
              document.getElementById('swal-copy-screen-url').textContent = '✅ הועתק!';
            });
          });
        }
      });
    };

    // Auto-mode switch
    var autoSwitch = document.getElementById('auto-mode-switch');
    var switchTrack = document.getElementById('switch-track');
    var switchThumb = document.getElementById('switch-thumb');
    var modeLabel = document.getElementById('mode-label');
    var modeDesc = document.getElementById('mode-desc');
    var modeEmailHint = document.getElementById('mode-email-hint');

    function updateModeEmailHint(email) {
      if (!modeEmailHint) return;
      modeEmailHint.textContent = email ? ('📧 נשלח אל: ' + email) : '📧 לא הוגדרה כתובת מייל - לחץ "מייל להתראות" להגדרה';
      modeEmailHint.style.color = email ? 'var(--text-muted)' : '#e0a53e';
    }

    // Load current mode
    db.ref('events/' + eventId + '/meta/autoMode').on('value', function(snap) {
      var isAuto = snap.val() === true;
      autoSwitch.checked = isAuto;
      updateSwitchUI(isAuto);
    });

    // Load current notification email
    db.ref('events/' + eventId + '/meta/notifyEmail').on('value', function(snap) {
      updateModeEmailHint(snap.val() || '');
    });

    function updateSwitchUI(isAuto) {
      if (isAuto) {
        switchTrack.style.background = '#2ecc71';
        switchThumb.style.left = '27px';
        modeLabel.textContent = 'מצב העלאה חופשית (AI)';
        modeDesc.textContent = 'ברכות עולות אוטומטית אחרי אישור AI';
      } else {
        switchTrack.style.background = '#e74c3c';
        switchThumb.style.left = '3px';
        modeLabel.textContent = 'מצב ביקורת אנושית';
        modeDesc.textContent = 'ברכות מחכות לאישור ידני + מייל';
      }
    }

    autoSwitch.addEventListener('change', function() {
      var isAuto = autoSwitch.checked;
      if (isAuto) {
        // Show warning SweetAlert
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            html: '<div dir="rtl" style="text-align:center; padding:8px 0;">' +
              '<div style="color:#ffc107; font-family:Assistant,sans-serif; font-weight:700; font-size:0.95rem; margin:0 auto 16px;">מצב אישור AI בלבד (ללא בדיקה ידנית)</div>' +
              '<h2 style="color:#fff; font-family:Assistant,sans-serif; font-weight:800; font-size:1.4rem; margin:0 0 12px;">מצב העלאה חופשית</h2>' +
              '<p style="color:rgba(255,255,255,0.6); font-size:0.95rem; line-height:1.8; margin:0;">שים לב! במצב זה הברכות יעלו למסך<br>באישור AI בלבד ללא בדיקה ידנית.<br><br><strong style="color:#ffc107;">מומלץ להשתמש במצב ביקורת אנושית</strong><br>כדי למנוע ברכות לא מתאימות</p></div>',
            background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
            border: '1px solid rgba(255,193,7,0.2)',
            confirmButtonText: 'הבנתי, הפעל מצב אוטומטי',
            confirmButtonColor: '#b8953e',
            showCancelButton: true,
            cancelButtonText: 'ביטול',
            width: 400,
          }).then(function(result) {
            if (result.isConfirmed) {
              db.ref('events/' + eventId + '/meta/autoMode').set(true);
            } else {
              autoSwitch.checked = false;
              updateSwitchUI(false);
            }
          });
        } else {
          db.ref('events/' + eventId + '/meta/autoMode').set(true);
        }
      } else {
        // Show explanation SweetAlert
        if (typeof Swal !== 'undefined') {
          db.ref('events/' + eventId + '/meta/notifyEmail').once('value', function(emailSnap) {
            var notifyEmail = emailSnap.val() || '';
            var emailLine = notifyEmail
              ? '<br><br><strong style="color:#e74c3c;">תקבל מייל על כל ברכה חדשה</strong><br>לכתובת ' + escapeHtml(notifyEmail) + ' עם קישור לאישור או דחייה'
              : '<br><br><strong style="color:#e74c3c;">תקבל מייל על כל ברכה חדשה</strong><br>עם קישור לאישור או דחייה<br><span style="color:#ffc107;">⚠ עדיין לא הגדרת כתובת מייל - הגדר דרך כפתור "מייל להתראות"</span>';
            Swal.fire({
              html: '<div dir="rtl" style="text-align:center; padding:8px 0;">' +
                '<div style="display:inline-block; background:rgba(231,76,60,0.12); border:1px solid rgba(231,76,60,0.35); color:#ff8a7a; font-family:Assistant,sans-serif; font-weight:700; font-size:0.85rem; padding:7px 16px; border-radius:999px; margin:0 auto 18px;">🔔 מצב ביקורת אנושית עם התראת מייל על כל ברכה חדשה</div>' +
                '<h2 style="color:#fff; font-family:Assistant,sans-serif; font-weight:800; font-size:1.4rem; margin:0 0 12px;">מצב ביקורת אנושית</h2>' +
                '<p style="color:rgba(255,255,255,0.6); font-size:0.95rem; line-height:1.8; margin:0;">מעכשיו כל ברכה חדשה תמתין<br>לאישור ידני שלך לפני שהיא עולה למסך.' + emailLine + '</p></div>',
              background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
              border: '1px solid rgba(231,76,60,0.2)',
              confirmButtonText: 'הבנתי, הפעל ביקורת אנושית',
              confirmButtonColor: '#b8953e',
              showCancelButton: true,
              cancelButtonText: 'ביטול',
              width: 400,
            }).then(function(result) {
              if (result.isConfirmed) {
                db.ref('events/' + eventId + '/meta/autoMode').set(false);
              } else {
                autoSwitch.checked = true;
                updateSwitchUI(true);
              }
            });
          });
        } else {
          db.ref('events/' + eventId + '/meta/autoMode').set(false);
        }
      }
    });

    // Listen for blessings
    var blessingsLoader = document.getElementById('blessings-loader');
    if (blessingsLoader) blessingsLoader.style.display = 'flex';

    blessingsUnsubscribe = onBlessingsChanged(eventId, function(blessings) {
      updateStats(blessings);
      renderList(blessings);
    });

    trashUnsubscribe = onTrashChanged(eventId, function(trashed) {
      var trashCount = document.getElementById('trash-count');
      if (trashCount) trashCount.textContent = trashed.length;
    });

    // Load screen images preview (separate from blessings)
    loadDashboardScreenImages(eventId);
  }

  // Screen images preview on the main dashboard - so they're not confused with blessings
  async function loadDashboardScreenImages(eventId) {
    var grid = document.getElementById('dashboard-screen-images-grid');
    var empty = document.getElementById('dashboard-screen-images-empty');
    var countEl = document.getElementById('dashboard-screen-images-count');
    if (!grid) return;

    var password = localStorage.getItem('admin_access_password');
    if (!password) return;

    try {
      var result = await callScreenImagesApi({ action: 'list', eventId: eventId, password: password });
      var images = result.images || [];
      if (countEl) countEl.textContent = images.length;

      if (images.length === 0) {
        grid.style.display = 'none';
        grid.innerHTML = '';
        if (empty) { empty.style.display = 'block'; empty.textContent = 'אין תמונות למסך'; }
        return;
      }

      if (empty) empty.style.display = 'none';
      grid.style.display = 'grid';
      grid.innerHTML = images.map(function(img) {
        return '<div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;">' +
          '<img src="' + img.dataUrl + '" alt="" style="width:100%;height:90px;object-fit:cover;display:block;background:#07101f;">' +
          '<button class="dashboard-screen-image-delete" data-id="' + img.id + '" style="width:100%;border:0;border-top:1px solid rgba(255,255,255,0.08);background:rgba(229,85,85,0.12);color:#ff8b8b;padding:6px;font-family:Assistant,sans-serif;font-size:0.75rem;font-weight:700;cursor:pointer;">מחק</button>' +
        '</div>';
      }).join('');
    } catch (err) {
      grid.style.display = 'none';
      grid.innerHTML = '';
      if (empty) { empty.style.display = 'block'; empty.textContent = 'שגיאה בטעינת התמונות'; }
    }
  }

  // Delete from the dashboard preview grid (delegated - grid is static in the DOM)
  var dashboardScreenImagesGrid = document.getElementById('dashboard-screen-images-grid');
  if (dashboardScreenImagesGrid) {
    dashboardScreenImagesGrid.addEventListener('click', async function(e) {
      var btn = e.target.closest('.dashboard-screen-image-delete');
      if (!btn) return;
      var imageId = btn.getAttribute('data-id');
      var password = await getAdminCredential();
      if (!password) return;
      btn.disabled = true;
      btn.textContent = 'מוחק...';
      try {
        await callScreenImagesApi({ action: 'delete', eventId: currentEventId, password: password, imageId: imageId });
        loadDashboardScreenImages(currentEventId);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'מחק';
        showScreenImageError('מחיקת התמונה נכשלה');
      }
    });
  }

  // Back to events
  document.getElementById('back-to-events').addEventListener('click', function() {
    showEventsView();
  });

  var backToEventsSideBtn = document.getElementById('back-to-events-side');
  if (backToEventsSideBtn) {
    backToEventsSideBtn.addEventListener('click', function() {
      showEventsView();
    });
  }

  // Stats
  async function updateStats(blessings) {
    document.getElementById('stat-total').textContent = blessings.length;

    var today = new Date().toDateString();
    var todayCount = blessings.filter(function(b) { return new Date(b.createdAt).toDateString() === today; }).length;
    document.getElementById('stat-today').textContent = todayCount;

    var usage = await getStorageUsage(currentEventId);
    document.getElementById('stat-storage').textContent = usage.usedKB;

    if (blessings.length > 0) {
      document.getElementById('stat-popular').textContent = blessings.length + ' ברכות';
      document.getElementById('stat-popular').style.fontSize = '0.9rem';
    } else {
      document.getElementById('stat-popular').textContent = '-';
    }

    document.getElementById('list-count').textContent = blessings.length;
  }

  // Render blessings list
  function renderList(blessings) {
    var loader = document.getElementById('blessings-loader');
    if (loader) loader.style.display = 'none';

    var blessingsList = document.getElementById('blessings-list');
    var emptyAdmin = document.getElementById('empty-admin');

    if (blessings.length === 0) {
      blessingsList.style.display = 'none';
      emptyAdmin.style.display = 'block';
      return;
    }

    emptyAdmin.style.display = 'none';
    blessingsList.style.display = 'flex';

    var sorted = blessings.slice().reverse();

    blessingsList.innerHTML = sorted.map(function(b) {
      var text = b.text || '';
      var name = b.name || '(ללא שם)';
      var date = b.createdAt ? new Date(b.createdAt).toLocaleDateString('he-IL', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      }) : '';
      var shortText = escapeHtml(text).substring(0, 40) + (text.length > 40 ? '...' : '');
      var hasLongText = text.length > 40;

      var status = b.status;
      var isChecking = !status;
      var isRejected = status === 'rejected';
      var isPending = status === 'pending';
      var isApproved = status === 'approved';
      var statusClass = isChecking ? 'status-checking' : isApproved ? 'status-approved' : isRejected ? 'status-rejected' : 'status-pending';
      var statusText = isChecking ? '🔍 בודק...' : isApproved ? 'אושר לעלות' : isRejected ? 'אין אישור להעלאה' : 'ממתין לאישור';

      var actionBtns = '';
      if (isChecking) {
        actionBtns = '<span style="color:var(--gold); font-size:0.7rem; opacity:0.7;">AI בודק...</span>';
      } else if (isPending) {
        actionBtns = '<button class="blessing-item-approve" data-id="' + b.id + '">אשר העלאה</button>';
      } else if (isRejected) {
        actionBtns = '<button class="blessing-item-approve" data-id="' + b.id + '">אשר בכל זאת</button>';
      }

      // Dropdown content: full text + rejected info
      var dropdownContent = '';
      if (hasLongText || isRejected) {
        dropdownContent = '<div class="blessing-item-dropdown" data-dropdown="' + b.id + '">';
        if (hasLongText) {
          dropdownContent += '<div class="blessing-full-text">' + escapeHtml(text) + '</div>';
        }
        if (isRejected) {
          dropdownContent += '<div style="margin-top:8px;background:rgba(229,85,85,0.1);border:1px solid rgba(229,85,85,0.2);border-radius:6px;padding:8px;font-size:0.75rem;">' +
            '<span style="color:#e55;">הודעה חשודה - יש לבדוק</span>' +
            (b.rejectReason ? '<br><span style="color:rgba(255,255,255,0.5);">סיבה: ' + escapeHtml(b.rejectReason) + '</span>' : '') +
          '</div>';
        }
        dropdownContent += '</div>';
      }

      var toggleBtn = (hasLongText || isRejected) ? '<button class="blessing-item-toggle" data-toggle="' + b.id + '">▼ פרטים</button>' : '';

      return '<div class="blessing-item ' + statusClass + '" data-id="' + b.id + '"' + (isChecking ? ' style="opacity:0.6; pointer-events:none;"' : '') + '>' +
        '<div class="blessing-item-row">' +
          (b.photoDataUrl && b.photoDataUrl.length > 10
            ? '<img class="blessing-item-photo" src="' + escapeHtml(b.photoDataUrl) + '" alt="' + escapeHtml(name) + '">'
            : '<div class="blessing-item-photo blessing-item-no-photo">אין תמונה</div>') +
          '<div class="blessing-item-info">' +
            '<span class="blessing-item-name">' + escapeHtml(name) + '</span>' +
            '<span class="blessing-item-text">' + shortText + '</span>' +
            '<span class="blessing-item-meta">' + date + '</span>' +
          '</div>' +
          '<span class="blessing-item-status ' + statusClass + '">' + statusText + '</span>' +
          actionBtns +
          toggleBtn +
          (isChecking ? '' : '<button class="blessing-item-edit" data-id="' + b.id + '" title="ערוך" style="background:none;border:1px solid rgba(184,149,62,0.35);color:var(--gold-light);padding:4px 9px;border-radius:6px;cursor:pointer;font-size:0.75rem;font-family:Assistant,sans-serif;">ערוך</button>') +
          (isChecking ? '' : '<button class="blessing-item-delete" data-id="' + b.id + '" title="מחק">✕</button>') +
        '</div>' +
        dropdownContent +
      '</div>';
    }).join('');
  }

  // Approve / Delete / Toggle warning
  document.getElementById('blessings-list').addEventListener('click', function(e) {
    // Dropdown toggle
    var toggleBtn = e.target.closest('.blessing-item-toggle');
    if (toggleBtn) {
      var id = toggleBtn.dataset.toggle;
      var dropdown = toggleBtn.closest('.blessing-item').querySelector('[data-dropdown="' + id + '"]');
      if (dropdown) {
        dropdown.classList.toggle('open');
        toggleBtn.textContent = dropdown.classList.contains('open') ? '▲ סגור' : '▼ פרטים';
      }
      return;
    }

    var editBtn = e.target.closest('.blessing-item-edit');
    if (editBtn && currentEventId) {
      var editId = editBtn.dataset.id;
      db.ref('events/' + currentEventId + '/blessings/' + editId).once('value', function(snap) {
        var blessing = snap.val();
        if (!blessing) return;

        Swal.fire({
          html: '<div dir="rtl" style="text-align:right;">' +
            '<h2 style="color:#fff;font-family:Assistant,sans-serif;font-weight:800;font-size:1.35rem;margin:0 0 16px;text-align:center;">עריכת ברכה</h2>' +
            '<label style="display:block;color:rgba(255,255,255,0.65);font-size:0.85rem;margin-bottom:6px;">שם</label>' +
            '<input id="swal-edit-name" type="text" value="' + escapeHtml(blessing.name || '') + '" style="width:100%;padding:12px 14px;border:1.5px solid rgba(255,255,255,0.15);border-radius:8px;font-family:Assistant,sans-serif;font-size:1rem;background:rgba(255,255,255,0.08);color:#fff;margin-bottom:12px;">' +
            '<label style="display:block;color:rgba(255,255,255,0.65);font-size:0.85rem;margin-bottom:6px;">טקסט הברכה</label>' +
            '<textarea id="swal-edit-text" rows="5" style="width:100%;padding:12px 14px;border:1.5px solid rgba(255,255,255,0.15);border-radius:8px;font-family:Assistant,sans-serif;font-size:1rem;background:rgba(255,255,255,0.08);color:#fff;resize:vertical;">' + escapeHtml(blessing.text || '') + '</textarea>' +
            '</div>',
          background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
          border: '1px solid rgba(255,255,255,0.15)',
          confirmButtonText: 'שמור',
          confirmButtonColor: '#b8953e',
          showCancelButton: true,
          cancelButtonText: 'ביטול',
          width: 460,
          preConfirm: function() {
            var name = document.getElementById('swal-edit-name').value.trim();
            var text = document.getElementById('swal-edit-text').value.trim();
            if (!name || !text) {
              Swal.showValidationMessage('נא למלא שם וטקסט ברכה');
              return false;
            }
            return { name: name, text: text };
          }
        }).then(function(result) {
          if (!result.isConfirmed) return;
          db.ref('events/' + currentEventId + '/blessings/' + editId).update({
            name: result.value.name,
            text: result.value.text,
            updatedAt: new Date().toISOString()
          }).then(function() {
            Swal.fire({
              text: 'הברכה עודכנה',
              icon: 'success',
              timer: 1400,
              showConfirmButton: false,
              background: '#0c1425',
              color: '#fff'
            });
          }).catch(function() {
            Swal.fire({
              text: 'שמירת הברכה נכשלה',
              icon: 'error',
              confirmButtonText: 'הבנתי',
              confirmButtonColor: '#b8953e',
              background: '#0c1425',
              color: '#fff'
            });
          });
        });
      });
      return;
    }

    var approveBtn = e.target.closest('.blessing-item-approve');
    if (approveBtn && currentEventId) {
      var id = approveBtn.dataset.id;
      var approveEventId = currentEventId;
      getAdminCredential().then(function(approvePassword) {
        if (!approvePassword) return;
        return fetch(APPROVE_BLESSING_API + '?event=' + encodeURIComponent(approveEventId) + '&id=' + encodeURIComponent(id) + '&action=approve&password=' + encodeURIComponent(approvePassword));
      }).catch(function() {
        showScreenImageError('אישור הברכה נכשל, נסו שוב');
      });
      return;
    }

    var deleteBtn = e.target.closest('.blessing-item-delete');
    if (!deleteBtn || !currentEventId) return;

    var id = deleteBtn.dataset.id;
    var item = deleteBtn.closest('.blessing-item');
    var name = item.querySelector('.blessing-item-name').textContent;

    showConfirm('למחוק את הברכה של ' + name + '?', 'הברכה תועבר לסל המיחזור וניתן יהיה לשחזר אותה משם', function() {
      deleteBlessing(currentEventId, id);
    });
  });

  // Clear all blessings for current event
  document.getElementById('clear-btn').addEventListener('click', async function() {
    if (!currentEventId) return;
    var blessings = await getAllBlessings(currentEventId);
    if (blessings.length === 0) return;

    showConfirm('למחוק את כל ' + blessings.length + ' הברכות?', 'כל הברכות יועברו לסל המיחזור וניתן יהיה לשחזר אותן משם', function() {
      clearAllBlessings(currentEventId);
    });
  });

  // ===== TRASH (recycle bin for deleted blessings) =====
  var trashBtn = document.getElementById('trash-btn');
  if (trashBtn) {
    trashBtn.addEventListener('click', function() {
      if (!currentEventId) return;
      openTrashModal();
    });
  }

  function openTrashModal() {
    getTrashedBlessings(currentEventId).then(renderTrashModal);
  }

  // Restoring a blessing has to go through the Admin SDK (manageTrash), not
  // a direct client write - the database rules block a client from ever
  // writing a `status` field, and a previously-approved blessing needs that
  // status put back or it'll come back stuck in "AI checking" limbo.
  function callManageTrashApi(action, id) {
    return getAdminCredential().then(function(password) {
      if (!password) return Promise.reject(new Error('no_password'));
      return fetch(MANAGE_TRASH_API + '?event=' + encodeURIComponent(currentEventId) +
        '&id=' + encodeURIComponent(id) + '&action=' + encodeURIComponent(action) +
        '&password=' + encodeURIComponent(password))
        .then(function(res) {
          return res.json().catch(function() { return {}; }).then(function(data) {
            if (!res.ok || data.ok === false) {
              throw new Error(data.error || 'request_failed');
            }
            return data;
          });
        });
      });
  }

  function renderTrashModal(items) {
    var listHtml;
    if (items.length === 0) {
      listHtml = '<p style="color:rgba(255,255,255,0.5); text-align:center; padding:24px 0;">סל המיחזור ריק</p>';
    } else {
      listHtml = items.map(function(b) {
        var text = b.text || '';
        var name = b.name || '(ללא שם)';
        var deletedDate = b.deletedAt ? new Date(b.deletedAt).toLocaleDateString('he-IL', {
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
        }) : '';
        var shortText = escapeHtml(text).substring(0, 50) + (text.length > 50 ? '...' : '');

        return '<div class="trash-item" data-id="' + b.id + '" style="display:flex; align-items:center; gap:10px; padding:10px; border:1px solid rgba(255,255,255,0.1); border-radius:8px; margin-bottom:8px;">' +
          (b.photoDataUrl && b.photoDataUrl.length > 10
            ? '<img src="' + escapeHtml(b.photoDataUrl) + '" style="width:44px; height:44px; border-radius:8px; object-fit:cover; flex-shrink:0;">'
            : '<div style="width:44px; height:44px; border-radius:8px; background:rgba(255,255,255,0.06); flex-shrink:0;"></div>') +
          '<div style="flex:1; min-width:0; text-align:right;">' +
            '<div style="color:#fff; font-weight:700; font-size:0.9rem;">' + escapeHtml(name) + '</div>' +
            '<div style="color:rgba(255,255,255,0.55); font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + shortText + '</div>' +
            '<div style="color:rgba(255,255,255,0.35); font-size:0.7rem;">נמחק: ' + deletedDate + '</div>' +
          '</div>' +
          '<div style="display:flex; flex-direction:column; gap:4px; flex-shrink:0;">' +
            '<button class="trash-view-btn" data-id="' + b.id + '" style="background:none; border:1px solid rgba(255,255,255,0.2); color:#fff; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:0.7rem; font-family:Assistant,sans-serif;">👁 פרטים</button>' +
            '<button class="trash-restore-btn" data-id="' + b.id + '" style="background:none; border:1px solid rgba(46,204,113,0.5); color:#2ecc71; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:0.7rem; font-family:Assistant,sans-serif;">↩ שחזור</button>' +
            '<button class="trash-purge-btn" data-id="' + b.id + '" style="background:none; border:1px solid rgba(229,85,85,0.4); color:#e55; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:0.7rem; font-family:Assistant,sans-serif;">מחק לצמיתות</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    Swal.fire({
      html: '<div dir="rtl">' +
        '<h2 style="color:#fff; font-family:Assistant,sans-serif; font-weight:800; font-size:1.3rem; margin:0 0 4px; text-align:center;">🗑 סל מיחזור</h2>' +
        '<p style="color:rgba(255,255,255,0.4); font-size:0.8rem; margin:0 0 16px; text-align:center;">ברכות שנמחקו - ניתן לצפות בפרטים ולשחזר מכאן</p>' +
        '<div style="max-height:420px; overflow-y:auto;">' + listHtml + '</div>' +
      '</div>',
      background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
      border: '1px solid rgba(255,255,255,0.15)',
      color: '#fff',
      showConfirmButton: false,
      showCloseButton: true,
      width: 480,
      didOpen: function() {
        var container = Swal.getHtmlContainer();
        if (!container) return;
        container.addEventListener('click', function(e) {
          var viewBtn = e.target.closest('.trash-view-btn');
          if (viewBtn) {
            var vid = viewBtn.dataset.id;
            db.ref('events/' + currentEventId + '/trash/' + vid).once('value', function(snap) {
              var b = snap.val();
              if (b) showTrashDetail(Object.assign({}, b, { id: vid }));
            });
            return;
          }

          var restoreBtn = e.target.closest('.trash-restore-btn');
          if (restoreBtn) {
            var rid = restoreBtn.dataset.id;
            callManageTrashApi('restore', rid).then(function() {
              Swal.fire({ text: 'הברכה שוחזרה בהצלחה', icon: 'success', timer: 1400, showConfirmButton: false, background: '#0c1425', color: '#fff' })
                .then(openTrashModal);
            }).catch(function() {
              showScreenImageError('שחזור הברכה נכשל, נסו שוב');
            });
            return;
          }

          var purgeBtn = e.target.closest('.trash-purge-btn');
          if (purgeBtn) {
            var pid = purgeBtn.dataset.id;
            Swal.close();
            showConfirm('למחוק את הברכה לצמיתות?', 'פעולה זו לא ניתנת לביטול - הברכה תימחק סופית ולא ניתן יהיה לשחזר אותה', function() {
              callManageTrashApi('purge', pid).then(openTrashModal).catch(function() {
                showScreenImageError('המחיקה נכשלה, נסו שוב');
              });
            });
            return;
          }
        });
      }
    });
  }

  // Full details of one trashed blessing, with a restore action, before committing
  function showTrashDetail(b) {
    var text = b.text || '';
    var name = b.name || '(ללא שם)';
    var deletedDate = b.deletedAt ? new Date(b.deletedAt).toLocaleDateString('he-IL', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : '';

    Swal.fire({
      html: '<div dir="rtl" style="text-align:center;">' +
        (b.photoDataUrl && b.photoDataUrl.length > 10
          ? '<img src="' + escapeHtml(b.photoDataUrl) + '" style="max-width:100%; max-height:220px; border-radius:10px; object-fit:cover; margin-bottom:14px;">'
          : '') +
        '<h2 style="color:#fff; font-family:Assistant,sans-serif; font-weight:800; font-size:1.2rem; margin:0 0 8px;">' + escapeHtml(name) + '</h2>' +
        '<p style="color:rgba(255,255,255,0.85); font-size:0.95rem; line-height:1.7; white-space:pre-wrap; text-align:right; background:rgba(255,255,255,0.05); border-radius:8px; padding:12px; margin:0 0 10px;">' + escapeHtml(text) + '</p>' +
        '<p style="color:rgba(255,255,255,0.4); font-size:0.75rem; margin:0;">נמחק ב-' + deletedDate + '</p>' +
      '</div>',
      background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
      border: '1px solid rgba(255,255,255,0.15)',
      color: '#fff',
      showDenyButton: true,
      confirmButtonText: '↩ שחזור הברכה',
      confirmButtonColor: '#2ecc71',
      denyButtonText: 'חזרה לרשימה',
      denyButtonColor: '#3a4560',
      width: 420,
    }).then(function(result) {
      if (result.isConfirmed) {
        callManageTrashApi('restore', b.id).then(function() {
          Swal.fire({ text: 'הברכה שוחזרה בהצלחה', icon: 'success', timer: 1400, showConfirmButton: false, background: '#0c1425', color: '#fff' });
        }).catch(function() {
          showScreenImageError('שחזור הברכה נכשל, נסו שוב');
        });
      } else {
        openTrashModal();
      }
    });
  }

  // Confirm dialog
  function showConfirm(title, message, onConfirm) {
    var overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = '<div class="confirm-card">' +
      '<h3>' + title + '</h3>' +
      '<p>' + message + '</p>' +
      '<div class="confirm-actions">' +
        (onConfirm ? '<button class="btn btn-danger btn-sm" id="confirm-yes">אישור</button>' : '') +
        '<button class="btn btn-secondary btn-sm" id="confirm-no">' + (onConfirm ? 'ביטול' : 'סגור') + '</button>' +
      '</div></div>';
    document.body.appendChild(overlay);

    overlay.querySelector('#confirm-no').addEventListener('click', function() {
      overlay.remove();
    });

    if (onConfirm) {
      overlay.querySelector('#confirm-yes').addEventListener('click', function() {
        onConfirm();
        overlay.remove();
      });
    }

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });
  }

  function showImageTooLargeAlert() {
    return Swal.fire({
      icon: 'warning',
      title: 'התמונה גדולה מדי',
      text: 'ניתן להעלות תמונה בגודל של עד 3MB בלבד',
      confirmButtonText: 'הבנתי',
      confirmButtonColor: '#b8953e',
      background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
      color: '#fff'
    });
  }

  function callSetEventPassword(targetEventId, newPwd, password) {
    return fetch(SET_EVENT_PASSWORD_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: targetEventId, password: password, newPassword: newPwd })
    });
  }

  function showScreenImageError(message) {
    return Swal.fire({
      icon: 'error',
      title: 'שגיאה',
      text: message || 'לא ניתן להשלים את הפעולה כרגע',
      confirmButtonText: 'הבנתי',
      confirmButtonColor: '#b8953e',
      background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
      color: '#fff'
    });
  }

  function getAdminCredential() {
    var saved = localStorage.getItem('admin_access_password');
    if (saved) return Promise.resolve(saved);

    return Swal.fire({
      html: '<div dir="rtl" style="text-align:center;">' +
        '<h2 style="color:#fff;font-family:Assistant,sans-serif;font-weight:800;font-size:1.35rem;margin:0 0 14px;">אימות מנהל אירוע</h2>' +
        '<input type="password" id="screen-images-password" placeholder="סיסמה" style="width:100%;padding:14px;border:1.5px solid rgba(255,255,255,0.15);border-radius:8px;font-family:Assistant,sans-serif;font-size:1.2rem;background:rgba(255,255,255,0.08);color:#fff;text-align:center;">' +
        '</div>',
      background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
      border: '1px solid rgba(255,255,255,0.15)',
      confirmButtonText: 'כניסה',
      confirmButtonColor: '#b8953e',
      showCancelButton: true,
      cancelButtonText: 'ביטול',
      width: 380,
      preConfirm: function() {
        // No network pre-check here on purpose - this used to call
        // subAdminLogin, but that only recognizes the main admin password or
        // an event's own per-event password, never a manager's login
        // password, so it always rejected a manager typing their own
        // (correct) password. The actual action this unlocks (approve,
        // trash, screen images) does its own server-side authorization via
        // isAuthorizedForEvent, which does accept the event owner's manager
        // password - so we just take whatever was typed and let that be the
        // real check.
        var pwd = document.getElementById('screen-images-password').value.trim();
        if (!pwd) {
          Swal.showValidationMessage('נא להזין סיסמה');
          return false;
        }
        return pwd;
      },
      didOpen: function() {
        document.getElementById('screen-images-password').focus();
      }
    }).then(function(result) {
      if (!result.isConfirmed) return null;
      localStorage.setItem('admin_access_password', result.value);
      return result.value;
    });
  }

  function callScreenImagesApi(payload) {
    return fetch(SCREEN_IMAGES_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(res) {
      return res.json().catch(function() { return {}; }).then(function(data) {
        if (!res.ok || data.ok === false) {
          var err = new Error(data.error || 'request_failed');
          err.code = data.code || data.error || 'request_failed';
          throw err;
        }
        return data;
      });
    });
  }

  function fileToDataUrl(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function(e) { resolve(e.target.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Resizes/compresses an image file in the browser (canvas -> JPEG) so a heavy
  // photographer photo still looks great on the screen but stays a reasonable
  // size for the system. Animated GIFs are left untouched (canvas would flatten
  // the animation) and just pass through fileToDataUrl.
  function compressImageForScreen(file, opts) {
    opts = opts || {};
    var maxDimension = opts.maxDimension || SCREEN_IMAGE_MAX_DIMENSION;
    var maxBytes = opts.maxBytes || SCREEN_IMAGE_TARGET_BYTES;

    if (file.type === 'image/gif') {
      return fileToDataUrl(file);
    }

    return new Promise(function(resolve, reject) {
      var objectUrl = URL.createObjectURL(file);
      var img = new Image();

      img.onload = function() {
        URL.revokeObjectURL(objectUrl);
        var srcW = img.naturalWidth || img.width;
        var srcH = img.naturalHeight || img.height;
        if (!srcW || !srcH) { reject(new Error('image_read_failed')); return; }

        function renderAt(dimension, quality) {
          var scale = Math.min(1, dimension / Math.max(srcW, srcH));
          var w = Math.max(1, Math.round(srcW * scale));
          var h = Math.max(1, Math.round(srcH * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          // Flatten onto white in case the source has transparency (e.g. a PNG)
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          return new Promise(function(res) {
            canvas.toBlob(function(blob) { res(blob); }, 'image/jpeg', quality);
          });
        }

        (async function attempt() {
          var dimension = maxDimension;
          var quality = 0.85;
          var blob = await renderAt(dimension, quality);
          var tries = 0;
          while (blob && blob.size > maxBytes && tries < 6) {
            tries++;
            if (quality > 0.5) {
              quality -= 0.12;
            } else {
              dimension = Math.round(dimension * 0.82);
            }
            blob = await renderAt(dimension, quality);
          }
          if (!blob || blob.size > maxBytes) {
            reject(Object.assign(new Error('image_too_large'), { code: 'image_too_large' }));
            return;
          }
          var reader = new FileReader();
          reader.onload = function(e) { resolve(e.target.result); };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })();
      };

      img.onerror = function() {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('image_load_failed'));
      };

      img.src = objectUrl;
    });
  }

  function renderScreenImages(images) {
    if (!images.length) {
      return '<div style="padding:28px 12px;color:rgba(255,255,255,0.45);font-size:0.95rem;">עדיין לא הועלו תמונות למסך</div>';
    }
    return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:10px;max-height:310px;overflow:auto;padding:2px;">' +
      images.map(function(img) {
        return '<div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;">' +
          '<img src="' + img.dataUrl + '" alt="" style="width:100%;height:82px;object-fit:cover;display:block;background:#07101f;">' +
          '<button class="screen-image-delete" data-id="' + img.id + '" style="width:100%;border:0;border-top:1px solid rgba(255,255,255,0.08);background:rgba(229,85,85,0.12);color:#ff8b8b;padding:7px;font-family:Assistant,sans-serif;font-weight:700;cursor:pointer;">מחק</button>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  async function openScreenImagesManager(eventId) {
    var password = await getAdminCredential();
    if (!password) return;

    Swal.fire({
      html: '<div dir="rtl" style="text-align:center;padding:18px 0;">' +
        '<div style="width:42px;height:42px;border:3px solid rgba(255,255,255,0.12);border-top-color:#d4b065;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px;"></div>' +
        '<h2 style="color:#fff;font-family:Assistant,sans-serif;font-size:1.25rem;margin:0 0 6px;">טוען תמונות...</h2>' +
        '<p style="color:rgba(255,255,255,0.5);font-size:0.9rem;margin:0;">רק רגע</p>' +
        '<style>@keyframes spin{to{transform:rotate(360deg)}}</style>' +
        '</div>',
      background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
      border: '1px solid rgba(255,255,255,0.15)',
      showConfirmButton: false,
      allowOutsideClick: false,
      width: 360
    });

    var images = [];
    try {
      var result = await callScreenImagesApi({ action: 'list', eventId: eventId, password: password });
      images = result.images || [];
    } catch (err) {
      localStorage.removeItem('admin_access_password');
      await showScreenImageError('אין הרשאה או שלא ניתן לטעון את התמונות');
      return;
    }

    Swal.fire({
      html: '<div dir="rtl" style="text-align:right;">' +
        '<h2 style="color:#fff;font-family:Assistant,sans-serif;font-weight:800;font-size:1.35rem;margin:0 0 6px;text-align:center;">תמונות למסך</h2>' +
        '<p id="screen-images-count" style="color:rgba(255,255,255,0.55);font-size:0.9rem;margin:0 0 14px;text-align:center;">' + images.length + ' תמונות</p>' +
        '<label for="screen-images-file" style="display:block;text-align:center;background:var(--gold);color:#0c1425;border-radius:8px;padding:12px 18px;font-family:Assistant,sans-serif;font-weight:800;cursor:pointer;margin-bottom:14px;">העלה תמונות</label>' +
        '<input type="file" id="screen-images-file" accept="image/*" multiple style="display:none;">' +
        '<div id="screen-images-upload-loader" style="display:none;text-align:center;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px;margin:0 0 12px;">' +
          '<div style="width:26px;height:26px;border:3px solid rgba(255,255,255,0.12);border-top-color:#d4b065;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 8px;"></div>' +
          '<span style="color:rgba(255,255,255,0.72);font-size:0.85rem;">מעלה תמונות...</span>' +
        '</div>' +
        '<p id="screen-images-status" style="min-height:20px;color:#8ee09f;font-size:0.85rem;text-align:center;margin:0 0 10px;"></p>' +
        '<div id="screen-images-grid">' + renderScreenImages(images) + '</div>' +
        '<button id="screen-images-done-btn" type="button" style="display:block;width:100%;margin-top:16px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#fff;border-radius:8px;padding:13px 18px;font-family:Assistant,sans-serif;font-weight:700;font-size:1rem;cursor:pointer;">✓ סיימתי, סגור</button>' +
        '<style>@keyframes spin{to{transform:rotate(360deg)}}</style>' +
        '</div>',
      background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
      border: '1px solid rgba(255,255,255,0.15)',
      showConfirmButton: false,
      showCloseButton: true,
      width: 520,
      didOpen: function() {
        var fileInput = document.getElementById('screen-images-file');
        var grid = document.getElementById('screen-images-grid');
        var count = document.getElementById('screen-images-count');
        var status = document.getElementById('screen-images-status');
        var uploadLoader = document.getElementById('screen-images-upload-loader');
        var doneBtn = document.getElementById('screen-images-done-btn');

        if (doneBtn) {
          doneBtn.addEventListener('click', function() { Swal.close(); });
        }

        function refresh(nextImages, message, highlightDone) {
          images = nextImages || images;
          count.textContent = images.length + ' תמונות';
          grid.innerHTML = renderScreenImages(images);
          status.textContent = message || '';
          // After a successful upload, make the "done" button stand out so the
          // user clearly sees the upload finished and knows what to do next.
          if (doneBtn && highlightDone) {
            doneBtn.style.background = 'var(--gold)';
            doneBtn.style.borderColor = 'var(--gold)';
            doneBtn.style.color = '#0c1425';
          }
        }

        fileInput.addEventListener('change', async function() {
          var files = Array.prototype.slice.call(fileInput.files || []);
          if (!files.length) return;

          var unsupported = files.some(function(file) {
            return !file.type || !file.type.startsWith('image/');
          });
          if (unsupported) {
            fileInput.value = '';
            await showScreenImageError('ניתן להעלות קובץ תמונה בלבד');
            return;
          }

          try {
            fileInput.disabled = true;
            uploadLoader.style.display = 'block';
            var latestImages = images;
            var skipped = [];
            for (var i = 0; i < files.length; i++) {
              count.textContent = 'מכווץ ומעלה תמונה ' + (i + 1) + ' מתוך ' + files.length + '...';
              status.textContent = '';
              var file = files[i];
              var dataUrl;
              try {
                // Auto-resize/compress every image client-side so a heavy photo
                // from a professional camera still looks sharp on screen but
                // stays a reasonable size to upload and store.
                dataUrl = await compressImageForScreen(file);
              } catch (compressErr) {
                skipped.push(file.name);
                continue;
              }
              var result = await callScreenImagesApi({
                action: 'upload',
                eventId: eventId,
                password: password,
                dataUrl: dataUrl,
                fileName: file.name
              });
              latestImages = result.images || latestImages;
            }
            var uploadedCount = files.length - skipped.length;
            refresh(latestImages, uploadedCount === 0 ? '' : (uploadedCount === 1 ? 'התמונה הועלתה בהצלחה' : uploadedCount + ' תמונות הועלו בהצלחה'), uploadedCount > 0);
            fileInput.value = '';
            if (skipped.length) {
              await showScreenImageError('התמונות הבאות לא הועלו כי הן גדולות מדי גם לאחר דחיסה: ' + skipped.join(', '));
            }
          } catch (err) {
            fileInput.value = '';
            count.textContent = images.length + ' תמונות';
            if (err.code === 'image_too_large') {
              await showImageTooLargeAlert();
            } else {
              await showScreenImageError('העלאת התמונה נכשלה');
            }
          } finally {
            fileInput.disabled = false;
            uploadLoader.style.display = 'none';
          }
        });

        grid.addEventListener('click', async function(e) {
          var btn = e.target.closest('.screen-image-delete');
          if (!btn) return;
          var imageId = btn.dataset.id;
          btn.disabled = true;
          btn.textContent = 'מוחק...';
          try {
            var result = await callScreenImagesApi({
              action: 'delete',
              eventId: eventId,
              password: password,
              imageId: imageId
            });
            refresh(result.images || [], 'התמונה נמחקה בהצלחה');
          } catch (err) {
            btn.disabled = false;
            btn.textContent = 'מחק';
            await showScreenImageError('מחיקת התמונה נכשלה');
          }
        });
      }
    });
  }
})();
