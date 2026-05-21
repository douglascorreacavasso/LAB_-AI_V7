// =============================================================================
// ACTION_SPEAK.JS — Lab v7 - Raciocínio
//
// MONTA A RESPOSTA FINAL.
//
// FILOSOFIA:
//   speak não inventa — ele escolhe ou compõe.
//   3 modos:
//   1. Template iluminado: pega o generated_msg com mais energia da tag pedida
//   2. Composição direta: usa o fato escrito ("ok, anotei: nome → Douglas")
//   3. Fallback: frase neutra ("ok.")
//
// SAÍDA:
//   {resposta_txt, output_node_id}
//
// IMPORTANTE: cria nó generated_msg na surface, ligando a action_speak
// que veio do router. Mantém cadeia rastreável.
// =============================================================================

'use strict';

// ============================================================
// SPEAK PRINCIPAL
// args = {
//   contexto:        'social_saudacao'|'social_despedida'|'feedback_pos'|
//                    'feedback_neg'|'atribuicao_ok'|'recall'|'pergunta_sem_resposta'|
//                    'desconhecido'
//   tag_template:    string (qual tag de template procurar)
//   compor_de:       {sujeito, predicado, valor, foi_update} (pra modo composição)
//   recall_texto:    string (pra modo recall — texto pronto do action_recall)
//   userInputNodeId,
//   parseNodeId,
//   actionPrevNodeId, (o write/recall que veio antes)
//   turnoInfo,
// }
// ============================================================
function actionSpeak(args){
  const {contexto, tag_template, compor_de, recall_texto,
         userInputNodeId, parseNodeId, actionPrevNodeId, turnoInfo} = args;

  // Cria o action_speak node
  const speakNode = makeNode({
    type:        'action_speak',
    layer:       'orquestrador',
    origin_type: 'SYSTEM',
    text:        'speak(' + contexto + ')',
    mass:        1,
    fire_id:     nextFireId(),
  });
  STATE.nodes.push(speakNode);

  // Liga ação anterior (write/recall) → speak
  if(actionPrevNodeId){
    STATE.edges.push(makeEdge({
      a: actionPrevNodeId, b: speakNode.id, w: 0.7, kind: 'sequence'
    }));
  } else if(parseNodeId){
    STATE.edges.push(makeEdge({
      a: parseNodeId, b: speakNode.id, w: 0.5, kind: 'sequence'
    }));
  }

  // ============================================================
  // 1. MODO RECALL — usa texto pronto do action_recall
  // ============================================================
  if(contexto === 'recall' && recall_texto){
    return _emit(speakNode, recall_texto, turnoInfo, 'recall');
  }

  // ============================================================
  // 2. MODO COMPOSIÇÃO — fala sobre o fato escrito
  // ============================================================
  if(contexto === 'atribuicao_ok' && compor_de){
    const txt = _composeAtribuicaoMsg(compor_de);
    return _emit(speakNode, txt, turnoInfo, 'composto');
  }

  // ============================================================
  // 3. MODO TEMPLATE — escolhe o iluminado pela tag
  // ============================================================
  if(tag_template){
    const candidatos = STATE.nodes
      .filter(n => n._template_tag === tag_template)
      .sort((a, b) => (b.energy || 0) - (a.energy || 0));

    if(candidatos.length > 0){
      const escolhido = candidatos[0];
      escolhido.lastAccessed = nowT();
      escolhido.mass = (escolhido.mass || 1) + 0.2;

      // Liga speak → template usado
      STATE.edges.push(makeEdge({
        a: speakNode.id, b: escolhido.id, w: 0.6, kind: 'exemplo_de'
      }));

      return _emit(speakNode, escolhido.text, turnoInfo, `template "${tag_template}"`);
    }
  }

  // ============================================================
  // 4. FALLBACK
  // ============================================================
  let fallback = 'ok.';
  if(contexto === 'pergunta_sem_resposta') fallback = 'hmm, não sei ainda. me ensina?';
  else if(contexto === 'desconhecido')     fallback = 'hmm, ainda não sei muito sobre isso. me conta mais?';

  return _emit(speakNode, fallback, turnoInfo, 'fallback');
}

// ============================================================
// COMPÕE FRASE DE ATRIBUIÇÃO
// "ok, gravei: nome do usuário → Douglas. o que douglas faz da vida?"
// ============================================================
function _composeAtribuicaoMsg(compor){
  const {sujeito, predicado, valor, foi_update, valor_anterior} = compor;
  const sujExib = sujeito === '__self__' ? 'eu' : cap(sujeito || '');

  const verbos_abertura = [
    'ok, anotei', 'beleza, gravei', 'entendi, registrei',
    'show, vou guardar', 'massa, lembrei',
  ];
  const abertura = pick(verbos_abertura);

  // Caso self
  if(sujeito === '__self__'){
    if(predicado === 'nome')    return `pode me chamar de ${cap(valor)}!`;
    if(predicado === 'apelido') return `pode me chamar de ${cap(valor)}!`;
    return `${abertura}: ${predicado} → ${valor}.`;
  }

  // Caso user — com mensagem de update se sobrescreveu
  if(foi_update && valor_anterior){
    return `mudei de "${valor_anterior}" para "${valor}". anotado!`;
  }

  // Update padrão
  const corpo = `${abertura}: ${_displayPredicado(predicado)} → ${valor}.`;
  return corpo;
}

function _displayPredicado(p){
  return ({
    'nome':      'nome',
    'apelido':   'apelido',
    'olhos':     'cor dos olhos',
    'cor_olhos': 'cor dos olhos',
    'partes':    'parte do corpo',
    'papel':     'papel',
    'gosta':     'gosto',
    'sabe':      'conhecimento',
  })[p] || p;
}

// ============================================================
// HELPER: emite o output node final e retorna
// ============================================================
function _emit(speakNode, txt, turnoInfo, origemEscolha){
  const outNode = makeNode({
    type:        'generated_msg',
    layer:       'surface',
    origin_type: 'GENERATED',
    text:        txt,
    mass:        1.5,
    session_id:  STATE.session_atual,
  });
  STATE.nodes.push(outNode);
  STATE.edges.push(makeEdge({
    a: speakNode.id, b: outNode.id, w: 0.8, kind: 'sequence'
  }));

  _addIterLogS(turnoInfo, 'infer',
    `speak: "${txt.slice(0, 60)}${txt.length > 60 ? '...' : ''}" (via ${origemEscolha})`,
    {origem: origemEscolha, output_id: outNode.id});

  return {
    resposta_txt: txt,
    output_node_id: outNode.id,
    speak_node_id: speakNode.id,
  };
}

function _addIterLogS(turnoInfo, kind, descricao, dados){
  if(!turnoInfo) return;
  turnoInfo.iteracoes.push({
    n:         turnoInfo.iteracoes.length + 1,
    kind:      kind,
    descricao: descricao,
    dados:     dados || null,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================
// EXPOR
// ============================================================
window.actionSpeak = actionSpeak;

console.log('[action_speak v7] carregado');
