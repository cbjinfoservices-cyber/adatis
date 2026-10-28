import { jsPDF } from 'jspdf';

type RGB = [number, number, number];

export interface PdfField { label: string; value: string }

export interface PdfStep {
  label: string;
  state: string;
  note: string;
  tone: 'success' | 'running' | 'pending' | 'failed';
}

export interface PdfPayload {
  ref: string;
  service: string;
  status: string;
  user: string;
  tenant: string;
  environment: string;
  createdAt: string;
  progress: number;
  duration: string;
  approval: string;
  steps: PdfStep[];
  result?: { title: string; fields: PdfField[] };
  error?: { code: string; severity: string; reason: string; solution: string };
  logs: { time: string; level: string; text: string }[];
  labels: Record<string, string>;
  fileName: string;
}

const INK: RGB = [22, 26, 32];
const SOFT: RGB = [130, 138, 148];
const LINE: RGB = [226, 230, 235];
const TEAL: RGB = [30, 160, 152];
const RED: RGB = [184, 70, 56];
const AMBER: RGB = [206, 150, 44];

const TONES: Record<PdfStep['tone'], RGB> = {
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

export const exportExecutionPdf = (p: PdfPayload) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = 210;
  const M = 16;
  const CW = W - M * 2;
  let y = 0;

  const fit = (text: string, width: number) => {
    const lines = doc.splitTextToSize(clean(text), width) as string[];
    return lines[0] || '';
  };

  const header = () => {
    doc.setFillColor(INK[0], INK[1], INK[2]);
    doc.rect(0, 0, W, 30, 'F');
    doc.setFillColor(TEAL[0], TEAL[1], TEAL[2]);
    doc.rect(0, 30, W, 1.4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(clean(p.labels.title), M, 13.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(fit(p.service, 95), M, 20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(p.ref, W - M, 13.5, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(196, 206, 216);
    doc.text(fit(p.status, 40), W - M, 20, { align: 'right' });
    y = 39;
  };

  const newPage = () => {
    doc.addPage();
    doc.setFillColor(TEAL[0], TEAL[1], TEAL[2]);
    doc.rect(0, 0, W, 2.6, 'F');
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(clean(p.labels.title), M, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(SOFT[0], SOFT[1], SOFT[2]);
    doc.text(p.ref, W - M, 12, { align: 'right' });
    y = 21;
  };

  const ensure = (needed: number) => {
    if (y + needed > 276) newPage();
  };

  const section = (title: string) => {
    ensure(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(SOFT[0], SOFT[1], SOFT[2]);
    doc.text(clean(title).toUpperCase(), M, y);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.3);
    doc.line(M, y + 2, W - M, y + 2);
    y += 7.5;
    doc.setTextColor(INK[0], INK[1], INK[2]);
  };

  const grid = (items: PdfField[]) => {
    const colW = CW / 2;
    items.forEach((item, i) => {
      const col = i % 2;
      if (col === 0) ensure(11);
      const x = M + col * colW;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(SOFT[0], SOFT[1], SOFT[2]);
      doc.text(clean(item.label).toUpperCase(), x, y);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.4);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text(fit(item.value, colW - 6), x, y + 4.6);
      if (col === 1 || i === items.length - 1) y += 11;
    });
  };

  const progressBar = () => {
    ensure(13);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.4);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(`${Math.round(p.progress)} %`, W - M, y, { align: 'right' });
    doc.setFillColor(232, 236, 240);
    doc.rect(M, y + 2, CW, 3.2, 'F');
    const ratio = Math.min(100, Math.max(0, p.progress)) / 100;
    doc.setFillColor(TEAL[0], TEAL[1], TEAL[2]);
    doc.rect(M, y + 2, Math.max(1.5, CW * ratio), 3.2, 'F');
    y += 12;
  };

  const timelineRow = (step: PdfStep) => {
    ensure(9);
    const tone = TONES[step.tone];
    doc.setFillColor(tone[0], tone[1], tone[2]);
    doc.circle(M + 1.5, y - 1.1, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(fit(step.label, 50), M + 6, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(tone[0], tone[1], tone[2]);
    doc.text(fit(step.state, 28), M + 60, y);
    doc.setFontSize(8);
    doc.setTextColor(88, 96, 106);
    doc.text(fit(step.note, 58), M + 92, y);
    y += 7;
  };

  const resultGrid = (fields: PdfField[]) => {
    const colW = (CW - 4) / 2;
    fields.forEach((field, i) => {
      const col = i % 2;
      if (col === 0) ensure(18);
      const rowTop = y;
      const x = M + col * (colW + 4);
      doc.setFillColor(247, 249, 250);
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
      doc.rect(x, rowTop, colW, 14, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(SOFT[0], SOFT[1], SOFT[2]);
      doc.text(clean(field.label).toUpperCase(), x + 3, rowTop + 5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.2);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text(fit(field.value, colW - 6), x + 3, rowTop + 10.5);
      if (col === 1 || i === fields.length - 1) y = rowTop + 17;
    });
  };

  const errorBlock = (err: PdfPayload['error']) => {
    if (!err) return;
    const solutionLines = doc.splitTextToSize(clean(err.solution), CW - 12) as string[];
    const height = 17 + (solutionLines.length - 1) * 3.8;
    ensure(height + 4);
    doc.setFillColor(252, 242, 239);
    doc.rect(M, y, CW, height, 'F');
    doc.setFillColor(RED[0], RED[1], RED[2]);
    doc.rect(M, y, 1.5, height, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.4);
    doc.setTextColor(120, 42, 32);
    doc.text(fit(`[${err.code}] ${err.reason}`, CW - 12), M + 5, y + 5.6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(150, 94, 84);
    doc.text(fit(`${err.severity}`, 40), M + 5, y + 10);
    doc.setFontSize(8);
    doc.setTextColor(70, 62, 60);
    solutionLines.forEach((line, i) => {
      doc.text(line, M + 5, y + 14 + i * 3.8);
    });
    y += height + 4;
  };

  const logsBlock = () => {
    const lines = p.logs.slice(-10);
    lines.forEach((log) => {
      const content = doc.splitTextToSize(clean(`${log.time}  ${log.text}`), CW - 6) as string[];
      ensure(content.length * 3.6 + 1.5);
      const tone = log.level === 'error' ? RED : log.level === 'warning' ? AMBER : log.level === 'success' ? TEAL : [70, 78, 88] as RGB;
      doc.setFont('courier', 'normal');
      doc.setFontSize(7.4);
      doc.setTextColor(tone[0], tone[1], tone[2]);
      content.forEach((line, i) => {
        doc.text(line, M + 2, y + i * 3.6);
      });
      y += content.length * 3.6 + 1.2;
    });
    if (p.logs.length > 10) {
      ensure(8);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.2);
      doc.setTextColor(SOFT[0], SOFT[1], SOFT[2]);
      doc.text(clean(p.labels.truncated), M + 2, y + 3);
      y += 8;
    }
  };

  header();
  section(p.labels.request);
  grid([
    { label: p.labels.ref, value: p.ref },
    { label: p.labels.service, value: p.service },
    { label: p.labels.user, value: p.user },
    { label: p.labels.tenant, value: p.tenant },
    { label: p.labels.env, value: p.environment },
    { label: p.labels.created, value: p.createdAt },
    { label: p.labels.status, value: p.status },
    { label: p.labels.duration, value: p.duration },
    { label: p.labels.approval, value: p.approval },
  ]);

  section(p.labels.progressTitle);
  progressBar();

  section(p.labels.timeline);
  p.steps.forEach(timelineRow);

  if (p.result) {
    section(`${p.labels.result} - ${p.result.title}`);
    resultGrid(p.result.fields);
  }

  if (p.error) {
    section(p.labels.error);
    errorBlock(p.error);
  }

  if (p.logs.length > 0) {
    section(p.labels.logs);
    logsBlock();
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(146, 154, 164);
    doc.text(clean(p.labels.generated), M, 289);
    doc.text(`${i} / ${pages}`, W - M, 289, { align: 'right' });
  }

  doc.save(p.fileName);
};