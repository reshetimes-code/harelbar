// ===== ADMIN PANEL LOGIC =====
(function() {
  const ADMIN_PASSWORD = 'hareli2026';

  const loginScreen = document.getElementById('login-screen');
  const adminPanel = document.getElementById('admin-panel');
  const loginForm = document.getElementById('login-form');
  const passwordInput = document.getElementById('admin-password');
  const loginError = document.getElementById('login-error');
  const logoutBtn = document.getElementById('logout-btn');

  const statTotal = document.getElementById('stat-total');
  const statToday = document.getElementById('stat-today');
  const statStorage = document.getElementById('stat-storage');
  const statPopular = document.getElementById('stat-popular');
  const listCount = document.getElementById('list-count');
  const blessingsList = document.getElementById('blessings-list');
  const emptyAdmin = document.getElementById('empty-admin');

  const exportBtn = document.getElementById('export-btn');
  const importInput = document.getElementById('import-input');
  const clearBtn = document.getElementById('clear-btn');

  // Check session
  if (sessionStorage.getItem('admin_auth') === 'true') {
    showPanel();
  }

  // Login
  loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    if (passwordInput.value === ADMIN_PASSWORD) {
      sessionStorage.setItem('admin_auth', 'true');
      loginError.classList.remove('show');
      showPanel();
    } else {
      loginError.classList.add('show');
      passwordInput.value = '';
      passwordInput.focus();
    }
  });

  // Logout
  logoutBtn.addEventListener('click', function() {
    sessionStorage.removeItem('admin_auth');
    adminPanel.style.display = 'none';
    loginScreen.style.display = 'flex';
    passwordInput.value = '';
  });

  function showPanel() {
    loginScreen.style.display = 'none';
    adminPanel.style.display = 'block';
    loadData();
  }

  function loadData() {
    const blessings = getAllBlessings();
    updateStats(blessings);
    renderList(blessings);
  }

  function updateStats(blessings) {
    statTotal.textContent = blessings.length;

    // Today count
    const today = new Date().toDateString();
    const todayCount = blessings.filter(b => new Date(b.createdAt).toDateString() === today).length;
    statToday.textContent = todayCount;

    // Storage
    const usage = getStorageUsage();
    statStorage.textContent = usage.usedKB;

    // Popular template
    if (blessings.length > 0) {
      const counts = {};
      blessings.forEach(b => {
        counts[b.templateId] = (counts[b.templateId] || 0) + 1;
      });
      const topId = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
      const tpl = getTemplateById(parseInt(topId));
      statPopular.textContent = tpl.name;
      statPopular.style.fontSize = '0.9rem';
    } else {
      statPopular.textContent = '-';
    }

    listCount.textContent = blessings.length;
  }

  function renderList(blessings) {
    if (blessings.length === 0) {
      blessingsList.style.display = 'none';
      emptyAdmin.style.display = 'block';
      return;
    }

    emptyAdmin.style.display = 'none';
    blessingsList.style.display = 'flex';

    // Sort newest first
    const sorted = [...blessings].reverse();

    blessingsList.innerHTML = sorted.map(b => {
      const tpl = getTemplateById(b.templateId);
      const date = b.createdAt ? new Date(b.createdAt).toLocaleDateString('he-IL', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      }) : '';
      const text = escapeHtml(b.text).substring(0, 60) + (b.text.length > 60 ? '...' : '');

      return `
        <div class="blessing-item" data-id="${b.id}">
          <img class="blessing-item-photo" src="${b.photoDataUrl}" alt="${escapeHtml(b.name)}">
          <div class="blessing-item-info">
            <div class="blessing-item-name">${escapeHtml(b.name)}</div>
            <div class="blessing-item-text">${text}</div>
            <div class="blessing-item-meta">${date}</div>
          </div>
          <span class="blessing-item-template">${tpl.name}</span>
          <button class="blessing-item-delete" data-id="${b.id}" title="מחק">✕</button>
        </div>
      `;
    }).join('');
  }

  // Delete single blessing
  blessingsList.addEventListener('click', function(e) {
    const deleteBtn = e.target.closest('.blessing-item-delete');
    if (!deleteBtn) return;

    const id = deleteBtn.dataset.id;
    const item = deleteBtn.closest('.blessing-item');
    const name = item.querySelector('.blessing-item-name').textContent;

    showConfirm(`למחוק את הברכה של ${name}?`, 'פעולה זו לא ניתנת לביטול', function() {
      deleteBlessing(id);
      loadData();
    });
  });

  // Export
  exportBtn.addEventListener('click', function() {
    exportDataAsJson();
  });

  // Import
  importInput.addEventListener('change', function() {
    const file = importInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      const success = importDataFromJson(e.target.result);
      if (success) {
        loadData();
        showConfirm('הייבוא הושלם בהצלחה', `${getAllBlessings().length} ברכות נטענו`, null);
      } else {
        showConfirm('שגיאה בייבוא', 'הקובץ אינו תקין', null);
      }
    };
    reader.readAsText(file);
    importInput.value = '';
  });

  // Clear all
  clearBtn.addEventListener('click', function() {
    const count = getAllBlessings().length;
    if (count === 0) return;

    showConfirm(`למחוק את כל ${count} הברכות?`, 'פעולה זו לא ניתנת לביטול', function() {
      clearAllBlessings();
      loadData();
    });
  });

  // Confirm dialog
  function showConfirm(title, message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-card">
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="confirm-actions">
          ${onConfirm ? '<button class="btn btn-danger btn-sm" id="confirm-yes">אישור</button>' : ''}
          <button class="btn btn-secondary btn-sm" id="confirm-no">${onConfirm ? 'ביטול' : 'סגור'}</button>
        </div>
      </div>
    `;
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

  // Auto-refresh every 10 seconds
  setInterval(function() {
    if (adminPanel.style.display !== 'none') {
      loadData();
    }
  }, 10000);
})();
