// =============================================================================
// UI_CHAT.JS — Lab v7 - Raciocínio
//
// UI do chat principal.
//
// REGRAS DE DESIGN:
//   - Chat = só mensagens user/ai (limpo, como conversa normal)
//   - Botão CALCULAR dispara o motor
//   - Iterações vão pro painel do meio (ui_log.js)
//   - Tela bloqueada enquanto motor está rodando
// =============================================================================

'use strict';

// ============================================================
// APPEND DE MENSAGEM
// ============================================================
function appendUserMsg(text){
  const chat = $('chat');
  if(!chat) return;
  const d = document.createElement('div');
  d.className = 'msg user';
  d.innerHTML = `
    <div class="who">você · ${ts()}</div>
    <div class="txt">${escapeHtml(text)}</div>
  `;
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
}

function appendAiMsg(text){
  const chat = $('chat');
  if(!chat) return;
  const d = document.createElement('div');
  d.className = 'msg ai';
  d.innerHTML = `
    <div class="who">nerel · ${ts()}</div>
    <div class="txt">${escapeHtml(text)}</div>
  `;
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
}

function appendSysMsg(text){
  const chat = $('chat');
  if(!chat) return;
  const d = document.createElement('div');
  d.className = 'msg sys';
  d.textContent = text;
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
}

function clearChat(){
  const chat = $('chat');
  if(chat) chat.innerHTML = '';
}

// ============================================================
// HANDLER DO BOTÃO CALCULAR
// ============================================================
async function handleCalcular(){
  const ta = $('txtInput');
  const btn = $('btnCalcular');
  if(!ta || !btn) return;

  const mensagem = ta.value.trim();
  if(!mensagem) return;

  // Mostra mensagem no chat
  appendUserMsg(mensagem);
  ta.value = '';
  ta.focus();

  // Desabilita botão durante cálculo
  btn.disabled = true;
  btn.textContent = 'CALCULANDO...';

  try {
    const t0 = nowT();
    const result = await calcular(mensagem);
    const elapsed = nowT() - t0;

    appendAiMsg(result.resposta);

    // Atualiza painéis
    if(window.renderLogPanel)  window.renderLogPanel(result);
    if(window.renderNetwork)   window.renderNetwork();
    if(window.updateStatBar)   window.updateStatBar();

    console.log(`[chat v7] turno ${result.turno} convergiu em ${result.iteracoes.length} iter / ${elapsed}ms`);
  } catch(err){
    console.error('[chat] erro no calcular:', err);
    appendSysMsg('⚠ erro no cálculo: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'CALCULAR';
  }
}

// ============================================================
// INICIALIZA UI
// ============================================================
function initChatUI(){
  const btn = $('btnCalcular');
  const ta  = $('txtInput');

  if(!btn || !ta){
    console.error('[ui_chat] elementos não encontrados');
    return;
  }

  // Habilita botão
  btn.disabled = false;
  btn.addEventListener('click', handleCalcular);

  // Enter envia (Shift+Enter quebra linha)
  ta.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      handleCalcular();
    }
  });

  // Foca input
  ta.focus();

  console.log('[ui_chat v7] inicializado');
}

// ============================================================
// STATBAR (footer da rede)
// ============================================================
function updateStatBar(){
  const elN = $('statNodes');
  const elE = $('statEdges');
  const elS = $('statSuper');
  const elSess = $('statSession');
  const elT = $('statTurn');
  const elInfo = $('redeInfo');

  if(elN) elN.textContent = STATE.nodes.length;
  if(elE) elE.textContent = STATE.edges.length;
  if(elS) elS.textContent = STATE.nodes.filter(n => n.is_super).length;
  if(elSess) elSess.textContent = STATE.session_atual ? STATE.session_atual.slice(-6) : '—';
  if(elT) elT.textContent = STATE.turn;
  if(elInfo) elInfo.textContent = `${STATE.nodes.length} nós · ${STATE.edges.length} arestas`;
}

// ============================================================
// EXPOR
// ============================================================
window.appendUserMsg  = appendUserMsg;
window.appendAiMsg    = appendAiMsg;
window.appendSysMsg   = appendSysMsg;
window.clearChat      = clearChat;
window.handleCalcular = handleCalcular;
window.initChatUI     = initChatUI;
window.updateStatBar  = updateStatBar;

console.log('[ui_chat v7] carregado');
