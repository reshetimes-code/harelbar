// ===== BOOK / PDF GENERATION LOGIC (Multi-Tenant) =====
(function() {
  var eventId = getEventIdFromQuery();
  if (!eventId) {
    alert('לא צוין אירוע');
    window.location.href = '/';
    return;
  }

  var celebrantName = '';

  const cardsGrid = document.getElementById('cards-grid');
  const statsEl = document.getElementById('stats');
  const emptyBook = document.getElementById('empty-book');
  const downloadBtn = document.getElementById('download-btn');
  const shareBookBtn = document.getElementById('share-book-btn');
  const progressContainer = document.getElementById('progress-container');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const exportOverlay = document.getElementById('export-overlay');
  const exportOverlayText = document.getElementById('export-overlay-text');

  function setExportStatus(text) {
    progressText.textContent = text;
    if (exportOverlayText) exportOverlayText.textContent = text;
  }

  // Lets an admin hand the book page itself to the event owner (WhatsApp or
  // email) so the owner can open it and download the PDF on their own
  // device, instead of waiting for someone else's export to finish.
  if (shareBookBtn) {
    shareBookBtn.addEventListener('click', function() {
      var bookUrl = window.location.origin + '/book.html?event=' + eventId;
      var name = celebrantName || '';
      var shareText = (name ? 'ספר הברכות של ' + name + ' מוכן! ' : 'ספר הברכות מוכן! ') +
        'אפשר לצפות ולהוריד PDF כאן 👇\n' + bookUrl;
      var mailSubject = 'ספר הברכות' + (name ? ' - ' + name : '');
      var mailBody = 'שלום,\n\nספר הברכות מוכן לצפייה ולהורדה בקישור הבא:\n' + bookUrl + '\n\nניתן ללחוץ על "הורד PDF" בעמוד כדי לשמור אותו למחשב או לטלפון.';

      if (typeof Swal === 'undefined') {
        // Fallback with no dependency, in case sweetalert2 failed to load.
        window.prompt('העתיקו את הקישור ושלחו לבעל האירוע:', bookUrl);
        return;
      }

      Swal.fire({
        title: 'שיתוף ספר הברכות',
        html: '<div dir="rtl" style="text-align:center;">' +
          '<p style="color:rgba(255,255,255,0.6); font-size:0.9rem; margin:0 0 14px;">בעל האירוע יוכל לפתוח את הקישור ולהוריד את ה-PDF בעצמו, מהמכשיר שלו</p>' +
          '<div style="display:flex; flex-direction:column; gap:12px;">' +
            '<a href="https://wa.me/?text=' + encodeURIComponent(shareText) + '" target="_blank" style="display:flex; align-items:center; gap:14px; padding:16px 18px; background:rgba(255,255,255,0.1); border:1.5px solid rgba(255,255,255,0.2); border-radius:12px; text-decoration:none; color:#fff;">' +
              '<span style="font-size:1.6rem;">📱</span>' +
              '<span style="flex:1; text-align:right; font-weight:700;">שליחה בוואטסאפ</span>' +
            '</a>' +
            '<div id="book-share-phone-toggle" style="display:flex; align-items:center; gap:14px; padding:16px 18px; background:rgba(255,255,255,0.1); border:1.5px solid rgba(255,255,255,0.2); border-radius:12px; cursor:pointer; color:#fff;">' +
              '<span style="font-size:1.6rem;">☎️</span>' +
              '<span style="flex:1; text-align:right; font-weight:700;">שליחה למספר ספציפי</span>' +
            '</div>' +
            '<div id="book-share-phone-section" style="display:none;">' +
              '<div style="display:flex; gap:8px;">' +
                '<input type="tel" id="book-share-phone-input" placeholder="הכניסו מספר טלפון" dir="ltr" style="flex:1; padding:12px 14px; border:1.5px solid rgba(255,255,255,0.15); border-radius:8px; font-family:Assistant,sans-serif; font-size:1rem; background:rgba(255,255,255,0.08); color:#fff; text-align:center;">' +
                '<button id="book-share-phone-send" style="padding:12px 18px; background:#25D366; color:#fff; border:none; border-radius:8px; font-family:Assistant,sans-serif; font-weight:700; cursor:pointer; white-space:nowrap;">שלחו</button>' +
              '</div>' +
            '</div>' +
            '<a href="mailto:?subject=' + encodeURIComponent(mailSubject) + '&body=' + encodeURIComponent(mailBody) + '" style="display:flex; align-items:center; gap:14px; padding:16px 18px; background:rgba(255,255,255,0.1); border:1.5px solid rgba(255,255,255,0.2); border-radius:12px; text-decoration:none; color:#fff;">' +
              '<span style="font-size:1.6rem;">✉️</span>' +
              '<span style="flex:1; text-align:right; font-weight:700;">שליחה במייל</span>' +
            '</a>' +
            '<button id="book-share-copy" style="display:flex; align-items:center; gap:14px; padding:16px 18px; background:rgba(255,255,255,0.1); border:1.5px solid rgba(255,255,255,0.2); border-radius:12px; color:#fff; font-family:Assistant,sans-serif; cursor:pointer;">' +
              '<span style="font-size:1.6rem;">🔗</span>' +
              '<span style="flex:1; text-align:right; font-weight:700;">העתקת קישור</span>' +
            '</button>' +
          '</div>' +
        '</div>',
        background: '#0a0f1e',
        color: '#fff',
        showConfirmButton: false,
        showCloseButton: true,
        width: 420,
        didOpen: function() {
          document.getElementById('book-share-phone-toggle').addEventListener('click', function() {
            var section = document.getElementById('book-share-phone-section');
            section.style.display = section.style.display === 'none' ? 'block' : 'none';
            if (section.style.display === 'block') document.getElementById('book-share-phone-input').focus();
          });
          document.getElementById('book-share-phone-send').addEventListener('click', function() {
            var phone = document.getElementById('book-share-phone-input').value.trim().replace(/[-\s]/g, '');
            if (!phone || phone.length < 9) return;
            var num = phone.startsWith('0') ? '972' + phone.slice(1) : phone;
            window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(shareText), '_blank');
            Swal.close();
          });
          document.getElementById('book-share-copy').addEventListener('click', function() {
            navigator.clipboard.writeText(bookUrl).then(function() {
              document.getElementById('book-share-copy').querySelector('span:last-child').textContent = 'הקישור הועתק!';
            });
          });
        }
      });
    });
  }

  async function init() {
    // Load event meta
    var meta = await getEventMeta(eventId);
    if (meta) {
      celebrantName = meta.celebrantName || '';
      document.getElementById('book-subtitle').textContent = 'האירוע של ' + celebrantName;
      document.title = 'ספר הברכות - ' + celebrantName;
    }

    const blessings = await getAllBlessings(eventId);

    if (blessings.length === 0) {
      cardsGrid.style.display = 'none';
      emptyBook.style.display = 'block';
      statsEl.textContent = '';
      return;
    }

    statsEl.textContent = blessings.length + ' ברכות';

    blessings.forEach(function(b) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = renderCard(b);
      cardsGrid.appendChild(wrapper.firstElementChild);
    });
  }

  function createCoverElement(count) {
    const cover = document.createElement('div');
    cover.style.cssText = 'width:794px;height:1123px;background:#1a2744;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Assistant,sans-serif;box-sizing:border-box;border:4px solid #d4a853;padding:40px;position:fixed;top:0;left:0;z-index:9999;';
    cover.innerHTML =
      '<div style="border:2px solid #d4a853;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;box-sizing:border-box;">' +
        '<h1 style="color:#d4a853;font-size:56px;font-weight:800;margin:0;">ספר הברכות</h1>' +
        '<p style="color:#f0d68a;font-size:36px;font-weight:700;margin:30px 0 0;">האירוע של ' + escapeHtml(celebrantName) + '</p>' +
        '<p style="color:#c8c8c8;font-size:24px;margin:40px 0 0;">' + new Date().toLocaleDateString('he-IL') + '</p>' +
        '<p style="color:#c8c8c8;font-size:20px;margin:20px 0 0;">' + count + ' ברכות מהלב</p>' +
        '<p style="color:#d4a853;font-size:80px;margin:50px 0 0;">✡</p>' +
      '</div>';
    return cover;
  }

  // Waits for the next painted frame (double rAF), so a progress-bar/text
  // update is actually visible before the next heavy, mostly-synchronous
  // html2canvas call blocks the main thread.
  function paintFrame() {
    return new Promise(function(r) {
      requestAnimationFrame(function() { requestAnimationFrame(r); });
    });
  }

  // Cheap stand-in for the old full-resolution canvas blur: shrink the photo
  // onto a tiny canvas (blur cost scales with pixel count, so this is ~100x
  // fewer pixels than blurring at full card size). Returns the tiny canvas
  // itself (not a data URL) - the caller draws it directly onto the final
  // page canvas rather than setting it as a CSS background-image, which
  // sidesteps an html2canvas bug where certain background-image render
  // sizes crash internally ("Failed to execute 'createPattern' ... width
  // or height of 0"). Never rejects - a broken/slow image just yields null
  // and the card falls back to a plain navy background instead of a photo
  // backdrop, so one bad photo can never hang or crash the whole export.
  function makeBlurredBackgroundCanvas(url) {
    return new Promise(function(resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      var done = false;
      var finish = function(result) { if (!done) { done = true; resolve(result); } };
      img.onload = function() {
        try {
          var tw = 110, th = 156; // ~A4 ratio, tiny on purpose
          var c = document.createElement('canvas');
          c.width = tw; c.height = th;
          var ctx = c.getContext('2d');
          ctx.filter = 'blur(6px) saturate(1.3) brightness(0.5)';
          var ow = tw * 1.16, oh = th * 1.16;
          ctx.drawImage(img, -(ow - tw) / 2, -(oh - th) / 2, ow, oh);
          finish(c);
        } catch (e) {
          finish(null); // e.g. tainted canvas - fall back to plain navy
        }
      };
      img.onerror = function() { finish(null); };
      img.src = url;
      // Never let one bad image hang the whole export.
      setTimeout(function() { finish(null); }, 4000);
    });
  }

  downloadBtn.addEventListener('click', async function() {
    if (downloadBtn.disabled) return;

    downloadBtn.disabled = true;
    progressContainer.classList.add('active');
    if (exportOverlay) exportOverlay.classList.add('active');
    // Swaps in the large, print-tuned photo/text sizing (css/style.css) for
    // the whole export - the normal sizing here is tuned for the small
    // on-screen preview thumbnail, not a full A4 print page.
    cardsGrid.classList.add('pdf-export-active');
    progressFill.style.width = '2%';
    setExportStatus('אני מוריד... אנא המתן');
    await paintFrame();

    try {
      const blessings = await getAllBlessings(eventId);
      if (blessings.length === 0) return;

      if (!window.jspdf || !window.jspdf.jsPDF) {
        throw new Error('ספריית ה-PDF לא נטענה (בדקו חיבור אינטרנט ורעננו את הדף)');
      }
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = 210;
      const pageHeight = 297;

      // --- Cover Page ---
      const cover = createCoverElement(blessings.length);
      document.body.appendChild(cover);
      await paintFrame();

      try {
        const coverCanvas = await html2canvas(cover, {
          scale: 1.5,
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
      let skippedCount = 0;
      let firstSkipDetail = '';

      for (let i = 0; i < cards.length; i++) {
        updateProgress(i + 1, totalSteps);
        await paintFrame();

        const card = cards[i];
        const origWidth = card.style.width;
        const origHeight = card.style.height;
        card.style.width = '794px';
        card.style.height = '1123px';
        card.style.borderRadius = '0';

        const cardBg = card.querySelector('.card-bg');
        let origBgImage = null;
        let blurredCanvas = null;
        if (cardBg) {
          const bgImg = cardBg.style.backgroundImage;
          const urlMatch = bgImg && bgImg.match(/url\(['"]?(.*?)['"]?\)/);
          if (urlMatch) {
            blurredCanvas = await makeBlurredBackgroundCanvas(urlMatch[1]);
          }
          // Clear the background-image itself (not just hide the element)
          // for the capture - html2canvas still tries to resolve/resize a
          // background-image on a display:none element while pre-loading
          // its resource cache, and the collapsed 0x0 box is exactly what
          // was throwing "createPattern ... width or height of 0". We draw
          // our own pre-blurred canvas underneath the result afterwards.
          origBgImage = bgImg;
          cardBg.style.backgroundImage = 'none';
        }

        // Photo cards had their real background hidden above, so capture
        // them transparently and paint our own backdrop in underneath;
        // no-photo cards already have an opaque gradient covering the
        // whole box, so a plain navy base is just a safety net for them.
        let canvas = null;
        try {
          canvas = await html2canvas(card, {
            scale: 2,
            useCORS: true,
            backgroundColor: cardBg ? null : '#1a2744',
            logging: false,
          });
        } catch (renderErr) {
          console.error('Card ' + (i + 1) + ' failed to render, skipping it:', renderErr);
          if (!firstSkipDetail) {
            firstSkipDetail = (renderErr && (renderErr.message || renderErr.toString())) || 'שגיאה לא ידועה';
          }
        }

        if (cardBg) cardBg.style.backgroundImage = origBgImage || '';
        card.style.width = origWidth;
        card.style.height = origHeight;
        card.style.borderRadius = '';

        if (!canvas) {
          skippedCount++;
          continue; // one bad card should never sink the whole book
        }

        if (cardBg) {
          const composite = document.createElement('canvas');
          composite.width = canvas.width;
          composite.height = canvas.height;
          const cctx = composite.getContext('2d');
          cctx.fillStyle = '#1a2744';
          cctx.fillRect(0, 0, composite.width, composite.height);
          if (blurredCanvas) {
            cctx.drawImage(blurredCanvas, 0, 0, composite.width, composite.height);
          }
          cctx.drawImage(canvas, 0, 0);
          canvas = composite;
        }

        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight);
      }

      if (skippedCount > 0) {
        console.warn(skippedCount + ' blessing(s) could not be rendered and were skipped.');
      }

      progressFill.style.width = '100%';
      setExportStatus('אני מוריד... אנא המתן');
      await paintFrame();

      var filename = 'ספר_ברכות_' + (celebrantName || 'אירוע') + '.pdf';
      pdf.save(filename);

      if (skippedCount > 0) {
        alert('הקובץ ירד, אבל ' + skippedCount + ' מתוך ' + totalSteps + ' ברכות לא הצליחו להיכנס אליו בגלל בעיה טכנית (' + firstSkipDetail + ') ולכן לא נכללו. אפשר לנסות שוב מאוחר יותר.');
      }
    } catch (err) {
      console.error('PDF export failed:', err);
      var detail = (err && (err.message || err.toString())) || 'שגיאה לא ידועה';
      alert('משהו השתבש בהכנת הקובץ (' + detail + '). נסו שוב - אם זה חוזר על עצמו, נסו ממכשיר אחר או עם פחות ברכות בו-זמנית.');
    } finally {
      cardsGrid.classList.remove('pdf-export-active');
      progressContainer.classList.remove('active');
      if (exportOverlay) exportOverlay.classList.remove('active');
      progressFill.style.width = '0%';
      downloadBtn.disabled = false;
    }
  });

  function updateProgress(current, total) {
    const pct = Math.round((current / total) * 100);
    progressFill.style.width = pct + '%';
    setExportStatus('אני מוריד... אנא המתן (' + current + ' מתוך ' + total + ')');
  }

  init();
})();
