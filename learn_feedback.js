// =============================================================================
// LEARN_FEEDBACK.JS — Lab v7 - Raciocínio
//
// FEEDBACK SEMÂNTICO — não apenas reforço/inibição mecânica.
//
// FILOSOFIA:
//   Hoje "errado" → inibe arestas + reverte last write. Burro.
//   Se o user disse "meu nome é douglas" e depois "olhos são azuis" e depois "errado",
//   o sistema reverte SÓ o último write (olhos). Mas e se o user queria dizer
//   que o NOME estava errado? O sistema não sabe.
//
// COMO C1 RESOLVE:
//   - "errado" sozinho → mantém comportamento atual (reverte último)
//   - "errado, é X" → reverte E reescreve com X
//   - "errado, na verdade Y é Z" → corrige fato específico
//   - "X não é Y" → busca fato (X,Y) e marca como refutado
//   - PERGUNTA quando ambíguo: "o que estava errado, o nome ou a cor?"
//
// TAMBÉM:
//   - feedback positivo elaborado: "isso! lembra disso" → consolida cadeia + dá mass extra
//   - feedback explícito sobre fato: "errado, eu disse vermelhos não verdes" → re-edita
// =============================================================================

'use strict';

// ============================================================
// AÇÃO PRINCIPAL: processa feedback com texto extra
// args = {
//   tipo:        'positivo' | 'negativo'
//   textoOrig:   texto completo do user
//   parseInfo,
//   userInputNodeId,
//   turnoInfo
// }
// Retorna: {acao_tomada, descricao, ask_args?}
// ============================================================
function learnProcessarFeedback(args){
  const {tipo, textoOrig, parseInfo, userInputNodeId, turnoInfo} = args;
  const t = norm(textoOrig || '');

  // ============================================================
  // FEEDBACK NEGATIVO COMPLEXO
  // ============================================================
  if(tipo === 'negativo'){
    // Caso "errado, é X" / "errado, na verdade Y"
    // Parse procura uma correção embutida
    const correcao = _extrairCorrecao(textoOrig);

    if(correcao){
      // Aplica correção específica
      return _aplicarCorrecao(correcao, parseInfo, userInputNodeId, turnoInfo);
    }

    // Caso "X não é Y"
    const negacaoFato = _detectarNegacaoFato(textoOrig);
    if(negacaoFato){
      return _aplicarNegacaoFato(negacaoFato, userInputNodeId, turnoInfo);
    }

    // Caso "errado" sozinho → fluxo padrão (já implementado no router)
    return {acao_tomada: 'revert_last', descricao: 'feedback simples — reverte último'};
  }

  // ============================================================
  // FEEDBACK POSITIVO ELABORADO
  // ============================================================
  if(tipo === 'positivo'){
    // "isso, lembra disso" → consolida última cadeia com mass extra
    const querLembrar = /\b(lembra|guarda|memoriza|grava)\b/.test(t);
    if(querLembrar){
      const last = STATE.logic_chains[STATE.logic_chains.length - 1];
      if(last){
        // Reforça cada nó da cadeia com mass extra
        for(const nid of last.sequencia){
          const n = STATE.nodes.find(x => x.id === nid);
          if(n){
            n.mass = (n.mass || 1) + 1.5;
            n.brightness = Math.min(1, (n.brightness || 0.5) + 0.3);
          }
        }
        _addIterLogF(turnoInfo, 'action',
          `feedback+ elaborado: cadeia consolidada com mass extra`,
          {chain_id: last.id});
        return {acao_tomada: 'consolida', descricao: 'cadeia recebeu massa extra'};
      }
    }
    return {acao_tomada: 'reforco_normal', descricao: 'feedback simples'};
  }

  return {acao_tomada: 'nenhuma', descricao: 'feedback não interpretado'};
}

// ============================================================
// EXTRAI CORREÇÃO DE FRASES TIPO "errado, é X" / "na verdade Y"
// ============================================================
function _extrairCorrecao(textoOrig){
  const t = norm(textoOrig || '');

  // padrões:
  //   "errado, é X"
  //   "errado, na verdade X"
  //   "errado X" (curto)
  //   "na verdade X"
  let m = t.match(/^(?:errado|errou|nao|não|nao foi assim|não foi assim)[,\s]+(?:e |é |sao |são |na verdade )?(.+)$/);
  if(m && m[1] && m[1].length > 0){
    return {tipo: 'reescrever', novo_valor: m[1].trim()};
  }

  m = t.match(/^na verdade\s+(.+)$/);
  if(m && m[1]){
    return {tipo: 'reescrever', novo_valor: m[1].trim()};
  }

  return null;
}

// ============================================================
// DETECTA "X não é Y" — negação direta de fato
// ============================================================
function _detectarNegacaoFato(textoOrig){
  const t = norm(textoOrig || '');
  // padrão: "X não é Y" ou "X nao são Y"
  const m = t.match(/^(.+?)\s+(?:nao|não)\s+(?:é|sao|são|tem|tenho)\s+(.+)$/);
  if(m){
    return {sujeito_neg: m[1].trim(), valor_neg: m[2].trim()};
  }
  return null;
}

// ============================================================
// APLICA CORREÇÃO: pega último fato escrito e reescreve com novo valor
// ============================================================
function _aplicarCorrecao(correcao, parseInfo, userInputNodeId, turnoInfo){
  // Busca último identity_fact/identity_attr NÃO superseded em todo o STATE
  // (não só na cadeia atual — porque a cadeia pode não conter o fato diretamente,
  // só o write_node que aponta pra ele)
  const fatos = STATE.nodes.filter(n =>
    (n.type === 'identity_fact' || n.type === 'identity_attr') &&
    !n._superseded
  ).sort((a, b) => (b._turno || 0) - (a._turno || 0));

  // Pega último (mais recente)
  const ultimoFato = fatos[0];

  if(!ultimoFato){
    return {acao_tomada: 'nenhuma', descricao: 'sem fato pra corrigir'};
  }

  // Marca como superseded e cria novo fato com valor corrigido
  ultimoFato._superseded = true;
  ultimoFato.brightness = Math.max(0.1, (ultimoFato.brightness || 0.5) - 0.4);

  // Aplica revert no dossiê
  if(ultimoFato._sujeito && ultimoFato._grupo && ultimoFato._slot){
    if(ultimoFato._sujeito === '__self__'){
      delete STATE.selfDossier[ultimoFato._slot];
    } else {
      const d = STATE.dossiers[ultimoFato._sujeito]?.[ultimoFato._grupo];
      if(d){
        if(Array.isArray(d[ultimoFato._slot])){
          d[ultimoFato._slot] = d[ultimoFato._slot].filter(v =>
            String(v).toLowerCase() !== String(ultimoFato._valor).toLowerCase()
          );
        } else {
          delete d[ultimoFato._slot];
        }
      }
    }
  }

  // Escreve novo fato com valor corrigido
  if(typeof actionWrite === 'function'){
    const wr = actionWrite({
      sujeito:    ultimoFato._sujeito,
      predicado:  ultimoFato._predicado,
      valor:      correcao.novo_valor,
      userInputNodeId,
      turnoInfo,
    });
    if(wr){
      _addIterLogF(turnoInfo, 'action',
        `correção: reescreveu ${ultimoFato._predicado} → "${correcao.novo_valor}" (era "${ultimoFato._valor}")`,
        {predicado: ultimoFato._predicado, era: ultimoFato._valor, agora: correcao.novo_valor});
      return {
        acao_tomada: 'corrigido',
        descricao: `${ultimoFato._predicado}: ${ultimoFato._valor} → ${correcao.novo_valor}`,
        valor_antigo: ultimoFato._valor,
        valor_novo:   correcao.novo_valor,
        predicado:    ultimoFato._predicado,
      };
    }
  }

  return {acao_tomada: 'nenhuma', descricao: 'falhou ao reescrever'};
}

// ============================================================
// APLICA NEGAÇÃO: marca fato existente como _superseded
// ============================================================
function _aplicarNegacaoFato(negacao, userInputNodeId, turnoInfo){
  const sujNeg = negacao.sujeito_neg;
  const valNeg = negacao.valor_neg;

  // Busca fato que tem esses dois termos juntos
  const candidatos = STATE.nodes.filter(n => {
    if(n.type !== 'identity_fact' && n.type !== 'identity_attr') return false;
    if(n._superseded) return false;
    const sujMatch = (n._sujeito || '').toLowerCase().includes(sujNeg) ||
                     sujNeg.includes((n._sujeito || '').toLowerCase());
    const valMatch = (n._valor || '').toLowerCase().includes(valNeg) ||
                     valNeg.includes((n._valor || '').toLowerCase());
    return sujMatch && valMatch;
  });

  if(candidatos.length > 0){
    for(const c of candidatos){
      c._superseded = true;
      c.brightness = Math.max(0.1, (c.brightness || 0.5) - 0.4);

      // Limpa do dossiê
      if(c._sujeito && c._grupo && c._slot){
        const d = STATE.dossiers[c._sujeito]?.[c._grupo];
        if(d){
          if(Array.isArray(d[c._slot])){
            d[c._slot] = d[c._slot].filter(v =>
              String(v).toLowerCase() !== String(c._valor).toLowerCase()
            );
          } else if(d[c._slot] === c._valor){
            delete d[c._slot];
          }
        }
      }
    }
    _addIterLogF(turnoInfo, 'action',
      `negação aplicada: ${candidatos.length} fato(s) marcado(s) como superseded`,
      {n: candidatos.length});
    return {acao_tomada: 'negado', descricao: `${candidatos.length} fato(s) anulado(s)`};
  }

  return {acao_tomada: 'nenhuma', descricao: 'nenhum fato bate com a negação'};
}

function _addIterLogF(turnoInfo, kind, descricao, dados){
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
window.learnProcessarFeedback = learnProcessarFeedback;

console.log('[learn_feedback v7] carregado');
