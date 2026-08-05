@echo off
title Instalador - Extensao CadunicoSLZ (SGBSTR)
echo Baixando e instalando a extensao CadunicoSLZ...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "irm ('https://raw.githubusercontent.com/cristianopereira85/sgbstr-extensao-cadunico/main/instalar-extensao.ps1?nocache=' + (Get-Random)) -OutFile $env:TEMP\instalar-extensao.ps1 ; & $env:TEMP\instalar-extensao.ps1"

echo.
echo ==================================================================
echo  Terminado. Leia as instrucoes acima (Chrome/Edge - Carregar sem
echo  compactacao) para concluir.
echo ==================================================================
pause
