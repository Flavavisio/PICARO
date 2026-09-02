(() => {
  'use strict';

  const FLEX_VALUE = 'Flexível';

  function getEls() {
    const schedule = document.getElementById('f-schedule');
    if (!schedule) return null;
    const scheduleField = schedule.closest('.field');
    const type = document.getElementById('f-schedule-type');
    return { schedule, scheduleField, type };
  }

  function createTypeField() {
    const schedule = document.getElementById('f-schedule');
    if (!schedule || document.getElementById('f-schedule-type')) return;

    const scheduleField = schedule.closest('.field');
    if (!scheduleField || !scheduleField.parentNode) return;

    const field = document.createElement('div');
    field.className = 'field';
    field.id = 'f-schedule-type-field';
    field.innerHTML = `
      <label>Tipo de turno</label>
      <select class="select-input" id="f-schedule-type">
        <option value="flexible">Flexível</option>
        <option value="fixed">Fixo</option>
      </select>
      <div class="hint" style="font-size:11.5px;color:var(--ink-faint);margin-top:6px;">
        <strong>Flexível</strong>: pode rodar entre vários turnos. <strong>Fixo</strong>: mantém um turno habitual definido.
      </div>`;

    scheduleField.parentNode.insertBefore(field, scheduleField);

    const label = scheduleField.querySelector('label');
    if (label) label.textContent = 'Turno habitual';

    const oldHint = scheduleField.querySelector('.hint');
    if (oldHint) {
      oldHint.innerHTML = 'Escolhe o turno que este colaborador deve cumprir habitualmente. O gerador de escalas deve usá-lo como base.';
    }

    document.getElementById('f-schedule-type')?.addEventListener('change', onTypeChange);
    schedule.addEventListener('change', () => {
      const els = getEls();
      if (!els?.type) return;
      if (els.schedule.value && els.schedule.value !== FLEX_VALUE) {
        els.type.value = 'fixed';
        updateVisibility();
      }
    });
  }

  function fixedOptions(schedule) {
    return Array.from(schedule.options).filter(opt => opt.value && opt.value !== FLEX_VALUE);
  }

  function updateVisibility() {
    const els = getEls();
    if (!els?.type || !els.scheduleField) return;
    const fixed = els.type.value === 'fixed';
    els.scheduleField.hidden = !fixed;

    Array.from(els.schedule.options).forEach(opt => {
      if (opt.value === FLEX_VALUE) {
        opt.hidden = fixed;
        opt.disabled = fixed;
      }
    });
  }

  function onTypeChange() {
    const els = getEls();
    if (!els?.type) return;

    if (els.type.value === 'flexible') {
      Array.from(els.schedule.options).forEach(opt => {
        if (opt.value === FLEX_VALUE) {
          opt.hidden = false;
          opt.disabled = false;
        }
      });
      els.schedule.value = FLEX_VALUE;
      updateVisibility();
      return;
    }

    const available = fixedOptions(els.schedule);
    if (!available.length) {
      els.type.value = 'flexible';
      els.schedule.value = FLEX_VALUE;
      updateVisibility();
      if (typeof window.showToast === 'function') {
        window.showToast('Crie primeiro pelo menos um turno antes de escolher Turno Fixo.', true);
      }
      return;
    }

    if (!els.schedule.value || els.schedule.value === FLEX_VALUE) {
      els.schedule.value = available[0].value;
    }
    updateVisibility();
  }

  function syncFromEmployeeValue() {
    createTypeField();
    const els = getEls();
    if (!els?.type) return;

    // Espera que populateShiftSelect/openColabDrawer terminem de preencher o select.
    const value = els.schedule.value || FLEX_VALUE;
    els.type.value = value === FLEX_VALUE ? 'flexible' : 'fixed';
    updateVisibility();
  }

  function scheduleSync() {
    setTimeout(syncFromEmployeeValue, 0);
    setTimeout(syncFromEmployeeValue, 80);
  }

  function init() {
    createTypeField();
    syncFromEmployeeValue();

    // Novo colaborador e botões de edição: sincroniza depois da lógica original abrir/preencher o drawer.
    document.addEventListener('click', event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('#new-colab-btn') || target.closest('[data-edit-colab]') || target.closest('.edit-colab-btn')) {
        scheduleSync();
      }
    }, true);

    // Cobertura adicional para qualquer forma de abertura do drawer já existente.
    const drawer = document.getElementById('colab-drawer');
    if (drawer) {
      const observer = new MutationObserver(() => scheduleSync());
      observer.observe(drawer, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    }

    // Se o código original reconstruir as opções de turno, mantém o estado correto.
    const schedule = document.getElementById('f-schedule');
    if (schedule) {
      const optionObserver = new MutationObserver(() => scheduleSync());
      optionObserver.observe(schedule, { childList: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
