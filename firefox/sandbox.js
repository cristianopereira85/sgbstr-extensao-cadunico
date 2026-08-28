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
    caixa.innerHTML = `
        <div style="font-size:12px; color:#8a8f99; font-weight:600; margin-bottom:10px;">Laboratório CadÚnico</div>
        <div style="font-size:17px; font-weight:700; margin-bottom:6px;">Em que CRAS você está?</div>
        <div style="font-size:12.5px; color:#8a8f99; margin-bottom:14px; line-height:1.5;">Preciso saber a unidade desta máquina pra contar certo na produção do dia. Só apareço 1 vez.</div>
        <input id="sgbstr-lab-input-cras" type="text" placeholder="Ex: ANIL, COHAB, TURU..."
            style="width:100%; box-sizing:border-box; padding:10px 11px; border-radius:6px; border:1px solid #323848; background:#0f1115; color:#e6e8eb; font-size:14px; margin-bottom:6px; outline:none;">
        <div id="sgbstr-lab-erro-cras" style="font-size:11.5px; color:#ff6b6b; min-height:14px; margin-bottom:6px;"></div>
        <button id="sgbstr-lab-btn-confirmar" style="width:100%; background:#4a9eff; border:none; color:#071018; font-weight:700; font-size:13.5px; border-radius:7px; padding:10px 12px; cursor:pointer;">Confirmar</button>
    `;
    moldura.appendChild(caixa);
    document.body.appendChild(moldura);

    const input = document.getElementById('sgbstr-lab-input-cras');
    const erroEl = document.getElementById('sgbstr-lab-erro-cras');
    const remover = () => moldura.remove();

    // Sem botão "Depois": só fecha digitando e confirmando um CRAS de
    // verdade — volta a aparecer em toda navegação até alguém responder.
    const confirmar = async () => {
        const valor = input.value.trim().toUpperCase();
        if (!valor) {
            erroEl.textContent = 'Digite o nome do CRAS pra continuar.';
            input.focus();
            return;
        }
        try {
            await fetch(`${SUPABASE_URL}/rest/v1/rpc/informar_cras_maquina`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
                body: JSON.stringify({ p_id_maquina: idMaquina, p_id_instalacao: idInstalacao, p_cras: valor })
            });
            await chrome.storage.local.set({ crasJaPerguntado: true });
            console.log(`LAB: CRAS informado via aviso no navegador -> ${valor}`);
        } catch (erro) {
            console.error('LAB: falha ao informar CRAS', erro);
        }
        remover();
    };
    document.getElementById('sgbstr-lab-btn-confirmar').addEventListener('click', confirmar);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmar(); });
    input.addEventListener('input', () => { erroEl.textContent = ''; });
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
                : 'A extensão Monitor CadÚnico - SEMCAS foi desativada. No Firefox não dá pra reativar por aqui — abra "about:addons" (menu ≡ → Complementos e temas), ache "Monitor CadÚnico - SEMCAS" e ative manualmente.'}
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

function checarEAtualizarAvisoMonitor() {
    chrome.storage.local.get('statusMonitor', (dados) => {
        const status = dados.statusMonitor;
        if (status && status.encontrada && status.ativa === false) {
            mostrarAvisoMonitorDesativado(status);
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