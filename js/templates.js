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

// Background gradients for blessings without photo
const NO_PHOTO_BACKGROUNDS = [
  'linear-gradient(135deg, #0c1425 0%, #1a2744 50%, #0d1b3e 100%)',
  'linear-gradient(135deg, #1a1040 0%, #2d1b69 50%, #15103a 100%)',
  'linear-gradient(135deg, #0d2137 0%, #163d5c 50%, #0a1a2e 100%)',
  'linear-gradient(135deg, #1a2e1a 0%, #2d4a2d 50%, #142214 100%)',
  'linear-gradient(135deg, #2a1a0a 0%, #4a3020 50%, #1e1208 100%)',
  'linear-gradient(135deg, #1a0a2a 0%, #301850 50%, #120820 100%)',
  'linear-gradient(135deg, #0a2a2a 0%, #184848 50%, #082020 100%)',
  'linear-gradient(135deg, #2a0a1a 0%, #4a1830 50%, #200810 100%)',
];

function getBackgroundForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return NO_PHOTO_BACKGROUNDS[Math.abs(hash) % NO_PHOTO_BACKGROUNDS.length];
}

function getCardSizeClass(textLength) {
  if (textLength > 400) return 'card-size-xl';
  if (textLength > 250) return 'card-size-lg';
  if (textLength > 120) return 'card-size-md';
  return 'card-size-sm';
}

function renderCard(blessing) {
  const name = escapeHtml(blessing.name);
  const text = escapeHtml(blessing.text);
  const photo = blessing.photoDataUrl;
  const sizeClass = getCardSizeClass(blessing.text.length);

  const hasPhoto = photo && photo.length > 10;

  const g = 'rgba(212,176,101,';

  // Floral divider above the name
  const floralDivider = `
    <svg class="card-floral-divider" viewBox="0 0 400 80" xmlns="http://www.w3.org/2000/svg">
      <g opacity="0.6">
        <!-- Center leaf cluster -->
        <ellipse cx="200" cy="35" rx="8" ry="14" fill="${g}0.4)" transform="rotate(0 200 35)"/>
        <ellipse cx="192" cy="38" rx="7" ry="12" fill="${g}0.35)" transform="rotate(-25 192 38)"/>
        <ellipse cx="208" cy="38" rx="7" ry="12" fill="${g}0.35)" transform="rotate(25 208 38)"/>
        <ellipse cx="185" cy="42" rx="6" ry="10" fill="${g}0.3)" transform="rotate(-45 185 42)"/>
        <ellipse cx="215" cy="42" rx="6" ry="10" fill="${g}0.3)" transform="rotate(45 215 42)"/>
        <!-- Left branch -->
        <path d="M195,50 Q170,48 140,55 Q110,60 80,52 Q60,46 40,50" stroke="${g}0.4)" fill="none" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M140,55 Q135,45 125,40" stroke="${g}0.3)" fill="none" stroke-width="1"/>
        <ellipse cx="122" cy="38" rx="8" ry="4" fill="${g}0.25)" transform="rotate(-30 122 38)"/>
        <path d="M110,58 Q105,50 95,47" stroke="${g}0.3)" fill="none" stroke-width="1"/>
        <ellipse cx="92" cy="45" rx="7" ry="3.5" fill="${g}0.2)" transform="rotate(-20 92 45)"/>
        <path d="M80,52 Q72,45 65,43" stroke="${g}0.25)" fill="none" stroke-width="0.8"/>
        <ellipse cx="62" cy="42" rx="6" ry="3" fill="${g}0.18)" transform="rotate(-35 62 42)"/>
        <!-- Left curl -->
        <path d="M40,50 Q30,55 28,48 Q26,40 35,38 Q42,37 43,44 Q44,48 40,50Z" fill="${g}0.15)" stroke="${g}0.3)" stroke-width="0.8"/>
        <!-- Right branch -->
        <path d="M205,50 Q230,48 260,55 Q290,60 320,52 Q340,46 360,50" stroke="${g}0.4)" fill="none" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M260,55 Q265,45 275,40" stroke="${g}0.3)" fill="none" stroke-width="1"/>
        <ellipse cx="278" cy="38" rx="8" ry="4" fill="${g}0.25)" transform="rotate(30 278 38)"/>
        <path d="M290,58 Q295,50 305,47" stroke="${g}0.3)" fill="none" stroke-width="1"/>
        <ellipse cx="308" cy="45" rx="7" ry="3.5" fill="${g}0.2)" transform="rotate(20 308 45)"/>
        <path d="M320,52 Q328,45 335,43" stroke="${g}0.25)" fill="none" stroke-width="0.8"/>
        <ellipse cx="338" cy="42" rx="6" ry="3" fill="${g}0.18)" transform="rotate(35 338 42)"/>
        <!-- Right curl -->
        <path d="M360,50 Q370,55 372,48 Q374,40 365,38 Q358,37 357,44 Q356,48 360,50Z" fill="${g}0.15)" stroke="${g}0.3)" stroke-width="0.8"/>
        <!-- Small dots -->
        <circle cx="155" cy="52" r="2" fill="${g}0.3)"/>
        <circle cx="245" cy="52" r="2" fill="${g}0.3)"/>
        <circle cx="200" cy="55" r="2.5" fill="${g}0.35)"/>
      </g>
    </svg>
  `;
  const decorations = `
    <div class="card-decor-line card-decor-line-top"></div>
    <div class="card-decor-line card-decor-line-bottom"></div>

    <svg class="card-swirl card-swirl-tr" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
      <path class="swirl-path sp-1" d="M300,0 Q280,20 260,60 Q240,100 250,140 Q255,160 240,175 Q220,195 230,220" stroke="${g}0.5)" fill="none" stroke-width="2" stroke-linecap="round"/>
      <path class="swirl-path sp-2" d="M270,0 Q255,30 250,70 Q245,100 255,120 Q260,135 245,150" stroke="${g}0.4)" fill="none" stroke-width="1.5" stroke-linecap="round"/>
      <path class="swirl-path sp-3" d="M300,30 Q275,45 265,80 Q258,105 270,125 Q278,138 265,155 Q250,170 258,190" stroke="${g}0.35)" fill="none" stroke-width="1.2" stroke-linecap="round"/>
      <circle class="swirl-dot sd-1" cx="230" cy="220" r="4" fill="${g}0.3)"/>
      <circle class="swirl-dot sd-2" cx="245" cy="150" r="3" fill="${g}0.4)"/>
      <circle class="swirl-dot sd-3" cx="258" cy="190" r="3.5" fill="${g}0.35)"/>
      <path class="swirl-curl sc-1" d="M250,140 Q235,130 240,115 Q245,100 260,105 Q270,110 265,125 Q260,135 250,140Z" fill="${g}0.18)" stroke="${g}0.35)" stroke-width="0.8"/>
      <path class="swirl-curl sc-2" d="M265,155 Q255,148 258,138 Q262,128 272,132 Q278,136 274,146 Q270,153 265,155Z" fill="${g}0.14)" stroke="${g}0.3)" stroke-width="0.6"/>
      <ellipse class="swirl-leaf sl-1" cx="255" cy="85" rx="20" ry="7" fill="${g}0.2)" transform="rotate(-35 255 85)"/>
      <ellipse class="swirl-leaf sl-2" cx="240" cy="170" rx="16" ry="6" fill="${g}0.18)" transform="rotate(-50 240 170)"/>
      <ellipse class="swirl-leaf sl-3" cx="270" cy="115" rx="14" ry="5" fill="${g}0.16)" transform="rotate(-25 270 115)"/>
    </svg>

    <svg class="card-swirl card-swirl-bl" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
      <path class="swirl-path sp-1" d="M0,300 Q20,280 40,240 Q60,200 50,160 Q45,140 60,125 Q80,105 70,80" stroke="${g}0.5)" fill="none" stroke-width="2" stroke-linecap="round"/>
      <path class="swirl-path sp-2" d="M30,300 Q45,270 50,230 Q55,200 45,180 Q40,165 55,150" stroke="${g}0.4)" fill="none" stroke-width="1.5" stroke-linecap="round"/>
      <path class="swirl-path sp-3" d="M0,270 Q25,255 35,220 Q42,195 30,175 Q22,162 35,145 Q50,130 42,110" stroke="${g}0.35)" fill="none" stroke-width="1.2" stroke-linecap="round"/>
      <circle class="swirl-dot sd-1" cx="70" cy="80" r="4" fill="${g}0.3)"/>
      <circle class="swirl-dot sd-2" cx="55" cy="150" r="3" fill="${g}0.4)"/>
      <circle class="swirl-dot sd-3" cx="42" cy="110" r="3.5" fill="${g}0.35)"/>
      <path class="swirl-curl sc-1" d="M50,160 Q65,170 60,185 Q55,200 40,195 Q30,190 35,175 Q40,165 50,160Z" fill="${g}0.18)" stroke="${g}0.35)" stroke-width="0.8"/>
      <path class="swirl-curl sc-2" d="M35,145 Q45,152 42,162 Q38,172 28,168 Q22,164 26,154 Q30,147 35,145Z" fill="${g}0.14)" stroke="${g}0.3)" stroke-width="0.6"/>
      <ellipse class="swirl-leaf sl-1" cx="45" cy="215" rx="20" ry="7" fill="${g}0.2)" transform="rotate(145 45 215)"/>
      <ellipse class="swirl-leaf sl-2" cx="60" cy="130" rx="16" ry="6" fill="${g}0.18)" transform="rotate(130 60 130)"/>
      <ellipse class="swirl-leaf sl-3" cx="30" cy="185" rx="14" ry="5" fill="${g}0.16)" transform="rotate(155 30 185)"/>
    </svg>

    <svg class="card-swirl card-swirl-tl" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
      <path class="swirl-path sp-1" d="M0,0 Q20,25 35,65 Q50,105 42,140 Q38,160 52,178 Q65,195 58,215" stroke="${g}0.3)" fill="none" stroke-width="1.8" stroke-linecap="round"/>
      <path class="swirl-path sp-2" d="M0,40 Q22,55 32,85 Q40,110 30,135 Q25,148 38,160" stroke="${g}0.35)" fill="none" stroke-width="1.2" stroke-linecap="round"/>
      <circle class="swirl-dot sd-1" cx="58" cy="215" r="3.5" fill="${g}0.4)"/>
      <circle class="swirl-dot sd-2" cx="38" cy="160" r="2.5" fill="${g}0.35)"/>
      <ellipse class="swirl-leaf sl-1" cx="40" cy="100" rx="18" ry="6" fill="${g}0.09)" transform="rotate(40 40 100)"/>
      <path class="swirl-curl sc-1" d="M42,140 Q55,132 58,145 Q60,158 47,158 Q38,155 42,140Z" fill="${g}0.14)" stroke="${g}0.3)" stroke-width="0.7"/>
    </svg>

    <svg class="card-swirl card-swirl-br" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
      <path class="swirl-path sp-1" d="M300,300 Q280,275 265,235 Q250,195 258,160 Q262,140 248,122 Q235,105 242,85" stroke="${g}0.3)" fill="none" stroke-width="1.8" stroke-linecap="round"/>
      <path class="swirl-path sp-2" d="M300,260 Q278,245 268,215 Q260,190 270,165 Q275,152 262,140" stroke="${g}0.35)" fill="none" stroke-width="1.2" stroke-linecap="round"/>
      <circle class="swirl-dot sd-1" cx="242" cy="85" r="3.5" fill="${g}0.4)"/>
      <circle class="swirl-dot sd-2" cx="262" cy="140" r="2.5" fill="${g}0.35)"/>
      <ellipse class="swirl-leaf sl-1" cx="260" cy="200" rx="18" ry="6" fill="${g}0.09)" transform="rotate(-40 260 200)"/>
      <path class="swirl-curl sc-1" d="M258,160 Q245,168 242,155 Q240,142 253,142 Q262,145 258,160Z" fill="${g}0.14)" stroke="${g}0.3)" stroke-width="0.7"/>
    </svg>
  `;

  if (hasPhoto) {
    return `
      <div class="blessing-card ${sizeClass}">
        <div class="card-bg" style="background-image:url('${photo}')"></div>
        <div class="card-overlay"></div>
        ${decorations}
        <div class="card-content">
          <div class="card-photo"><img src="${photo}" alt="${name}"></div>
          ${floralDivider}
          <div class="card-name">${name}</div>
          <div class="card-divider"></div>
          <div class="card-text">${text}</div>
        </div>
      </div>`;
  }

  const bg = getBackgroundForName(blessing.name);
  return `
    <div class="blessing-card no-photo ${sizeClass}" style="background:${bg}">
      <div class="card-overlay"></div>
      ${decorations}
      <div class="card-content">
        ${floralDivider}
        <div class="card-name">${name}</div>
        <div class="card-divider"></div>
        <div class="card-text">${text}</div>
      </div>
    </div>`;
}

function renderTemplateSelector(selectedId = 1) {
  return '';
}
