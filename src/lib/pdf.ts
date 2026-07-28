import { jsPDF } from 'jspdf';
import { ComicStory } from '../types';
import { drawPanelToCanvas } from './export';

export interface PdfExportOptions {
  pageSize: 'A4' | 'A5' | 'A6';
  orientation: 'portrait' | 'landscape';
  layout: 'one-per-page' | 'grid';
  lang: string;
}

export async function exportToPdf(
  comic: ComicStory,
  options: PdfExportOptions = {
    pageSize: 'A4',
    orientation: 'portrait',
    layout: 'one-per-page',
    lang: 'en'
  }
) {
  const { pageSize, orientation, layout, lang } = options;

  // jsPDF orientation can be 'p' or 'l'
  const pdfOrientation = orientation === 'portrait' ? 'p' : 'l';
  const pdfFormat = pageSize.toLowerCase(); // 'a4', 'a5', 'a6'

  const doc = new jsPDF({
    orientation: pdfOrientation,
    unit: 'mm',
    format: pdfFormat
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 8; // margins around page

  const totalPanels = comic.panels.length;

  if (layout === 'one-per-page') {
    // Exactly 1 panel per page
    for (let i = 0; i < totalPanels; i++) {
      if (i > 0) {
        doc.addPage(pdfFormat, pdfOrientation);
      }

      const panel = comic.panels[i];
      if (!panel) continue;

      try {
        // Draw the high-fidelity comic canvas (with Embedded Hebrew text & balloons)
        const canvas = await drawPanelToCanvas(panel, comic.title, i + 1, totalPanels, lang);
        const imgData = canvas.toDataURL('image/jpeg', 0.95);

        const maxWidth = pageWidth - (margin * 2);
        const maxHeight = pageHeight - (margin * 2);

        // Aspect ratio of our comic page canvas is 800 (w) / 1050 (h)
        const canvasRatio = 800 / 1050;

        let destWidth = maxWidth;
        let destHeight = maxWidth / canvasRatio;

        if (destHeight > maxHeight) {
          destHeight = maxHeight;
          destWidth = maxHeight * canvasRatio;
        }

        // Center within margins
        const destX = (pageWidth - destWidth) / 2;
        const destY = (pageHeight - destHeight) / 2;

        doc.addImage(imgData, 'JPEG', destX, destY, destWidth, destHeight);
      } catch (err) {
        console.error(`Error rendering panel ${i + 1} onto PDF page:`, err);
        // Fallback text drawing
        doc.setFontSize(14);
        doc.text(`Panel ${i + 1} - Image generation failed`, margin, margin + 20);
      }
    }
  } else {
    // Grid alignment: 2 columns, suitable rows based on orientation
    const columnsCount = orientation === 'portrait' ? 2 : 2;
    const rowsCount = orientation === 'portrait' ? 2 : 1;
    const panelsPerPage = columnsCount * rowsCount;

    const availableWidth = pageWidth - (margin * 2);
    const availableHeight = pageHeight - (margin * 2);

    const padding = 4; // padding between grid cards

    const cardWidth = (availableWidth - (padding * (columnsCount - 1))) / columnsCount;
    const cardHeight = (availableHeight - (padding * (rowsCount - 1))) / rowsCount;

    // Canvas aspect ratio (width/height): 800 / 1050 = 0.762
    const canvasRatio = 800 / 1050;

    // Scale card dimensions to preserve aspect ratio within cell
    let drawW = cardWidth;
    let drawH = cardWidth / canvasRatio;

    if (drawH > cardHeight) {
      drawH = cardHeight;
      drawW = cardHeight * canvasRatio;
    }

    for (let i = 0; i < totalPanels; i++) {
      if (i > 0 && i % panelsPerPage === 0) {
        doc.addPage(pdfFormat, pdfOrientation);
      }

      const panelIndexInPage = i % panelsPerPage;
      const col = panelIndexInPage % columnsCount;
      const row = Math.floor(panelIndexInPage / columnsCount);

      // Centered positions inside the cell
      const cellStartX = margin + col * (cardWidth + padding);
      const cellStartY = margin + row * (cardHeight + padding);

      const x = cellStartX + (cardWidth - drawW) / 2;
      const y = cellStartY + (cardHeight - drawH) / 2;

      const panel = comic.panels[i];
      if (!panel) continue;

      try {
        const canvas = await drawPanelToCanvas(panel, comic.title, i + 1, totalPanels, lang);
        const imgData = canvas.toDataURL('image/jpeg', 0.9);

        doc.addImage(imgData, 'JPEG', x, y, drawW, drawH);
      } catch (err) {
        console.error(`Error rendering grid panel ${i + 1}:`, err);
      }
    }
  }

  const sanitizedTitle = comic.title.replace(/[\\/*?:"<>|]/g, '_').replace(/\s+/g, '_');
  doc.save(`${sanitizedTitle}_${pageSize}_${orientation}.pdf`);
}
