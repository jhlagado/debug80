import type { ProjectStatusPayload } from '../../src/contracts/platform-view';

export function setTargetOptions(
  homeTargetSelect: HTMLSelectElement,
  options: ProjectStatusPayload['targets'],
  selectedTargetName?: string
): void {
  clearSelectOptions(homeTargetSelect);
  if (options.length === 0) {
    setSelectPlaceholder(homeTargetSelect, 'No targets available');
    homeTargetSelect.disabled = true;
    return;
  }
  setSelectPlaceholder(homeTargetSelect, 'Select target...');
  for (const option of options) {
    const el = document.createElement('option');
    el.value = option.name;
    el.textContent = option.name;
    el.title = option.detail ?? option.description ?? option.name;
    homeTargetSelect.appendChild(el);
  }
  homeTargetSelect.disabled = false;
  homeTargetSelect.value = selectedTargetName ?? '';
}

export function sendButtonLabel(platform: string | undefined): string {
  if (platform === 'tec1g') {
    return 'Send to TEC-1G';
  }
  if (platform === 'tec1') {
    return 'Send to TEC-1';
  }
  return 'Send to Board';
}

function clearSelectOptions(select: HTMLSelectElement): void {
  while (select.firstChild) {
    select.removeChild(select.firstChild);
  }
}

function setSelectPlaceholder(select: HTMLSelectElement, label: string): void {
  const option = document.createElement('option');
  option.value = '';
  option.textContent = label;
  option.disabled = true;
  option.selected = true;
  select.appendChild(option);
}
