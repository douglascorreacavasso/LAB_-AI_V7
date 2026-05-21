// =============================================================================
// ACTION_ASK.JS — Lab v7 - Raciocínio
//
// FORMULA PERGUNTAS INTELIGENTES.
//
// FILOSOFIA:
//   "Hmm, me conta mais" é vago — não ajuda o user.
//   "O que é olho?" — focada, user sabe responder.
//   "Olho é parte do corpo, certo?" — pede confirmação de hipótese.
//
// 3 TIPOS DE PERGUNTA:
//   1. ASK_CATEGORY: "isso é o quê? / o que é {palavra}?"
//      → quando criou provisional sem ideia da categoria
//   2. ASK_CONFIRM:  "{palavra} é {hipótese}, certo?"
//      → quando tem hipótese com confidence média (~0.4-0.6)
//   3. ASK_CLARIFY:  pergunta específica baseada no contexto
//      → quando tem várias interpretações possíveis
//
// QUEM GERA UMA ASK ATIVA `pendingClarify`:
//   STATE.pendingClarify = {
//     term, original, turno_criado, hypothesis_id, provisional_id
//   }
//
// PRÓXIMO TURNO, o engine vê pendingClarify e trata a resposta como explicação.
// =============================================================================

'use strict';

// ============================================================
// AÇÃO PRINCIPAL
// args = {
//   tipo:        'category' | 'confirm' | 'clarify'
//   palavra:     "olho" (o termo em questão)
//   palavra_id:  node_id da palavra
//   hipotese:    string (texto da hipótese — pra confirmar)
//   hypothesis_node_id: node_id da hipótese
//   provisional_node_id: node_id da provisional
//   userInputNodeId, parseNodeId, turnoInfo
// }
// Retorna: {resposta_txt, ask_node_id, output_node_id}
// ============================================================
function actionAsk(args){
  const {tipo, palavra, palavra_id, hipotese, hypothesis_node_id,
         provisional_node_id, userInputNodeId, parseNodeId, turnoInfo} = args;

  // Cria action_ask node
  const askNode = makeNode({
    type:        'action_ask',
    layer:       'orquestrador',
    origin_type: 'SYSTEM',
    text:        `ask(${tipo})`,
    mass:        1,
    fire_id:     nextFireId(),
  });
  STATE.nodes.push(askNode);

  if(parseNodeId){
    STATE.edges.push(makeEdge({
      a: parseNodeId, b: askNode.id, w: 0.5, kind: 'sequence'
    }));
  } else if(userInputNodeId){
    STATE.edges.push(makeEdge({
      a: userInputNodeId, b: askNode.id, w: 0.5, kind: 'sequence'
    }));
  }

  // Liga ask → hypothesis (se houver)
  if(hypothesis_node_id){
    STATE.edges.push(makeEdge({
      a: askNode.id, b: hypothesis_node_id, w: 0.7, kind: 'deriva_de'
    }));
  }
  if(provisional_node_id){
    STATE.edges.push(makeEdge({
      a: askNode.id, b: provisional_node_id, w: 0.7, kind: 'deriva_de'
    }));
  }

  // Formula a pergunta
  let pergunta = '';
  switch(tipo){
    case 'category':
      pergunta = _formulateCategoryAsk(palavra);
      break;
    case 'confirm':
      pergunta = _formulateConfirmAsk(palavra, hipotese);
      break;
    case 'clarify':
      pergunta = _formulateClarifyAsk(palavra, args.opcoes);
      break;
    default:
      pergunta = `não sei o que é "${palavra}". me explica?`;
  }

  // Cria output node (generated_question)
  const outNode = makeNode({
    type:        'generated_question',
    layer:       'surface',
    origin_type: 'GENERATED',
    text:        pergunta,
    mass:        1.5,
    session_id:  STATE.session_atual,
  });
  STATE.nodes.push(outNode);
  STATE.edges.push(makeEdge({
    a: askNode.id, b: outNode.id, w: 0.8, kind: 'sequence'
  }));

  // ATIVA pendingClarify — próximo turno vai esperar resposta
  STATE.pendingClarify = {
    term:               palavra,
    original:           STATE.nodes.find(n => n.id === userInputNodeId)?.text || '',
    turno_criado:       STATE.turn,
    hypothesis_id:      hypothesis_node_id || null,
    provisional_id:     provisional_node_id || null,
    palavra_node_id:    palavra_id || null,
    pergunta:           pergunta,
    ask_node_id:        askNode.id,
  };

  _addIterLogA(turnoInfo, 'action',
    `ask[${tipo}]: "${pergunta.slice(0, 60)}" → ativou pendingClarify`,
    {tipo, palavra, hipotese, pergunta});

  return {
    resposta_txt: pergunta,
    output_node_id: outNode.id,
    ask_node_id: askNode.id,
    speak_node_id: askNode.id,   // pra cadeia rastrear
  };
}

// ============================================================
// FORMULADORES DE PERGUNTA
// ============================================================
function _formulateCategoryAsk(palavra){
  const opcoes = [
    `não conheço "${palavra}". o que é?`,
    `"${palavra}" é o quê? me explica?`,
    `o que significa "${palavra}"?`,
    `nunca ouvi "${palavra}". me conta?`,
    `"${palavra}" é tipo de quê?`,
  ];
  return pick(opcoes);
}

function _formulateConfirmAsk(palavra, hipotese){
  const opcoes = [
    `acho que "${palavra}" ${hipotese}. tá certo?`,
    `"${palavra}" ${hipotese}? confere?`,
    `posso dizer que "${palavra}" ${hipotese}?`,
  ];
  return pick(opcoes);
}

function _formulateClarifyAsk(palavra, opcoes){
  if(Array.isArray(opcoes) && opcoes.length > 1){
    return `"${palavra}" — você quis dizer ${opcoes.slice(0, -1).join(', ')} ou ${opcoes[opcoes.length - 1]}?`;
  }
  return `pode esclarecer o que você quis dizer com "${palavra}"?`;
}

// ============================================================
// AÇÃO DE EXPLICAÇÃO — chamada quando user RESPONDE a pendingClarify
// args = {
//   pendingClarify, userInputNodeId, parseInfo, turnoInfo
// }
// Retorna: {confirmou, novo_tipo, ...}
// ============================================================
function actionExplain(args){
  const {pendingClarify, userInputNodeId, parseInfo, turnoInfo} = args;
  if(!pendingClarify) return null;

  const inputNode = STATE.nodes.find(n => n.id === userInputNodeId);
  const respostaUser = inputNode?.text || '';
  const respNorm = norm(respostaUser);

  // 1. Detecta confirmação simples ("sim", "isso", "certo")
  const confirmaPalavras = ['sim', 'isso', 'certo', 'correto', 'exato', 'perfeito'];
  const ehConfirmacao = confirmaPalavras.some(w =>
    respNorm === w || respNorm.startsWith(w + ' ') || respNorm.endsWith(' ' + w)
  );

  // 2. Detecta negação simples ("não", "errado")
  const negaPalavras = ['nao', 'não', 'errado', 'jamais'];
  const ehNegacao = negaPalavras.some(w =>
    respNorm === w || respNorm.startsWith(w + ' ')
  );

  // Atualiza hypothesis se houver
  if(pendingClarify.hypothesis_id){
    const hypo = STATE.nodes.find(n => n.id === pendingClarify.hypothesis_id);
    if(hypo){
      if(ehConfirmacao){
        hypo._status     = 'confirmada';
        hypo._confidence = Math.min(0.95, (hypo._confidence || 0.4) + 0.4);
        hypo.mass        = (hypo.mass || 1) + 1;
        _addIterLogA(turnoInfo, 'infer',
          `explain: hipótese "${hypo._afirma}" CONFIRMADA pelo user`,
          {hypo_id: hypo.id});
      } else if(ehNegacao){
        hypo._status     = 'refutada';
        hypo._confidence = Math.max(0.05, (hypo._confidence || 0.4) - 0.3);
        hypo.brightness  = Math.max(0.1, (hypo.brightness || 0.5) - 0.3);
        _addIterLogA(turnoInfo, 'infer',
          `explain: hipótese "${hypo._afirma}" REFUTADA pelo user`,
          {hypo_id: hypo.id});
      }
    }
  }

  // Se o user deu uma EXPLICAÇÃO real ("X é parte do corpo"), captura
  let explicacao = null;
  if(parseInfo && parseInfo.modo === 'atribuicao' && parseInfo.predicado && parseInfo.valor){
    explicacao = {
      sujeito_dito:  parseInfo.predicado,
      categoria:     parseInfo.valor,
    };
  } else if(!ehConfirmacao && !ehNegacao && respNorm.length > 1){
    // Pega resposta livre como categoria (ex: "parte do corpo")
    explicacao = {
      sujeito_dito:  pendingClarify.term,
      categoria:     respNorm,
    };
  }

  // Guarda definição
  if(explicacao){
    STATE.definitions[pendingClarify.term] = explicacao.categoria;
    _addIterLogA(turnoInfo, 'action',
      `explain: gravou definição "${pendingClarify.term}" = "${explicacao.categoria}"`,
      {definicao: explicacao});
  }

  // Limpa pendingClarify
  const pcConfirma = ehConfirmacao;
  const pcExplicou = !!explicacao;
  STATE.pendingClarify = null;

  return {
    confirmou: pcConfirma,
    negou: ehNegacao,
    explicou: pcExplicou,
    explicacao: explicacao,
  };
}

function _addIterLogA(turnoInfo, kind, descricao, dados){
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
window.actionAsk     = actionAsk;
window.actionExplain = actionExplain;

console.log('[action_ask v7] carregado');
