import JSZip from 'jszip';

// Helper to wait for an image to load cleanly
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    // Do NOT set crossOrigin on data: or blob: URIs as browsers reject them
    const isDataOrBlob = src.startsWith('data:') || src.startsWith('blob:');
    if (!isDataOrBlob) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => resolve(img);
    img.onerror = () => {
      // If crossOrigin anonymous failed on an HTTP/HTTPS URL, retry without crossOrigin
      if (img.crossOrigin && !isDataOrBlob) {
        const retryImg = new Image();
        retryImg.onload = () => resolve(retryImg);
        retryImg.onerror = (err) => reject(err);
        retryImg.src = src;
      } else {
        reject(new Error(`Failed to load image resource`));
      }
    };
    img.src = src;
  });
}

// Custom wrapped text drawer with layout support
function wrapAndDrawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  isRtl: boolean
): number {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine ? currentLine + ' ' + words[i] : words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  let currentY = y;
  lines.forEach((line) => {
    ctx.fillText(line, x, currentY);
    currentY += lineHeight;
  });

  return lines.length * lineHeight;
}

// Generate a pristine combined canvas with image, panels, borders, dialogue balloon and narrative caption
export async function drawPanelToCanvas(
  panel: { imageUrl?: string; caption?: string; dialogue?: string; mood?: string },
  title: string,
  index: number,
  total: number,
  lang: string
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 1050; // Dynamic height for comic card: 60px header + 800px image + 190px caption/footer

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  const isRtl = lang === 'he';

  // 1. Draw solid background
  ctx.fillStyle = '#fdfcf7'; // Friendly warm canvas paper background
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Main outer comic heavy outline border
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#000000';
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

  // 3. Draw story header bar
  ctx.fillStyle = '#000000';
  ctx.fillRect(8, 8, canvas.width - 16, 65);

  // Header Title
  ctx.fillStyle = '#FFB800'; // Splash of friendly color
  ctx.font = isRtl 
    ? '900 24px "Rubik", "Heebo", "Secular One", Arial' 
    : '900 24px "Outfit", "Bangers", Arial';
  ctx.textAlign = isRtl ? 'right' : 'left';
  ctx.textBaseline = 'middle';
  ctx.direction = isRtl ? 'rtl' : 'ltr';

  const titleX = isRtl ? canvas.width - 40 : 40;
  ctx.fillText(title, titleX, 40);

  // Header Panel Index Tracker
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18pt "Outfit", Arial';
  ctx.textAlign = isRtl ? 'left' : 'right';
  const trackerText = isRtl 
    ? `פאנל ${index} מתוך ${total}` 
    : `Panel ${index} of ${total}`;
  const trackerX = isRtl ? 40 : canvas.width - 40;
  ctx.fillText(trackerText, trackerX, 40);

  // 4. Render main square illustration
  if (panel.imageUrl) {
    try {
      const img = await loadImage(panel.imageUrl);
      // Center the image in our target visual area
      // Target area: size 784x784, starting position x=8, y=73
      ctx.drawImage(img, 8, 73, 784, 784);
    } catch (err) {
      console.log('Rendering fallback illustration frame for panel canvas export');
      ctx.fillStyle = '#f1f1f1';
      ctx.fillRect(8, 73, 784, 784);
      // Paint broken picture icon placeholder
      ctx.fillStyle = '#999999';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('[Image Loading... Check Connection]', 400, 465);
    }
  } else {
    ctx.fillStyle = '#e5e5e5';
    ctx.fillRect(8, 73, 784, 784);
  }

  // Draw separator line below image
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#000000';
  ctx.beginPath();
  ctx.moveTo(8, 857);
  ctx.lineTo(792, 857);
  ctx.stroke();

  // 5. Draw Speech Bubble Balloon (if dialogue exists)
  if (panel.dialogue) {
    const cx = 400;
    const cy = 160;
    const rx = 240;
    const ry = 55;

    // Speech balloon ellipse
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#ffffff';
    
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Tail pointing down slightly
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy + ry - 2);
    ctx.lineTo(cx - 35, cy + ry + 30);
    ctx.lineTo(cx + 15, cy + ry - 2);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx - 20, cy + ry - 2);
    ctx.lineTo(cx - 35, cy + ry + 30);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + 15, cy + ry - 2);
    ctx.lineTo(cx - 35, cy + ry + 30);
    ctx.stroke();

    // Redraw inner fill line to merge tail cleanly
    ctx.beginPath();
    ctx.moveTo(cx - 19, cy + ry - 6);
    ctx.lineTo(cx + 14, cy + ry - 6);
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Write speech bubble text
    ctx.fillStyle = '#000000';
    ctx.font = isRtl 
      ? 'bold 20px "Rubik", "Heebo", sans-serif'
      : 'italic bold 20px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = isRtl ? 'rtl' : 'ltr';

    // Dialogue layout line wrap
    wrapAndDrawText(ctx, `"${panel.dialogue}"`, cx, cy - 8, rx * 1.7, 26, isRtl);
  }

  // 6. Draw Comic Storyteller Caption Block at the bottom
  const captionBoxY = 861;
  const captionBoxHeight = 181;
  
  // Fill Caption box with comic parchment style
  ctx.fillStyle = '#fffdf3';
  ctx.fillRect(8, captionBoxY, 784, captionBoxHeight);

  // Write Story captions
  if (panel.caption) {
    ctx.fillStyle = '#111111';
    ctx.font = isRtl 
      ? '500 21px "Rubik", "Heebo", "Varela Round", sans-serif' 
      : '500 20px "Outfit", "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.direction = isRtl ? 'rtl' : 'ltr';

    const textPaddingX = 50;
    const availableWidth = canvas.width - (textPaddingX * 2);
    const textYOffset = captionBoxY + 30;

    wrapAndDrawText(ctx, panel.caption, canvas.width / 2, textYOffset, availableWidth, 32, isRtl);
  }

  // Draw Mood tag badge on bottom border
  if (panel.mood) {
    const badgeText = isRtl ? `אווירה: ${panel.mood}` : `Mood: ${panel.mood}`;
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 11px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'ltr';
    
    // Draw small rounded badge at bottom right
    const badgeW = 120;
    const badgeH = 24;
    const badgeX = canvas.width - badgeW - 30;
    const badgeY = canvas.height - 12;
    
    ctx.fillRect(badgeX, badgeY - badgeH/2, badgeW, badgeH);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(badgeText.toUpperCase(), badgeX + badgeW/2, badgeY);
  }

  return canvas;
}

// Saved Single Image triggers
export async function exportElementAsPng(
  panel: { imageUrl?: string; caption?: string; dialogue?: string; mood?: string },
  title: string,
  index: number,
  total: number,
  lang: string
) {
  try {
    const canvas = await drawPanelToCanvas(panel, title, index, total, lang);
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${title.replace(/\s+/g, '_')}_panel_${index}.png`;
    link.href = dataUrl;
    link.click();
  } catch (error) {
    console.error('Error rendering image composite:', error);
    throw error;
  }
}

// Download ALL Panels triggers
export async function downloadAllPanelsAsZip(
  panels: { imageUrl?: string; caption?: string; dialogue?: string; mood?: string }[],
  title: string,
  lang: string
) {
  const zip = new JSZip();
  const total = panels.length;

  const renderPromises = panels.map(async (panel, index) => {
    try {
      const canvas = await drawPanelToCanvas(panel, title, index + 1, total, lang);
      
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
      });

      if (blob) {
        zip.file(`panel-${index + 1}.jpg`, blob);
      }
    } catch (error) {
      console.error(`Error drawing comic page composite layout ${index + 1}:`, error);
    }
  });

  await Promise.all(renderPromises);

  const content = await zip.generateAsync({ type: 'blob' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(content);
  link.download = `${title.replace(/\s+/g, '_')}-comics-all.zip`;
  link.click();
}
