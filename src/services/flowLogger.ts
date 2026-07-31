import { logger } from './logger';

/** Log a high-level flow / navigation action (step changes, major workflows). */
export function logFlow(title: string, details?: string) {
  logger.addLog({
    category: 'UI',
    level: 'info',
    title,
    details,
  });
}

/** Log a user click or control interaction. */
export function logUiAction(title: string, details?: string) {
  logger.addLog({
    category: 'UI',
    level: 'info',
    title,
    details,
  });
}

function cleanLabel(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 100);
}

function describeElement(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return cleanLabel(aria);

  const title = el.getAttribute('title');
  if (title) return cleanLabel(title);

  if (el instanceof HTMLSelectElement) {
    const selected = el.options[el.selectedIndex]?.text || el.value;
    return cleanLabel(`Select → ${selected}`);
  }

  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox' || el.type === 'radio') {
      return cleanLabel(`${el.type}: ${el.name || el.id || 'control'} = ${el.checked}`);
    }
    if (el.type === 'file') return cleanLabel(`File upload: ${el.files?.[0]?.name || 'chooser'}`);
    return cleanLabel(`Input: ${el.name || el.placeholder || el.id || el.type}`);
  }

  if (el instanceof HTMLTextAreaElement) {
    return cleanLabel(`Text area: ${el.name || el.placeholder || el.id || 'story'}`);
  }

  const text = el.innerText || el.textContent || '';
  if (text.trim()) return cleanLabel(text);

  return cleanLabel(el.tagName.toLowerCase());
}

/**
 * Attach document-level listeners that record clicks and control changes
 * into the Live Terminal (category: UI). Call once from App mount.
 */
export function attachUiActionLogging(getStep: () => string): () => void {
  const shouldSkip = (el: HTMLElement | null): boolean => {
    if (!el) return true;
    // Avoid logging pure scroll/chrome noise inside the log panes themselves
    // still allow buttons in log panes — only skip the log stream rows.
    if (el.closest('[data-log-stream="true"]')) return true;
    return false;
  };

  const onClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const el = target.closest(
      'button, a, [role="button"], summary, label, input[type="checkbox"], input[type="radio"], input[type="file"], select'
    ) as HTMLElement | null;

    if (!el || shouldSkip(el)) return;

    // Ignore disabled controls
    if (el instanceof HTMLButtonElement && el.disabled) return;

    const label = describeElement(el);
    if (!label || label === 'button') return;

    logUiAction(`Click: ${label}`, `Screen: ${getStep()} | <${el.tagName.toLowerCase()}>`);
  };

  const onChange = (event: Event) => {
    const el = event.target as HTMLElement | null;
    if (!el || shouldSkip(el)) return;

    if (el instanceof HTMLSelectElement) {
      const selected = el.options[el.selectedIndex]?.text || el.value;
      logUiAction(`Changed select → ${cleanLabel(selected)}`, `Screen: ${getStep()} | value=${el.value}`);
      return;
    }

    if (el instanceof HTMLInputElement) {
      if (el.type === 'checkbox' || el.type === 'radio') {
        logUiAction(
          `Toggled ${el.type}: ${el.name || el.id || 'control'} = ${el.checked}`,
          `Screen: ${getStep()}`
        );
        return;
      }
      if (el.type === 'range' || el.type === 'color') {
        logUiAction(`Changed ${el.type} → ${el.value}`, `Screen: ${getStep()}`);
        return;
      }
      if (el.type === 'file' && el.files?.length) {
        logUiAction(`Uploaded file: ${el.files[0].name}`, `Screen: ${getStep()}`);
      }
      return;
    }

    if (el instanceof HTMLTextAreaElement) {
      const len = el.value.length;
      logUiAction(`Edited text (${len} chars)`, `Screen: ${getStep()} | ${el.placeholder || el.name || 'textarea'}`);
    }
  };

  document.addEventListener('click', onClick, true);
  document.addEventListener('change', onChange, true);

  return () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('change', onChange, true);
  };
}
