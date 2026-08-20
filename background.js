// =================================================================
// LABORATÓRIO SGBSTR - AUTO-UPDATE + HEARTBEAT (v2)
// =================================================================
// Extensão "descompactada" não é recarregada pelo Chrome sozinha quando
// os arquivos mudam em disco (ex: depois de um `git pull`/atualizador
// via GitHub). Esse service worker fecha esse buraco: a cada alarme,
// lê o manifest.json direto do disco (sem cache) e compara a versão
// com a que está carregada em memória. Se mudou, chama
// chrome.runtime.reload() sozinho, sem precisar de clique humano em
// chrome://extensions.
//
// Limitação conhecida (não dá pra evitar): abas do Cadastro Único já
// abertas continuam com o interceptor.js/sandbox.js antigos até a
// próxima navegação/F5 real, porque é SPA. Ver "Pegadinhas" no CLAUDE.md.
//
// Também manda um HEARTBEAT (id_maquina + versão rodando) a cada alarme,
// direto pro Supabase — INDEPENDENTE de alguém abrir uma família no
// Cadastro Único. Isso é o que permite saber "que versão está rodando em
// cada máquina" e "essa máquina ainda está viva" sem depender de produção
// real (útil pra checar remotamente, ex. segunda de manhã antes de
// qualquer atendimento). Ver "Identificação de máquina" no CLAUDE.md.

const SUPABASE_URL = 'https://vxinqteushefztszmhdb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4aW5xdGV1c2hlZnp0c3ptaGRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMTgzNjUsImV4cCI6MjA3NDU5NDM2NX0.I9lPwicVkLUmd9e_eRfK_gC0zLgbeRoYVIE2PxtoYDs';

const NOME_ALARME = 'sgbstr-verificar-atualizacao';
const INTERVALO_MINUTOS = 2;

console.log(`LAB: background.js carregado, versão ${chrome.runtime.getManifest().version}`);

chrome.runtime.onInstalled.addListener(agendarVerificacao);
chrome.runtime.onStartup.addListener(agendarVerificacao);

function agendarVerificacao() {
    chrome.alarms.create(NOME_ALARME, { periodInMinutes: INTERVALO_MINUTOS });
}

chrome.alarms.onAlarm.addListener((alarme) => {
    if (alarme.name === NOME_ALARME) {
        verificarAtualizacao();
        enviarHeartbeat();
    }
});

// Roda uma vez já na inicialização do service worker, sem esperar o
// primeiro alarme (cobre o caso de o worker acordar por outro motivo).
verificarAtualizacao();
enviarHeartbeat();

async function verificarAtualizacao() {
    try {
        const resposta = await fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' });
        const manifestEmDisco = await resposta.json();
        const versaoCarregada = chrome.runtime.getManifest().version;

        if (manifestEmDisco.version !== versaoCarregada) {
            console.log(`LAB: nova versão da extensão em disco (${manifestEmDisco.version}, carregada: ${versaoCarregada}) — recarregando sozinho.`);
            chrome.runtime.reload();
        }
    } catch (erro) {
        console.error('LAB: falha ao verificar atualização da extensão', erro);
    }
}

// Mesma lógica de id_maquina do sandbox.js, duplicada de propósito (service
// worker e content script não compartilham escopo JS, só o
// chrome.storage.local — quem rodar primeiro cria a chave, o outro só lê).
async function obterIdMaquina() {
    const armazenado = await chrome.storage.local.get('idMaquina');
    if (armazenado.idMaquina) return armazenado.idMaquina;
    const novoId = crypto.randomUUID();
    await chrome.storage.local.set({ idMaquina: novoId });
    return novoId;
}

// Mesma lógica do sandbox.js: config_maquina.json é gravado 1x pelo
// INSTALADOR na pasta compartilhada de onde Chrome e Edge carregam a
// extensão — id_instalacao de dentro dele é igual nos dois navegadores da
// mesma máquina física (diferente do idMaquina, que é por navegador). Ver
// CLAUDE.md, 20/08/2026.
async function obterConfigMaquina() {
    try {
        const resposta = await fetch(chrome.runtime.getURL('config_maquina.json'), { cache: 'no-store' });
        if (!resposta.ok) return { idInstalacao: null, cras: null };
        const json = await resposta.json();
        return { idInstalacao: json.id_instalacao ?? null, cras: json.cras ?? null };
    } catch (erro) {
        return { idInstalacao: null, cras: null };
    }
}

// screen/navigator.platform não existem em service worker (sem tela) —
// captura só o que é seguro nesse contexto. Nunca deixa o heartbeat falhar
// por causa do fingerprint: se alguma propriedade não existir, fica null.
function coletarFingerprintBasico() {
    try {
        return {
            userAgent: navigator.userAgent ?? null,
            plataforma: navigator.platform ?? null,
            idioma: navigator.language ?? null
        };
    } catch (erro) {
        return null;
    }
}

async function enviarHeartbeat() {
    try {
        const idMaquina = await obterIdMaquina();
        const configMaquina = await obterConfigMaquina();
        const agora = new Date().toISOString();

        const res = await fetch(`${SUPABASE_URL}/rest/v1/maquinas_heartbeat?on_conflict=id_maquina`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify({
                id_maquina: idMaquina,
                versao_extensao: chrome.runtime.getManifest().version,
                fingerprint_navegador: coletarFingerprintBasico(),
                ultimo_heartbeat: agora,
                id_instalacao: configMaquina.idInstalacao,
                cras_config: configMaquina.cras
            })
        });
        if (res.ok) {
            console.log(`LAB: heartbeat enviado (máquina ${idMaquina}, versão ${chrome.runtime.getManifest().version})`);
        } else {
            console.error(`LAB: heartbeat rejeitado (${res.status})`, await res.text());
        }
    } catch (erro) {
        console.error('LAB: falha ao enviar heartbeat', erro);
    }
}
