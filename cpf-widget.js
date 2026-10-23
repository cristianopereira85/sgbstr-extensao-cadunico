// Roda dentro do widget de CPF do JotForm (www.jotform.com/form-widgets/
// cpf-validator), aninhado no formulário embutido no CadÚnico. Recebe o CPF
// do jotform-cpf.js e preenche o campo como se tivesse sido digitado.
(function () {
  if (window === window.top) return;
  const o = Array.from(location.ancestorOrigins || []);
  if (o.length && !o.includes('https://cadunico.dataprev.gov.br')) return;

  function preencher(cpf) {
    const input = document.getElementById('cpfVerifierInput') || document.querySelector('input.cpfVerifier__input');
    if (!input) return false;
    const mascarado = cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    if (input.value === mascarado) return true;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    input.focus();
    setter.call(input, mascarado);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: mascarado.slice(-1) }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: mascarado.slice(-1) }));
    input.blur();
    console.log('[Visita] CPF preenchido no widget');
    return true;
  }

  window.addEventListener('message', (ev) => {
    if (ev.origin !== 'https://form.jotform.com' || !ev.data || ev.data.fonte !== 'slz-visita-cpf') return;
    const cpf = String(ev.data.cpf || '');
    if (!/^\d{11}$/.test(cpf)) return;
    if (preencher(cpf)) ev.source.postMessage({ fonte: 'slz-visita-cpf-ok' }, 'https://form.jotform.com');
  });
})();
