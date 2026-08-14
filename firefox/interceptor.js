// =================================================================
// LABORATÓRIO SGBSTR - INTERCEPTADOR DE REDE (roda no MAIN world)
// Captura toda resposta JSON da API do Cadastro Único (portal-api) e
// repassa pro sandbox.js (isolated world) via postMessage.
// =================================================================
(function () {
    const ALVO = '/portal-api/';

    function repassar(url, metodo, status, corpoTexto) {
        window.postMessage({
            fonte: 'sgbstr-lab-rede',
            url,
            metodo,
            status,
            corpo: corpoTexto
        }, window.location.origin);
    }

    const fetchOriginal = window.fetch;
    window.fetch = async function (...args) {
        const resposta = await fetchOriginal.apply(this, args);
        try {
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            const metodo = (args[1]?.method || args[0]?.method || 'GET').toUpperCase();
            if (url && url.includes(ALVO)) {
                resposta.clone().text()
                    .then((corpo) => repassar(url, metodo, resposta.status, corpo))
                    .catch(() => {});
            }
        } catch (e) {}
        return resposta;
    };

    const xhrOpenOriginal = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
        this.__labMetodo = metodo;
        this.__labUrl = url;
        return xhrOpenOriginal.call(this, metodo, url, ...resto);
    };

    const xhrSendOriginal = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args) {
        this.addEventListener('load', function () {
            try {
                if (this.__labUrl && this.__labUrl.includes(ALVO)) {
                    repassar(this.__labUrl, this.__labMetodo || 'GET', this.status, this.responseText);
                }
            } catch (e) {}
        });
        return xhrSendOriginal.apply(this, args);
    };

    console.log('LAB: interceptador de rede ativo.');
})();
