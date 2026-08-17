@echo off
title Instalador - Extensao CadunicoSLZ (SGBSTR)
echo Baixando e instalando a extensao CadunicoSLZ...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 ; $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' ; $Destino = $env:LOCALAPPDATA + '\SGBSTR-Extensao' ; $pastaTemp = Join-Path $env:TEMP ('sgbstr-install-' + (Get-Random)) ; $zipPath = Join-Path $pastaTemp 'extensao.zip' ; $ok = $false ; for ($i=1; $i -le 3 -and -not $ok; $i++) { try { New-Item -ItemType Directory -Force -Path $pastaTemp | Out-Null ; Invoke-WebRequest -Uri ('https://vxinqteushefztszmhdb.supabase.co/storage/v1/object/public/extensao%20lab%20chrome/sgbstr-extensao-cadunico-main.zip?nocache=' + (Get-Random)) -OutFile $zipPath -UseBasicParsing -UserAgent $ua -TimeoutSec 60 ; $ok = $true } catch { Write-Output ('Tentativa ' + $i + ' de 3 falhou: ' + $_.Exception.Message) ; Start-Sleep -Seconds 3 } } ; if (-not $ok) { Write-Output 'ERRO: nao foi possivel baixar apos 3 tentativas.' } else { Expand-Archive -Path $zipPath -DestinationPath $pastaTemp -Force ; $pastaExtraida = Get-ChildItem -Path $pastaTemp -Directory | Where-Object { $_.Name -like 'sgbstr-extensao-cadunico-*' } | Select-Object -First 1 ; New-Item -ItemType Directory -Force -Path $Destino | Out-Null ; Copy-Item -Path ($pastaExtraida.FullName + '\*') -Destination $Destino -Recurse -Force ; Remove-Item -Path $pastaTemp -Recurse -Force -ErrorAction SilentlyContinue ; Write-Output ('Extensao instalada em: ' + $Destino) ; & (Join-Path $Destino 'configurar-auto-atualizacao.ps1') -Destino $Destino }"

echo.
echo ==================================================================
echo  Terminado. Leia as instrucoes acima (Chrome/Edge - Carregar sem
echo  compactacao) para concluir.
echo ==================================================================
pause
