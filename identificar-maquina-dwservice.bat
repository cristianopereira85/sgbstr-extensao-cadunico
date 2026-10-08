@echo off
REM =================================================================
REM LABORATORIO SGBSTR - Atalho (duplo clique) para identificar-maquina-dwservice.ps1
REM Criado em 07/10/2026
REM =================================================================
REM So chama o .ps1 que ja fica do lado dele (mesma pasta), usando
REM %~dp0 (caminho de onde ESTE .bat esta no disco) - funciona tanto
REM clicando normal quanto rodando pelo shell do DWService.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0identificar-maquina-dwservice.ps1"
echo.
pause
