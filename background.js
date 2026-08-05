// =================================================================
// LABORATÓRIO SGBSTR - AUTO-UPDATE (v1)
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

const NOME_ALARME = 'sgbstr-verificar-atualizacao';
const INTERVALO_MINUTOS = 15;

chrome.runtime.onInstalled.addListener(agendarVerificacao);
chrome.runtime.onStartup.addListener(agendarVerificacao);

function agendarVerificacao() {
    chrome.alarms.create(NOME_ALARME, { periodInMinutes: INTERVALO_MINUTOS });
}

chrome.alarms.onAlarm.addListener((alarme) => {
    if (alarme.name === NOME_ALARME) verificarAtualizacao();
});

// Roda uma vez já na inicialização do service worker, sem esperar o
// primeiro alarme (cobre o caso de o worker acordar por outro motivo).
verificarAtualizacao();

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
