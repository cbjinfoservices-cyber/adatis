import { jsPDF } from 'jspdf';

type RGB = [number, number, number];

export interface BundleStep {
  label: string;
  state: string;
  note: string;
  tone: 'success' | 'running' | 'pending' | 'failed';
}

export interface BundleItem {
  ref: string;
  service: string;
  status: string;
  user: string;
  tenant: string;
  environment: string;
  createdAt: string;
  duration: string;
  approval: string;
  progress: number;
  steps: BundleStep[];
  result?: { title: string; fields: { label: string; value: string }[] };
  error?: { code: string; severity: string; reason: string; solution: string };
}

export interface BundlePayload {
  items: BundleItem[];
  labels: Record<string, string>;
  fileName: string;
}

const INK: RGB = [22, 26, 32];
const SOFT: RGB = [130, 138, 148];
const LINE: RGB = [226, 230, 235];
const TEAL: RGB = [30, 160, 152];
const RED: RGB = [184, 70, 56];
const AMBER: RGB = [206, 150, 44];

const TONES: Record<BundleStep['tone'], RGB> = {
  success: TEAL,
  running: AMBER,
  pending: [190, 196, 203],
  failed: RED,
};

const clean = (value: string) => (value || '')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201C\u201D]/g, '"')
  .replace(/[\u2013\u2014]/g, '-')
  .replace(/\u00B7/g, '-')
  .replace(/\u2026/g, '...')
  .replace(/\u2192/g, '->');

export const exportRequestBundlePdf = (p: BundlePayload) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = 210;
  const M = 16;
  const CW = W - M * 2;
  let y = 0;

  const fit = (text: string, width: number) => {
    const lines = doc.splitTextToSize(clean(text), width) as string[];
    return lines[0] || '';
  };

  const footer = () => {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i += 1) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(146, 154, 164);
      doc.text(clean(p.labels.generated), M, 289);
      doc.text(`${i} / ${pages}`, W - M, 289, { align: 'right' });
    }
  };

  const cover = () => {
    doc.setFillColor(INK[0], INK[1], INK[2]);
    doc.rect(0, 0, W, 42, 'F');
    doc.setFillColor(TEAL[0], TEAL[1], TEAL[2]);
    doc.rect(0, 42, W, 1.4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text(clean(p.labels.title), M, 17);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(196, 206, 216);
    doc.text(fit(p.labels.subtitle, CW - 10), M, 25);
    doc.setFontSize(7.6);
    doc.text(clean(p.labels.generated), M, 35);
    y = 55;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(SOFT[0], SOFT[1], SOFT[2]);
    doc.text(clean(p.labels.table).toUpperCase(), M, y);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.3);
    doc.line(M, y + 2, W - M, y + 2);
    y += 7.5;

    const cols = [
      { x: M, w: 40, key: 'ref' },
      { x: M + 42, w: 62, key: 'service' },
      { x: M + 106, w: 26, key: 'status' },
      { x: M + 134, w: 34, key: 'user' },
      { x: M + 170, w: 26, key: 'date' },
    ];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(SOFT[0], SOFT[1], SOFT[2]);
    cols.forEach((col) => {
      doc.text(clean(p.labels[col.key]).toUpperCase(), col.x, y);
    });
    y += 4;

    p.items.forEach((item, index) => {
      if (y + 10 > 276) {
        doc.addPage();
        y = 24;
      }
      const values: Record<string, string> = {
        ref: item.ref,
        service: item.service,
        status: item.status,
        user: item.user,
        date: item.createdAt,
      };
      if (index % 2 === 1) {
        doc.setFillColor(247, 249, 250);
        doc.rect(M - 2, y - 3.4, CW + 4, 8, 'F');
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.4);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      cols.forEach((col) => {
        doc.text(fit(values[col.key], col.w), col.x, y);
      });
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
      doc.setLineWidth(0.15);
      doc.line(M, y + 3.4, W - M, y + 3.4);
      y += 8;
    });

    y += 4;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.4);
    doc.setTextColor(SOFT[0], SOFT[1], SOFT[2]);
    doc.text(clean(p.labels.details), M, y);
  };

  const itemPage = (item: BundleItem) => {
    doc.addPage();
    doc.setFillColor(INK[0], INK[1], INK[2]);
    doc.rect(0, 0, W, 24, 'F');
    doc.setFillColor(TEAL[0], TEAL[1], TEAL[2]);
    doc.rect(0, 24, W, 1.2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(item.ref, M, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.6);
    doc.setTextColor(196, 206, 216);
    doc.text(fit(item.service, 105), M, 18.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(fit(item.status, 40), W - M, 12, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(196, 206, 216);
    doc.text(item.createdAt, W - M, 18.5, { align: 'right' });
    y = 34;

    const ensure = (needed: number) => {
      if (y + needed > 276) {
        doc.addPage();
        y = 22;
      }
    };

    const section = (title: string) => {
      ensure(14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(SOFT[0], SOFT[1], SOFT[2]);
      doc.text(clean(title).toUpperCase(), M, y);
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
      doc.setLineWidth(0.3);
      doc.line(M, y + 2, W - M, y + 2);
      y += 7.5;
      doc.setTextColor(INK[0], INK[1], INK[2]);
    };

    section(p.labels.request);
    const grid = [
      { label: p.labels.ref, value: item.ref },
      { label: p.labels.service, value: item.service },
      { label: p.labels.user, value: item.user },
      { label: p.labels.tenant, value: item.tenant },
      { label: p.labels.env, value: item.environment },
      { label: p.labels.duration, value: item.duration },
      { label: p.labels.approval, value: item.approval },
      { label: p.labels.status, value: item.status },
    ];
    const colW = CW / 2;
    grid.forEach((field, i) => {
      const col = i % 2;
      if (col === 0) ensure(11);
      const x = M + col * colW;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(SOFT[0], SOFT[1], SOFT[2]);
      doc.text(clean(field.label).toUpperCase(), x, y);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.2);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text(fit(field.value, colW - 6), x, y + 4.4);
      if (col === 1 || i === grid.length - 1) y += 11;
    });

    section(p.labels.progressTitle);
    ensure(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.4);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(`${Math.round(item.progress)} %`, W - M, y, { align: 'right' });
    doc.setFillColor(232, 236, 240);
    doc.rect(M, y + 2, CW, 3, 'F');
    const ratio = Math.min(100, Math.max(0, item.progress)) / 100;
    doc.setFillColor(TEAL[0], TEAL[1], TEAL[2]);
    doc.rect(M, y + 2, Math.max(1.5, CW * ratio), 3, 'F');
    y += 11;

    section(p.labels.timeline);
    item.steps.forEach((step) => {
      ensure(9);
      const tone = TONES[step.tone];
      doc.setFillColor(tone[0], tone[1], tone[2]);
      doc.circle(M + 1.5, y - 1.1, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.8);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text(fit(step.label, 48), M + 6, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(tone[0], tone[1], tone[2]);
      doc.text(fit(step.state, 26), M + 58, y);
      doc.setFontSize(7.8);
      doc.setTextColor(88, 96, 106);
      doc.text(fit(step.note, 90), M + 88, y);
      y += 6.6;
    });

    if (item.result) {
      section(`${p.labels.result} - ${item.result.title}`);
      const fieldCol = (CW - 4) / 2;
      item.result.fields.forEach((field, i) => {
        const col = i % 2;
        if (col === 0) ensure(18);
        const top = y;
        const x = M + col * (fieldCol + 4);
        doc.setFillColor(247, 249, 250);
        doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
        doc.rect(x, top, fieldCol, 13, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(SOFT[0], SOFT[1], SOFT[2]);
        doc.text(clean(field.label).toUpperCase(), x + 3, top + 4.6);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(INK[0], INK[1], INK[2]);
        doc.text(fit(field.value, fieldCol - 6), x + 3, top + 9.8);
        if (col === 1 || i === item.result!.fields.length - 1) y = top + 16;
      });
    }

    if (item.error) {
      const solutionLines = doc.splitTextToSize(clean(item.error.solution), CW - 12) as string[];
      const height = 16 + (solutionLines.length - 1) * 3.6;
      section(p.labels.error);
      ensure(height + 4);
      doc.setFillColor(252, 242, 239);
      doc.rect(M, y, CW, height, 'F');
      doc.setFillColor(RED[0], RED[1], RED[2]);
      doc.rect(M, y, 1.5, height, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(120, 42, 32);
      doc.text(fit(`[${item.error.code}] ${item.error.reason}`, CW - 12), M + 5, y + 5.4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.4);
      doc.setTextColor(150, 94, 84);
      doc.text(fit(item.error.severity, 40), M + 5, y + 9.6);
      doc.setFontSize(8);
      doc.setTextColor(70, 62, 60);
      solutionLines.forEach((line, i) => {
        doc.text(line, M + 5, y + 13.4 + i * 3.6);
      });
      y += height + 4;
    }
  };

  cover();
  p.items.forEach(itemPage);
  footer();
  doc.save(p.fileName);
};