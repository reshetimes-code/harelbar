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

    // --- Cover Page ---
    pdf.setFillColor(26, 39, 68);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');

    pdf.setDrawColor(212, 168, 83);
    pdf.setLineWidth(1);
    pdf.rect(10, 10, pageWidth - 20, pageHeight - 20);
    pdf.rect(14, 14, pageWidth - 28, pageHeight - 28);

    pdf.setFont('Helvetica', 'bold');
    pdf.setTextColor(212, 168, 83);
    pdf.setFontSize(36);
    pdf.text('ספר הברכות', pageWidth / 2, 100, { align: 'center' });

    pdf.setFontSize(24);
    pdf.setTextColor(240, 214, 138);
    pdf.text('בר המצווה של הראלי', pageWidth / 2, 130, { align: 'center' });

    pdf.setFontSize(16);
    pdf.setTextColor(200, 200, 200);
    const dateStr = new Date().toLocaleDateString('he-IL');
    pdf.text(dateStr, pageWidth / 2, 160, { align: 'center' });

    pdf.setFontSize(14);
    pdf.text(`${blessings.length} ברכות מהלב`, pageWidth / 2, 180, { align: 'center' });

    pdf.setFontSize(60);
    pdf.setTextColor(212, 168, 83);
    pdf.text('✡', pageWidth / 2, 230, { align: 'center' });

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
