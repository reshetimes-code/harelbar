// ===== GUEST PAGE LOGIC =====
(function() {
  // Get eventId from URL
  var eventId = getEventIdFromPath();
  if (!eventId) return;

  let selectedTemplateId = 1;
  let compressedPhoto = null;
  let currentBlessing = null;
  let cropper = null;

  const form = document.getElementById('blessing-form');
  const nameInput = document.getElementById('guest-name');
  const textInput = document.getElementById('blessing-text');
  const photoInput = document.getElementById('photo-input');
  const photoArea = document.getElementById('photo-area');
  const previewModal = document.getElementById('preview-modal');
  const cardPreview = document.getElementById('card-preview');
  const confirmBtn = document.getElementById('confirm-btn');
  const editBtn = document.getElementById('edit-btn');
  const formContainer = document.getElementById('form-container');
  const successState = document.getElementById('success-state');
  const newBlessingBtn = document.getElementById('new-blessing-btn');

  // Crop modal elements
  const cropModal = document.getElementById('crop-modal');
  const cropImage = document.getElementById('crop-image');
  const cropConfirm = document.getElementById('crop-confirm');
  const cropCancel = document.getElementById('crop-cancel');

  // Photo upload - click
  photoArea.addEventListener('click', function() {
    photoInput.click();
  });

  // Photo upload - drag & drop
  photoArea.addEventListener('dragover', function(e) {
    e.preventDefault();
    photoArea.classList.add('dragover');
  });

  photoArea.addEventListener('dragleave', function() {
    photoArea.classList.remove('dragover');
  });

  photoArea.addEventListener('drop', function(e) {
    e.preventDefault();
    photoArea.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      handlePhotoFile(e.dataTransfer.files[0]);
    }
  });

  photoInput.addEventListener('change', function() {
    console.log('photo change event, files:', photoInput.files.length);
    if (photoInput.files.length) {
      handlePhotoFile(photoInput.files[0]);
    }
  });

  // Also listen on photo-area for input changes (in case input is recreated)
  photoArea.addEventListener('change', function(e) {
    if (e.target && e.target.type === 'file' && e.target.files.length) {
      handlePhotoFile(e.target.files[0]);
    }
  });

  function handlePhotoFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('נא להעלות קובץ תמונה בלבד');
      return;
    }

    // Read file and open cropper
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        cropImage.src = e.target.result;
        cropModal.classList.add('active');

        // Destroy previous cropper if exists
        if (cropper) {
          cropper.destroy();
          cropper = null;
        }

        // Wait for image to load then init cropper
        cropImage.onload = function() {
          try {
            cropper = new Cropper(cropImage, {
              aspectRatio: 1,
              viewMode: 1,
              dragMode: 'move',
              autoCropArea: 1,
              cropBoxResizable: true,
              cropBoxMovable: true,
              background: false,
              guides: false,
              center: true,
              highlight: false,
              responsive: true,
            });
          } catch(err) {
            console.error('Cropper error:', err);
            // Fallback - use image without cropping
            cropModal.classList.remove('active');
            compressImage(file).then(function(dataUrl) {
              compressedPhoto = dataUrl;
              photoArea.classList.add('has-photo');
              photoArea.innerHTML = '<img src="' + dataUrl + '" class="photo-preview" alt="תצוגה מקדימה"><button type="button" class="remove-photo" onclick="removePhoto(event)">×</button>';
              clearError('photo-group');
            });
          }
        };
      } catch(err) {
        console.error('Photo read error:', err);
        // Fallback - use image without cropping
        compressImage(file).then(function(dataUrl) {
          compressedPhoto = dataUrl;
          photoArea.classList.add('has-photo');
          photoArea.innerHTML = '<img src="' + dataUrl + '" class="photo-preview" alt="תצוגה מקדימה"><button type="button" class="remove-photo" onclick="removePhoto(event)">×</button>';
          clearError('photo-group');
        });
      }
    };
    reader.readAsDataURL(file);
  }

  // Crop confirm
  cropConfirm.addEventListener('click', function() {
    if (!cropper) return;

    const canvas = cropper.getCroppedCanvas({
      width: 1600,
      height: 1600,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    });

    compressedPhoto = encodeJpegWithBudget(canvas, { quality: 0.88 });

    // Close crop modal
    cropModal.classList.remove('active');
    cropper.destroy();
    cropper = null;

    // Show preview in upload area
    photoArea.classList.add('has-photo');
    photoArea.innerHTML = `
      <img src="${compressedPhoto}" class="photo-preview" alt="תצוגה מקדימה">
      <button type="button" class="remove-photo" onclick="removePhoto(event)">×</button>
    `;
    clearError('photo-group');
  });

  // Crop cancel
  cropCancel.addEventListener('click', function() {
    cropModal.classList.remove('active');
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }
  });

  // Close crop modal on backdrop click
  cropModal.addEventListener('click', function(e) {
    if (e.target === cropModal) {
      cropModal.classList.remove('active');
      if (cropper) {
        cropper.destroy();
        cropper = null;
      }
    }
  });

  // Remove photo (global for onclick)
  window.removePhoto = function(e) {
    e.stopPropagation();
    compressedPhoto = null;
    photoArea.classList.remove('has-photo');
    photoArea.innerHTML = `
      <input type="file" id="photo-input" accept="image/*">
      <span class="upload-icon">📷</span>
      <span class="upload-text">לחצו כאן להעלאת תמונה</span>
    `;
    const newInput = document.getElementById('photo-input');
    newInput.addEventListener('change', function() {
      if (newInput.files.length) handlePhotoFile(newInput.files[0]);
    });
  };

  // Form submit -> preview
  form.addEventListener('submit', function(e) {
    e.preventDefault();

    if (!validateForm()) return;

    currentBlessing = {
      name: nameInput.value.trim(),
      text: textInput.value.trim(),
      photoDataUrl: compressedPhoto,
      templateId: selectedTemplateId
    };

    cardPreview.innerHTML = renderCard(currentBlessing);
    previewModal.classList.add('active');
  });

  // Confirm send - check AI first
  confirmBtn.addEventListener('click', async function() {
    if (!currentBlessing) return;

    // Disable button and show checking state
    confirmBtn.disabled = true;
    confirmBtn.textContent = '🔍 בודק תוכן...';

    try {
      var aiResult = await checkBlessingClientSide(currentBlessing.name, currentBlessing.text);

      if (!aiResult.approved) {
        // Content rejected - show error and go back to edit
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'שלחו ברכה';
        previewModal.classList.remove('active');

        Swal.fire({
          html: '<div dir="rtl" style="text-align:center; padding:8px 0;">' +
            '<div style="width:56px; height:56px; border-radius:50%; background:rgba(229,85,85,0.12); display:flex; align-items:center; justify-content:center; margin:0 auto 20px; font-size:1.8rem; color:#e55;">⚠️</div>' +
            '<h2 style="color:#fff; font-family:Assistant,sans-serif; font-weight:800; font-size:1.5rem; margin:0 0 8px;">יש בעיה בברכה</h2>' +
            '<p style="color:rgba(255,255,255,0.6); font-size:1rem; margin:0 0 8px;">הברכה מכילה תוכן לא מתאים לאירוע</p>' +
            '<p style="color:#e55; font-size:0.9rem; background:rgba(229,85,85,0.1); padding:8px 12px; border-radius:6px; margin:12px 0 0;">' + (aiResult.reason || 'מילים פוגעניות או תמונה לא מתאימה') + '</p>' +
            '</div>',
          background: 'linear-gradient(180deg, #0c1425 0%, #111c32 100%)',
          border: '1px solid rgba(229,85,85,0.2)',
          confirmButtonText: 'חזרה לעריכה',
          confirmButtonColor: '#b8953e',
          width: 380,
        });
        return;
      }

      // AI approved - send blessing
      await sendBlessingAndShowSuccess();
    } catch (err) {
      console.error('AI check error:', err);
      // If the AI check itself fails, don't block the guest - send anyway.
      await sendBlessingAndShowSuccess();
    }
  });

  // Actually writes the blessing and only shows the success screen once the
  // write is confirmed - previously this fired saveBlessing() without
  // waiting, so a write rejected by the database (e.g. a photo that ended
  // up over the size limit) still showed "sent!" to the guest while nothing
  // was actually saved.
  async function sendBlessingAndShowSuccess() {
    try {
      await saveBlessing(eventId, currentBlessing);
    } catch (saveErr) {
      console.error('Save blessing failed:', saveErr);
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'שלחו ברכה';
      alert('שליחת הברכה נכשלה. בדקו את החיבור לאינטרנט ונסו שוב - אם יש תמונה, אפשר גם לנסות עם תמונה אחרת.');
      return;
    }

    previewModal.classList.remove('active');
    formContainer.style.display = 'none';
    successState.classList.add('active');
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'שלחו ברכה';
    resetForm();

    document.dispatchEvent(new Event('blessing-sent'));
    if (window.confettiBurst) {
      setTimeout(function() { window.confettiBurst(window.innerWidth / 2, window.innerHeight / 3, 120); }, 300);
    }
  }

  // Back to edit
  editBtn.addEventListener('click', function() {
    previewModal.classList.remove('active');
  });

  // Close modal on backdrop click
  previewModal.addEventListener('click', function(e) {
    if (e.target === previewModal) {
      previewModal.classList.remove('active');
    }
  });

  // New blessing
  newBlessingBtn.addEventListener('click', function() {
    successState.classList.remove('active');
    formContainer.style.display = 'block';
  });

  // Validation
  function validateForm() {
    let valid = true;

    if (!nameInput.value.trim()) {
      showError('name-group', 'name-error');
      valid = false;
    } else {
      clearError('name-group');
    }

    if (!textInput.value.trim()) {
      showError('text-group', 'text-error');
      valid = false;
    } else {
      clearError('text-group');
    }

    clearError('photo-group');

    return valid;
  }

  function showError(groupId, errorId) {
    document.getElementById(groupId).classList.add('error');
    if (errorId) document.getElementById(errorId).classList.add('show');
  }

  function clearError(groupId) {
    const group = document.getElementById(groupId);
    if (group) {
      group.classList.remove('error');
      const err = group.querySelector('.error-msg');
      if (err) err.classList.remove('show');
    }
  }

  nameInput.addEventListener('input', () => clearError('name-group'));
  textInput.addEventListener('input', () => clearError('text-group'));

  function resetForm() {
    form.reset();
    compressedPhoto = null;
    currentBlessing = null;
    selectedTemplateId = 1;

    photoArea.classList.remove('has-photo');
    photoArea.innerHTML = `
      <input type="file" id="photo-input" accept="image/*">
      <span class="upload-icon">📷</span>
      <span class="upload-text">לחצו כאן להעלאת תמונה</span>
    `;
    const newInput = document.getElementById('photo-input');
    newInput.addEventListener('change', function() {
      if (newInput.files.length) handlePhotoFile(newInput.files[0]);
    });
  }
})();
