import { analytics } from './analytics.js';
import { featureFlagClient } from './featureFlags.js';

const flagControls = document.getElementById('flag-controls');
const assignmentLog = document.getElementById('assignment-log');
const eventLog = document.getElementById('event-log');

function renderFlagControls(flags) {
  flagControls.innerHTML = '';
  Object.keys(flags).forEach((flag) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'options';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = featureFlagClient.isEnabled(flag);
    toggle.addEventListener('change', () => {
      const value = toggle.checked;
      featureFlagClient.setFlag(flag, value);
      analytics.trackEvent('flag_updated', { flag, value, source: 'harness' });
      renderFlagControls(featureFlagClient.flags);
      renderLog(eventLog, analytics.getEvents());
    });
    const text = document.createElement('span');
    text.textContent = flag;
    wrapper.append(toggle, text);
    flagControls.append(wrapper);
  });
}

function renderLog(listEl, items) {
  listEl.innerHTML = '';
  items.slice(-10).reverse().forEach((item) => {
    const li = document.createElement('li');
    li.textContent = JSON.stringify(item);
    listEl.append(li);
  });
}

function bindVariantButtons() {
  document.querySelectorAll('[data-variant]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const variant = btn.dataset.variant;
      analytics.trackAssignment('ui_layout', variant, { source: 'harness' });
      renderLog(assignmentLog, analytics.getAssignments());
    });
  });
}

async function bootstrap() {
  await featureFlagClient.initialize();
  renderFlagControls(featureFlagClient.flags);
  bindVariantButtons();
  renderLog(eventLog, analytics.getEvents());
  renderLog(assignmentLog, analytics.getAssignments());
}

document.addEventListener('DOMContentLoaded', bootstrap);
