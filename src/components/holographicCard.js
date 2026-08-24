/**
 * Holographic 3D Tilt Card Component - Interactively tilts card with shiny rainbow glare & sparkles
 */
export function initHoloTilt(cardElement) {
  if (!cardElement) return;

  const glare = cardElement.querySelector('.holo-card-glare');
  let bounds = cardElement.getBoundingClientRect();
  let isInteracting = false;

  function updateBounds() {
    bounds = cardElement.getBoundingClientRect();
  }

  function handleMove(x, y) {
    if (!bounds.width || !bounds.height) updateBounds();

    const left = x - bounds.left;
    const top = y - bounds.top;
    const centerX = bounds.width / 2;
    const centerY = bounds.height / 2;

    const percentX = (left - centerX) / centerX;
    const percentY = (top - centerY) / centerY;

    const rotateX = -percentY * 18; // Max 18 deg tilt
    const rotateY = percentX * 18;

    cardElement.style.transform = `perspective(800px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.04, 1.04, 1.04)`;

    if (glare) {
      const glareX = (left / bounds.width) * 100;
      const glareY = (top / bounds.height) * 100;
      glare.style.background = `linear-gradient(${120 + percentX * 50}deg, 
        rgba(255, 0, 150, 0) 0%, 
        rgba(255, 255, 255, ${0.2 + Math.abs(percentX) * 0.3}) ${glareX - 20}%, 
        rgba(0, 240, 255, 0.5) ${glareX}%, 
        rgba(255, 230, 0, 0.4) ${glareX + 15}%, 
        rgba(255, 0, 150, 0.3) ${glareX + 30}%, 
        rgba(0, 0, 0, 0) 100%)`;
      glare.style.opacity = '0.85';
    }
  }

  function resetTilt() {
    isInteracting = false;
    cardElement.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    if (glare) {
      glare.style.opacity = '0.4';
      glare.style.background = '';
    }
  }

  // Mouse events
  cardElement.addEventListener('mouseenter', () => {
    updateBounds();
    isInteracting = true;
  });

  cardElement.addEventListener('mousemove', (e) => {
    if (!isInteracting) return;
    handleMove(e.clientX, e.clientY);
  });

  cardElement.addEventListener('mouseleave', resetTilt);

  // Touch events for mobile finger dragging
  cardElement.addEventListener('touchstart', (e) => {
    updateBounds();
    isInteracting = true;
    if (e.touches.length === 1) {
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  cardElement.addEventListener('touchmove', (e) => {
    if (!isInteracting || e.touches.length !== 1) return;
    handleMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  cardElement.addEventListener('touchend', resetTilt);
  cardElement.addEventListener('touchcancel', resetTilt);

  // Device orientation (Smartphone gyroscope tilt)
  if (window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission !== 'function') {
    window.addEventListener('deviceorientation', (e) => {
      if (isInteracting || !e.gamma || !e.beta) return;
      const gamma = Math.min(Math.max(e.gamma, -25), 25); // Tilt left/right
      const beta = Math.min(Math.max(e.beta - 45, -25), 25); // Tilt up/down (assuming 45deg holding angle)
      
      const rotY = (gamma / 25) * 15;
      const rotX = -(beta / 25) * 15;

      cardElement.style.transform = `perspective(800px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) scale3d(1.02, 1.02, 1.02)`;
    }, { passive: true });
  }
}
