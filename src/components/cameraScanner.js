/**
 * Camera Scanner Component - Manages WebRTC video stream, torch, zoom, frame crop & capture
 */
import { sound } from '../services/soundService.js';

export class CameraScanner {
  constructor({ videoElement, canvasElement, frameElement, onCapture }) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.frame = frameElement;
    this.onCapture = onCapture;
    
    this.stream = null;
    this.track = null;
    this.facingMode = 'environment'; // 'environment' = back camera, 'user' = front camera
    this.isTorchOn = false;
    this.currentZoom = 1.0;
    this.isScanning = false;
  }

  async startCamera() {
    this.stopCamera();

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: this.facingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      this.track = this.stream.getVideoTracks()[0];

      await this.video.play();
      return true;
    } catch (err) {
      console.warn('Não foi possível acessar a câmera:', err);
      // Fallback constraint
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: true });
        this.video.srcObject = this.stream;
        this.track = this.stream.getVideoTracks()[0];
        await this.video.play();
        return true;
      } catch (err2) {
        console.error('Falha geral no acesso à câmera:', err2);
        return false;
      }
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
      this.track = null;
    }
  }

  async switchCamera() {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    sound.playTap();
    await this.startCamera();
  }

  async toggleTorch() {
    if (!this.track) return false;
    const capabilities = this.track.getCapabilities ? this.track.getCapabilities() : {};
    
    if (capabilities.torch) {
      this.isTorchOn = !this.isTorchOn;
      try {
        await this.track.applyConstraints({
          advanced: [{ torch: this.isTorchOn }]
        });
        sound.playTap();
        return this.isTorchOn;
      } catch (e) {
        console.warn('Falha ao alternar lanterna:', e);
      }
    }
    return false;
  }

  async setZoom(zoomLevel) {
    if (!this.track) return;
    this.currentZoom = zoomLevel;
    const capabilities = this.track.getCapabilities ? this.track.getCapabilities() : {};
    
    if (capabilities.zoom) {
      const min = capabilities.zoom.min || 1;
      const max = capabilities.zoom.max || 3;
      const targetZoom = Math.min(Math.max(zoomLevel, min), max);
      try {
        await this.track.applyConstraints({
          advanced: [{ zoom: targetZoom }]
        });
      } catch (e) {
        // ignore
      }
    }
  }

  /**
   * Captures the exact cropped region aligned with the bounding card frame
   * @returns {HTMLCanvasElement} High resolution cropped canvas containing the card
   */
  captureCardFrame() {
    if (!this.video || this.video.videoWidth === 0) return null;

    const videoWidth = this.video.videoWidth;
    const videoHeight = this.video.videoHeight;

    // Viewport and Frame DOM positions
    const videoRect = this.video.getBoundingClientRect();
    const frameRect = this.frame.getBoundingClientRect();

    // Calculate scale between displayed video rect and intrinsic video resolution
    const scaleX = videoWidth / videoRect.width;
    const scaleY = videoHeight / videoRect.height;

    // Frame position relative to video display
    const cropX = (frameRect.left - videoRect.left) * scaleX;
    const cropY = (frameRect.top - videoRect.top) * scaleY;
    const cropWidth = frameRect.width * scaleX;
    const cropHeight = frameRect.height * scaleY;

    // Ensure within video boundary bounds
    const sx = Math.max(0, cropX);
    const sy = Math.max(0, cropY);
    const sw = Math.min(videoWidth - sx, cropWidth);
    const sh = Math.min(videoHeight - sy, cropHeight);

    this.canvas.width = sw;
    this.canvas.height = sh;

    const ctx = this.canvas.getContext('2d');
    ctx.drawImage(this.video, sx, sy, sw, sh, 0, 0, sw, sh);

    return this.canvas;
  }

  setScanningAnimation(active) {
    this.isScanning = active;
    if (active) {
      this.frame.classList.add('active-scanning');
      sound.playScanBeep();
      if (navigator.vibrate) navigator.vibrate(40);
    } else {
      this.frame.classList.remove('active-scanning');
    }
  }
}
