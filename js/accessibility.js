// ===== ACCESSIBILITY WIDGET (shared across all public pages) =====
// Self-contained: injects its own styles and floating button/panel,
// no markup needs to be added to the pages that include this script.
(function() {
  var STORAGE_KEY = 'a11y_prefs_v1';
  var defaults = { fontScale: 1, highContrast: false, underlineLinks: false, noAnimations: false };
  var prefs;
  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    prefs = Object.assign({}, defaults, saved);
  } catch (e) {
    prefs = Object.assign({}, defaults);
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch (e) {}
  }

  function apply() {
    var root = document.documentElement;
    root.style.setProperty('--a11y-font-scale', prefs.fontScale);
    root.classList.toggle('a11y-high-contrast', !!prefs.highContrast);
    root.classList.toggle('a11y-underline-links', !!prefs.underlineLinks);
    root.classList.toggle('a11y-no-animations', !!prefs.noAnimations);
  }

  function injectStyles() {
    var style = document.createElement('style');
    style.textContent =
      'html { font-size: calc(100% * var(--a11y-font-scale, 1)); }' +
      '.a11y-high-contrast, .a11y-high-contrast body { background:#000 !important; }' +
      '.a11y-high-contrast * { background-color:#000 !important; color:#fff !important; border-color:#666 !important; box-shadow:none !important; }' +
      '.a11y-high-contrast a, .a11y-high-contrast button, .a11y-high-contrast .btn { color:#ffe14d !important; }' +
      '.a11y-underline-links a { text-decoration: underline !important; }' +
      '.a11y-no-animations *, .a11y-no-animations *::before, .a11y-no-animations *::after { animation: none !important; transition: none !important; }' +
      '#a11y-toggle-btn { position: fixed; bottom: 16px; left: 16px; z-index: 99999; width: 48px; height: 48px; border-radius: 50%; background: #b8953e; color:#0c1425; border:none; cursor:pointer; font-size: 1.4rem; display:flex; align-items:center; justify-content:center; box-shadow: 0 4px 16px rgba(0,0,0,0.4); }' +
      '#a11y-panel { position: fixed; bottom: 72px; left: 16px; z-index: 99999; background: linear-gradient(180deg, #0c1425 0%, #111c32 100%); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; padding: 16px; width: 260px; max-width: calc(100vw - 32px); display:none; box-shadow: 0 8px 32px rgba(0,0,0,0.5); font-family: Assistant, sans-serif; direction: rtl; text-align: right; }' +
      '#a11y-panel.open { display:block; }' +
      '#a11y-panel h3 { color:#fff; font-size:1rem; margin:0 0 12px; font-family: Assistant, sans-serif; }' +
      '#a11y-panel button.a11y-action { display:block; width:100%; text-align:right; padding:10px 12px; margin-bottom:8px; background: rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:8px; color:#fff; font-family:Assistant,sans-serif; font-size:0.9rem; cursor:pointer; }' +
      '#a11y-panel button.a11y-action.active { background: rgba(184,149,62,0.25); border-color:#b8953e; color:#d4b065; }' +
      '#a11y-panel .a11y-links { display:flex; justify-content:space-between; margin-top:4px; }' +
      '#a11y-panel .a11y-links a { color:#d4b065; font-size:0.8rem; text-decoration:none; }' +
      '#a11y-panel .a11y-links a:hover { text-decoration:underline; }';
    document.head.appendChild(style);
  }

  function injectWidget() {
    if (document.getElementById('a11y-toggle-btn')) return;

    var btn = document.createElement('button');
    btn.id = 'a11y-toggle-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'תפריט נגישות');
    btn.textContent = '♿';

    var panel = document.createElement('div');
    panel.id = 'a11y-panel';
    panel.innerHTML =
      '<h3>נגישות</h3>' +
      '<button type="button" class="a11y-action" data-action="inc">א+ הגדלת טקסט</button>' +
      '<button type="button" class="a11y-action" data-action="dec">א- הקטנת טקסט</button>' +
      '<button type="button" class="a11y-action" data-action="contrast">ניגודיות גבוהה</button>' +
      '<button type="button" class="a11y-action" data-action="underline">הדגשת קישורים</button>' +
      '<button type="button" class="a11y-action" data-action="animations">עצירת אנימציות</button>' +
      '<button type="button" class="a11y-action" data-action="reset">איפוס הגדרות</button>' +
      '<div class="a11y-links"><a href="/accessibility.html">הצהרת נגישות</a><a href="/privacy.html">מדיניות פרטיות</a></div>';

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    function updateActiveStates() {
      var c = panel.querySelector('[data-action="contrast"]');
      var u = panel.querySelector('[data-action="underline"]');
      var a = panel.querySelector('[data-action="animations"]');
      if (c) c.classList.toggle('active', !!prefs.highContrast);
      if (u) u.classList.toggle('active', !!prefs.underlineLinks);
      if (a) a.classList.toggle('active', !!prefs.noAnimations);
    }

    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      panel.classList.toggle('open');
    });

    panel.addEventListener('click', function(e) {
      var actionBtn = e.target.closest('.a11y-action');
      if (!actionBtn) return;
      var action = actionBtn.dataset.action;
      if (action === 'inc') prefs.fontScale = Math.min(1.6, Math.round((prefs.fontScale + 0.1) * 100) / 100);
      else if (action === 'dec') prefs.fontScale = Math.max(0.8, Math.round((prefs.fontScale - 0.1) * 100) / 100);
      else if (action === 'contrast') prefs.highContrast = !prefs.highContrast;
      else if (action === 'underline') prefs.underlineLinks = !prefs.underlineLinks;
      else if (action === 'animations') prefs.noAnimations = !prefs.noAnimations;
      else if (action === 'reset') prefs = Object.assign({}, defaults);
      save();
      apply();
      updateActiveStates();
    });

    document.addEventListener('click', function(e) {
      if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== btn) {
        panel.classList.remove('open');
      }
    });

    updateActiveStates();
  }

  injectStyles();
  apply();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectWidget);
  } else {
    injectWidget();
  }
})();
