// ===== CONFETTI — MINIMAL & ELEGANT =====
(function() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let particles = [];
  let animating = false;

  const COLORS = [
    '#b8953e', '#d4b065', '#c9a84c', '#e8d5a0',
    '#8a7040', '#f0d68a', '#a08838', '#c0a050'
  ];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  resize();
  window.addEventListener('resize', resize);

  class Particle {
    constructor(x, y) {
      this.x = x || canvas.width / 2;
      this.y = y || canvas.height / 3;
      this.size = Math.random() * 6 + 2;
      this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
      this.shape = Math.random() > 0.5 ? 'rect' : 'circle';
      this.speedY = (Math.random() - 0.5) * 10;
      this.speedX = (Math.random() - 0.5) * 10;
      this.rotation = Math.random() * 360;
      this.rotSpeed = (Math.random() - 0.5) * 6;
      this.opacity = 1;
      this.gravity = 0.12;
      this.friction = 0.99;
      this.life = 100;
      this.maxLife = this.life;
    }

    update() {
      this.speedY += this.gravity;
      this.speedX *= this.friction;
      this.x += this.speedX;
      this.y += this.speedY;
      this.rotation += this.rotSpeed;
      this.life--;
      this.opacity = Math.max(0, this.life / this.maxLife);
    }

    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate((this.rotation * Math.PI) / 180);
      ctx.globalAlpha = this.opacity;
      ctx.fillStyle = this.color;

      if (this.shape === 'rect') {
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size * 0.6);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, this.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles = particles.filter(p => p.life > 0 && p.y < canvas.height + 20);
    particles.forEach(p => {
      p.update();
      p.draw();
    });

    if (particles.length > 0) {
      requestAnimationFrame(animate);
    } else {
      animating = false;
    }
  }

  function startAnimation() {
    if (!animating) {
      animating = true;
      animate();
    }
  }

  function burstConfetti(x, y, count) {
    x = x || canvas.width / 2;
    y = y || canvas.height / 3;
    for (let i = 0; i < (count || 60); i++) {
      particles.push(new Particle(x, y));
    }
    startAnimation();
  }

  // Expose burst for external use
  window.confettiBurst = function(x, y, count) {
    burstConfetti(x, y, count);
  };

  // Burst on success
  document.addEventListener('blessing-sent', function() {
    burstConfetti(canvas.width / 2, canvas.height / 3, 80);
  });

  // Confetti button in slideshow
  const confettiBtn = document.getElementById('confetti-btn');
  if (confettiBtn) {
    confettiBtn.addEventListener('click', function() {
      burstConfetti(canvas.width / 2, canvas.height / 3, 80);
    });
  }
})();
