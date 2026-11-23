// =================================================================
// Botão "Formulário de campo" (ao lado do "Agendar visita").
// Lê o registro da visita na base do app do Nilton (view dados_qualificacao_unificado,
// mesma consulta de leitura pública que o Monitor já faz) e preenche no formulário de
// campo oficial SÓ a seção 4 (informações coletadas = RELATO DO ENTREVISTADOR). Conclusões (5) ficam em branco.
// NUNCA clica em Concluir/Salvar: quem confere e conclui é o entrevistador.
// Seção 3 (inclui 3.02.3 + texto) pelo STATUS (regraSecao3); 2.01/2.02 pela COMP FAMILIAR; 7.04/7.05 com padrão institucional. A 6 ainda não.
// =================================================================
(function () {
  if (window.__cuFcInjected) return;
  window.__cuFcInjected = true;

  // Base separada do Nilton: chave ANON pública (somente leitura), a mesma já embutida no Monitor.
  const NILTON_URL = "https://hxokccieggmynwhmxtfd.supabase.co";
  const NILTON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4b2tjY2llZ2dteW53aG14dGZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2Mzg4ODcsImV4cCI6MjA3NjIxNDg4N30.MGV6Trh8_x1y9hUuyJzIuxaJSA521nQg6Auw5aBGFz0";
  const VIEW = NILTON_URL + "/rest/v1/dados_qualificacao_unificado";
  const MAX = 350; // limite dos textareas 4 e 5

  const COLS = ["CPF RF", "UTL", "COMP FAMILIAR", "COD FAMILIAR", "STATUS", "is_arquivado", "DATA DE EDICAO", "RELATO DO ENTREVISTADOR",
    "OBSERVACOES", "MOTIVO DE IMPOSSIBILIDADE", "NOME VISITADOR", "NOME ENTREVISTADOR", "DT VISITA", "DT VISITA 2 VISITA",
    "DT 3 VISITA", "DT SEM CONTATO", "DT USUARIO NAO ENCONTRADO", "DT ENDERECO NAO EXISTE", "DT OMISSAO COMP FAMILIAR",
    "DT IMPOSSIBILIDADE DE VISITA DOMICILIAR", "DT NEGATIVA NA PRESTACAO DE INFORMACAO", "DT INSERCAO"];

  // Coluna de data de cada desfecho (mesma tabela do Monitor).
  const COLUNA_DATA = {
    "VISITA REALIZADA": "DT VISITA", "REQUER 2 VISITA": "DT VISITA 2 VISITA", "REQUER 3 VISITA": "DT 3 VISITA",
    "OMISSAO COMP FAMILIAR": "DT OMISSAO COMP FAMILIAR", "ENDERECO NAO EXISTE": "DT ENDERECO NAO EXISTE",
    "SEM CONTATO": "DT SEM CONTATO", "USUARIO NAO ENCONTRADO": "DT USUARIO NAO ENCONTRADO",
    "IMPOSSIBILIDADE DE VISITA DOMICILIAR": "DT IMPOSSIBILIDADE DE VISITA DOMICILIAR",
    "NEGATIVA NA PRESTACAO DE INFORMACAO": "DT NEGATIVA NA PRESTACAO DE INFORMACAO",
  };

  function visivel(el) { return !!el && el.getBoundingClientRect().width > 0; }
  // O formulário de campo está aberto quando o campo da seção 4 está visível na tela.
  function formularioAberto() { return visivel(document.getElementById("teInformacaoColetada")); }
  const MSG_ABRIR = "Disponível no final da entrevista, quando marcada como realizada em domicílio, ou ao registrar uma visita sem sucesso.";
  const txt = (v) => (v == null ? "" : String(v)).replace(/\s+/g, " ").trim();

  // Corta em 350 sem partir palavra.
  function limitar(s) {
    if (s.length <= MAX) return s;
    const c = s.slice(0, MAX);
    const i = c.lastIndexOf(" ");
    return (i > MAX * 0.6 ? c.slice(0, i) : c).trim();
  }

  function preencherTexto(el, valor) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, valor); // setter nativo: o framework da página só vê assim
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  async function consultar(col, valor) {
    const sel = COLS.map(encodeURIComponent).join(",");
    const url = `${VIEW}?${encodeURIComponent(col)}=eq.${encodeURIComponent(valor)}&select=${sel}`;
    const res = await fetch(url, { headers: { apikey: NILTON_KEY, Authorization: "Bearer " + NILTON_KEY } });
    if (!res.ok) throw new Error("base do app de visitas respondeu " + res.status);
    return res.json();
  }

  // Mesma regra do Monitor: registro ativo; sem ativo, o mais recente (visita concluída vai para o arquivo).
  function escolher(rows) {
    if (!rows || !rows.length) return null;
    return rows.find((r) => r.is_arquivado === false) ||
      rows.slice().sort((a, b) => new Date(b["DATA DE EDICAO"] || 0) - new Date(a["DATA DE EDICAO"] || 0))[0];
  }

  async function buscarRegistro() {
    if (typeof window.__visitaMontar !== "function") throw new Error("módulo de visita não carregado");
    const d = window.__visitaMontar(); // dados da família aberta (CPF do RF e código familiar)
    let rows = d.cpf ? await consultar("CPF RF", d.cpf) : [];
    if (!rows.length && d._familia) rows = await consultar("COD FAMILIAR", String(d._familia));
    return { registro: escolher(rows), cpf: d.cpf, nome: d.nome };
  }

  // Seção 4 = RELATO DO ENTREVISTADOR. A seção 5 (conclusões) fica em branco de propósito (decisão do Cristiano).
  function montarTextos(r) {
    const status = txt(r["STATUS"]).toUpperCase();
    return { status, secao4: limitar(txt(r["RELATO DO ENTREVISTADOR"])) };
  }

  // Último relato que o botão colocou no campo (para não confundir com texto digitado pelo entrevistador).
  let ultimoInserido = "";
  let hashAnterior = location.hash;
  // Ao trocar de tela/família: se o campo ainda tem o relato que inserimos, apaga; e esquece o texto lembrado.
  setInterval(() => {
    if (location.hash === hashAnterior) return;
    hashAnterior = location.hash;
    const el = document.getElementById("teInformacaoColetada");
    if (el && ultimoInserido && txt(el.value) === ultimoInserido) preencherTexto(el, "");
    ultimoInserido = "";
  }, 400);

  // Regras do Cristiano (18/11/2026): STATUS do app -> marcação da seção 3.
  // radio = botão da seção 3 (3.02.3 Outro(s) motivo(s) = idMotivoNaoRealizacaoEntrevista_6); texto = campo livre que o 3.02.3 abre (80 car.), se existir.
  // IMPOSSIBILIDADE DE VISITA DOMICILIAR e PENDENCIA ficam fora (nenhuma marcação).
  const norm = (v) => txt(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  function regraSecao3(status) {
    const s = norm(status);
    if (s === "VISITA REALIZADA") return { radio: "inEntrevistaRealizadaDisplay_1", rotulo: "3.01 Entrevista realizada" };
    if (s === "ENDERECO NAO EXISTE") return { radio: "idMotivoNaoRealizacaoEntrevista_1", rotulo: "3.02.1a Endereço inexistente" };
    if (s === "USUARIO NAO ENCONTRADO") return { radio: "idMotivoNaoRealizacaoEntrevista_3", rotulo: "3.02.2a RUF não localizado" };
    if (s.startsWith("NEGATIVA")) return { radio: "idMotivoNaoRealizacaoEntrevista_4", rotulo: "3.02.2b RUF recusou a prestar informação" };
    const outro = { "REQUER 2 VISITA": "REQUER 2º VISITA A ESTE DOMICILIO", "REQUER 3 VISITA": "REQUER 3º VISITA A ESTE DOMICILIO",
      "SEM CONTATO": "SEM CONTATO EM VISITA/TELEFONE" };
    const rot = "3.02.3 Outro(s) motivo(s)", radio = "idMotivoNaoRealizacaoEntrevista_6";
    if (outro[s]) return { radio, rotulo: rot, texto: outro[s] };
    if (s.startsWith("OMISSAO")) return { radio, rotulo: rot, texto: "USUARIO OMITIU A COMPOSIÇÃO FAMILIAR" };
    return null;
  }

  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  // Marca o radio da seção 3 e, no 3.02.3, escreve o motivo no campo livre que ele abrir. Nunca mexe em campo bloqueado nem troca marcação feita à mão.
  async function marcarSecao3(r) {
    const regra = regraSecao3(r["STATUS"]);
    if (!regra) return null;
    const res = (resultado) => ({ rotulo: regra.rotulo, resultado });
    const radio = document.getElementById(regra.radio);
    if (!radio) return res("campo não encontrado na tela");
    if (!radio.checked) {
      if (radio.disabled) return res("bloqueado pelo sistema (não alterado)");
      const outroMarcado = document.querySelector('input[id^="idMotivoNaoRealizacaoEntrevista_"]:checked');
      if (outroMarcado) return res("já há outro motivo marcado (mantido)");
      radio.click();
    } else if (!regra.texto) return res("já estava marcado");
    if (!regra.texto) return res("marcado");
    // campo livre que o 3.02.3 abre: primeiro campo de texto/área depois do radio, na ordem da página
    let campo = null;
    for (let i = 0; i < 10 && !campo; i++) {
      await esperar(200);
      campo = Array.from(document.querySelectorAll('input[type="text"], input:not([type]), textarea')).find((el) =>
        !el.disabled && visivel(el) && (radio.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        el.id !== "teInformacaoColetada" && el.id !== "teConclusao" && (el.maxLength === 80 || /qual|motivo/i.test(el.placeholder || "")));
    }
    if (!campo) return res("marcado, mas não apareceu campo de texto (escreva à mão: " + regra.texto + ")");
    if (txt(campo.value) && txt(campo.value) !== regra.texto) return res("marcado; o campo já tinha texto (mantido)");
    preencherTexto(campo, regra.texto);
    return res("marcado + \"" + regra.texto + "\" (campo " + (campo.id || "sem id") + ")");
  }

  // Padrão institucional (decisão do Cristiano, 18/11/2026): 7.04 telefone e 7.05 e-mail. Só preenche se estiver vazio.
  const TEL_PADRAO = "98992243596";
  const EMAIL_PADRAO = "strcsemcas@gmail.com";
  // 7.03 = "CRAS " + UTL do app (decisão do Cristiano, 19/11/2026). Corta lixo após vírgula (há UTL com e-mail colado); UTL vazia = não preenche.
  function unidadeDaUtl(r) {
    const u = txt(r["UTL"]).split(",")[0].trim();
    if (!u) return "";
    return /^CRAS\b/i.test(u) ? u : "CRAS " + u;
  }
  function preencherInstitucional(r) {
    const feitos = [];
    [["nmUnidadeReferenciada", unidadeDaUtl(r), "7.03 unidade"], ["nuTelefoneInstituicao", TEL_PADRAO, "7.04 telefone"], ["nmEmailInstituicao", EMAIL_PADRAO, "7.05 e-mail"]].forEach(([id, v, nome]) => {
      const el = document.getElementById(id);
      if (!v || !el || el.disabled || txt(el.value)) return;
      preencherTexto(el, v);
      feitos.push(nome);
    });
    return feitos;
  }

  // Seção 2 pela composição familiar do app: UNIPESSOAL -> 2.01; MULTIPESSOAL -> 2.02. Vazio/outro: nada.
  function marcarComposicao(r) {
    const c = norm(r["COMP FAMILIAR"]);
    const alvo = c === "UNIPESSOAL" ? ["inMotivoCadastroUnipessoal_true", "2.01 Família unipessoal"]
      : c === "MULTIPESSOAL" ? ["inMotivoCadastroQualificacao_true", "2.02 Qualificação cadastral"] : null;
    if (!alvo) return null;
    const cb = document.getElementById(alvo[0]);
    if (!cb) return alvo[1] + " - campo não encontrado";
    if (cb.checked) return alvo[1] + " - já estava marcado";
    if (cb.disabled) return alvo[1] + " - bloqueado pelo sistema (não alterado)";
    cb.click();
    return alvo[1] + " - marcado";
  }

  async function preencher(r) {
    if (!formularioAberto()) return { ok: false, msg: MSG_ABRIR };
    const t = montarTextos(r);
    if (t.status === "PENDENCIA" || !t.status) {
      return { ok: false, msg: "No app de visitas esta família ainda está PENDENTE (visita não registrada). Nada foi preenchido." };
    }
    const feitos = [], jaPreenchidos = [];
    [["teInformacaoColetada", t.secao4, "4"]].forEach(([id, valor, nome]) => {
      const el = document.getElementById(id);
      if (!valor) return;
      if (!el || el.disabled) return;
      // nunca sobrescreve texto digitado à mão; mas texto que NÓS inserimos antes (outra família) pode ser trocado
      if (txt(el.value) && txt(el.value) !== valor && txt(el.value) !== ultimoInserido) { jaPreenchidos.push(nome); return; }
      preencherTexto(el, valor);
      ultimoInserido = valor;
      feitos.push(nome);
    });
    const secao3 = await marcarSecao3(r);
    const composicao = marcarComposicao(r);
    const institucional = preencherInstitucional(r);
    return { ok: true, status: t.status, feitos, jaPreenchidos, semRelato: !t.secao4, secao3, composicao, institucional };
  }

  function aviso(texto, erro) {
    let t = document.getElementById("cu-fc-aviso");
    if (!t) { t = document.createElement("div"); t.id = "cu-fc-aviso"; document.documentElement.appendChild(t); }
    t.textContent = texto;
    t.className = erro ? "cu-fc-erro" : "";
    t.style.display = "block";
    clearTimeout(t._h);
    t._h = setTimeout(() => { t.style.display = "none"; }, erro ? 5000 : 10000); // vermelho: 5 s; verde (mais longo): 10 s
  }

  window.__cuAviso = aviso; // o botão Agendar visita (visita.js) reaproveita este aviso

  async function acao() {
    // Confere a tela antes de consultar a base.
    if (!formularioAberto()) { aviso(MSG_ABRIR, true); return; }
    aviso("Buscando o registro no app de visitas...");
    const { registro, nome } = await buscarRegistro();
    if (!registro) { aviso("Nenhum registro de visita encontrado no app de visitas para esta família" + (nome ? " (" + nome + ")" : "") + ". Nada foi preenchido.", true); return; }
    const r = await preencher(registro);
    if (!r.ok) { aviso(r.msg, true); return; }
    const sec4 = r.feitos.length ? "preenchida com o relato do app"
      : r.jaPreenchidos.length ? "já tinha texto, mantido"
      : r.semRelato ? "o app não tem relato" : "não alterada";
    const partes = ["App de visitas: " + r.status + ". Seção 4: " + sec4 + ". Seção 5 (conclusões): obrigatória, escreva você mesmo (só letras, números e espaços)."];
    if (r.composicao) partes.push("Composição: " + r.composicao + ".");
    if (r.secao3) partes.push("Marcação: " + r.secao3.rotulo + " - " + r.secao3.resultado + ".");
    if (r.institucional.length) partes.push("Preenchido: " + r.institucional.join(" e ") + " institucional.");
    partes.push("Confira e conclua você mesmo.");
    aviso(partes.join(" "));
  }

function barraBotoes(){var g=document.getElementById('cu-bar');if(!g){g=document.createElement('div');g.id='cu-bar';window.__cuBar=g;document.documentElement.appendChild(g);}return g;}
  function montarBotao() {
    if (document.getElementById("cu-fc-btn")) return;
    const b = document.createElement("div");
    b.id = "cu-fc-btn";
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>' +
      '<span class="cu-fc-txt">Formulário de campo</span>';
    // Só fica clicável com o formulário de campo visível; fora dele fica cinza (dica ao passar o mouse e aviso ao clicar).
    const estado = () => {
      // Fora das telas de família (ex.: login, pesquisa) o botão nem aparece, igual ao Agendar visita.
      b.style.display = /#\/familia\//.test(location.hash) ? "" : "none";
      const ok = formularioAberto();
      b.classList.toggle("cu-fc-off", !ok);
      b.title = ok ? "Preencher o formulário de campo com os dados do app de visitas" : MSG_ABRIR;
      const av = document.getElementById("cu-fc-aviso");
      // não deixa o aviso de sucesso antigo na tela quando o formulário fecha (o vermelho some sozinho em 5 s)
      if (!ok && av && av.style.display === "block" && !av.classList.contains("cu-fc-erro")) av.style.display = "none";
    };
    estado();
    setInterval(estado, 400);
    b.addEventListener("click", () => {
      acao().catch((e) => {
        aviso("Não foi possível preencher: " + (e && e.message ? e.message : e), true);
        console.error("[FormCampo] erro", e);
      });
    });
    barraBotoes().appendChild(b);
  }

  if (document.body) montarBotao();
  else document.addEventListener("DOMContentLoaded", montarBotao);
})();
