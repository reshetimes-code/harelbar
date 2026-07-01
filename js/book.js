// ===== BOOK / PDF GENERATION LOGIC =====
(function() {
  const cardsGrid = document.getElementById('cards-grid');
  const statsEl = document.getElementById('stats');
  const emptyBook = document.getElementById('empty-book');
  const downloadBtn = document.getElementById('download-btn');
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

      const card = cards[i];
      const origWidth = card.style.width;
      const origHeight = card.style.height;
      card.style.width = '794px';
      card.style.height = '1123px';
      card.style.borderRadius = '0';

      // Pre-blur card-bg image using canvas since html2canvas doesn't support CSS blur
      const cardBg = card.querySelector('.card-bg');
      let origBgStyle = null;
      if (cardBg) {
        origBgStyle = cardBg.style.cssText;
        const bgImg = cardBg.style.backgroundImage;
        const urlMatch = bgImg && bgImg.match(/url\(['"]?(.*?)['"]?\)/);
        if (urlMatch) {
          try {
            const blurCanvas = document.createElement('canvas');
            blurCanvas.width = 800;
            blurCanvas.height = 1100;
            const ctx = blurCanvas.getContext('2d');
            ctx.filter = 'blur(30px) saturate(1.3) brightness(0.5)';
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = urlMatch[1];
            await new Promise(r => { img.onload = r; img.onerror = r; });
            ctx.drawImage(img, -60, -60, 920, 1220);
            const blurredUrl = blurCanvas.toDataURL();
            cardBg.style.filter = 'none';
            cardBg.style.backgroundImage = `url('${blurredUrl}')`;
            cardBg.style.transform = 'none';
            cardBg.style.inset = '0';
          } catch(e) {}
        }
      }

      await new Promise(r => setTimeout(r, 50));

      const canvas = await html2canvas(card, {
        scale: 3,
        useCORS: true,
        backgroundColor: null,
        logging: false,
      });

      // Restore original styles
      if (cardBg && origBgStyle !== null) {
        cardBg.style.cssText = origBgStyle;
      }
      card.style.width = origWidth;
      card.style.height = origHeight;
      card.style.borderRadius = '';

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight);

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
