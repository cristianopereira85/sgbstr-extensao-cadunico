// =================================================================
// Roda DENTRO do iframe do widget do Nilton (visita-domiciliar.pages.dev/nova-visita).
// Recebe da página do Cadastro Único {tipo:"slz:preencher", v:1, dados:{...}} e preenche
// os campos que o widget deixou vazios (ex.: quando a família não está na base dele).
// Nunca sobrescreve campo já preenchido e preenche cada campo uma única vez por captura,
// então o entrevistador pode corrigir depois. Os ids dos campos (f-<id>) vêm do Jotform.
// =================================================================
(function () {
  if (window.__slzWidgetInjected || window.parent === window) return;
  window.__slzWidgetInjected = true;

  const PAI = "https://cadunico.dataprev.gov.br";
  // id do campo no widget -> chave em dados (UTL fica de fora: quem agenda escolhe)
  const CAMPOS = {
    "f-207": "cpf", "f-6": "nome", "f-5": "codigoFamiliar", "f-9": "localidade", "f-10": "endereco",
    "f-21": "referencia", "f-106": "telefone",
    "f-42": "processo", "f-44": "integrantes",
    "f-46": "bolsaFamilia", "f-47": "tsee", "f-48": "bpc", "f-50": "transferencia",
  };
  let alvo = {};            // id -> valor ainda a preencher
  let ocupado = false;
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

  function preencherTexto(el, valor) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, valor); // setter nativo: o React só vê assim
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function preencherLista(btn, valor) {
    const o = { bubbles: true, cancelable: true, button: 0, pointerType: "mouse", isPrimary: true };
    btn.dispatchEvent(new PointerEvent("pointerdown", o)); // Radix Select abre no pointerdown
    let opt = null;
    for (let i = 0; i < 10 && !opt; i++) {
      await pausa(80);
      opt = [...document.querySelectorAll('[role="option"]')].find((e) => norm(e.textContent) === norm(valor));
    }
    if (!opt) { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return false; }
    opt.dispatchEvent(new PointerEvent("pointerup", o));
    opt.dispatchEvent(new MouseEvent("click", o));
    await pausa(150);
    return true;
  }

  function vazio(el) {
    if (el.tagName === "BUTTON") return el.hasAttribute("data-placeholder") || norm(el.textContent) === "";
    return String(el.value || "").trim() === "";
  }

  async function aplicar() {
    if (ocupado) return;
    ocupado = true;
    try {
      for (const id of Object.keys(alvo)) {
        const el = document.getElementById(id);
        if (!el) continue; // etapa ainda não montada: o observer tenta de novo quando aparecer
        const valor = alvo[id];
        if (vazio(el)) {
          if (el.tagName === "BUTTON") await preencherLista(el, valor);
          else preencherTexto(el, valor);
        }
        delete alvo[id]; // uma vez só: se já tinha valor (da base do Nilton), respeita
      }
    } finally { ocupado = false; }
  }

  new MutationObserver(() => { if (Object.keys(alvo).length) aplicar(); })
    .observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("message", async (ev) => {
    if (ev.source !== window.parent || ev.origin !== PAI) return;
    const d = ev.data;
    if (!d || d.tipo !== "slz:preencher" || d.v !== 1 || !d.dados) return;
    alvo = {};
    for (const [id, chave] of Object.entries(CAMPOS)) {
      const v = d.dados[chave];
      if (v != null && String(v).trim() !== "") alvo[id] = String(v);
    }
    await pausa(1500); // dá tempo da busca do widget pela base do Nilton terminar
    aplicar();
  });
})();
