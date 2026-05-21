@echo off
REM ============================================================
REM  Lab v7 - Raciocínio  —  launcher
REM  - sobe servidor HTTP local na porta 8765
REM  - abre o navegador em http://localhost:8765/index.html
REM  - fechar esta janela = derruba o servidor
REM ============================================================

title Lab v7 - Raciocinio - servidor local
cd /d "%~dp0"

echo.
echo  ===============================================
echo   Lab v7 - Raciocinio - subindo servidor local...
echo  ===============================================
echo.
echo  pasta: %CD%
echo  porta: 8765
echo  url:   http://localhost:8765
echo.

REM Tenta python primeiro, depois py (Windows launcher)
where python >nul 2>nul
if %errorlevel%==0 (
    start "" "http://localhost:8765/index.html"
    echo.
    echo  servidor rodando. fecha esta janela pra parar.
    echo.
    python -m http.server 8765
    goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
    start "" "http://localhost:8765/index.html"
    echo.
    echo  servidor rodando. fecha esta janela pra parar.
    echo.
    py -m http.server 8765
    goto :eof
)

echo.
echo  ERRO: Python nao encontrado no PATH.
echo  instala Python 3 de https://python.org e tenta de novo.
echo.
pause
