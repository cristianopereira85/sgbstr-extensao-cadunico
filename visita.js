// =================================================================
// AGENDAR VISITA (CadúnicoSLZ) - botão + painel do JotForm
// Origem: extensão "CadÚnico → JotForm" do Nilton. Diferença: em vez de
// ler a tela (XPath/DOM), usa as respostas da API que o interceptor.js já
// repassa via postMessage (mesmo canal que o sandbox.js usa pra gravar).
// Roda em document_start só pra ouvir as respostas desde o login; a
// interface é montada quando o <body> existir.
// =================================================================
(function () {
  if (window.__cuJfInjected) return;
  window.__cuJfInjected = true;

  const FORM_ID = "252954363471058";
  const FIELD_MAP = {
    nome: "nomeRf", cpf: "cpfRf", bolsaFamilia: "pbf", bpc: "bpc",
    endereco: "tipoLogradouro", referencia: "referencia", utl: "utl",
    telefone: "telefone", integrantes: "compFamiliar", localidade: "localidade",
    processo: "processo42", tsee: "tsee", transferencia: "transferencia",
    codigoFamiliar: "codFamiliar",
  };

  const UTL_MAP = {
    "CRAS TERRITORIO 1 CENTRO": "CENTRO",
    "CRAS TERRITORIO 2 BAIRRO DE FATIMA": "BAIRRO DE FATIMA",
    "CRAS TERRITORIO 3 COROADINHO": "COROADINHO",
    "CRAS TERRITORIO 4 LIBERDADE": "LIBERDADE",
    "CRAS TERRITORIO 5 SAO FRANCISCO": "SAO FRANCISCO",
    "CRAS TERRITORIO 6 ANIL": "ANIL",
    "CRAS TERRITORIO 7 BEQUIMAO": "BEQUIMAO",
    "CRAS TERRITORIO 8 COHAB": "COHAB",
    "CRAS TERRITORIO 9 TURU": "TURU",
    "CRAS TERRITORIO 10 VINHAIS": "VINHAIS",
    "CRAS TERRITORIO 11 ANJO DA GUARDA": "ANJO DA GUARDA",
    "CRAS TERRITORIO 12 ESTIVA": "ESTIVA",
    "CRAS TERRITORIO 13 MARACANA": "MARACANA",
    "CRAS TERRITORIO 14 VILA BACANGA": "BACANGA",
    "CRAS TERRITORIO 15 VILA NOVA": "VILA NOVA",
    "CRAS TERRITORIO 16 CIDADE OLIMPICA": "CID OLIMPICA",
    "CRAS TERRITORIO 17 CIDADE OPERARIA": "CID OPERARIA",
    "CRAS TERRITORIO 18 JANAINA": "JANAINA",
    "CRAS TERRITORIO 19 JOAO DE DEUS": "JOAO DE DEUS",
    "CRAS TERRITORIO 20 SAO RAIMUNDO": "SAO RAIMUNDO",
  };

  // ----- Respostas da API (alimentadas pelo interceptor.js) -----
  const ESTADO_CADASTRADO = "3";
  const dominios = {};        // categoria -> { codigo(text) -> label }
  const familias = {};        // numeroFamiliar(sem zero) -> { fam, prog, pend, rev, ave }
  let familiaAtual = null;

  function semZero(n) { return String(n || "").replace(/^0+/, ""); }
  function dado(n) { return (familias[n] = familias[n] || {}); }
  function numeroDaUrl(url, re) { const m = url.match(re); return m ? semZero(m[1]) : null; }

  function guardar(msg) {
    const url = msg.url || "";
    let json;
    if (msg.corpo === "") json = {};
    else { try { json = JSON.parse(msg.corpo); } catch (_) { return; } }
    if (json === null) return;

    if (/\/v1\/dominios(\?|$)/.test(url) && msg.status === 200 && typeof json === "object") {
      ["tipoLogradouro", "tituloLogradouro"].forEach((cat) => {
        if (!Array.isArray(json[cat])) return;
        dominios[cat] = {};
        json[cat].forEach((o) => { dominios[cat][String(o.value)] = o.label; });
      });
      return;
    }
    if (msg.status !== 200 && msg.status !== 204) return;

    let n = numeroDaUrl(url, /\/familias\/numero-familiar\/(\d+)/) ||
            numeroDaUrl(url, /\/familias\/buscar-atualizar-integracao\/(\d+)/);
    if (n && json.principal) {
      dado(n).fam = json;
      familiaAtual = n;
      atualizarEstado();
      return;
    }
    n = numeroDaUrl(url, /programas-sociais\?numeroFamiliar=(\d+)/);
    if (n) { dado(n).prog = json; return; }
    n = numeroDaUrl(url, /\/pendencias-ocorrencias\/familia\/(\d+)/);
    if (n) { dado(n).pend = json; return; }
    // Qualificação cadastral: o resumo chega ao abrir a família; o detalhe (com "situacao") só quando se clica na tela.
    n = numeroDaUrl(url, /buscarQualificacaoCadastral\?nuFamiliar=(\d+)/);
    if (n) { dado(n).qual = json; return; }
    const anoDaUrl = (u) => { const m = u.match(/anoNuGrupo=(\d+)/); return m ? m[1] : "?"; };
    n = numeroDaUrl(url, /buscarRevisaoCadastralFamilia\?nuFamiliar=(\d+)/);
    if (n) { (dado(n).revs = dado(n).revs || {})[anoDaUrl(url)] = json; return; }
    n = numeroDaUrl(url, /buscarAveriguacaoRendaFamilia\?nuFamiliar=(\d+)/);
    if (n) { (dado(n).aves = dado(n).aves || {})[anoDaUrl(url)] = json; return; }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.fonte !== "sgbstr-lab-rede") return;
    try { guardar(event.data); } catch (e) { console.error("[Visita] erro ao guardar resposta", e); }
  });

  // ----- Transformações -----
  function normalize(s) {
    return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toUpperCase().replace(/\s+/g, " ").trim();
  }
  function digitsOnly(s) { return (s || "").replace(/\D+/g, ""); }
  function alnumOnly(s) {
    return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }
  function mapUtl(s) {
    if (!s) return "";
    const key = normalize(s);
    if (UTL_MAP[key]) return UTL_MAP[key];
    const m = key.match(/CRAS TERRITORIO (\d+)\b/);
    if (m) {
      for (const k of Object.keys(UTL_MAP)) {
        if (new RegExp(`^CRAS TERRITORIO ${m[1]} `).test(k)) return UTL_MAP[k];
      }
    }
    return s.trim();
  }
  function rotulo(cat, codigo) {
    if (codigo == null || codigo === "") return "";
    return (dominios[cat] && dominios[cat][String(codigo)]) || "";
  }
  function hojeBr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function ehHoje(dataApi) {
    if (!dataApi) return false;
    const s = String(dataApi);
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}` === hojeBr();
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    return br ? `${br[3]}-${br[2]}-${br[1]}` === hojeBr() : false;
  }
  // Avatar só fica disponível quando a "DATA DE ATUALIZAÇÃO" da tela (principal.dataAlteracao) é hoje.
  // idTipoCondicaoCadastroFamilia 4 = cadastro ainda em preenchimento (não finalizado).
  const MSG_BLOQUEADO = "Atualize o cadastro hoje para agendar a visita";
  function liberado() {
    const f = familiaAtual && familias[familiaAtual] && familias[familiaAtual].fam;
    const p = f && f.principal;
    if (!p) return false;
    if (String(p.idTipoCondicaoCadastroFamilia) === "4") return false;
    return ehHoje(p.dataAlteracao);
  }
  function atualizarEstado() {
    const avatar = document.getElementById("cu-jf-avatar");
    const chip = document.getElementById("cu-jf-chip");
    const panel = document.getElementById("cu-jf-panel");
    if (!avatar) return;
    const ok = liberado();
    avatar.classList.toggle("cu-jf-off", !ok);
    avatar.title = ok ? "Agendar visita" : MSG_BLOQUEADO;
    if (chip) chip.textContent = ok ? "Liberado" : "Bloqueado";
    if (!ok && panel) panel.classList.remove("open");
  }
  function temConteudo(j) {
    if (j == null) return false;
    if (Array.isArray(j)) return j.length > 0;
    if (typeof j === "object") return Object.keys(j).length > 0;
    return true;
  }

  // Revisão (REV) e averiguação (AVE) só valem se forem do ano VIGENTE e estiverem PENDENTES (situacao 1 = regularizada).
  // Com o detalhe clicado na tela usa "situacao"; sem ele, cai no resumo (buscarQualificacaoCadastral).
  // Pendentes ao mesmo tempo = processo "AVE/REV".
  function qualificacaoPendente(d) {
    const r = { rev: false, ave: false, avisos: [] };
    const anoAtual = String(new Date().getFullYear());
    const pend = (j) => temConteudo(j) && String(j.situacao) !== "1";
    if (pend((d.revs || {})[anoAtual])) r.rev = true;
    if (pend((d.aves || {})[anoAtual])) r.ave = true;
    (Array.isArray(d.qual) ? d.qual : []).forEach((q) => {
      if (String(q.anoNuGrupo) !== anoAtual) return;
      const p = q.painelRendaQualificacao || {};
      const pessoasPend = Array.isArray(p.pessoas) && p.pessoas.some((x) => String(x.situacao) !== "1");
      if ((p.possuiAveriguacaoRenda || p.possuiAveriguacaoUnipessoal) && !(d.aves && d.aves[anoAtual]) && pessoasPend) r.ave = true;
      if (p.possuiRevisaoCadastral && !(d.revs && d.revs[anoAtual])) {
        r.rev = true;
        r.avisos.push(`Revisão cadastral ${anoAtual}: situação não confirmada, clique nela na tela para conferir`);
      }
    });
    if (!r.rev) r.avisos.length = 0;
    return r;
  }

  // ----- Montagem dos dados a partir da última família carregada -----
  function montar() {
    if (!familiaAtual || !familias[familiaAtual] || !familias[familiaAtual].fam) {
      throw new Error("abra uma família em Visualizar antes de capturar");
    }
    const d = familias[familiaAtual];
    const f = d.fam;
    const ic = f.identificacaoControle || {};
    const resp = f.responsavel || {};
    const pessoas = Array.isArray(f.dadosPessoais) ? f.dadosPessoais : [];
    const ativas = pessoas.filter((p) => {
      const e = p.identificacaoPessoa && p.identificacaoPessoa.idTipoEstadoCadastralMembro;
      return e == null || String(e) === ESTADO_CADASTRADO;
    });
    const rf = ativas.find((p) => p.identificacaoPessoa && Number(p.identificacaoPessoa.idRelacaoParentesco) === 1);
    const count = ativas.length;

    const numero = String(ic.numeroLogradouro || "").replace(/^0+/, "") || String(ic.numeroLogradouro || "");
    const tipo = rotulo("tipoLogradouro", ic.idTipoLogradouro);
    const titulo = rotulo("tituloLogradouro", ic.idTituloLogradouro);
    const endereco = [tipo, titulo, ic.nomeLogradouro, numero, ic.complementoNumeroLogradouro, ic.complementoAdicionalLogradouro]
      .map((s) => (s == null ? "" : String(s)).trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

    const prog = d.prog;
    // Espécies de benefício no CNIS: 87 = BPC pessoa com deficiência, 88 = BPC idoso.
    // Valem mesmo quando o programas-sociais diz que não tem BPC (CNIS é a fonte mais completa).
    const especies = new Set();
    ativas.forEach((p) => {
      const bs = p.rendasCnis && p.rendasCnis.rendasBeneficios && p.rendasCnis.rendasBeneficios.beneficios;
      if (!Array.isArray(bs)) return;
      bs.forEach((b) => {
        const e = b && b.especie;
        let cod = e && (e.codigo != null ? e.codigo : e.id);
        if (cod == null && e && e.descricao) {
          if (/PORTADORA DEFICIENCIA/i.test(normalize(e.descricao))) cod = 87;
          else if (/AMPARO SOCIAL AO IDOSO/i.test(normalize(e.descricao))) cod = 88;
        }
        if (cod != null) especies.add(Number(cod));
      });
    });
    const bpcCnis = especies.has(87) ? "BPC PCD" : especies.has(88) ? "BPC IDOSO" : "";

    let pbf = "", bpc = "", tsee = "", bpcEstimado = false, bpcSoCnis = false;
    if (prog !== undefined) {
      pbf = prog && prog.temBolsaFamilia ? "SIM" : "NAO";
      tsee = prog && prog.temTarifaSocialEnergiaEletrica ? "SIM" : "NAO";
      if (bpcCnis) {
        bpc = bpcCnis;
        bpcSoCnis = !(prog && prog.temBPC);
      } else if (prog && prog.temBPC) {
        // Sem espécie no CNIS: cai na regra do Nilton (alguém com deficiência) e avisa.
        const pcd = ativas.some((p) => p.deficiencia && String(p.deficiencia.pessoaTemDeficiencia) === "1");
        bpc = pcd ? "BPC PCD" : "BPC IDOSO";
        bpcEstimado = true;
      } else {
        bpc = "NAO";
      }
    }

    let transferencia = "";
    if (Array.isArray(d.pend && d.pend.pendenciasOcorrenciasFamilia)) {
      transferencia = d.pend.pendenciasOcorrenciasFamilia.some((o) =>
        /TRANSFERIDA PARA ESTE MUNICIPIO/.test(normalize(o && o.descricao))) ? "SIM" : "NAO";
    } else if (d.pend !== undefined) {
      transferencia = "NAO";
    }

    const q = qualificacaoPendente(d);
    let processo;
    if (q.ave && q.rev) processo = "AVE/REV";
    else if (q.ave) processo = "AVE";
    else if (q.rev) processo = "REV";
    else processo = ehHoje(f.principal && f.principal.dataCadastramento) ? "NOVO" : "ATUALIZACAO";

    const cpfRf = rf && rf.documento && rf.documento.numeroCpfPessoa;
    return {
      nome: rf ? (rf.identificacaoPessoa.nomeCompleto || "") : "",
      cpf: cpfRf ? digitsOnly(String(cpfRf)).padStart(11, "0") : "",
      bolsaFamilia: pbf,
      bpc,
      tsee,
      transferencia,
      endereco,
      localidade: ic.localidadeLogradouro || "",
      processo,
      referencia: alnumOnly(ic.nomeReferenciaLocalizacao || ""),
      utl: mapUtl(ic.nomeUnidadeTerritorialLocal || ""),
      telefone: digitsOnly(`${resp.numeroDddContato1Familia || ""}${resp.numeroTelefoneContato1Familia || ""}`),
      integrantes: count <= 1 ? "UNIPESSOAL" : "MULTIPESSOAL",
      codigoFamiliar: familiaAtual ? String(familiaAtual).padStart(11, "0") : "",
      _count: count,
      _familia: familiaAtual,
      _avisos: [
        !tipo && "tipo/título do logradouro sem tradução (domínios não carregados nesta sessão)",
        prog === undefined && "Bolsa Família/BPC/TSEE ainda não carregados (programas sociais)",
        d.pend === undefined && "transferência ainda não carregada (pendências/ocorrências)",
        bpcEstimado && "tipo do BPC estimado pela deficiência (sem benefício no CNIS)",
        bpcSoCnis && "BPC assumido pelo CNIS (programas sociais não marcou BPC)",
        !rf && "responsável familiar não localizado",
        ...q.avisos,
      ].filter(Boolean),
    };
  }

  window.__visitaMontar = montar; // depuração: no console, __visitaMontar()

  // ----- UI -----
  function montarUI() {
    if (document.getElementById("cu-jf-avatar")) return;
    // Botão "11E": bloco vertical com etiqueta de estado, ícone de calendário e texto
    const avatar = document.createElement("div");
    avatar.id = "cu-jf-avatar";
    avatar.title = "Agendar visita";
    avatar.innerHTML =
      '<span id="cu-jf-chip">Bloqueado</span>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>' +
      '<span class="cu-jf-txt">Agendar<br>visita</span>';

    const panel = document.createElement("div");
    panel.id = "cu-jf-panel";
    panel.innerHTML = `
      <div id="cu-jf-header">
        <span class="cu-jf-title">INSERÇÃO DE VISITAS DOMICILIARES</span>
        <button id="cu-jf-min" title="Minimizar">_</button>
        <button id="cu-jf-close" title="Fechar">×</button>
      </div>
      <div id="cu-jf-toolbar">
        <button id="cu-jf-capture">Capturar</button>
        <button id="cu-jf-clear" class="danger">Apagar</button>
        <span id="cu-jf-status">Pronto.</span>
      </div>
      <div id="cu-jf-frame-wrap">
        <iframe id="cu-jf-frame" src="https://form.jotform.com/${FORM_ID}" allow="geolocation; microphone; camera"></iframe>
      </div>
    `;
    document.documentElement.appendChild(avatar);
    document.documentElement.appendChild(panel);

    const abrir = () => {
      if (!liberado()) { atualizarEstado(); return; }
      panel.classList.toggle("open");
    };
    atualizarEstado();
    ultimoHash = null;
    setTimeout(aplicarRota, 0);
    avatar.addEventListener("click", abrir);
    panel.querySelector("#cu-jf-close").addEventListener("click", () => panel.classList.remove("open"));
    panel.querySelector("#cu-jf-min").addEventListener("click", () => panel.classList.remove("open"));

    const status = panel.querySelector("#cu-jf-status");
    const frame = panel.querySelector("#cu-jf-frame");

    panel.querySelector("#cu-jf-clear").addEventListener("click", () => {
      frame.src = `https://form.jotform.com/${FORM_ID}`;
      status.textContent = "Formulário limpo.";
    });
    panel.querySelector("#cu-jf-capture").addEventListener("click", () => {
      try {
        const data = montar();
        const params = new URLSearchParams();
        // UTL é escolhida pelo entrevistador que agenda: continua sendo calculada em montar(), mas não vai pro formulário
        Object.keys(FIELD_MAP).filter((k) => k !== "utl").forEach((k) => params.set(FIELD_MAP[k], data[k] || ""));
        const hash = data.cpf ? `#slzcpf=${data.cpf}` : "";
        frame.src = `https://form.jotform.com/${FORM_ID}?${params.toString()}${hash}`;
        status.textContent = data._avisos.length
          ? "Enviado, mas confira: " + data._avisos.join("; ")
          : "Dados enviados ao formulário. Revise e envie.";
      } catch (e) {
        status.textContent = "Não foi possível capturar: " + (e && e.message ? e.message : e);
        console.error("[Visita] erro ao capturar", e);
      }
    });
  }

  // Ao voltar para a tela de pesquisa: fecha a janelinha, apaga os dados e volta a ficar desativado até a próxima consulta.
  function limparConsulta() {
    familiaAtual = null;
    Object.keys(familias).forEach((k) => delete familias[k]);
    const panel = document.getElementById("cu-jf-panel");
    if (panel) {
      panel.classList.remove("open");
      panel.querySelector("#cu-jf-status").textContent = "Pronto.";
      const frame = panel.querySelector("#cu-jf-frame");
      const base = `https://form.jotform.com/${FORM_ID}`;
      if (frame.src !== base) frame.src = base;
    }
    atualizarEstado();
  }
  // O botão só aparece nas telas de família (#/familia/...). Fora da tela de visualizar, os dados da consulta anterior são apagados.
  let ultimoHash = null;
  function aplicarRota() {
    const h = location.hash || "";
    if (h === ultimoHash) return;
    ultimoHash = h;
    const avatar = document.getElementById("cu-jf-avatar");
    const naFamilia = /#\/familia\//.test(h);
    if (avatar) avatar.style.display = naFamilia ? "" : "none";
    if (!/#\/familia\/visualizar/.test(h)) limparConsulta();
    else atualizarEstado();
  }
  window.addEventListener("hashchange", aplicarRota);
  window.addEventListener("popstate", aplicarRota);
  setInterval(aplicarRota, 400);

  if (document.body) montarUI();
  else document.addEventListener("DOMContentLoaded", montarUI);
})();
