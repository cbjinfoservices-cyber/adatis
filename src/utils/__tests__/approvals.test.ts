import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAuditEntries, hoursLeft, isUrgent, type ApprovalItem, type AuditEntry } from '@/utils/approvals';

const NOW = new Date('2026-06-01T12:00:00Z').getTime();

const item = (over: Partial<ApprovalItem>): ApprovalItem => ({
  id: 'A1', requestId: 'REQ-1', serviceId: 's', service: { fr: 'S', en: 'S' }, category: 'c',
  user: 'alice', initials: 'AL', role: { fr: 'R', en: 'R' }, tenant: 't', environment: 'prod',
  submittedAt: '2026-06-01T00:00:00Z', dueAt: '2026-06-02T00:00:00Z', risk: 'low', myTurn: true,
  decision: 'pending', justification: { fr: '', en: '' }, impacts: [], levels: [], ...over,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('hoursLeft', () => {
  it('compte les heures restantes à partir de maintenant', () => {
    expect(hoursLeft('2026-06-01T17:00:00Z', NOW)).toBe(5);
    expect(hoursLeft('2026-06-01T10:00:00Z', NOW)).toBe(-2);
  });

  it('utilise l’heure courante par défaut', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(hoursLeft('2026-06-01T15:00:00Z')).toBe(3);
  });
});

describe('isUrgent', () => {
  it('est urgent si l’échéance est à 3 h ou moins et la demande en attente', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(isUrgent(item({ dueAt: '2026-06-01T14:00:00Z' }))).toBe(true);
    expect(isUrgent(item({ dueAt: '2026-06-02T14:00:00Z' }))).toBe(false);
    expect(isUrgent(item({ dueAt: '2026-06-01T14:00:00Z', decision: 'approved' }))).toBe(false);
  });
});

describe('buildAuditEntries', () => {
  const decided = item({
    levels: [
      { key: 'manager', status: 'approved', approver: 'bob', decidedAt: '2026-06-01T08:00:00Z' },
      { key: 'security', status: 'rejected', approver: 'eve', decidedAt: '2026-06-01T09:00:00Z' },
      { key: 'technical', status: 'current' },
    ],
  });

  it('crée une entrée par niveau décidé, la plus récente d’abord', () => {
    const entries = buildAuditEntries([decided], []);
    expect(entries.map((e) => [e.level, e.decision])).toEqual([['security', 'rejected'], ['manager', 'approved']]);
    expect(entries[1].actorRole.fr).toBe('Manager');
  });

  it('ajoute l’historique archivé sans doublon', () => {
    const archived = buildAuditEntries([decided], [])[1];
    const older: AuditEntry = { ...archived, id: 'old', ref: 'REQ-0', at: '2026-05-01T00:00:00Z' };
    const entries = buildAuditEntries([decided], [archived, older]);
    expect(entries.map((e) => e.id)).toEqual(['A1-security', 'A1-manager', 'old']);
  });
});
