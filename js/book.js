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

  // Download PDF
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

    // --- Cover Page (rendered as image for Hebrew support) ---
    const coverEl = document.getElementById('pdf-cover');
    document.getElementById('cover-date').textContent = new Date().toLocaleDateString('he-IL');
    document.getElementById('cover-count').textContent = blessings.length + ' ברכות מהלב';

    // Make visible for html2canvas
    coverEl.style.opacity = '1';
    coverEl.style.zIndex = '9999';
    await new Promise(r => setTimeout(r, 100));

    const coverCanvas = await html2canvas(coverEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#1a2744',
      logging: false,
    });

    // Hide again
    coverEl.style.opacity = '0';
    coverEl.style.zIndex = '-1';

    const coverImg = coverCanvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(coverImg, 'JPEG', 0, 0, pageWidth, pageHeight);

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
