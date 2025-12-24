import { analytics } from './analytics.js';
import { featureFlagClient, getVariantFromQuery } from './featureFlags.js';

const state = {
  flags: {},
  variant: 'control',
  sessionActive: false,
};

function renderVariantUI(container, variant, flags) {
  container.dataset.variant = variant;
  container.dataset.flags = JSON.stringify(flags);
  container.querySelector('#variant-name').textContent = variant;
  container.querySelector('#flag-readout').textContent = JSON.stringify(flags, null, 2);

  const optionsBlock = container.querySelector('#options-block');
  const enhancedOptions = container.querySelector('#enhanced-options');
  optionsBlock.classList.toggle('variant-new', variant !== 'control' || flags.newLayout);
  enhancedOptions.style.display = flags.enhancedOptions ? 'grid' : 'none';
}

function wireEvents(container) {
  const startBtn = container.querySelector('#start-session');
  const completeBtn = container.querySelector('#complete-hand');
  const optionButtons = container.querySelectorAll('[data-option]');

  startBtn.addEventListener('click', () => {
    state.sessionActive = true;
    analytics.trackEvent('session_start', { variant: state.variant, flags: state.flags });
    container.querySelector('#status').textContent = 'Session started';
  });

  completeBtn.addEventListener('click', () => {
    if (!state.sessionActive) return;
    analytics.trackEvent('hand_completed', { variant: state.variant });
    container.querySelector('#status').textContent = 'Hand completed';
  });

  optionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const option = button.dataset.option;
      analytics.trackEvent('option_clicked', { option, variant: state.variant });
      container.querySelector('#status').textContent = `Selected: ${option}`;
    });
  });
}

async function bootstrap() {
  const container = document.getElementById('app');
  state.flags = await featureFlagClient.initialize();
  state.variant = getVariantFromQuery(featureFlagClient.isEnabled('newLayout') ? 'variant-b' : 'control');

  analytics.trackAssignment('ui_layout', state.variant, { flags: state.flags });
  renderVariantUI(container, state.variant, state.flags);
  wireEvents(container);
}

document.addEventListener('DOMContentLoaded', bootstrap);
