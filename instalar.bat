@echo off
title Instalador - Extensao CadunicoSLZ (SGBSTR)
echo Baixando e instalando a extensao CadunicoSLZ...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 ; irm ('https://raw.githubusercontent.com/cristianopereira85/sgbstr-extensao-cadunico/main/instalar-extensao.ps1?nocache=' + (Get-Random)) -OutFile $env:TEMP\instalar-extensao.ps1 -UserAgent ([Microsoft.PowerShell.Commands.PSUserAgent]::Chrome) ; & $env:TEMP\instalar-extensao.ps1"

echo.
echo ==================================================================
echo  Terminado. Leia as instrucoes acima (Chrome/Edge - Carregar sem
echo  compactacao) para concluir.
echo ==================================================================
pause
