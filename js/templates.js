// ===== TEMPLATE DEFINITIONS =====
const TEMPLATES = [
  { id: 1, name: 'קלאסי', cssClass: 'template-default', tplClass: 'tpl-1' },
];

function getTemplateById(id) {
  return TEMPLATES[0];
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderCard(blessing) {
  const name = escapeHtml(blessing.name);
  const text = escapeHtml(blessing.text);
  const photo = blessing.photoDataUrl;

  return `
    <div class="blessing-card">
      <div class="card-bg" style="background-image:url('${photo}')"></div>
      <div class="card-overlay"></div>
      <div class="card-content">
        <div class="card-photo">
          <img src="${photo}" alt="${name}">
        </div>
        <div class="card-name">${name}</div>
        <div class="card-divider"></div>
        <div class="card-text">${text}</div>
      </div>
    </div>`;
}

function renderTemplateSelector(selectedId = 1) {
  return '';
}
