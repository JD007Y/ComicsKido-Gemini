export interface LogEntry {
  id: string;
  timestamp: string;
  /** Epoch ms — used to sort oldest → newest (first log on top). */
  createdAt: number;
  category: 'STORY' | 'PANEL_GEN' | 'AVATAR_GEN' | 'PHOTO_LIKENESS' | 'TRANSLATION' | 'SYSTEM' | 'SERVER' | 'UI';
  level: 'info' | 'warn' | 'error' | 'success';
  title: string;
  details?: string;
  model?: string;
  durationMs?: number;
}

type LogListener = (entry: LogEntry) => void;

/** Newest first (latest log on top). */
export function sortLogsNewestFirst(logs: LogEntry[]): LogEntry[] {
  return [...logs].sort((a, b) => {
    const aAt = a.createdAt ?? 0;
    const bAt = b.createdAt ?? 0;
    if (aAt !== bAt) return bAt - aAt;
    return b.id.localeCompare(a.id);
  });
}

/** @deprecated use sortLogsNewestFirst */
export function sortLogsOldestFirst(logs: LogEntry[]): LogEntry[] {
  return sortLogsNewestFirst(logs).reverse();
}

function normalizeCachedLogs(raw: unknown): LogEntry[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const hasCreatedAt = raw.every(
    (e: any) => typeof e?.createdAt === 'number' && e.createdAt > 0
  );
  if (hasCreatedAt) {
    return sortLogsNewestFirst(raw as LogEntry[]);
  }

  // Legacy cache without createdAt — assume already newest-first (unshift era)
  const ordered = [...raw];
  const base = Date.now() - ordered.length * 1000;
  return ordered.map((entry: any, index: number) => ({
    ...entry,
    // index 0 is newest → highest createdAt
    createdAt: base + (ordered.length - 1 - index) * 1000,
  }));
}

class LoggerService {
  private logs: LogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private channel: BroadcastChannel | null = null;

  constructor() {
    // Try to load cached logs from localStorage
    try {
      const cached = localStorage.getItem('comicskido_client_logs');
      if (cached) {
        this.logs = normalizeCachedLogs(JSON.parse(cached));
      }
    } catch (e) {
      console.warn('Failed to load cached logs', e);
    }

    if (this.logs.length === 0) {
      this.logs.push({
        id: 'init_sys',
        timestamp: new Date().toLocaleTimeString(),
        createdAt: Date.now(),
        category: 'SYSTEM',
        level: 'info',
        title: 'Logger initialized',
        details: 'Comicskido AI Live Console & Monitor ready.',
      });
    }

    // Setup cross-tab BroadcastChannel
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.channel = new BroadcastChannel('comicskido_live_logs_channel');
        this.channel.onmessage = (event) => {
          if (event.data?.type === 'ADD_LOG' && event.data?.entry) {
            const entry = event.data.entry as LogEntry;
            if (!this.logs.some(l => l.id === entry.id)) {
              this.logs.unshift({
                ...entry,
                createdAt: entry.createdAt || Date.now(),
              });
              if (this.logs.length > 400) this.logs.pop();
              this.notifyListeners(entry);
            }
          } else if (event.data?.type === 'CLEAR_LOGS') {
            this.logs = [];
            this.notifyListeners({
              id: 'clr',
              timestamp: new Date().toLocaleTimeString(),
              createdAt: Date.now(),
              category: 'SYSTEM',
              level: 'info',
              title: 'Logs cleared',
            });
          }
        };
      }
    } catch (e) {
      console.warn('BroadcastChannel not supported or restricted', e);
    }
  }

  addLog(entry: Omit<LogEntry, 'id' | 'timestamp' | 'createdAt'>): LogEntry {
    const fullEntry: LogEntry = {
      ...entry,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      createdAt: Date.now(),
    };
    this.logs.unshift(fullEntry); // newest first — latest log on top
    if (this.logs.length > 400) {
      this.logs.pop();
    }
    
    try {
      // Keep only a slim recent slice in localStorage — full prompts blow the 5MB quota
      // and then session saves fail, which looks like the app "crashed" back to the start.
      const slim = this.logs.slice(0, 80).map((l) => ({
        ...l,
        details: l.details && l.details.length > 500 ? l.details.slice(0, 500) + '…' : l.details,
      }));
      localStorage.setItem('comicskido_client_logs', JSON.stringify(slim));
    } catch (e) {
      try {
        localStorage.removeItem('comicskido_client_logs');
      } catch (_) {}
    }

    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'ADD_LOG', entry: fullEntry });
      } catch (e) {}
    }

    this.notifyListeners(fullEntry);
    return fullEntry;
  }

  getLogs(): LogEntry[] {
    return sortLogsNewestFirst(this.logs);
  }

  clearLogs() {
    this.logs = [];
    try {
      localStorage.removeItem('comicskido_client_logs');
    } catch (e) {}

    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'CLEAR_LOGS' });
      } catch (e) {}
    }

    this.addLog({
      category: 'SYSTEM',
      level: 'info',
      title: 'Logs cleared',
      details: 'Console history cleared by user.',
    });
  }

  subscribe(listener: LogListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(entry: LogEntry) {
    this.listeners.forEach(listener => listener(entry));
  }
}

export const logger = new LoggerService();
