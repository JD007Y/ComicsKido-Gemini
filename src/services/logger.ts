export interface LogEntry {
  id: string;
  timestamp: string;
  category: 'STORY' | 'PANEL_GEN' | 'AVATAR_GEN' | 'PHOTO_LIKENESS' | 'TRANSLATION' | 'SYSTEM' | 'SERVER';
  level: 'info' | 'warn' | 'error' | 'success';
  title: string;
  details?: string;
  model?: string;
  durationMs?: number;
}

type LogListener = (entry: LogEntry) => void;

class LoggerService {
  private logs: LogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private channel: BroadcastChannel | null = null;

  constructor() {
    // Try to load cached logs from localStorage
    try {
      const cached = localStorage.getItem('comicskido_client_logs');
      if (cached) {
        this.logs = JSON.parse(cached);
      }
    } catch (e) {
      console.warn('Failed to load cached logs', e);
    }

    if (this.logs.length === 0) {
      this.logs.push({
        id: 'init_sys',
        timestamp: new Date().toLocaleTimeString(),
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
              this.logs.unshift(entry);
              if (this.logs.length > 250) this.logs.pop();
              this.notifyListeners(entry);
            }
          } else if (event.data?.type === 'CLEAR_LOGS') {
            this.logs = [];
            this.notifyListeners({
              id: 'clr',
              timestamp: new Date().toLocaleTimeString(),
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

  addLog(entry: Omit<LogEntry, 'id' | 'timestamp'>): LogEntry {
    const fullEntry: LogEntry = {
      ...entry,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
    };
    this.logs.unshift(fullEntry); // newest first
    if (this.logs.length > 250) {
      this.logs.pop();
    }
    
    try {
      localStorage.setItem('comicskido_client_logs', JSON.stringify(this.logs.slice(0, 100)));
    } catch (e) {}

    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'ADD_LOG', entry: fullEntry });
      } catch (e) {}
    }

    this.notifyListeners(fullEntry);
    return fullEntry;
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
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
