// ===== SLIDESHOW LOGIC (Multi-Tenant) =====
(function() {
  var eventId = getEventIdFromQuery();
  if (!eventId) {
    alert('לא צוין אירוע');
    window.location.href = '/';
    return;
  }

  // Load event meta
  getEventMeta(eventId).then(function(meta) {
    if (meta && meta.celebrantName) {
      var titleEl = document.getElementById('slideshow-title');
      if (titleEl) titleEl.textContent = 'ברכות לכבוד ' + meta.celebrantName;
    }
  });

  const slidesContainer = document.getElementById('slides-container');
  const emptyState = document.getElementById('empty-state');
  const swiperEl = document.getElementById('slideshow-swiper');
  const playBtn = document.getElementById('play-btn');
  const speedBtn = document.getElementById('speed-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const countBadge = document.getElementById('count-badge');
  const newToast = document.getElementById('new-toast');

  let swiper = null;
  let isPlaying = true;
  let currentSpeed = 6000;

  const speeds = [
    { delay: 8000, label: 'איטית' },
    { delay: 6000, label: 'רגילה' },
    { delay: 4000, label: 'מהירה' },
    { delay: 2500, label: 'מהירה מאוד' },
  ];
  let speedIndex = 1;

  function addSlide(blessing) {
    const slide = document.createElement('div');
    slide.className = 'swiper-slide';
    slide.dataset.blessingId = blessing.id;
    slide.innerHTML = renderCard(blessing);
    slidesContainer.appendChild(slide);
  }

  function initSwiper() {
    swiper = new Swiper('#slideshow-swiper', {
      effect: 'fade',
      fadeEffect: { crossFade: true },
      autoplay: {
        delay: currentSpeed,
        disableOnInteraction: false,
      },
      loop: true,
      speed: 1000,
      keyboard: { enabled: true },
    });
  }

  function showToast() {
    newToast.classList.add('show');
    setTimeout(function() { newToast.classList.remove('show'); }, 3000);
  }

  function updateCount(count) {
    countBadge.textContent = count + ' ברכות';
  }

  // Real-time listener
  let firstLoad = true;
  let knownIds = new Set();

  onBlessingsChanged(eventId, function(allBlessings) {
    // Only show blessings the AI/admin has actually approved - a raw write
    // is visible here the instant a guest submits, before the moderation
    // Cloud Function has even run, so showing everything would put
    // unreviewed (and potentially rejected) content on screen. Same filter
    // screen.html already applies to the live event display.
    var blessings = allBlessings.filter(function(b) { return b.status === 'approved'; });
    updateCount(blessings.length);

    if (blessings.length === 0) {
      swiperEl.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    swiperEl.style.display = 'block';

    if (firstLoad) {
      blessings.forEach(function(b) {
        addSlide(b);
        knownIds.add(b.id);
      });
      initSwiper();
      firstLoad = false;
    } else {
      var newOnes = blessings.filter(function(b) { return !knownIds.has(b.id); });
      if (newOnes.length > 0) {
        newOnes.forEach(function(b) {
          knownIds.add(b.id);
          addSlide(b);
        });
        if (swiper) swiper.update();
        showToast();
      }
    }
  });

  // Play/Pause
  playBtn.addEventListener('click', function() {
    if (!swiper) return;
    if (isPlaying) {
      swiper.autoplay.stop();
      playBtn.textContent = '▶ הפעל';
    } else {
      swiper.autoplay.start();
      playBtn.textContent = '⏸ השהה';
    }
    isPlaying = !isPlaying;
  });

  // Speed
  speedBtn.addEventListener('click', function() {
    speedIndex = (speedIndex + 1) % speeds.length;
    currentSpeed = speeds[speedIndex].delay;
    speedBtn.textContent = 'מהירות: ' + speeds[speedIndex].label;

    if (swiper) {
      swiper.params.autoplay.delay = currentSpeed;
      if (isPlaying) {
        swiper.autoplay.stop();
        swiper.autoplay.start();
      }
    }
  });

  // Fullscreen
  fullscreenBtn.addEventListener('click', function() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(function() {});
      fullscreenBtn.textContent = 'צא ממסך מלא';
    } else {
      document.exitFullscreen();
      fullscreenBtn.textContent = 'מסך מלא';
    }
  });

  // Keyboard
  document.addEventListener('keydown', function(e) {
    if (e.code === 'Space') {
      e.preventDefault();
      playBtn.click();
    }
  });
})();
