/* ============================================================
   particles.js — 共享粒子背景（与校区页同一套视觉）
   页面只需：<canvas id="particleCanvas"></canvas> 并引入本脚本
   ============================================================ */
(function () {
  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let particles = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initParticles();
  }
  function initParticles() {
    particles = [];
    const count = Math.min(Math.floor((canvas.width * canvas.height) / 14000), 110);
    for (let i = 0; i < count; i++) particles.push(createParticle());
  }
  function createParticle() {
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 2.6 + 0.5,
      speedX: (Math.random() - 0.5) * 0.45,
      speedY: (Math.random() - 0.5) * 0.45,
      opacity: Math.random() * 0.45 + 0.12,
      hue: Math.random() * 40 + 200,
      saturation: Math.random() * 50 + 50,
      lightness: Math.random() * 30 + 50,
      pulse: Math.random() * Math.PI * 2
    };
  }
  function drawParticle(p) {
    p.pulse += 0.02;
    const op = p.opacity * (0.7 + Math.sin(p.pulse) * 0.3);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = 'hsla(' + p.hue + ',' + p.saturation + '%,' + p.lightness + '%,' + op + ')';
    ctx.fill();
    if (p.size > 1.5) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'hsla(' + p.hue + ',' + p.saturation + '%,' + p.lightness + '%,' + (op * 0.15) + ')';
      ctx.fill();
    }
  }
  function connectParticles() {
    const maxDist = 145;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxDist) {
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(59,130,246,' + ((1 - dist / maxDist) * 0.15) + ')';
          ctx.lineWidth = 0.5;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
  }
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.speedX; p.y += p.speedY;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;
      drawParticle(p);
    });
    connectParticles();
    requestAnimationFrame(animate);
  }
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });
  resize();
  animate();
})();
