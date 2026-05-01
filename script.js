// ==================== APP STATE ====================
let canvas, ctx;
let canvasW = 1280, canvasH = 720;
let elements = [];
let selectedElement = null;
let currentTool = 'select';
let bgType = 'solid';
let gradDir = 'to right';
let bgImage = null;
let customFonts = [];
let showGrid = false;
let zoomLevel = 1;
let history = [];
let historyIndex = -1;
let isDragging = false;
let isResizing = false;
let isRotating = false;
let dragOffsetX = 0, dragOffsetY = 0;
let resizeHandle = '';
let elementIdCounter = 0;
let startAngle = 0;
let initialRotation = 0;
let initialFontSize = 0;
let initialWidth = 0;
let initialHeight = 0;
let startX = 0;
let cropStartX = 0, cropStartY = 0, currentCropX = 0, currentCropY = 0, isCropping = false;
let startY = 0;

// ==================== INIT ====================
window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('mainCanvas');
  ctx = canvas.getContext('2d');
  
  updateBackground();
  render();
  updateOutputSize();
  
  // Export scale change
  document.getElementById('exportScale').addEventListener('change', updateOutputSize);
  
  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);
  
  // Mouse events on canvas
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseUp);
  
  // Touch events
  canvas.addEventListener('touchstart', onTouchStart, {passive: false});
  canvas.addEventListener('touchmove', onTouchMove, {passive: false});
  canvas.addEventListener('touchend', onMouseUp);
  
  // Click outside canvas to deselect
  document.getElementById('canvasArea').addEventListener('mousedown', (e) => {
    if (e.target.id === 'canvasArea' || e.target.id === 'canvasWrapper') {
      deselectAll();
    }
  });
});

// ==================== TOOLS ====================
function setTool(tool) {
  currentTool = tool;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('tool-' + tool);
  if (btn) btn.classList.add('active');
  
  if (tool === 'text') {
    addTextElement();
    setTool('select');
  } else if (tool === 'image') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => loadImageElement(e);
    input.click();
    setTool('select');
  }
}

// ==================== CANVAS ELEMENTS ====================
function createBaseElement(type) {
  return {
    id: ++elementIdCounter,
    type: type,
    x: canvasW / 2 - 100,
    y: canvasH / 2 - 30,
    rotation: 0,
    opacity: 1,
    selected: false,
    lockRatio: true,
    originalAspect: 1,
    visible: true,
    savedOpacity: 1
  };
}

function addTextElement(text = 'Your Text Here') {
  const el = {
    ...createBaseElement('text'),
    text: text,
    fontFamily: 'Inter',
    fontSize: 48,
    fontWeight: '700',
    fontStyle: 'normal',
    textDecoration: 'none',
    textAlign: 'center',
    color: '#ffffff',
    bgColor: '#000000',
    showBg: false,
    shadow: { enabled: false, x: 3, y: 3, blur: 4, color: '#000000' },
    effects: { outline: false, glow: false, neon: false, '3d': false, 'gradient-text': false, stroke: false },
    strokeWidth: 2,
    strokeColor: '#000000',
    glowColor: '#e94560',
    glowSize: 10,
    textGradColor2: '#00d2ff',
    lineHeight: 1.2,
    maxWidth: 0,
    uppercase: false,
    lowercase: false,
    letterSpacing: false,
    letterSpacingValue: 2,
    strikethrough: false,
    width: 200,
    height: 60,
    zIndex: elements.length
  };
  
  elements.push(el);
  saveHistory();
  selectElement(el);
  render();
  updateLayersList();
  return el;
}

function loadImageElement(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      const maxW = canvasW * 0.6;
      const maxH = canvasH * 0.6;
      
      if (w > maxW || h > maxH) {
        const scale = Math.min(maxW / w, maxH / h);
        w *= scale;
        h *= scale;
      }
      
      const el = {
        ...createBaseElement('image'),
        image: img,
        imageSrc: e.target.result,
        width: w,
        height: h,
        radius: 0,
        filters: { brightness: 100, contrast: 100, hue: 0, saturation: 100, blur: 0 },
        zIndex: elements.length
      };
      
      el.x = (canvasW - w) / 2;
      el.y = (canvasH - h) / 2;
      
      elements.push(el);
      saveHistory();
      selectElement(el);
      render();
      updateLayersList();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

// ==================== CROPPING ====================
function openCropModal() {
  if (!selectedElement || selectedElement.type !== 'image') return;
  const modal = document.getElementById('cropModal');
  modal.style.display = 'flex';
  
  const cropCanvas = document.getElementById('cropCanvas');
  const cropCtx = cropCanvas.getContext('2d');
  
  const img = selectedElement.image;
  const maxW = window.innerWidth * 0.8;
  const maxH = window.innerHeight * 0.7;
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  
  if (w > maxW || h > maxH) {
    const scale = Math.min(maxW/w, maxH/h);
    w *= scale;
    h *= scale;
  }
  
  cropCanvas.width = w;
  cropCanvas.height = h;
  cropCanvas.dataset.scale = w / (img.naturalWidth || img.width);
  
  cropCtx.drawImage(img, 0, 0, w, h);
  
  cropStartX = 0; cropStartY = 0; currentCropX = w; currentCropY = h;
  drawCropOverlay();
}

function closeCropModal() {
  document.getElementById('cropModal').style.display = 'none';
}

function drawCropOverlay() {
  const cropCanvas = document.getElementById('cropCanvas');
  const cropCtx = cropCanvas.getContext('2d');
  const img = selectedElement.image;
  const w = cropCanvas.width;
  const h = cropCanvas.height;
  
  cropCtx.clearRect(0, 0, w, h);
  cropCtx.drawImage(img, 0, 0, w, h);
  
  const x = Math.min(cropStartX, currentCropX);
  const y = Math.min(cropStartY, currentCropY);
  const cw = Math.abs(currentCropX - cropStartX);
  const ch = Math.abs(currentCropY - cropStartY);
  
  cropCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  cropCtx.fillRect(0, 0, w, h);
  
  cropCtx.clearRect(x, y, cw, ch);
  cropCtx.drawImage(img, x / (w/(img.naturalWidth||img.width)), y / (h/(img.naturalHeight||img.height)), cw / (w/(img.naturalWidth||img.width)), ch / (h/(img.naturalHeight||img.height)), x, y, cw, ch);
  
  cropCtx.strokeStyle = '#fff';
  cropCtx.lineWidth = 2;
  cropCtx.strokeRect(x, y, cw, ch);
}

function onCropMouseDown(e) {
  const rect = document.getElementById('cropCanvas').getBoundingClientRect();
  cropStartX = e.clientX - rect.left;
  cropStartY = e.clientY - rect.top;
  currentCropX = cropStartX;
  currentCropY = cropStartY;
  isCropping = true;
}

function onCropMouseMove(e) {
  if (!isCropping) return;
  const rect = document.getElementById('cropCanvas').getBoundingClientRect();
  currentCropX = e.clientX - rect.left;
  currentCropY = e.clientY - rect.top;
  drawCropOverlay();
}

function onCropMouseUp() {
  isCropping = false;
}

function applyCrop() {
  if (!selectedElement || selectedElement.type !== 'image') return;
  
  const scale = parseFloat(document.getElementById('cropCanvas').dataset.scale);
  const x = Math.min(cropStartX, currentCropX) / scale;
  const y = Math.min(cropStartY, currentCropY) / scale;
  const cw = Math.abs(currentCropX - cropStartX) / scale;
  const ch = Math.abs(currentCropY - cropStartY) / scale;
  
  if (cw <= 10 || ch <= 10) {
    closeCropModal();
    return;
  }
  
  const offCanvas = document.createElement('canvas');
  offCanvas.width = cw;
  offCanvas.height = ch;
  const offCtx = offCanvas.getContext('2d');
  
  offCtx.drawImage(selectedElement.image, x, y, cw, ch, 0, 0, cw, ch);
  
  const dataUrl = offCanvas.toDataURL('image/png');
  selectedElement.imageSrc = dataUrl;
  
  const newImg = new Image();
  newImg.onload = () => {
    selectedElement.image = newImg;
    selectedElement.width = cw;
    selectedElement.height = ch;
    saveHistory();
    render();
    updatePropertiesPanel();
  };
  newImg.src = dataUrl;
  
  closeCropModal();
}

// ==================== SELECTION ====================
function selectElement(el) {
  deselectAll();
  selectedElement = el;
  el.selected = true;
  updatePropertiesPanel();
  render();
}

function deselectAll() {
  selectedElement = null;
  elements.forEach(e => e.selected = false);
  document.getElementById('textProperties').style.display = 'none';
  document.getElementById('imageProperties').style.display = 'none';
  render();
}

function deleteSelected() {
  if (!selectedElement) return;
  elements = elements.filter(e => e.id !== selectedElement.id);
  selectedElement = null;
  saveHistory();
  render();
  updateLayersList();
  showToast('Element deleted');
}

function duplicateSelected() {
  if (!selectedElement) return;
  const clone = JSON.parse(JSON.stringify(selectedElement));
  clone.id = ++elementIdCounter;
  clone.x += 20;
  clone.y += 20;
  clone.selected = false;
  clone.zIndex = elements.length;
  
  if (clone.type === 'image' && selectedElement.image) {
    clone.image = selectedElement.image;
  }
  
  elements.push(clone);
  saveHistory();
  selectElement(clone);
  render();
  updateLayersList();
  showToast('Element duplicated');
}

function bringForward() {
  if (!selectedElement) return;
  const idx = elements.indexOf(selectedElement);
  if (idx < elements.length - 1) {
    [elements[idx], elements[idx + 1]] = [elements[idx + 1], elements[idx]];
    elements.forEach((e, i) => e.zIndex = i);
    saveHistory();
    render();
    updateLayersList();
  }
}

function sendBackward() {
  if (!selectedElement) return;
  const idx = elements.indexOf(selectedElement);
  if (idx > 0) {
    [elements[idx], elements[idx - 1]] = [elements[idx - 1], elements[idx]];
    elements.forEach((e, i) => e.zIndex = i);
    saveHistory();
    render();
    updateLayersList();
  }
}

// ==================== PROPERTIES PANEL ====================
function updatePropertiesPanel() {
  const el = selectedElement;
  if (!el) return;
  
  if (el.type === 'text') {
    document.getElementById('textProperties').style.display = 'block';
    document.getElementById('imageProperties').style.display = 'none';
    
    document.getElementById('textContent').value = el.text;
    document.getElementById('fontFamily').value = el.fontFamily;
    document.getElementById('fontSize').value = el.fontSize;
    document.getElementById('lineHeight').value = el.lineHeight;
    document.getElementById('textColor').value = el.color;
    document.getElementById('textColorHex').value = el.color;
    document.getElementById('textBgColor').value = el.bgColor;
    document.getElementById('textBgColorHex').value = el.bgColor;
    document.getElementById('textX').value = Math.round(el.x);
    document.getElementById('textY').value = Math.round(el.y);
    document.getElementById('textRotation').value = el.rotation;
    document.getElementById('textRotationVal').value = el.rotation;
    document.getElementById('textOpacity').value = el.opacity;
    document.getElementById('textMaxWidth').value = el.maxWidth || 0;
    document.getElementById('strokeWidth').value = el.strokeWidth;
    document.getElementById('strokeColor').value = el.strokeColor;
    document.getElementById('glowColor').value = el.glowColor;
    document.getElementById('glowSize').value = el.glowSize;
    document.getElementById('textGradColor2').value = el.textGradColor2;
    
    // Shadow
    document.getElementById('shadowX').value = el.shadow.x;
    document.getElementById('shadowY').value = el.shadow.y;
    document.getElementById('shadowBlur').value = el.shadow.blur;
    document.getElementById('shadowColor').value = el.shadow.color;
    
    // Style buttons
    document.querySelectorAll('#textProperties .style-btn-bold').forEach(b => {
      b.classList.toggle('active', el.fontWeight === '900' || el.fontWeight === 'bold');
    });
    document.querySelectorAll('#textProperties .style-btn-italic').forEach(b => {
      b.classList.toggle('active', el.fontStyle === 'italic');
    });
    document.querySelectorAll('#textProperties .style-btn-underline').forEach(b => {
      b.classList.toggle('active', el.textDecoration === 'underline');
    });
    
    // Alignment
    document.querySelectorAll('.align-buttons .style-btn').forEach(b => b.classList.remove('active'));
    
    // Effects
    document.querySelectorAll('.effect-item').forEach(e => {
      const effect = e.dataset.effect;
      e.classList.toggle('active', el.effects[effect]);
    });
    
  } else if (el.type === 'image') {
    document.getElementById('textProperties').style.display = 'none';
    document.getElementById('imageProperties').style.display = 'block';
    
    document.getElementById('imgX').value = Math.round(el.x);
    document.getElementById('imgY').value = Math.round(el.y);
    document.getElementById('imgWidth').value = Math.round(el.width);
    document.getElementById('imgHeight').value = Math.round(el.height);
    document.getElementById('imgRotation').value = el.rotation;
    document.getElementById('imgOpacity').value = el.opacity;
    document.getElementById('imgRadius').value = el.radius || 0;
    document.getElementById('imgLockRatio').checked = el.lockRatio;
    if (el.filters) {
      document.getElementById('imgBrightness').value = el.filters.brightness;
      document.getElementById('imgContrast').value = el.filters.contrast;
      document.getElementById('imgSaturation').value = el.filters.saturation;
      document.getElementById('imgHue').value = el.filters.hue;
      document.getElementById('imgBlur').value = el.filters.blur;
    }
  }
  
  updateLayersList();
}

function updateSelectedText() {
  if (!selectedElement || selectedElement.type !== 'text') return;
  const el = selectedElement;
  
  el.text = document.getElementById('textContent').value;
  el.fontFamily = document.getElementById('fontFamily').value;
  el.fontSize = parseInt(document.getElementById('fontSize').value);
  el.lineHeight = parseFloat(document.getElementById('lineHeight').value);
  el.color = document.getElementById('textColor').value;
  document.getElementById('textColorHex').value = el.color;
  el.bgColor = document.getElementById('textBgColor').value;
  document.getElementById('textBgColorHex').value = el.bgColor;
  el.x = parseInt(document.getElementById('textX').value) || 0;
  el.y = parseInt(document.getElementById('textY').value) || 0;
  el.rotation = parseInt(document.getElementById('textRotation').value);
  document.getElementById('textRotationVal').value = el.rotation;
  el.opacity = parseFloat(document.getElementById('textOpacity').value);
  el.maxWidth = parseInt(document.getElementById('textMaxWidth').value) || 0;
  el.strokeWidth = parseInt(document.getElementById('strokeWidth').value);
  el.strokeColor = document.getElementById('strokeColor').value;
  el.glowColor = document.getElementById('glowColor').value;
  el.glowSize = parseInt(document.getElementById('glowSize').value);
  el.textGradColor2 = document.getElementById('textGradColor2').value;
  
  el.shadow.x = parseInt(document.getElementById('shadowX').value);
  el.shadow.y = parseInt(document.getElementById('shadowY').value);
  el.shadow.blur = parseInt(document.getElementById('shadowBlur').value);
  el.shadow.color = document.getElementById('shadowColor').value;
  
  measureText(el);
  render();
}

function updateSelectedImage() {
  if (!selectedElement || selectedElement.type !== 'image') return;
  const el = selectedElement;
  
  el.x = parseInt(document.getElementById('imgX').value) || 0;
  el.y = parseInt(document.getElementById('imgY').value) || 0;
  
  const lockRatio = document.getElementById('imgLockRatio').checked;
  const newW = parseInt(document.getElementById('imgWidth').value);
  const newH = parseInt(document.getElementById('imgHeight').value);
  
  if (lockRatio && newW) {
    el.width = newW;
    el.height = Math.round(newW / el.originalAspect);
    document.getElementById('imgHeight').value = el.height;
  } else if (lockRatio && newH) {
    el.height = newH;
    el.width = Math.round(newH * el.originalAspect);
    document.getElementById('imgWidth').value = el.width;
  } else {
    el.width = newW;
    el.height = newH;
  }
  
  el.rotation = parseInt(document.getElementById('imgRotation').value);
  el.opacity = parseFloat(document.getElementById('imgOpacity').value);
  el.radius = parseInt(document.getElementById('imgRadius').value);
  
  if (!el.filters) el.filters = { brightness: 100, contrast: 100, hue: 0, saturation: 100, blur: 0 };
  el.filters.brightness = parseInt(document.getElementById('imgBrightness').value);
  el.filters.contrast = parseInt(document.getElementById('imgContrast').value);
  el.filters.saturation = parseInt(document.getElementById('imgSaturation').value);
  el.filters.hue = parseInt(document.getElementById('imgHue').value);
  el.filters.blur = parseInt(document.getElementById('imgBlur').value);
  
  render();
}

// ==================== TEXT STYLES ====================
function toggleStyle(style, btn) {
  if (!selectedElement || selectedElement.type !== 'text') return;
  const el = selectedElement;
  btn.classList.toggle('active');
  
  switch(style) {
    case 'bold':
      el.fontWeight = el.fontWeight === '900' || el.fontWeight === 'bold' ? '700' : '900';
      break;
    case 'italic':
      el.fontStyle = el.fontStyle === 'italic' ? 'normal' : 'italic';
      break;
    case 'underline':
      el.textDecoration = el.textDecoration === 'underline' ? 'none' : 'underline';
      break;
    case 'uppercase':
      el.uppercase = !el.uppercase;
      if (el.uppercase) el.lowercase = false;
      break;
    case 'lowercase':
      el.lowercase = !el.lowercase;
      if (el.lowercase) el.uppercase = false;
      break;
    case 'strikethrough':
      el.strikethrough = !el.strikethrough;
      break;
    case 'letter-spacing':
      el.letterSpacing = !el.letterSpacing;
      break;
  }
  
  measureText(el);
  render();
}

function setTextAlign(align, btn) {
  if (!selectedElement || selectedElement.type !== 'text') return;
  selectedElement.textAlign = align;
  document.querySelectorAll('.align-buttons .style-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  render();
}

function toggleTextShadow() {
  if (!selectedElement || selectedElement.type !== 'text') return;
  selectedElement.shadow.enabled = !selectedElement.shadow.enabled;
  document.getElementById('shadowControls').style.display = selectedElement.shadow.enabled ? 'block' : 'none';
  document.getElementById('shadowToggle').classList.toggle('active', selectedElement.shadow.enabled);
  render();
}

function toggleEffect(effect, btn) {
  if (!selectedElement || selectedElement.type !== 'text') return;
  selectedElement.effects[effect] = !selectedElement.effects[effect];
  btn.classList.toggle('active');
  render();
}

function toggleTextBg() {
  if (!selectedElement || selectedElement.type !== 'text') return;
  selectedElement.showBg = !selectedElement.showBg;
  render();
}

function adjustFontSize(delta) {
  if (!selectedElement || selectedElement.type !== 'text') return;
  selectedElement.fontSize = Math.max(8, Math.min(300, selectedElement.fontSize + delta));
  document.getElementById('fontSize').value = selectedElement.fontSize;
  measureText(selectedElement);
  render();
}

function moveText(dx, dy) {
  if (!selectedElement) return;
  selectedElement.x += dx;
  selectedElement.y += dy;
  updatePropertiesPanel();
  render();
}

function centerText() {
  if (!selectedElement) return;
  selectedElement.x = (canvasW - selectedElement.width) / 2;
  selectedElement.y = (canvasH - selectedElement.height) / 2;
  updatePropertiesPanel();
  render();
}

// ==================== TEXT MEASUREMENT ====================
function measureText(el) {
  const style = getTextStyle(el);
  ctx.font = style;
  
  const lines = getLines(el);
  const lineHeight = el.fontSize * el.lineHeight;
  
  let maxW = 0;
  lines.forEach(line => {
    const m = ctx.measureText(line);
    if (m.width > maxW) maxW = m.width;
  });
  
  el.width = maxW + (el.effects.outline || el.effects.stroke ? el.strokeWidth * 2 : 0);
  el.height = lines.length * lineHeight;
}

function getLines(el) {
  let text = el.text;
  if (el.uppercase) text = text.toUpperCase();
  if (el.lowercase) text = text.toLowerCase();
  return text.split('\n');
}

function getTextStyle(el) {
  let style = `${el.fontStyle} ${el.fontWeight}`;
  style += ` ${el.fontSize}px "${el.fontFamily}"`;
  return style;
}

// ==================== RENDERING ====================
function render() {
  ctx.clearRect(0, 0, canvasW, canvasH);
  
  // Background
  drawBackground();
  
  // Grid
  if (showGrid) drawGrid();
  
  // Elements
  elements.forEach(el => {
    if (el.visible === false) return;
    ctx.save();
    ctx.globalAlpha = el.opacity;
    
    if (el.type === 'text') {
      drawTextElement(el);
    } else if (el.type === 'image') {
      drawImageElement(el);
    }
    
    // Selection handles
    if (el.selected) {
      drawSelectionHandles(el);
    }
    
    ctx.restore();
  });
}

function drawBackground() {
  if (bgType === 'solid') {
    ctx.fillStyle = document.getElementById('bgColor').value;
    ctx.fillRect(0, 0, canvasW, canvasH);
  } else if (bgType === 'gradient') {
    let grad;
    const c1 = document.getElementById('gradColor1').value;
    const c2 = document.getElementById('gradColor2').value;
    const c3 = document.getElementById('gradColor3').value;
    
    if (gradDir === 'radial') {
      grad = ctx.createRadialGradient(canvasW/2, canvasH/2, 0, canvasW/2, canvasH/2, Math.max(canvasW, canvasH)/2);
    } else {
      let x1 = 0, y1 = 0, x2 = canvasW, y2 = canvasH;
      switch(gradDir) {
        case 'to right': x2 = canvasW; y1 = y2 = canvasH/2; break;
        case 'to left': x1 = canvasW; x2 = 0; y1 = y2 = canvasH/2; break;
        case 'to bottom': y2 = canvasH; x1 = x2 = canvasW/2; break;
        case 'to top': y1 = canvasH; y2 = 0; x1 = x2 = canvasW/2; break;
        case 'to bottom right': break;
        case 'to bottom left': x1 = canvasW; x2 = 0; break;
        case 'to top right': y1 = canvasH; y2 = 0; break;
        case 'to top left': x1 = canvasW; x2 = 0; y1 = canvasH; y2 = 0; break;
        case '45deg': x1 = 0; y1 = canvasH; x2 = canvasW; y2 = 0; break;
        case '135deg': x1 = 0; y1 = 0; x2 = canvasW; y2 = canvasH; break;
      }
      grad = ctx.createLinearGradient(x1, y1, x2, y2);
    }
    
    grad.addColorStop(0, c1);
    grad.addColorStop(0.5, c2);
    grad.addColorStop(1, c3);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasW, canvasH);
    
    // Update gradient preview
    document.getElementById('gradientPreview').style.background = 
      gradDir === 'radial' 
        ? `radial-gradient(circle, ${c1}, ${c2}, ${c3})`
        : `linear-gradient(${gradDir}, ${c1}, ${c2}, ${c3})`;
  } else if (bgType === 'image' && bgImage) {
    const fitMode = document.getElementById('bgFitMode').value;
    drawFittedImage(bgImage, fitMode, 0, 0, canvasW, canvasH);
  } else if (bgType === 'image' && !bgImage) {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = '#6c6c8a';
    ctx.font = '24px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('Upload a background image', canvasW/2, canvasH/2);
  }
}

function drawFittedImage(img, mode, x, y, w, h) {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  
  let dx, dy, dw, dh;
  
  switch(mode) {
    case 'cover':
      if (imgRatio > boxRatio) {
        dh = h; dw = h * imgRatio;
      } else {
        dw = w; dh = w / imgRatio;
      }
      dx = x + (w - dw) / 2;
      dy = y + (h - dh) / 2;
      break;
    case 'contain':
      if (imgRatio > boxRatio) {
        dw = w; dh = w / imgRatio;
      } else {
        dh = h; dw = h * imgRatio;
      }
      dx = x + (w - dw) / 2;
      dy = y + (h - dh) / 2;
      break;
    case 'stretch':
      dx = x; dy = y; dw = w; dh = h;
      break;
    case 'center':
      dw = img.width; dh = img.height;
      const scale = Math.min(w / dw, h / dh, 1);
      dw *= scale; dh *= scale;
      dx = x + (w - dw) / 2;
      dy = y + (h - dh) / 2;
      break;
    case 'tile':
      const pat = ctx.createPattern(img, 'repeat');
      ctx.fillStyle = pat;
      ctx.fillRect(x, y, w, h);
      return;
  }
  
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawTextElement(el) {
  const lines = getLines(el);
  const lineHeight = el.fontSize * el.lineHeight;
  const style = getTextStyle(el);
  
  ctx.font = style;
  ctx.textAlign = el.textAlign;
  ctx.textBaseline = 'top';
  
  let renderX = el.x;
  let renderY = el.y;
  
  // Handle text background
  if (el.showBg) {
    const totalH = lines.length * lineHeight;
    let bgX = renderX, bgW = el.width;
    if (el.textAlign === 'center') { bgX = renderX - el.width / 2; }
    else if (el.textAlign === 'right') { bgX = renderX - el.width; }
    
    ctx.fillStyle = el.bgColor;
    ctx.fillRect(bgX, renderY, bgW, totalH);
  }
  
  // Draw each line
  lines.forEach((line, i) => {
    let drawX = renderX;
    const drawY = renderY + i * lineHeight;
    
    // Handle text alignment positioning
    if (el.textAlign === 'center') {
      drawX = renderX + el.width / 2;
    } else if (el.textAlign === 'right') {
      drawX = renderX + el.width;
    }
    
    ctx.save();
    
    // Text shadow
    if (el.shadow.enabled) {
      ctx.shadowColor = el.shadow.color;
      ctx.shadowBlur = el.shadow.blur;
      ctx.shadowOffsetX = el.shadow.x;
      ctx.shadowOffsetY = el.shadow.y;
    }
    
    // Effects
    if (el.effects['3d']) {
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 4;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillText(line, drawX + 4, drawY + 4);
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      ctx.fillText(line, drawX + 2, drawY + 2);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
    
    if (el.effects.glow || el.effects.neon) {
      const glowSize = el.effects.neon ? el.glowSize * 2 : el.glowSize;
      ctx.shadowColor = el.glowColor;
      ctx.shadowBlur = glowSize;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
    
    // Text gradient
    if (el.effects['gradient-text']) {
      const grad = ctx.createLinearGradient(drawX - el.width/2, drawY, drawX + el.width/2, drawY);
      grad.addColorStop(0, el.color);
      grad.addColorStop(1, el.textGradColor2);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = el.color;
    }
    
    // Letter spacing
    if (el.letterSpacing) {
      drawTextWithSpacing(ctx, line, drawX, drawY, el);
    } else {
      ctx.fillText(line, drawX, drawY);
    }
    
    // Underline
    if (el.textDecoration === 'underline') {
      const m = ctx.measureText(line);
      const uw = m.width;
      let ux = drawX;
      if (el.textAlign === 'center') ux = drawX - uw/2;
      else if (el.textAlign === 'right') ux = drawX - uw;
      
      ctx.strokeStyle = el.color;
      ctx.lineWidth = Math.max(1, el.fontSize / 20);
      ctx.beginPath();
      ctx.moveTo(ux, drawY + el.fontSize + 2);
      ctx.lineTo(ux + uw, drawY + el.fontSize + 2);
      ctx.stroke();
    }
    
    // Strikethrough
    if (el.strikethrough) {
      const m = ctx.measureText(line);
      const sw = m.width;
      let sx = drawX;
      if (el.textAlign === 'center') sx = drawX - sw/2;
      else if (el.textAlign === 'right') sx = drawX - sw;
      
      ctx.strokeStyle = el.color;
      ctx.lineWidth = Math.max(1, el.fontSize / 20);
      ctx.beginPath();
      ctx.moveTo(sx, drawY + el.fontSize * 0.5);
      ctx.lineTo(sx + sw, drawY + el.fontSize * 0.5);
      ctx.stroke();
    }
    
    // Outline / Stroke
    if (el.effects.outline || el.effects.stroke) {
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = el.strokeWidth;
      ctx.lineJoin = 'round';
      
      if (el.letterSpacing) {
        drawTextStrokeWithSpacing(ctx, line, drawX, drawY, el);
      } else {
        ctx.strokeText(line, drawX, drawY);
      }
    }
    
    ctx.restore();
  });
}

function drawTextWithSpacing(ctx, text, x, y, el) {
  const spacing = el.letterSpacingValue || 2;
  const chars = text.split('');
  let currentX = x;
  
  if (el.textAlign === 'center') {
    const totalWidth = chars.reduce((sum, c) => sum + ctx.measureText(c).width + spacing, 0) - spacing;
    currentX = x - totalWidth / 2;
  } else if (el.textAlign === 'right') {
    const totalWidth = chars.reduce((sum, c) => sum + ctx.measureText(c).width + spacing, 0) - spacing;
    currentX = x - totalWidth;
  }
  
  chars.forEach(char => {
    ctx.fillText(char, currentX, y);
    currentX += ctx.measureText(char).width + spacing;
  });
}

function drawTextStrokeWithSpacing(ctx, text, x, y, el) {
  const spacing = el.letterSpacingValue || 2;
  const chars = text.split('');
  let currentX = x;
  
  if (el.textAlign === 'center') {
    const totalWidth = chars.reduce((sum, c) => sum + ctx.measureText(c).width + spacing, 0) - spacing;
    currentX = x - totalWidth / 2;
  } else if (el.textAlign === 'right') {
    const totalWidth = chars.reduce((sum, c) => sum + ctx.measureText(c).width + spacing, 0) - spacing;
    currentX = x - totalWidth;
  }
  
  chars.forEach(char => {
    ctx.strokeText(char, currentX, y);
    currentX += ctx.measureText(char).width + spacing;
  });
}

function drawImageElement(el) {
  ctx.save();
  
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  
  ctx.translate(cx, cy);
  ctx.rotate(el.rotation * Math.PI / 180);
  ctx.translate(-cx, -cy);
  
  if (el.radius > 0) {
    ctx.beginPath();
    ctx.roundRect(el.x, el.y, el.width, el.height, el.radius);
    ctx.clip();
  }
  
  if (el.image) {
    if (el.filters) {
      ctx.filter = `brightness(${el.filters.brightness}%) contrast(${el.filters.contrast}%) saturate(${el.filters.saturation}%) hue-rotate(${el.filters.hue}deg) blur(${el.filters.blur}px)`;
    }
    ctx.drawImage(el.image, el.x, el.y, el.width, el.height);
    ctx.filter = 'none';
  }
  
  ctx.restore();
}

function drawSelectionHandles(el) {
  ctx.save();
  ctx.strokeStyle = '#ff477e';
  ctx.lineWidth = 2;
  
  let x = el.x, y = el.y, w = el.width, h = el.height;
  
  if (el.rotation !== 0) {
    const cx = el.x + el.width/2;
    const cy = el.y + el.height/2;
    ctx.translate(cx, cy);
    ctx.rotate(el.rotation * Math.PI / 180);
    ctx.translate(-cx, -cy);
  }
  
  ctx.strokeRect(x, y, w, h);
  
  // Resize handles
  const handles = [
    [x, y], [x + w, y], [x, y + h], [x + w, y + h]
  ];
  
  handles.forEach(([hx, hy]) => {
    ctx.fillStyle = '#ff477e';
    ctx.beginPath();
    ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  
  // Rotation handle
  const rotX = x + w/2;
  const rotY = y - 30;
  ctx.beginPath();
  ctx.moveTo(rotX, y);
  ctx.lineTo(rotX, rotY);
  ctx.strokeStyle = '#ff477e';
  ctx.stroke();
  
  ctx.fillStyle = '#ff477e';
  ctx.beginPath();
  ctx.arc(rotX, rotY, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.stroke();
  
  ctx.restore();
}

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  
  const gridSize = 50;
  for (let x = 0; x <= canvasW; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasH);
    ctx.stroke();
  }
  for (let y = 0; y <= canvasH; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasW, y);
    ctx.stroke();
  }
  
  // Center guides
  ctx.strokeStyle = 'rgba(233,69,96,0.3)';
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(canvasW/2, 0);
  ctx.lineTo(canvasW/2, canvasH);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, canvasH/2);
  ctx.lineTo(canvasW, canvasH/2);
  ctx.stroke();
  ctx.setLineDash([]);
  
  ctx.restore();
}

// ==================== MOUSE EVENTS ====================
function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvasW / rect.width;
  const scaleY = canvasH / rect.height;
  
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

function rotatePoint(px, py, cx, cy, angleDeg) {
  const angleRad = angleDeg * Math.PI / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos
  };
}

function hitTestHandles(mx, my, el) {
  if (!el || !el.selected) return null;
  
  const cx = el.x + el.width/2;
  const cy = el.y + el.height/2;
  const pt = rotatePoint(mx, my, cx, cy, -el.rotation);
  
  const x = el.x, y = el.y, w = el.width, h = el.height;
  const handleSize = 8;
  
  const rotX = x + w/2;
  const rotY = y - 30;
  if (Math.abs(pt.x - rotX) <= handleSize && Math.abs(pt.y - rotY) <= handleSize) return 'rotate';
  
  if (Math.abs(pt.x - x) <= handleSize && Math.abs(pt.y - y) <= handleSize) return 'tl';
  if (Math.abs(pt.x - (x+w)) <= handleSize && Math.abs(pt.y - y) <= handleSize) return 'tr';
  if (Math.abs(pt.x - x) <= handleSize && Math.abs(pt.y - (y+h)) <= handleSize) return 'bl';
  if (Math.abs(pt.x - (x+w)) <= handleSize && Math.abs(pt.y - (y+h)) <= handleSize) return 'br';
  
  return null;
}

function hitTest(mx, my) {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.visible === false) continue;
    
    const cx = el.x + el.width/2;
    const cy = el.y + el.height/2;
    const pt = rotatePoint(mx, my, cx, cy, -el.rotation);
    
    const padding = el.type === 'text' ? 10 : 0;
    
    if (pt.x >= el.x - padding && pt.x <= el.x + el.width + padding &&
        pt.y >= el.y - padding && pt.y <= el.y + el.height + padding) {
      return el;
    }
  }
  return null;
}

function onMouseDown(e) {
  const {x, y} = getCanvasCoords(e);
  
  if (selectedElement) {
    const handle = hitTestHandles(x, y, selectedElement);
    if (handle) {
      if (handle === 'rotate') {
        isRotating = true;
        const cx = selectedElement.x + selectedElement.width/2;
        const cy = selectedElement.y + selectedElement.height/2;
        startAngle = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
        initialRotation = selectedElement.rotation;
      } else {
        isResizing = true;
        resizeHandle = handle;
        initialFontSize = selectedElement.fontSize;
        initialWidth = selectedElement.width;
        initialHeight = selectedElement.height;
        startX = x;
        startY = y;
      }
      return;
    }
  }
  
  const hit = hitTest(x, y);
  
  if (hit) {
    selectElement(hit);
    isDragging = true;
    dragOffsetX = x - hit.x;
    dragOffsetY = y - hit.y;
  } else {
    deselectAll();
  }
}

function onMouseMove(e) {
  if (!isDragging && !isResizing && !isRotating) return;
  if (!selectedElement) return;
  e.preventDefault();
  
  const {x, y} = getCanvasCoords(e);
  
  if (isRotating) {
    const cx = selectedElement.x + selectedElement.width/2;
    const cy = selectedElement.y + selectedElement.height/2;
    const currentAngle = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
    let newRotation = initialRotation + (currentAngle - startAngle);
    selectedElement.rotation = Math.round(newRotation);
    updatePropertiesPanel();
    render();
    return;
  }
  
  if (isResizing) {
    const cx = selectedElement.x + selectedElement.width/2;
    const cy = selectedElement.y + selectedElement.height/2;
    const startDist = Math.hypot(startX - cx, startY - cy);
    const currentDist = Math.hypot(x - cx, y - cy);
    const scale = currentDist / startDist;
    
    if (selectedElement.type === 'text') {
      let newSize = Math.round(initialFontSize * scale);
      selectedElement.fontSize = Math.max(8, Math.min(300, newSize));
      measureText(selectedElement);
      selectedElement.x = cx - selectedElement.width/2;
      selectedElement.y = cy - selectedElement.height/2;
    } else if (selectedElement.type === 'image') {
      let newW = Math.round(initialWidth * scale);
      let newH = Math.round(initialHeight * scale);
      selectedElement.width = Math.max(10, newW);
      selectedElement.height = Math.max(10, newH);
      selectedElement.x = cx - selectedElement.width/2;
      selectedElement.y = cy - selectedElement.height/2;
    }
    updatePropertiesPanel();
    render();
    return;
  }
  
  if (isDragging) {
    selectedElement.x = x - dragOffsetX;
    selectedElement.y = y - dragOffsetY;
    updatePropertiesPanel();
    render();
  }
}

function onMouseUp(e) {
  if ((isDragging || isResizing || isRotating) && selectedElement) {
    saveHistory();
  }
  isDragging = false;
  isResizing = false;
  isRotating = false;
}

function onTouchStart(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent('mousedown', {
    clientX: touch.clientX,
    clientY: touch.clientY
  });
  onMouseDown(mouseEvent);
}

function onTouchMove(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent('mousemove', {
    clientX: touch.clientX,
    clientY: touch.clientY
  });
  onMouseMove(mouseEvent);
}

// ==================== BACKGROUND ====================
function setBgType(type) {
  bgType = type;
  document.getElementById('bg-solid-options').style.display = type === 'solid' ? 'block' : 'none';
  document.getElementById('bg-gradient-options').style.display = type === 'gradient' ? 'block' : 'none';
  document.getElementById('bg-image-options').style.display = type === 'image' ? 'block' : 'none';
  
  document.getElementById('bg-solid').classList.toggle('active', type === 'solid');
  document.getElementById('bg-gradient').classList.toggle('active', type === 'gradient');
  document.getElementById('bg-image').classList.toggle('active', type === 'image');
  
  render();
}

function updateBackground() {
  render();
}

function setBgColor(color) {
  document.getElementById('bgColor').value = color;
  document.getElementById('bgColorHex').value = color;
  render();
}

function updateBgFromHex() {
  const hex = document.getElementById('bgColorHex').value;
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    document.getElementById('bgColor').value = hex;
    render();
  }
}

function setGradDir(dir, btn) {
  gradDir = dir;
  document.querySelectorAll('.dir-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  render();
}

function setGradientTemplate(c1, c2, c3, dir) {
  document.getElementById('gradColor1').value = c1;
  document.getElementById('gradColor2').value = c2;
  document.getElementById('gradColor3').value = c3;
  setGradDir(dir);
}

function loadBgImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      bgImage = img;
      render();
      showToast('Background image loaded');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ==================== SIZE ====================
function setSize(w, h, name, btn) {
  canvasW = w;
  canvasH = h;
  document.getElementById('canvasWidth').value = w;
  document.getElementById('canvasHeight').value = h;
  
  // Update preset buttons in sidebar
  document.querySelectorAll('.panel-content .size-preset').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  
  canvas.width = canvasW;
  canvas.height = canvasH;
  
  // Reposition elements to fit
  elements.forEach(el => {
    el.x = Math.min(el.x, canvasW - 50);
    el.y = Math.min(el.y, canvasH - 50);
  });
  
  updateOutputSize();
  fitCanvasToView();
  render();
  showToast(`Canvas size: ${w} × ${h} (${name})`);
}

function resizeCanvas() {
  canvasW = parseInt(document.getElementById('canvasWidth').value) || 1280;
  canvasH = parseInt(document.getElementById('canvasHeight').value) || 720;
  canvas.width = canvasW;
  canvas.height = canvasH;
  updateOutputSize();
  fitCanvasToView();
  render();
}

// ==================== COVER / BANNER MODAL ====================
function openCoverBannerModal() {
  document.getElementById('coverBannerModal').classList.add('active');
}

function closeCoverBannerModal() {
  document.getElementById('coverBannerModal').classList.remove('active');
}

function setCoverSize(width, height, name, btn) {
  // Highlight selection
  document.querySelectorAll('#coverBannerModal .size-preset').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  
  // Apply size
  setSize(width, height, name, null);
  
  // Close modal
  closeCoverBannerModal();
}

function setCustomCoverSize() {
  const width = parseInt(document.getElementById('customCoverWidth').value);
  const height = parseInt(document.getElementById('customCoverHeight').value);
  
  if (width && height) {
    setCoverSize(width, height, 'Custom Size', null);
  } else {
    showToast('Please enter valid dimensions', 'error');
  }
}

// ==================== CUSTOM FONTS ====================
function addCustomFont() {
  const name = document.getElementById('customFontName').value.trim();
  if (!name) {
    showToast('Please enter a font name');
    return;
  }
  
  if (customFonts.includes(name)) {
    showToast('Font already added');
    return;
  }
  
  customFonts.push(name);
  
  // Add to select
  const select = document.getElementById('fontFamily');
  let optgroup = select.querySelector('optgroup[label="Custom Fonts"]');
  if (!optgroup) {
    optgroup = document.createElement('optgroup');
    optgroup.label = 'Custom Fonts';
    select.appendChild(optgroup);
  }
  
  const option = document.createElement('option');
  option.value = name;
  option.textContent = name;
  optgroup.appendChild(option);
  
  document.getElementById('customFontName').value = '';
  updateCustomFontList();
  showToast(`Font "${name}" added`);
}

function removeCustomFont(name) {
  customFonts = customFonts.filter(f => f !== name);
  const option = document.querySelector(`#fontFamily option[value="${name}"]`);
  if (option) option.remove();
  updateCustomFontList();
  showToast(`Font "${name}" removed`);
}

function updateCustomFontList() {
  const list = document.getElementById('customFontList');
  list.innerHTML = customFonts.map(f => `
    <div class="custom-font-item" style="display:flex; justify-content:space-between; padding:4px 8px; background:var(--bg-primary); border-radius:4px; margin-bottom:2px; font-size:12px;">
      <span style="font-family:'${f}'">${f}</span>
      <button class="layer-action-btn" onclick="removeCustomFont('${f}')">✕</button>
    </div>
  `).join('');
}

// ==================== LAYERS ====================
function updateLayersList() {
  const list = document.getElementById('layersList');
  if (elements.length === 0) {
    list.innerHTML = '<div class="empty-state" style="text-align:center; padding:20px; color:var(--text-muted);"><div style="font-size:30px;">📑</div>No layers yet.</div>';
    return;
  }
  
  list.innerHTML = elements.slice().reverse().map(el => `
    <div class="layer-item ${el.selected ? 'active' : ''}" onclick="selectElementById(${el.id})">
      <span class="layer-icon">${el.type === 'text' ? 'T' : '🖼️'}</span>
      <span class="layer-name">${el.type === 'text' ? el.text.substring(0, 20) : 'Image'}</span>
      <div class="layer-actions">
        <button class="layer-action-btn" onclick="event.stopPropagation();toggleLayerVisibility(${el.id})" title="Toggle visibility">
          ${el.visible !== false ? '👁️' : '🚫'}
        </button>
        <button class="layer-action-btn" onclick="event.stopPropagation();deleteElementById(${el.id})" title="Delete">🗑️</button>
      </div>
    </div>
  `).join('');
}

function selectElementById(id) {
  const el = elements.find(e => e.id === id);
  if (el) selectElement(el);
}

function toggleLayerVisibility(id) {
  const el = elements.find(e => e.id === id);
  if (el) {
    el.visible = el.visible === false ? true : false;
    el.opacity = el.visible === false ? 0 : (el.savedOpacity || 1);
    if (el.visible !== false) el.savedOpacity = el.opacity;
    render();
    updateLayersList();
  }
}

function deleteElementById(id) {
  elements = elements.filter(e => e.id !== id);
  if (selectedElement && selectedElement.id === id) selectedElement = null;
  saveHistory();
  render();
  updateLayersList();
}

// ==================== ZOOM ====================
function fitCanvasToView() {
  const area = document.getElementById('canvasArea');
  const maxW = area.clientWidth - 40;
  const maxH = area.clientHeight - 40;
  
  const scaleW = maxW / canvasW;
  const scaleH = maxH / canvasH;
  zoomLevel = Math.min(scaleW, scaleH, 1);
  
  applyZoom();
}

function applyZoom() {
  const wrapper = document.getElementById('canvasWrapper');
  wrapper.style.transform = `scale(${zoomLevel})`;
  wrapper.style.transformOrigin = 'center center';
}

function zoomIn() {
  zoomLevel = Math.min(zoomLevel + 0.1, 3);
  applyZoom();
}

function zoomOut() {
  zoomLevel = Math.max(zoomLevel - 0.1, 0.1);
  applyZoom();
}

function zoomReset() {
  fitCanvasToView();
}

function toggleGrid() {
  showGrid = !showGrid;
  render();
  showToast(showGrid ? 'Grid enabled' : 'Grid disabled');
}

// ==================== HISTORY ====================
function saveHistory() {
  if (historyIndex < history.length - 1) {
    history = history.slice(0, historyIndex + 1);
  }
  
  const state = elements.map(el => {
    const clone = {...el};
    if (clone.image) clone.image = null;
    return clone;
  });
  
  history.push(JSON.stringify(state));
  if (history.length > 50) history.shift();
  historyIndex = history.length - 1;
}

function undoAction() {
  if (historyIndex > 0) {
    historyIndex--;
    restoreState(history[historyIndex]);
    showToast('Undo');
  }
}

function redoAction() {
  if (historyIndex < history.length - 1) {
    historyIndex++;
    restoreState(history[historyIndex]);
    showToast('Redo');
  }
}

function restoreState(json) {
  const state = JSON.parse(json);
  state.forEach(saved => {
    const current = elements.find(e => e.id === saved.id);
    if (current && current.image) {
      saved.image = current.image;
    }
  });
  elements = state;
  selectedElement = null;
  render();
  updateLayersList();
}

// ==================== EXPORT ====================
function exportHD() {
  exportThumbnail(2);
}

function exportStandard() {
  const scale = parseInt(document.getElementById('exportScale').value);
  exportThumbnail(scale);
}

function exportThumbnail(scale) {
  const format = document.getElementById('exportFormat').value;
  const quality = parseInt(document.getElementById('exportQuality').value) / 100;
  
  // Show progress
  const progress = document.getElementById('exportProgress');
  const progressBar = document.getElementById('exportProgressBar');
  progress.classList.add('active');
  progressBar.style.width = '30%';
  
  // Create offscreen canvas at desired scale
  const offCanvas = document.createElement('canvas');
  offCanvas.width = canvasW * scale;
  offCanvas.height = canvasH * scale;
  const offCtx = offCanvas.getContext('2d');
  offCtx.scale(scale, scale);
  
  // Draw background
  drawBackgroundOnCtx(offCtx);
  
  // Draw elements
  elements.forEach(el => {
    if (el.visible === false) return;
    offCtx.save();
    offCtx.globalAlpha = el.opacity;
    
    if (el.type === 'text') {
      drawTextOnCtx(offCtx, el);
    } else if (el.type === 'image') {
      drawImageOnCtx(offCtx, el);
    }
    
    offCtx.restore();
  });
  
  progressBar.style.width = '70%';
  
  // Export
  setTimeout(() => {
    let mimeType = 'image/png';
    let ext = 'png';
    if (format === 'jpeg') { mimeType = 'image/jpeg'; ext = 'jpg'; }
    else if (format === 'webp') { mimeType = 'image/webp'; ext = 'webp'; }
    
    const dataUrl = offCanvas.toDataURL(mimeType, quality);
    const link = document.createElement('a');
    link.download = `thumbnail_${canvasW}x${canvasH}_${scale}x.${ext}`;
    link.href = dataUrl;
    link.click();
    
    progressBar.style.width = '100%';
    setTimeout(() => {
      progress.classList.remove('active');
      progressBar.style.width = '0%';
    }, 500);
    
    const size = (dataUrl.length * 0.75 / 1024 / 1024).toFixed(2);
    showToast(`✅ Saved! ${offCanvas.width}×${offCanvas.height} (${size} MB)`);
  }, 200);
}

function drawBackgroundOnCtx(c) {
  if (bgType === 'solid') {
    c.fillStyle = document.getElementById('bgColor').value;
    c.fillRect(0, 0, canvasW, canvasH);
  } else if (bgType === 'gradient') {
    let grad;
    const c1 = document.getElementById('gradColor1').value;
    const c2 = document.getElementById('gradColor2').value;
    const c3 = document.getElementById('gradColor3').value;
    
    if (gradDir === 'radial') {
      grad = c.createRadialGradient(canvasW/2, canvasH/2, 0, canvasW/2, canvasH/2, Math.max(canvasW, canvasH)/2);
    } else {
      let x1 = 0, y1 = 0, x2 = canvasW, y2 = canvasH;
      switch(gradDir) {
        case 'to right': x2 = canvasW; y1 = y2 = canvasH/2; break;
        case 'to left': x1 = canvasW; x2 = 0; y1 = y2 = canvasH/2; break;
        case 'to bottom': y2 = canvasH; x1 = x2 = canvasW/2; break;
        case 'to top': y1 = canvasH; y2 = 0; x1 = x2 = canvasW/2; break;
        case 'to bottom right': break;
        case 'to bottom left': x1 = canvasW; x2 = 0; break;
        case 'to top right': y1 = canvasH; y2 = 0; break;
        case 'to top left': x1 = canvasW; x2 = 0; y1 = canvasH; y2 = 0; break;
        case '45deg': x1 = 0; y1 = canvasH; x2 = canvasW; y2 = 0; break;
        case '135deg': x1 = 0; y1 = 0; x2 = canvasW; y2 = canvasH; break;
      }
      grad = c.createLinearGradient(x1, y1, x2, y2);
    }
    
    grad.addColorStop(0, c1);
    grad.addColorStop(0.5, c2);
    grad.addColorStop(1, c3);
    c.fillStyle = grad;
    c.fillRect(0, 0, canvasW, canvasH);
  } else if (bgType === 'image' && bgImage) {
    const fitMode = document.getElementById('bgFitMode').value;
    drawFittedImageCtx(c, bgImage, fitMode, 0, 0, canvasW, canvasH);
  } else {
    c.fillStyle = '#1a1a2e';
    c.fillRect(0, 0, canvasW, canvasH);
  }
}

function drawFittedImageCtx(c, img, mode, x, y, w, h) {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let dx, dy, dw, dh;
  
  switch(mode) {
    case 'cover':
      if (imgRatio > boxRatio) { dh = h; dw = h * imgRatio; } else { dw = w; dh = w / imgRatio; }
      dx = x + (w - dw) / 2; dy = y + (h - dh) / 2;
      break;
    case 'contain':
      if (imgRatio > boxRatio) { dw = w; dh = w / imgRatio; } else { dh = h; dw = h * imgRatio; }
      dx = x + (w - dw) / 2; dy = y + (h - dh) / 2;
      break;
    case 'stretch': dx = x; dy = y; dw = w; dh = h; break;
    case 'center':
      dw = img.width; dh = img.height;
      const sc = Math.min(w / dw, h / dh, 1);
      dw *= sc; dh *= sc;
      dx = x + (w - dw) / 2; dy = y + (h - dh) / 2;
      break;
    case 'tile':
      const pat = c.createPattern(img, 'repeat');
      c.fillStyle = pat;
      c.fillRect(x, y, w, h);
      return;
  }
  c.drawImage(img, dx, dy, dw, dh);
}

function drawTextOnCtx(c, el) {
  const lines = getLines(el);
  const lineHeight = el.fontSize * el.lineHeight;
  const style = getTextStyle(el);
  
  c.font = style;
  c.textAlign = el.textAlign;
  c.textBaseline = 'top';
  
  let renderX = el.x, renderY = el.y;
  
  if (el.showBg) {
    const totalH = lines.length * lineHeight;
    let bgX = renderX, bgW = el.width;
    if (el.textAlign === 'center') { bgX = renderX - el.width / 2; }
    else if (el.textAlign === 'right') { bgX = renderX - el.width; }
    c.fillStyle = el.bgColor;
    c.fillRect(bgX, renderY, bgW, totalH);
  }
  
  lines.forEach((line, i) => {
    let drawX = renderX;
    const drawY = renderY + i * lineHeight;
    
    if (el.textAlign === 'center') drawX = renderX + el.width / 2;
    else if (el.textAlign === 'right') drawX = renderX + el.width;
    
    c.save();
    
    if (el.shadow.enabled) {
      c.shadowColor = el.shadow.color;
      c.shadowBlur = el.shadow.blur;
      c.shadowOffsetX = el.shadow.x;
      c.shadowOffsetY = el.shadow.y;
    }
    
    if (el.effects['3d']) {
      c.shadowColor = 'rgba(0,0,0,0.5)';
      c.shadowBlur = 0;
      c.shadowOffsetX = 4;
      c.shadowOffsetY = 4;
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.fillText(line, drawX + 4, drawY + 4);
      c.shadowOffsetX = 2; c.shadowOffsetY = 2;
      c.fillText(line, drawX + 2, drawY + 2);
      c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0;
    }
    
    if (el.effects.glow || el.effects.neon) {
      const glowSize = el.effects.neon ? el.glowSize * 2 : el.glowSize;
      c.shadowColor = el.glowColor;
      c.shadowBlur = glowSize;
      c.shadowOffsetX = 0; c.shadowOffsetY = 0;
    }
    
    if (el.effects['gradient-text']) {
      const grad = c.createLinearGradient(drawX - el.width/2, drawY, drawX + el.width/2, drawY);
      grad.addColorStop(0, el.color);
      grad.addColorStop(1, el.textGradColor2);
      c.fillStyle = grad;
    } else {
      c.fillStyle = el.color;
    }
    
    if (el.letterSpacing) {
      drawTextWithSpacingCtx(c, line, drawX, drawY, el);
    } else {
      c.fillText(line, drawX, drawY);
    }
    
    if (el.textDecoration === 'underline') {
      const m = c.measureText(line);
      const uw = m.width;
      let ux = drawX;
      if (el.textAlign === 'center') ux = drawX - uw/2;
      else if (el.textAlign === 'right') ux = drawX - uw;
      c.strokeStyle = el.color;
      c.lineWidth = Math.max(1, el.fontSize / 20);
      c.beginPath();
      c.moveTo(ux, drawY + el.fontSize + 2);
      c.lineTo(ux + uw, drawY + el.fontSize + 2);
      c.stroke();
    }
    
    if (el.strikethrough) {
      const m = c.measureText(line);
      const sw = m.width;
      let sx = drawX;
      if (el.textAlign === 'center') sx = drawX - sw/2;
      else if (el.textAlign === 'right') sx = drawX - sw;
      c.strokeStyle = el.color;
      c.lineWidth = Math.max(1, el.fontSize / 20);
      c.beginPath();
      c.moveTo(sx, drawY + el.fontSize * 0.5);
      c.lineTo(sx + sw, drawY + el.fontSize * 0.5);
      c.stroke();
    }
    
    if (el.effects.outline || el.effects.stroke) {
      c.shadowBlur = 0; c.shadowOffsetX = 0; c.shadowOffsetY = 0;
      c.strokeStyle = el.strokeColor;
      c.lineWidth = el.strokeWidth;
      c.lineJoin = 'round';
      if (el.letterSpacing) {
        drawTextStrokeWithSpacingCtx(c, line, drawX, drawY, el);
      } else {
        c.strokeText(line, drawX, drawY);
      }
    }
    
    c.restore();
  });
}

function drawTextWithSpacingCtx(c, text, x, y, el) {
  const spacing = el.letterSpacingValue || 2;
  const chars = text.split('');
  let currentX = x;
  if (el.textAlign === 'center') {
    const tw = chars.reduce((s, ch) => s + c.measureText(ch).width + spacing, 0) - spacing;
    currentX = x - tw / 2;
  } else if (el.textAlign === 'right') {
    const tw = chars.reduce((s, ch) => s + c.measureText(ch).width + spacing, 0) - spacing;
    currentX = x - tw;
  }
  chars.forEach(ch => { c.fillText(ch, currentX, y); currentX += c.measureText(ch).width + spacing; });
}

function drawTextStrokeWithSpacingCtx(c, text, x, y, el) {
  const spacing = el.letterSpacingValue || 2;
  const chars = text.split('');
  let currentX = x;
  if (el.textAlign === 'center') {
    const tw = chars.reduce((s, ch) => s + c.measureText(ch).width + spacing, 0) - spacing;
    currentX = x - tw / 2;
  } else if (el.textAlign === 'right') {
    const tw = chars.reduce((s, ch) => s + c.measureText(ch).width + spacing, 0) - spacing;
    currentX = x - tw;
  }
  chars.forEach(ch => { c.strokeText(ch, currentX, y); currentX += c.measureText(ch).width + spacing; });
}

function drawImageOnCtx(c, el) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  
  c.translate(cx, cy);
  c.rotate(el.rotation * Math.PI / 180);
  c.translate(-cx, -cy);
  
  if (el.radius > 0) {
    c.beginPath();
    c.roundRect(el.x, el.y, el.width, el.height, el.radius);
    c.clip();
  }
  
  if (el.image) {
    if (el.filters) {
      c.filter = `brightness(${el.filters.brightness}%) contrast(${el.filters.contrast}%) saturate(${el.filters.saturation}%) hue-rotate(${el.filters.hue}deg) blur(${el.filters.blur}px)`;
    }
    c.drawImage(el.image, el.x, el.y, el.width, el.height);
    c.filter = 'none';
  }
}

// ==================== KEYBOARD ====================
function handleKeyboard(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedElement) {
      deleteSelected();
      e.preventDefault();
    }
  }
  
  if (e.key === 'Escape') {
    deselectAll();
    closeCoverBannerModal();
  }
  
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z') { e.preventDefault(); undoAction(); }
    if (e.key === 'y') { e.preventDefault(); redoAction(); }
    if (e.key === 'd') { e.preventDefault(); duplicateSelected(); }
    if (e.key === 's') { e.preventDefault(); exportHD(); }
  }
  
  if (selectedElement && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowUp') moveText(0, -step);
    if (e.key === 'ArrowDown') moveText(0, step);
    if (e.key === 'ArrowLeft') moveText(-step, 0);
    if (e.key === 'ArrowRight') moveText(step, 0);
  }
}

// ==================== UTILITIES ====================
function clearCanvas() {
  if (elements.length === 0) return;
  if (confirm('Clear all elements? This cannot be undone.')) {
    elements = [];
    selectedElement = null;
    saveHistory();
    render();
    updateLayersList();
    showToast('Canvas cleared');
  }
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show ' + type;
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function togglePanel(section) {
  if (typeof section === 'string') {
    section = document.getElementById(section);
  }
  section.classList.toggle('collapsed');
}

function updateOutputSize() {
  const scale = parseInt(document.getElementById('exportScale').value);
  const w = canvasW * scale;
  const h = canvasH * scale;
  document.getElementById('outputSize').textContent = `${w} × ${h}`;
}

// ==================== WINDOW RESIZE ====================
window.addEventListener('resize', () => {
  fitCanvasToView();
});

// ==================== EVENT LISTENERS ====================
// Close modal when clicking outside
document.getElementById('coverBannerModal')?.addEventListener('click', function(e) {
  if (e.target === this) {
    closeCoverBannerModal();
  }
});

// Initial setup
window.addEventListener('load', () => {
  setTimeout(() => {
    fitCanvasToView();
    saveHistory();
    updateLayersList();
    showToast('🎨 Welcome! Click "T" to add text or "🖼️" to add images.');
  }, 100);
});