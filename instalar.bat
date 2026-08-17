@echo off
title Instalador - Extensao CadunicoSLZ (SGBSTR)
echo Baixando e instalando a extensao CadunicoSLZ...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 ; irm ('https://raw.githubusercontent.com/cristianopereira85/sgbstr-extensao-cadunico/main/instalar-extensao.ps1?nocache=' + (Get-Random)) -OutFile $env:TEMP\instalar-extensao.ps1 -UserAgent 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' ; & $env:TEMP\instalar-extensao.ps1"

echo.
echo ==================================================================
echo  Terminado. Leia as instrucoes acima (Chrome/Edge - Carregar sem
echo  compactacao) para concluir.
echo ==================================================================
pause
