// ===== BOOK / PDF GENERATION LOGIC =====
(function() {
  const cardsGrid = document.getElementById('cards-grid');
  const statsEl = document.getElementById('stats');
  const emptyBook = document.getElementById('empty-book');
  const downloadBtn = document.getElementById('download-btn');
  const layoutSelect = document.getElementById('layout-select');
  const progressContainer = document.getElementById('progress-container');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');

  async function init() {
    const blessings = await getAllBlessings();

    if (blessings.length === 0) {
      cardsGrid.style.display = 'none';
      emptyBook.style.display = 'block';
      statsEl.textContent = '';
      return;
    }

    statsEl.textContent = `${blessings.length} ברכות`;

    blessings.forEach(b => {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = renderCard(b);
      cardsGrid.appendChild(wrapper.firstElementChild);
    });
  }

  function createCoverElement(count) {
    const cover = document.createElement('div');
    cover.style.cssText = 'width:794px;height:1123px;background:#1a2744;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Assistant,sans-serif;box-sizing:border-box;border:4px solid #d4a853;padding:40px;position:fixed;top:0;left:0;z-index:9999;';
    cover.innerHTML = `
      <div style="border:2px solid #d4a853;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;box-sizing:border-box;">
        <h1 style="color:#d4a853;font-size:56px;font-weight:800;margin:0;">ספר הברכות</h1>
        <p style="color:#f0d68a;font-size:36px;font-weight:700;margin:30px 0 0;">בר המצווה של הראלי</p>
        <p style="color:#c8c8c8;font-size:24px;margin:40px 0 0;">${new Date().toLocaleDateString('he-IL')}</p>
        <p style="color:#c8c8c8;font-size:20px;margin:20px 0 0;">${count} ברכות מהלב</p>
        <p style="color:#d4a853;font-size:80px;margin:50px 0 0;">✡</p>
      </div>
    `;
    return cover;
  }

  downloadBtn.addEventListener('click', async function() {
    const blessings = await getAllBlessings();
    if (blessings.length === 0) return;

    const cardsPerPage = parseInt(layoutSelect.value);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;
    const pageHeight = 297;

    downloadBtn.disabled = true;
    progressContainer.classList.add('active');
    progressText.textContent = 'מכין שער...';

    // --- Cover Page ---
    const cover = createCoverElement(blessings.length);
    document.body.appendChild(cover);
    await new Promise(r => setTimeout(r, 200));

    try {
      const coverCanvas = await html2canvas(cover, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#1a2744',
        logging: false,
      });
      const coverImg = coverCanvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(coverImg, 'JPEG', 0, 0, pageWidth, pageHeight);
    } finally {
      document.body.removeChild(cover);
    }

    // --- Blessing Pages ---
    const cards = cardsGrid.querySelectorAll('.blessing-card');
    const totalSteps = cards.length;

    for (let i = 0; i < cards.length; i++) {
      updateProgress(i + 1, totalSteps);

      const canvas = await html2canvas(cards[i], {
        scale: 2,
        useCORS: true,
        backgroundColor: null,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const imgRatio = canvas.height / canvas.width;

      if (cardsPerPage === 1) {
        pdf.addPage();
        const cardWidth = pageWidth - 40;
        const cardHeight = cardWidth * imgRatio;
        const x = 20;
        const y = (pageHeight - cardHeight) / 2;
        pdf.addImage(imgData, 'JPEG', x, y, cardWidth, cardHeight);
      } else {
        const posOnPage = i % 2;
        if (posOnPage === 0) pdf.addPage();

        const cardWidth = pageWidth - 40;
        const cardHeight = Math.min(cardWidth * imgRatio, (pageHeight - 30) / 2 - 10);
        const adjustedWidth = cardHeight / imgRatio;
        const x = (pageWidth - adjustedWidth) / 2;
        const y = posOnPage === 0 ? 15 : pageHeight / 2 + 5;
        pdf.addImage(imgData, 'JPEG', x, y, adjustedWidth, cardHeight);
      }

      await new Promise(r => setTimeout(r, 50));
    }

    pdf.save('ספר_ברכות_הראלי.pdf');

    progressContainer.classList.remove('active');
    downloadBtn.disabled = false;
  });

  function updateProgress(current, total) {
    const pct = Math.round((current / total) * 100);
    progressFill.style.width = pct + '%';
    progressText.textContent = `מעבד ברכה ${current} מתוך ${total}...`;
  }

  init();
})();
