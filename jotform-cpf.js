// Roda no iframe do formulário (form.jotform.com), só quando embutido no
// CadÚnico. O campo de CPF é um widget em OUTRO iframe aninhado
// (www.jotform.com/form-widgets/cpf-validator), então aqui só repassamos o
// CPF (vindo no hash #slzcpf=...) pra esse iframe via postMessage; quem
// preenche é o cpf-widget.js.
(function () {
  try {
    if (window === window.top) return;
    const o = Array.from(location.ancestorOrigins || []);
    if (o.length && !o.includes('https://cadunico.dataprev.gov.br')) return;
  } catch (e) { return; }

  const m = location.hash.match(/slzcpf=(\d{11})/);
  if (!m) return;
  const cpf = m[1];
  let confirmado = false;

  window.addEventListener('message', (ev) => {
    if (ev.origin === 'https://www.jotform.com' && ev.data && ev.data.fonte === 'slz-visita-cpf-ok') confirmado = true;
  });

  let tentativas = 0;
  const timer = setInterval(() => {
    tentativas++;
    if (confirmado || tentativas > 40) { clearInterval(timer); return; }
    const f = document.querySelector('iframe[src*="cpf-validator"]');
    if (f && f.contentWindow) {
      f.contentWindow.postMessage({ fonte: 'slz-visita-cpf', cpf }, 'https://www.jotform.com');
    }
  }, 750);
})();
