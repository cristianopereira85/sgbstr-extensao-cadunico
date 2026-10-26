// Roda dentro do widget de CPF do JotForm (www.jotform.com/form-widgets/
// cpf-validator), aninhado no formulário embutido no CadÚnico. Recebe o CPF
// do jotform-cpf.js e preenche o campo como se tivesse sido digitado.
// O widget termina de iniciar depois do nosso primeiro preenchimento e às vezes
// zera o campo (valida, mas volta a 000.000.000-00), então o valor fica sob
// vigia: se sumir ou mudar, é preenchido de novo. O "ok" só sai depois que o
// CPF ficou estável por alguns segundos.
(function () {
  if (window === window.top) return;
  const o = Array.from(location.ancestorOrigins || []);
  if (o.length && !o.includes('https://cadunico.dataprev.gov.br')) return;

  const ESTAVEL_MS = 3000;
  const VIGIA_MS = 25000;
  let alvo = null;       // CPF mascarado em vigia
  let confirmou = false;
  let fonte = null;
  let refeito = 0;
  let estavelDesde = 0;
  let timerAtual = null;

  function achar() {
    return document.getElementById('cpfVerifierInput') || document.querySelector('input.cpfVerifier__input');
  }

  function preencher(input, mascarado) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    input.focus();
    setter.call(input, mascarado);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: mascarado.slice(-1) }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: mascarado.slice(-1) }));
    input.blur();
  }

  function vigiar(mascarado) {
    clearInterval(timerAtual);
    const inicio = Date.now();
    const timer = timerAtual = setInterval(() => {
      if (Date.now() - inicio > VIGIA_MS) { clearInterval(timer); return; }
      const input = achar();
      if (!input) { estavelDesde = 0; return; }
      if (input.value !== mascarado) {
        if (estavelDesde) { refeito++; console.log('[Visita] CPF zerado pelo widget, refazendo (' + refeito + ')'); }
        preencher(input, mascarado);
        estavelDesde = Date.now();
        if (!refeito) console.log('[Visita] CPF preenchido no widget');
        return;
      }
      if (!estavelDesde) estavelDesde = Date.now();
      if (!confirmou && Date.now() - estavelDesde >= ESTAVEL_MS) {
        confirmou = true;
        if (fonte) fonte.postMessage({ fonte: 'slz-visita-cpf-ok' }, 'https://form.jotform.com');
      }
    }, 400);
  }

  window.addEventListener('message', (ev) => {
    if (ev.origin !== 'https://form.jotform.com' || !ev.data || ev.data.fonte !== 'slz-visita-cpf') return;
    const cpf = String(ev.data.cpf || '');
    if (!/^\d{11}$/.test(cpf)) return;
    fonte = ev.source;
    const mascarado = cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    if (alvo === mascarado) {
      if (confirmou) fonte.postMessage({ fonte: 'slz-visita-cpf-ok' }, 'https://form.jotform.com');
      return;
    }
    alvo = mascarado; confirmou = false; refeito = 0; estavelDesde = 0;
    vigiar(mascarado);
  });
})();
