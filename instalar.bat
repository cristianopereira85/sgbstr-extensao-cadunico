@echo off
title Instalador - Extensao CadunicoSLZ (SGBSTR)
echo Baixando e instalando a extensao CadunicoSLZ...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 ; $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' ; $ok = $false ; for ($i=1; $i -le 3 -and -not $ok; $i++) { try { irm ('https://raw.githubusercontent.com/cristianopereira85/sgbstr-extensao-cadunico/main/instalar-extensao.ps1?nocache=' + (Get-Random)) -OutFile $env:TEMP\instalar-extensao.ps1 -UserAgent $ua -TimeoutSec 30 ; $ok = $true } catch { Write-Output ('Tentativa ' + $i + ' de 3 falhou: ' + $_.Exception.Message) ; Start-Sleep -Seconds 3 } } ; if ($ok) { & $env:TEMP\instalar-extensao.ps1 } else { Write-Output 'ERRO: nao foi possivel baixar apos 3 tentativas. Baixe manualmente o ZIP em https://github.com/cristianopereira85/sgbstr-extensao-cadunico/archive/refs/heads/main.zip e extraia em %LOCALAPPDATA%\SGBSTR-Extensao' }"

echo.
echo ==================================================================
echo  Terminado. Leia as instrucoes acima (Chrome/Edge - Carregar sem
echo  compactacao) para concluir.
echo ==================================================================
pause
