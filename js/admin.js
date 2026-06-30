// ===== ADMIN PANEL LOGIC =====
(function() {
  const ADMIN_PASSWORD = 'oren8773';

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
    // Listen for real-time updates
    onBlessingsChanged(function(blessings) {
      updateStats(blessings);
      renderList(blessings);
    });
  }

  async function updateStats(blessings) {
    statTotal.textContent = blessings.length;

    const today = new Date().toDateString();
    const todayCount = blessings.filter(b => new Date(b.createdAt).toDateString() === today).length;
    statToday.textContent = todayCount;

    const usage = await getStorageUsage();
    statStorage.textContent = usage.usedKB;

    if (blessings.length > 0) {
      const counts = {};
      blessings.forEach(b => {
        counts[b.templateId] = (counts[b.templateId] || 0) + 1;
      });
      statPopular.textContent = blessings.length + ' ברכות';
      statPopular.style.fontSize = '0.9rem';
    } else {
      statPopular.textContent = '-';
    }

    listCount.textContent = blessings.length;
  }

  function renderList(blessings) {
    const loader = document.getElementById('blessings-loader');
    if (loader) loader.style.display = 'none';

    if (blessings.length === 0) {
      blessingsList.style.display = 'none';
      emptyAdmin.style.display = 'block';
      return;
    }

    emptyAdmin.style.display = 'none';
    blessingsList.style.display = 'flex';

    const sorted = [...blessings].reverse();

    blessingsList.innerHTML = sorted.map(b => {
      const date = b.createdAt ? new Date(b.createdAt).toLocaleDateString('he-IL', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      }) : '';
      const text = escapeHtml(b.text).substring(0, 60) + (b.text.length > 60 ? '...' : '');

      const status = b.status || 'pending';
      const statusClass = status === 'approved' ? 'status-approved' : status === 'rejected' ? 'status-rejected' : 'status-pending';
      const statusText = status === 'approved' ? 'אושר לעלות' : status === 'rejected' ? 'אין אישור להעלאה' : 'ממתין לאישור';
      const approveBtn = status === 'pending' ? `<button class="blessing-item-approve" data-id="${b.id}" title="אשר">אשר העלאה</button>` : '';

      return `
        <div class="blessing-item ${statusClass}" data-id="${b.id}">
          ${b.photoDataUrl && b.photoDataUrl.length > 10
            ? `<img class="blessing-item-photo" src="${b.photoDataUrl}" alt="${escapeHtml(b.name)}">`
            : `<div class="blessing-item-photo blessing-item-no-photo">אין תמונה</div>`}
          <div class="blessing-item-info">
            <div class="blessing-item-name">${escapeHtml(b.name)}</div>
            <div class="blessing-item-text">${text}</div>
            <div class="blessing-item-meta">${date}</div>
          </div>
          <span class="blessing-item-status ${statusClass}">${statusText}</span>
          ${approveBtn}
          <button class="blessing-item-delete" data-id="${b.id}" title="מחק">✕</button>
        </div>
      `;
    }).join('');
  }

  // Approve blessing
  blessingsList.addEventListener('click', function(e) {
    const approveBtn = e.target.closest('.blessing-item-approve');
    if (approveBtn) {
      const id = approveBtn.dataset.id;
      db.ref('blessings/' + id + '/status').set('approved');
      return;
    }

    // Delete single blessing
    const deleteBtn = e.target.closest('.blessing-item-delete');
    if (!deleteBtn) return;

    const id = deleteBtn.dataset.id;
    const item = deleteBtn.closest('.blessing-item');
    const name = item.querySelector('.blessing-item-name').textContent;

    showConfirm(`למחוק את הברכה של ${name}?`, 'פעולה זו לא ניתנת לביטול', function() {
      deleteBlessing(id);
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
    reader.onload = async function(e) {
      const success = await importDataFromJson(e.target.result);
      if (success) {
        showConfirm('הייבוא הושלם בהצלחה', '', null);
      } else {
        showConfirm('שגיאה בייבוא', 'הקובץ אינו תקין', null);
      }
    };
    reader.readAsText(file);
    importInput.value = '';
  });

  // Clear all
  clearBtn.addEventListener('click', async function() {
    const blessings = await getAllBlessings();
    if (blessings.length === 0) return;

    showConfirm(`למחוק את כל ${blessings.length} הברכות?`, 'פעולה זו לא ניתנת לביטול', function() {
      clearAllBlessings();
    });
  });

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
})();
