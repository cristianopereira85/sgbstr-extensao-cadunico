# =================================================================
# LABORATORIO SGBSTR - Loop de atualizacao (sem precisar de admin)
# =================================================================
# Roda escondido em segundo plano, iniciado pela pasta "Inicializar"
# do Windows (nao pelo Agendador de Tarefas - varias maquinas dos
# CRAS/secretaria bloqueiam usuario comum de registrar tarefa
# agendada via GPO, mas escrever na propria pasta de Inicializar
# nunca exige permissao especial). A cada $IntervaloMinutos chama o
# atualizador; o proprio background.js da extensao detecta a versao
# nova e se recarrega sozinho dentro do navegador.

param(
    [string]$Destino = "$env:LOCALAPPDATA\SGBSTR-Extensao",
    [int]$IntervaloMinutos = 30
)

# Evita empilhar um loop novo a cada login em cima dos que ja estao
# rodando de sessoes anteriores.
$mutex = New-Object System.Threading.Mutex($false, "SGBSTR-Extensao-AutoUpdate")
if (-not $mutex.WaitOne(0)) {
    exit
}

try {
    while ($true) {
        try {
            & (Join-Path $Destino "atualizar-extensao.ps1") -Destino $Destino
        } catch {
            # Ignora falha pontual (ex: sem internet no momento) e tenta de novo no proximo ciclo.
        }
        Start-Sleep -Seconds ($IntervaloMinutos * 60)
    }
} finally {
    $mutex.ReleaseMutex()
}
