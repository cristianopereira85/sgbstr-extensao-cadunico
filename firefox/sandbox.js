// =================================================================
// LABORATÓRIO SGBSTR - VERSÃO 0.5.0 (+ VERSAO_EXTENSAO EM CADA CAPTURA)
// =================================================================

const SUPABASE_URL = 'https://vxinqteushefztszmhdb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4aW5xdGV1c2hlZnp0c3ptaGRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMTgzNjUsImV4cCI6MjA3NDU5NDM2NX0.I9lPwicVkLUmd9e_eRfK_gC0zLgbeRoYVIE2PxtoYDs';

// UUID gerado 1x por carregamento da extensão (1 por sessão de navegador).
// Amarra cada captura de dataprev_capturas a QUEM gerou ela sem depender de
// achar o v1/usuario/info "mais recente por horário" — com várias máquinas
// gravando ao mesmo tempo, "mais recente globalmente" pode vir da máquina
// errada. Ver "Captura de EDIÇÕES/atualizações" no CLAUDE.md.
const sessaoNavegador = crypto.randomUUID();

// ID persistente da MÁQUINA (diferente do sessaoNavegador acima, que
// reseta a cada reinício do navegador). Gerado 1x e salvo em
// chrome.storage.local, que sobrevive a reinícios/reboots — só reseta se
// a extensão for desinstalada/reinstalada ou os dados dela forem limpos.
// Não é hostname real (nenhuma API de extensão expõe isso, é bloqueio de
// privacidade do próprio navegador) — é o substituto prático de
// "identidade da máquina" pra detectar quando uma máquina para de gerar
// captura (extensão desativada, trocada, com defeito). Ver "Identificação
// de máquina" no CLAUDE.md.
let idMaquinaPromise = null;
async function obterIdMaquina() {
    if (idMaquinaPromise) return idMaquinaPromise;
    idMaquinaPromise = (async () => {
        const armazenado = await chrome.storage.local.get('idMaquina');
        if (armazenado.idMaquina) return armazenado.idMaquina;
        const novoId = crypto.randomUUID();
        await chrome.storage.local.set({ idMaquina: novoId });
        return novoId;
    })();
    return idMaquinaPromise;
}

// Fingerprint leve de navegador/SO, capturado 1x por carregamento — serve
// de "dupla verificação" pro idMaquina: se um idMaquina novo aparecer com
// o mesmo fingerprint de uma máquina já conhecida, é sinal de que a
// extensão foi reinstalada na MESMA máquina física, não que surgiu uma
// máquina nova de verdade.
const fingerprintNavegador = {
    userAgent: navigator.userAgent,
    plataforma: navigator.platform,
    idioma: navigator.language,
    tela: `${screen.width}x${screen.height}`
};

// config_maquina.json é gravado 1x pelo INSTALADOR (não pelo navegador)
// dentro da mesma pasta compartilhada de onde Chrome e Edge carregam a
// extensão descompactada — por isso o id_instalacao de dentro desse
// arquivo é IGUAL nos dois navegadores da mesma máquina física, ao
// contrário do idMaquina acima (que é gerado por chrome.storage.local,
// não compartilhado entre navegadores). Resolve na raiz o problema de
// "mesmo operador, navegador diferente, aparece como máquina nova" (ver
// CLAUDE.md, 20/08/2026). Se o arquivo não existir (máquina ainda não
// passou pela versão nova do instalador), os dois campos ficam null e
// nada muda no comportamento de hoje.
let configMaquinaPromise = null;
async function obterConfigMaquina() {
    if (configMaquinaPromise) return configMaquinaPromise;
    configMaquinaPromise = (async () => {
        try {
            const resposta = await fetch(chrome.runtime.getURL('config_maquina.json'), { cache: 'no-store' });
            if (!resposta.ok) return { idInstalacao: null, cras: null };
            const json = await resposta.json();
            return { idInstalacao: json.id_instalacao ?? null, cras: json.cras ?? null };
        } catch (erro) {
            return { idInstalacao: null, cras: null };
        }
    })();
    return configMaquinaPromise;
}

// =================================================================
// AVISO ÚNICO DE CRAS (20/08/2026) — cobre máquinas JÁ instaladas antes
// desta feature existir (config_maquina.json ainda sem CRAS, ou o
// arquivo nem existe). Diferente do instalador (que roda escondido, sem
// tela), este content script roda na própria página do Cadastro Único —
// onde tem certeza que uma pessoa está olhando — então é o lugar certo
// pra perguntar sem precisar visitar a máquina fisicamente.
// =================================================================
(async () => {
    try {
        const configMaquina = await obterConfigMaquina();
        if (configMaquina.cras) return; // já definido (arquivo ou resposta anterior) — nada a fazer

        const jaPerguntado = await chrome.storage.local.get('crasJaPerguntado');
        if (jaPerguntado.crasJaPerguntado) return; // já perguntado (e adiado) nesse navegador — não insiste a cada página

        const idMaquina = await obterIdMaquina();

        // confere se OUTRO navegador dessa MESMA máquina física (mesmo
        // id_instalacao) já respondeu — evita perguntar de novo no Edge se
        // já foi respondido no Chrome da mesma máquina.
        if (configMaquina.idInstalacao) {
            try {
                const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cras_conhecido_para_instalacao`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
                    body: JSON.stringify({ p_id_instalacao: configMaquina.idInstalacao })
                });
                const crasConhecido = resp.ok ? await resp.json() : null;
                if (crasConhecido) {
                    await chrome.storage.local.set({ crasJaPerguntado: true });
                    return;
                }
            } catch (erro) { /* sem resposta do servidor, segue e pergunta mesmo assim */ }
        }

        mostrarAvisoCras(idMaquina, configMaquina.idInstalacao);
    } catch (erro) {
        console.error('LAB: falha ao checar necessidade de perguntar CRAS', erro);
    }
})();

// Lista fechada de unidades reais (16/09/2026) — precisa bater com
// unidades_cras_validas no Supabase e com o menu numerado de
// configurar-auto-atualizacao.ps1. Antes disso o campo era texto livre
// sem validação nenhuma — foi assim que 5 máquinas ficaram com CRAS
// errado (Anil 6, Turu 5, Bacanga 6, Liberdade 8, Centro 11), todas sem
// id_instalacao (fora do config_maquina.json, ou Firefox — que nunca
// consegue ler esse arquivo). Nenhuma API de extensão lê essa tabela ao
// vivo, então precisa manter esta lista em sincronia manual.
const UNIDADES_CRAS = [
    'ANIL', 'ANJO DA GUARDA', 'BACANGA', 'BAIRRO DE FATIMA', 'BEQUIMAO', 'CENTRO',
    'CENTRO POP CENTRO', 'CENTRO POP COHAB', 'CIDADE OLIMPICA', 'CIDADE OPERARIA',
    'COHAB', 'COROADINHO', 'ESTIVA', 'JANAINA', 'JOAO DE DEUS', 'LIBERDADE',
    'MARACANA', 'SAO FRANCISCO', 'SAO RAIMUNDO', 'SEDE DA SEMCAS', 'TURU',
    'VILA NOVA', 'VINHAIS'
];

function mostrarAvisoCras(idMaquina, idInstalacao) {
    if (document.getElementById('sgbstr-lab-aviso-cras') || !document.body) return;

    // Moldura cobre a tela toda só pra centralizar a caixa, mas
    // pointer-events:none nela deixa clique passar direto pro sistema por
    // baixo — só a caixa em si (pointer-events:auto) intercepta clique.
    // Decisão do Cristiano (24/08/2026): maior e centralizado, mas sem
    // travar o atendimento por trás.
    const moldura = document.createElement('div');
    moldura.id = 'sgbstr-lab-aviso-cras';
    moldura.style.cssText = `
        position: fixed; inset: 0; z-index: 2147483647;
        display: flex; align-items: center; justify-content: center;
        pointer-events: none;
    `;

    const caixa = document.createElement('div');
    caixa.style.cssText = `
        pointer-events: auto; width: 320px;
        background: #171a21; color: #e6e8eb; border: 1px solid #323848;
        border-radius: 12px; padding: 22px 24px;
        font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
        font-size: 14px; box-shadow: 0 12px 40px rgba(0,0,0,0.5);
    `;
    // Lista fechada em vez de texto livre — só deixa confirmar escolhendo
    // um item real. "Tenho um código de acesso" só aparece quando a busca
    // não bate com nenhuma unidade (link discreto, não atrapalha o uso
    // normal) e libera um campo de nome livre pra máquina de TESTE (ex:
    // "Casa Cristiano") — validado no servidor via
    // validar_codigo_maquina_teste/nomear_maquina_teste; o código em si
    // nunca fica escrito aqui, mora só no Vault do Supabase.
    caixa.innerHTML = `
        <div style="font-size:12px; color:#8a8f99; font-weight:600; margin-bottom:10px;">Laboratório CadÚnico</div>
        <div style="font-size:17px; font-weight:700; margin-bottom:6px;">Em que CRAS você está?</div>
        <div style="font-size:12.5px; color:#8a8f99; margin-bottom:14px; line-height:1.5;">Preciso saber a unidade desta máquina pra contar certo na produção do dia. Escolha da lista abaixo.</div>
        <div style="position:relative;">
            <input id="sgbstr-lab-input-cras" type="text" placeholder="Digite pra buscar..." autocomplete="off"
                style="width:100%; box-sizing:border-box; padding:10px 11px; border-radius:6px; border:1px solid #323848; background:#0f1115; color:#e6e8eb; font-size:14px; margin-bottom:6px; outline:none;">
            <div id="sgbstr-lab-lista-cras" style="display:none; position:absolute; top:calc(100% + 2px); left:0; right:0; z-index:5; max-height:150px; overflow-y:auto; border-radius:8px; background:#0f1115; border:1px solid #323848; box-shadow:0 10px 24px rgba(0,0,0,.4);"></div>
        </div>
        <div id="sgbstr-lab-escolhido" style="display:none; align-items:center; gap:6px; font-size:11.5px; color:#7cd6a0; margin-bottom:6px;">✓ <span id="sgbstr-lab-escolhido-nome"></span> selecionado</div>
        <div id="sgbstr-lab-secreto-1" style="display:none; flex-direction:column; gap:6px; margin-bottom:8px;">
            <input id="sgbstr-lab-input-codigo" type="password" placeholder="Código de acesso" autocomplete="off"
                style="width:100%; box-sizing:border-box; padding:8px 10px; border-radius:6px; border:1px solid #323848; background:#0f1115; color:#e6e8eb; font-size:12.5px; outline:none;">
            <button id="sgbstr-lab-btn-validar-codigo" type="button" style="align-self:flex-start; background:none; border:1px solid #323848; color:#e6e8eb; font-size:11px; padding:5px 10px; border-radius:6px; cursor:pointer;">Validar código</button>
            <div id="sgbstr-lab-status-codigo" style="font-size:11px; min-height:14px;"></div>
        </div>
        <div id="sgbstr-lab-secreto-2" style="display:none; margin-bottom:8px;">
            <input id="sgbstr-lab-input-nome-livre" type="text" placeholder="Nome desta máquina (uso restrito)" autocomplete="off"
                style="width:100%; box-sizing:border-box; padding:9px 10px; border-radius:6px; border:1px solid #323848; background:#0f1115; color:#e6e8eb; font-size:13px; outline:none;">
        </div>
        <div id="sgbstr-lab-erro-cras" style="font-size:11.5px; color:#ff6b6b; min-height:14px; margin-bottom:6px;"></div>
        <button id="sgbstr-lab-btn-confirmar" disabled style="width:100%; background:#4a9eff; border:none; color:#071018; font-weight:700; font-size:13.5px; border-radius:7px; padding:10px 12px; cursor:pointer; opacity:.5;">Confirmar</button>
    `;
    moldura.appendChild(caixa);
    document.body.appendChild(moldura);

    const input = document.getElementById('sgbstr-lab-input-cras');
    const lista = document.getElementById('sgbstr-lab-lista-cras');
    const escolhidoBox = document.getElementById('sgbstr-lab-escolhido');
    const escolhidoNome = document.getElementById('sgbstr-lab-escolhido-nome');
    const secreto1 = document.getElementById('sgbstr-lab-secreto-1');
    const secreto2 = document.getElementById('sgbstr-lab-secreto-2');
    const inputCodigo = document.getElementById('sgbstr-lab-input-codigo');
    const btnValidarCodigo = document.getElementById('sgbstr-lab-btn-validar-codigo');
    const statusCodigo = document.getElementById('sgbstr-lab-status-codigo');
    const inputNomeLivre = document.getElementById('sgbstr-lab-input-nome-livre');
    const erroEl = document.getElementById('sgbstr-lab-erro-cras');
    const btnConfirmar = document.getElementById('sgbstr-lab-btn-confirmar');
    const remover = () => moldura.remove();

    let valorEscolhido = null;
    let codigoValidado = null; // só setado depois de validar_codigo_maquina_teste responder true

    const habilitarConfirmar = (v) => {
        btnConfirmar.disabled = !v;
        btnConfirmar.style.opacity = v ? '1' : '.5';
    };

    const esconderSegredo = () => {
        secreto1.style.display = 'none';
        secreto2.style.display = 'none';
        inputCodigo.value = '';
        statusCodigo.textContent = '';
        codigoValidado = null;
    };

    const renderLista = (filtro) => {
        const termo = filtro.toUpperCase();
        lista.innerHTML = '';
        if (!termo) { lista.style.display = 'none'; esconderSegredo(); return; }
        const matches = UNIDADES_CRAS.filter((c) => c.indexOf(termo) !== -1);
        if (matches.length === 0) {
            const vazio = document.createElement('div');
            vazio.style.cssText = 'padding:9px 11px 4px; font-size:12px; color:#8a8f99; font-style:italic;';
            vazio.textContent = 'Nenhuma unidade encontrada.';
            const linkSegredo = document.createElement('button');
            linkSegredo.type = 'button';
            linkSegredo.textContent = 'Tenho um código de acesso';
            linkSegredo.style.cssText = 'display:block; width:100%; text-align:left; background:none; border:none; padding:2px 11px 9px; font-size:11px; color:#5b8fd6; cursor:pointer; text-decoration:underline;';
            linkSegredo.addEventListener('click', () => {
                lista.style.display = 'none';
                secreto1.style.display = 'flex';
                inputCodigo.focus();
            });
            lista.appendChild(vazio);
            lista.appendChild(linkSegredo);
            lista.style.display = 'block';
            return;
        }
        esconderSegredo();
        matches.forEach((c) => {
            const opt = document.createElement('div');
            opt.textContent = c;
            opt.style.cssText = 'padding:8px 11px; font-size:12.5px; cursor:pointer; color:#e6e8eb;';
            opt.addEventListener('mouseenter', () => { opt.style.background = 'rgba(74,158,255,.16)'; });
            opt.addEventListener('mouseleave', () => { opt.style.background = 'transparent'; });
            opt.addEventListener('click', () => {
                input.value = c;
                valorEscolhido = c;
                lista.style.display = 'none';
                escolhidoBox.style.display = 'flex';
                escolhidoNome.textContent = c;
                habilitarConfirmar(true);
                erroEl.textContent = '';
            });
            lista.appendChild(opt);
        });
        lista.style.display = 'block';
    };

    input.addEventListener('input', () => {
        valorEscolhido = null;
        habilitarConfirmar(false);
        escolhidoBox.style.display = 'none';
        erroEl.textContent = '';
        renderLista(input.value.trim());
    });
    input.addEventListener('focus', () => { if (input.value.trim()) renderLista(input.value.trim()); });
    document.addEventListener('click', (e) => {
        if (e.target !== input && !lista.contains(e.target)) lista.style.display = 'none';
    });

    btnValidarCodigo.addEventListener('click', async () => {
        const codigo = inputCodigo.value.trim();
        if (!codigo) { statusCodigo.textContent = 'Digite o código.'; statusCodigo.style.color = '#ff6b6b'; return; }
        statusCodigo.textContent = 'Verificando…';
        statusCodigo.style.color = '#8a8f99';
        btnValidarCodigo.disabled = true;
        try {
            const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/validar_codigo_maquina_teste`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
                body: JSON.stringify({ p_codigo: codigo })
            });
            const valido = resp.ok ? await resp.json() : false;
            btnValidarCodigo.disabled = false;
            if (valido) {
                codigoValidado = codigo;
                statusCodigo.textContent = 'Código válido ✓';
                statusCodigo.style.color = '#7cd6a0';
                secreto1.style.display = 'none';
                secreto2.style.display = 'block';
                inputNomeLivre.focus();
                habilitarConfirmar(true);
                erroEl.textContent = '';
            } else {
                statusCodigo.textContent = 'Código inválido.';
                statusCodigo.style.color = '#ff6b6b';
            }
        } catch (erro) {
            btnValidarCodigo.disabled = false;
            statusCodigo.textContent = 'Sem resposta do servidor — tente de novo.';
            statusCodigo.style.color = '#ff6b6b';
        }
    });
    inputCodigo.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnValidarCodigo.click(); });

    // Sem botão "Depois": só fecha escolhendo uma unidade real (ou
    // validando o código de acesso) — volta a aparecer em toda navegação
    // até alguém responder.
    const confirmar = async () => {
        if (codigoValidado && secreto2.style.display !== 'none') {
            const nomeLivre = inputNomeLivre.value.trim();
            if (!nomeLivre) {
                erroEl.textContent = 'Digite um nome pra essa máquina.';
                inputNomeLivre.focus();
                return;
            }
            try {
                const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/nomear_maquina_teste`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
                    body: JSON.stringify({ p_id_maquina: idMaquina, p_id_instalacao: idInstalacao, p_codigo: codigoValidado, p_nome: nomeLivre })
                });
                const gravou = resp.ok ? await resp.json() : false;
                if (!gravou) {
                    erroEl.textContent = 'Não deu pra gravar — confira o código e tente de novo.';
                    return;
                }
                await chrome.storage.local.set({ crasJaPerguntado: true });
                console.log(`LAB: máquina de teste nomeada via código de acesso -> ${nomeLivre}`);
            } catch (erro) {
                console.error('LAB: falha ao nomear máquina de teste', erro);
                erroEl.textContent = 'Sem resposta do servidor — tente de novo.';
                return;
            }
            remover();
            return;
        }

        if (!valorEscolhido) {
            erroEl.textContent = 'Escolha uma unidade da lista.';
            return;
        }
        try {
            await fetch(`${SUPABASE_URL}/rest/v1/rpc/informar_cras_maquina`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
                body: JSON.stringify({ p_id_maquina: idMaquina, p_id_instalacao: idInstalacao, p_cras: valorEscolhido })
            });
            await chrome.storage.local.set({ crasJaPerguntado: true });
            console.log(`LAB: CRAS informado via aviso no navegador -> ${valorEscolhido}`);
        } catch (erro) {
            console.error('LAB: falha ao informar CRAS', erro);
        }
        remover();
    };
    btnConfirmar.addEventListener('click', confirmar);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && valorEscolhido) confirmar(); });
}

// =================================================================
// VIGIA DO MONITOR (28/08/2026) — mostra um aviso na própria tela do
// Cadastro Único quando o background.js detecta que a extensão irmã
// "Monitor CadÚnico - SEMCAS" foi desativada, com botão de reativação
// em 1 clique (Chrome/Edge) ou instrução manual (Firefox — ver
// comentário em background.js: management.setEnabled() lá só funciona
// pra temas). Mesmo estilo visual do "Aviso de CRAS" acima (tema escuro,
// moldura full-screen pointer-events:none, só a caixa intercepta clique).
// =================================================================
function removerAvisoMonitor() {
    const existente = document.getElementById('sgbstr-lab-aviso-monitor');
    if (existente) existente.remove();
}

function mostrarAvisoMonitorDesativado(status) {
    if (document.getElementById('sgbstr-lab-aviso-monitor') || !document.body) return;

    const moldura = document.createElement('div');
    moldura.id = 'sgbstr-lab-aviso-monitor';
    moldura.style.cssText = `
        position: fixed; inset: 0; z-index: 2147483647;
        display: flex; align-items: flex-start; justify-content: center;
        pointer-events: none; padding-top: 24px;
    `;

    const caixa = document.createElement('div');
    caixa.style.cssText = `
        pointer-events: auto; max-width: 480px;
        background: #171a21; color: #e6e8eb; border: 1px solid #323848;
        border-radius: 10px; padding: 18px 22px;
        font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
        font-size: 13px; box-shadow: 0 12px 40px rgba(0,0,0,0.5); text-align: left;
    `;

    const podeReativarSozinho = status.podeReativarSozinho !== false;
    caixa.innerHTML = `
        <div style="font-size:15px;font-weight:700;margin-bottom:6px;">⚠️ Extensão Monitor CadÚnico desativada</div>
        <div style="font-size:13px;line-height:1.4;margin-bottom:12px;color:#c7ccd6;">
            ${podeReativarSozinho
                ? 'A extensão Monitor CadÚnico - SEMCAS foi desativada. Reative pra manter os alertas de pendências, consulta de PBF/CNPJ e o registro de produtividade funcionando.'
                : 'A extensão Monitor CadÚnico - SEMCAS foi desativada. No Firefox não dá pra reativar por aqui — abra "about:addons" (menu ≡ → Extensões e temas), ache "Monitor CadÚnico - SEMCAS" e ative manualmente.'}
        </div>
        ${podeReativarSozinho ? `<button id="sgbstr-lab-btn-reativar-monitor" style="
            width:100%; padding:10px; border:none; border-radius:7px;
            background:#4a9eff; color:#071018; font-weight:700; cursor:pointer; font-size:13.5px;
        ">Reativar agora</button>` : ''}
    `;

    moldura.appendChild(caixa);
    document.body.appendChild(moldura);

    if (podeReativarSozinho) {
        document.getElementById('sgbstr-lab-btn-reativar-monitor').addEventListener('click', (e) => {
            e.target.textContent = 'Aguardando confirmação do navegador…';
            e.target.disabled = true;
            chrome.runtime.sendMessage({ action: 'reativarMonitor', id: status.id }, (novoStatus) => {
                if (novoStatus && novoStatus.ativa) {
                    removerAvisoMonitor();
                } else {
                    e.target.textContent = 'Reativar agora';
                    e.target.disabled = false;
                }
            });
        });
    }
}

// =================================================================
// AVISO DE EXTENSÃO AUSENTE (11/09/2026) — diferente do "desativada"
// acima (que o Laboratório resolve sozinho via chrome.management, com
// confirmação nativa), não existe NENHUMA API de navegador que permita
// uma extensão instalar outra — bloqueio de segurança proposital do
// Chromium, sem contorno possível. Mas instalar o MONITOR de novo (esse
// aviso é só pro caso "Monitor ausente" — o inverso, "Laboratório
// ausente", é sideload/unpacked, bem mais manual, sem link de 1-clique)
// é fácil: ele é publicado na Chrome Web Store (funciona também no Edge,
// que aceita extensões da CWS) e tem .xpi assinado no Firefox — dá pra
// dar o link direto em vez de só pedir pra avisar a gestão. Registrado
// em avisos_extensao_ausente (throttle de 1x/dia por navegador) pra dar
// visibilidade de quem já viu o aviso e o Monitor continua faltando.
// =================================================================
const LINK_MONITOR_CHROME_WEBSTORE = 'https://chromewebstore.google.com/detail/monitor-cad%C3%BAnico-semcas/fekcbjgeoimacbdhljmkklfhlapejamn';
const LINK_MONITOR_FIREFOX_XPI = 'https://vxinqteushefztszmhdb.supabase.co/storage/v1/object/public/Extensao%20Cadunico%20Firefox/53e2473cbd4f4a4c96e8-1.8.4.xpi';

function detectarNavegadorInstalacao() {
    const ua = navigator.userAgent || '';
    if (/Firefox\//.test(ua)) return 'firefox';
    if (/Edg\//.test(ua)) return 'edge'; // tem que vir ANTES do teste de Chrome — UA do Edge também contém "Chrome/"
    return 'chrome';
}

// Injeta 1x a keyframe do ícone piscando — banner é criado/removido várias
// vezes (a cada checagem de 2min), mas a <style> só precisa existir 1x na
// página.
function garantirEstiloPiscarAlerta() {
    if (document.getElementById('sgbstr-lab-estilo-piscar')) return;
    const estilo = document.createElement('style');
    estilo.id = 'sgbstr-lab-estilo-piscar';
    estilo.textContent = `@keyframes sgbstrPiscarAlerta { 0%, 100% { opacity: 1; } 50% { opacity: 0.15; } }`;
    document.head.appendChild(estilo);
}

function mostrarAvisoMonitorAusente() {
    if (document.getElementById('sgbstr-lab-aviso-monitor') || !document.body) return;
    garantirEstiloPiscarAlerta();

    // Centralizado na tela (não só no topo) e com ícone piscando —
    // pedido do Cristiano (11/09/2026): esse aviso precisa ser bem mais
    // chamativo que o de "desativada" acima. Diferente daquele, este AGORA
    // tem um botão de ação (instalar o Monitor de novo) — mas o clique
    // final ("Usar no Chrome"/"Adicionar", ou a confirmação do Firefox)
    // ainda depende do operador, por isso a instrução deixa claro o que
    // fazer depois de abrir o link, e mantém "avise a gestão" como saída
    // de reserva pra quem não conseguir sozinho (política do órgão pode
    // bloquear instalação de extensão em algumas máquinas).
    const navegador = detectarNavegadorInstalacao();
    const config = {
        chrome: {
            link: LINK_MONITOR_CHROME_WEBSTORE,
            botao: 'Abrir a Chrome Web Store',
            instrucao: 'Clique no botão abaixo. Na página que abrir, clique em <b>"Usar no Chrome"</b> (ou "Adicionar ao Chrome") pra instalar.'
        },
        edge: {
            link: LINK_MONITOR_CHROME_WEBSTORE,
            botao: 'Abrir a página da extensão',
            instrucao: 'Clique no botão abaixo. O Edge pode pedir uma permissão extra ("Permitir extensões de outras lojas") antes de mostrar o botão de instalar — confirme e clique nele.'
        },
        firefox: {
            link: LINK_MONITOR_FIREFOX_XPI,
            botao: 'Instalar o Monitor agora',
            instrucao: 'Clique no botão abaixo — o Firefox já reconhece o arquivo e vai perguntar se quer instalar. É só confirmar.'
        }
    }[navegador];

    const moldura = document.createElement('div');
    moldura.id = 'sgbstr-lab-aviso-monitor';
    moldura.style.cssText = `
        position: fixed; inset: 0; z-index: 2147483647;
        display: flex; align-items: center; justify-content: center;
        pointer-events: none;
    `;

    const caixa = document.createElement('div');
    // max-height + overflow-y ficam como rede de segurança (nunca custa
    // nada e cobre qualquer tela/zoom fora do comum), mas a decisão de
    // 12/09/2026 foi trocar a lista de 5 itens por 1 parágrafo só — a
    // maioria dos operadores não ia rolar pra baixo pra achar o botão de
    // instalar, então melhor um texto mais curto que cabe inteiro sem
    // precisar de scroll na maioria das telas.
    caixa.style.cssText = `
        pointer-events: auto; max-width: 460px; max-height: 90vh; overflow-y: auto;
        background: #171a21; color: #e6e8eb; border: 2px solid #ffd23f;
        border-radius: 12px; padding: 26px 28px;
        font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
        font-size: 14px; box-shadow: 0 16px 48px rgba(0,0,0,0.6); text-align: center;
        box-sizing: border-box;
    `;
    caixa.innerHTML = `
        <div style="font-size:40px; line-height:1; animation: sgbstrPiscarAlerta 1s ease-in-out infinite; margin-bottom:10px;">⚠️</div>
        <div style="font-size:17px;font-weight:700;margin-bottom:10px;">Extensão Monitor CadÚnico não está instalada</div>
        <div style="font-size:13.5px;line-height:1.5;color:#e6e8eb;text-align:left;margin-bottom:12px;">
            Sabia que sem o Monitor você não vê a visita do APP de Visitas, o status do Bolsa Família,
            os prazos de Revisão/Averiguação nem os avisos de SICON e Integração de Dados? Tudo isso
            aparece direto na tela, só com ele instalado.
        </div>
        <div style="font-size:13.5px;line-height:1.5;color:#93989f;text-align:left;margin-bottom:16px;">
            ${config.instrucao}
        </div>
        <a href="${config.link}" target="_blank" rel="noopener" style="
            display:block; width:100%; box-sizing:border-box; padding:11px; border-radius:8px;
            background:#4a9eff; color:#071018; font-weight:700; font-size:13.5px;
            text-decoration:none; text-align:center; margin-bottom:12px;
        ">${config.botao}</a>
        <div style="font-size:12px;line-height:1.4;color:#8a8f99;text-align:left;">
            Não conseguiu instalar sozinho? Avise a gestão do Cadastro Único (Nilton ou Cristiano).
        </div>
    `;

    moldura.appendChild(caixa);
    document.body.appendChild(moldura);
}

// Throttle de 1 registro/dia por navegador, pra não encher a tabela a cada
// checagem de 2min do background.js — só interessa saber que o operador
// já viu o aviso naquele dia, não quantas vezes a página recarregou.
async function registrarAvisoMonitorAusenteSeNecessario() {
    const CHAVE = 'ultimoRegistroAvisoMonitorAusente';
    const hoje = new Date().toISOString().slice(0, 10);
    const dados = await chrome.storage.local.get(CHAVE);
    if (dados[CHAVE] === hoje) return; // já registrado hoje

    try {
        const idMaquina = await obterIdMaquina();
        const configMaquina = await obterConfigMaquina();
        await fetch(`${SUPABASE_URL}/rest/v1/avisos_extensao_ausente`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
            body: JSON.stringify({
                extensao_que_avisou: 'laboratorio',
                extensao_ausente: 'monitor',
                sessao_navegador: sessaoNavegador,
                id_maquina: idMaquina,
                id_instalacao: configMaquina.idInstalacao,
                cras_config: configMaquina.cras
            })
        });
        await chrome.storage.local.set({ [CHAVE]: hoje });
        console.log('LAB: aviso de Monitor ausente registrado (1x/dia)');
    } catch (erro) {
        console.error('LAB: falha ao registrar aviso de Monitor ausente', erro);
    }
}

function checarEAtualizarAvisoMonitor() {
    chrome.storage.local.get('statusMonitor', (dados) => {
        const status = dados.statusMonitor;
        if (status && status.encontrada && status.ativa === false) {
            mostrarAvisoMonitorDesativado(status);
        } else if (status && status.encontrada === false) {
            mostrarAvisoMonitorAusente();
            registrarAvisoMonitorAusenteSeNecessario();
        } else {
            removerAvisoMonitor();
        }
    });
}

checarEAtualizarAvisoMonitor();
if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.statusMonitor) {
            checarEAtualizarAvisoMonitor();
        }
    });
}

let idAtendimentoAtual = null;
let bloqueioCaptura = false; 
let tempoInicio = Date.now();
let dadosColetados = { 
    blocos: new Set(), 
    alertas: new Set(), 
    membros: [] 
};

// 1. MONITOR DE TELA (OBSERVADOR)
const observer = new MutationObserver(() => {
    if (window.location.hash.includes('/visualizar') && !idAtendimentoAtual && !bloqueioCaptura) {
        bloqueioCaptura = true;
        console.log("LAB 0.1.9: Iniciando Deep Scanner...");
        setTimeout(iniciarCaptura, 4000); 
    }
    mapearBotoesNavegacao();
    capturarAlertasProfundos();
});

observer.observe(document.body, { childList: true, subtree: true });

// 2. FUNÇÃO DE EXTRAÇÃO (SCANNER DE VARREDURA)
async function iniciarCaptura() {
    let codFam = "";
    const elementos = Array.from(document.querySelectorAll('span, p, div, b, strong, h4'));
    const alvo = elementos.find(el => el.innerText.includes('Código Familiar') && /\d+/.test(el.innerText));
    
    if (alvo) {
        codFam = alvo.innerText.replace(/\D/g, '');
    } else {
        const todosNumeros = document.body.innerText.match(/\d{11}/g);
        if (todosNumeros) codFam = todosNumeros[0]; 
    }

    const nomeOp = document.querySelector('.text-weight-bold')?.innerText.split('-')[0].trim() || "OP_DESCONHECIDO";
    
    const membros = [];
    document.querySelectorAll('[class*="MembroFamilia_panel"]').forEach(card => {
        const nomeEl = card.querySelector('[id^="idNomePessoa"]') || card.querySelector('[class*="MembroFamilia_name"]');
        const nomeBruto = nomeEl ? nomeEl.innerText.trim() : "";
        const nomeLimpo = nomeBruto.replace(/^\d+\.\s*/, ''); 

        const cpfEl = card.querySelector('[id^="idCpf"]');
        const cpf = cpfEl ? cpfEl.innerText.replace(/\D/g, '').substring(0, 11) : "";

        const nisEl = card.querySelector('[id^="idNis"]');
        const nis = nisEl ? nisEl.innerText.replace(/\D/g, '') : "";

        const parentesco = card.querySelector('[class*="MembroFamilia_mainData"]')?.innerText.replace(nomeBruto, '').replace('\n', '').trim();
        const status = card.querySelector('[class*="MembroFamilia_tag"]')?.innerText.trim();

        if (nomeLimpo && (cpf || nis)) {
            membros.push({ nome: nomeLimpo, cpf, nis, parentesco, status });
        }
    });

    if (membros.length === 0) {
        bloqueioCaptura = false;
        return;
    }

    dadosColetados.membros = membros;

    const payload = {
        nome_operador: nomeOp,
        codigo_familiar: codFam || "NÃO LOCALIZADO",
        cpf_rf_real: membros[0]?.cpf || "NÃO LOCALIZADO",
        lista_membros_real: membros,
        acao_fluxo: 'CONSULTA',
        status_final: 'ABERTO'
    };

    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/atendimentos_laboratorio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=representation' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data[0]) {
            idAtendimentoAtual = data[0].id;
            console.log("✅ LAB 0.1.9: Registro Criado!", idAtendimentoAtual);
            setInterval(heartbeatSync, 10000);
        }
    } catch (err) {
        console.error("❌ LAB Erro:", err);
        bloqueioCaptura = false;
    }
}

// 3. CAPTURA PROFUNDA DE ALERTAS (DENTRO DAS DIVS)
function capturarAlertasProfundos() {
    // Captura alertas clássicos (vermelhos/amarelos)
    const seletoresAlerta = '.text-negative, .text-warning, .q-notification, .MembroFamilia_accordionDetails__2f1kw, [style*="rgb(251, 189, 8)"]';
    
    document.querySelectorAll(seletoresAlerta).forEach(a => {
        const msg = a.innerText.trim();
        // Filtra para não pegar textos vazios ou padrões genéricos
        if (msg.length > 8 && !msg.includes("Nenhuma pendência") && !msg.includes("Nenhuma ocorrência")) {
            if (!dadosColetados.alertas.has(msg)) {
                dadosColetados.alertas.add(msg);
                console.log("LAB: Novo alerta/pendência capturado:", msg);
            }
        }
    });
}

// 4. HEARTBEAT E NAVEGAÇÃO
async function heartbeatSync() {
    if (!idAtendimentoAtual) return;
    fetch(`${SUPABASE_URL}/rest/v1/atendimentos_laboratorio?id=eq.${idAtendimentoAtual}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({
            blocos_visitados: Array.from(dadosColetados.blocos),
            alertas_identificados: Array.from(dadosColetados.alertas)
        })
    });
}

function mapearBotoesNavegacao() {
    document.querySelectorAll('.q-tab, .q-item, button, .br-button, [role="button"]').forEach(el => {
        if (!el.dataset.monitorado) {
            el.addEventListener('click', () => {
                const texto = el.innerText.trim().split('\n')[0];
                if (texto.length > 1 && texto.length < 60) {
                    dadosColetados.blocos.add(texto);
                }
            });
            el.dataset.monitorado = "true";
        }
    });
}

// 5. DETECÇÃO DE AÇÃO (FILTRO RIGOROSO POR TAG E ID)
document.addEventListener('click', (e) => {
    const target = e.target.closest('button, div[id*="Familia"], #finalizarbtn');
    if (!target) return;

    const id = target.id || "";
    const txt = target.innerText?.toUpperCase() || "";

    // Só muda o status se for um clique REAL em botões de comando
    if (id === 'alterarFamilia' || (target.tagName === 'BUTTON' && txt.includes('ALTERAR'))) {
        console.log("LAB: Status -> ALTERACAO");
        atualizarAcaoFluxo('ALTERACAO');
    } 
    else if (id === 'abrirIncluirFamilia' || (target.tagName === 'BUTTON' && txt.includes('INCLUIR'))) {
        console.log("LAB: Status -> INCLUSAO");
        atualizarAcaoFluxo('INCLUSAO');
    }
    else if (id === 'excluirFamilia') {
        atualizarAcaoFluxo('EXCLUSAO');
    }
    else if (id === 'finalizarbtn' || (target.tagName === 'BUTTON' && txt.includes('FINALIZAR'))) {
        finalizarAtendimento('CONCLUIDO');
    }
});

async function atualizarAcaoFluxo(novaAcao) {
    if (!idAtendimentoAtual) return;
    await fetch(`${SUPABASE_URL}/rest/v1/atendimentos_laboratorio?id=eq.${idAtendimentoAtual}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ acao_fluxo: novaAcao })
    });
}

async function finalizarAtendimento(statusFinal = 'ABANDONADO') {
    if (!idAtendimentoAtual) return;
    const tempoTotal = Math.floor((Date.now() - tempoInicio) / 1000);
    await fetch(`${SUPABASE_URL}/rest/v1/atendimentos_laboratorio?id=eq.${idAtendimentoAtual}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({
            status_final: statusFinal,
            blocos_visitados: Array.from(dadosColetados.blocos),
            alertas_identificados: Array.from(dadosColetados.alertas),
            tempo_permanencia_segundos: tempoTotal
        })
    });
    idAtendimentoAtual = null;
    bloqueioCaptura = false;
    tempoInicio = Date.now();
    dadosColetados = { blocos: new Set(), alertas: new Set(), membros: [] };
}

window.addEventListener('hashchange', () => {
    if (!window.location.hash.includes('/visualizar') && idAtendimentoAtual) {
        finalizarAtendimento('SAIU_DA_TELA');
    }
});

// =================================================================
// 6. CAPTURA BRUTA DE REDE (recebe do interceptor.js via postMessage
// e grava a resposta JSON completa da API do Cadastro Único)
// =================================================================

// Extrai o número familiar da URL por padrões conhecidos (path/query),
// não por contagem de dígitos — código familiar varia de 8 a 10+ dígitos
// dependendo da família, e um regex genérico tipo \d{9,11} deixa passar
// famílias de 8 dígitos e pode colidir com outros números na URL (ex:
// código IBGE do município, idPrefeitura). Fallback genérico só entra se
// nenhum padrão nomeado bater.
function extrairNumeroFamiliar(url) {
    const padroesNomeados = [
        /numero-familiar\/(\d+)/,
        /pessoas-transferidas\/(\d+)/,
        /familia\/(\d+)/,
        /[?&](?:numeroFamiliar|nuFamiliar)=(\d+)/
    ];
    for (const padrao of padroesNomeados) {
        const m = url.match(padrao);
        if (m) return m[1];
    }
    // Busca por CPF (ex: v1/familias?tipoBusca=1&cpf=...) pode retornar
    // várias famílias diferentes pro mesmo CPF (histórico entre municípios)
    // — não tem um único numero_familiar pra essa captura, e o CPF não é
    // número de família. Sem essa exclusão, o fallback genérico abaixo
    // pegaria o CPF e gravaria errado como se fosse numero_familiar.
    if (/[?&]cpf=\d+/.test(url)) return null;
    const fallback = url.match(/(\d{8,11})/);
    return fallback ? fallback[1] : null;
}

window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.fonte !== 'sgbstr-lab-rede') return;

    let corpoJson;
    if (msg.corpo === '') {
        console.log(`LAB: resposta com corpo vazio (status ${msg.status}), gravando payload {} -> ${msg.url}`);
        corpoJson = {};
    } else {
        try {
            corpoJson = JSON.parse(msg.corpo);
        } catch (e) {
            console.error(`LAB: falha ao parsear corpo da resposta, ignorando captura -> ${msg.url}`, e);
            return;
        }
    }
    if (corpoJson === null) {
        console.log(`LAB: resposta com corpo "null", ignorando captura -> ${msg.url}`);
        return;
    }

    const numeroFamiliar = extrairNumeroFamiliar(msg.url);
    const endpoint = msg.url.split('/portal-api/')[1] || msg.url;
    const idMaquina = await obterIdMaquina();
    const configMaquina = await obterConfigMaquina();

    fetch(`${SUPABASE_URL}/rest/v1/dataprev_capturas`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        },
        body: JSON.stringify({
            id_atendimento: idAtendimentoAtual,
            endpoint,
            metodo: msg.metodo,
            status_http: msg.status,
            numero_familiar: numeroFamiliar,
            payload: corpoJson,
            url: msg.url,
            sessao_navegador: sessaoNavegador,
            id_maquina: idMaquina,
            fingerprint_navegador: fingerprintNavegador,
            versao_extensao: chrome.runtime.getManifest().version,
            id_instalacao: configMaquina.idInstalacao,
            cras_config: configMaquina.cras
        })
    }).then((res) => {
        if (res.ok) {
            console.log(`LAB: captura de rede gravada -> ${endpoint}`);
        } else {
            res.text().then((corpo) => console.error(`LAB: captura de rede rejeitada (${res.status}) -> ${endpoint}`, corpo));
        }
    }).catch((err) => {
        console.error('LAB: falha ao gravar captura de rede', err);
    });
});