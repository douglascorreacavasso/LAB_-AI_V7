// =============================================================================
// ACTION_DOUBT.JS — Lab v7 - Raciocínio
//
// NÚCLEO DE DÚVIDA ATIVO.
//
// FILOSOFIA:
//   Dúvida não é "fallback estúpido". É um ESTADO COGNITIVO importante.
//   Quando o sistema entra em dúvida, ele:
//   1. ANALISA o que causou a dúvida (palavras desconhecidas? sujeito ambíguo?)
//   2. REGISTRA isso como hipóteses pendentes
//   3. DECIDE: vale perguntar agora? ou ficar quieto?
//
// QUANDO USAR:
//   - parser deu modo='desconhecido' mas tem palavras novas
//   - parser deu sujeito ambíguo (várias pessoas mencionadas)
//   - houve contradição não-resolvida na rede
//
// SAÍDA:
//   {decidiu_perguntar, ask_args, doubt_node}
// =============================================================================

'use strict';

// ============================================================
// AÇÃO PRINCIPAL
// args = {
//   parseInfo,
//   userInputNodeId,
//   turnoInfo
// }
// Retorna: {decidiu_perguntar, ask_args?, doubt_node}
// ============================================================
function actionDoubt(args){
  const {parseInfo, userInputNodeId, turnoInfo} = args;

  // Cria action_doubt node
  const doubtNode = makeNode({
    type:        'action_doubt',
    layer:       'decisao',
    origin_type: 'SYSTEM',
    text:        'em dúvida',
    mass:        1,
    fire_id:     nextFireId(),
  });
  STATE.nodes.push(doubtNode);
  if(userInputNodeId){
    STATE.edges.push(makeEdge({
      a: userInputNodeId, b: doubtNode.id, w: 0.5, kind: 'sequence'
    }));
  }
  if(parseInfo?.parse_node_id){
    STATE.edges.push(makeEdge({
      a: parseInfo.parse_node_id, b: doubtNode.id, w: 0.6, kind: 'sequence'
    }));
  }

  // ============================================================
  // ANÁLISE: por que a dúvida?
  // ============================================================
  const causa = _analisarCausa(parseInfo);
  doubtNode._causa = causa.tipo;
  doubtNode._motivo = causa.descricao;

  _addIterLogD(turnoInfo, 'infer',
    `doubt: análise → ${causa.tipo} (${causa.descricao})`,
    {causa: causa.tipo});

  // ============================================================
  // DECISÃO: vale perguntar?
  // ============================================================
  let decidiu_perguntar = false;
  let ask_args = null;

  // Se tem palavra desconhecida significativa, pergunta sobre ela
  if(parseInfo?.palavras_desconhecidas?.length > 0){
    // Filtra desconhecidas que são significativas (não números/símbolos)
    const candidatas = parseInfo.palavras_desconhecidas.filter(p => {
      const t = (p.txt || '').trim();
      if(t.length <= 1) return false;
      if(/^[0-9+\-*/=?!.,]+$/.test(t)) return false;
      return true;
    });

    if(candidatas.length > 0){
      // PRIORIDADE 1: palavra desconhecida no PREDICADO (estrutural)
      // PRIORIDADE 2: palavra desconhecida no VALOR (instância)
      // PRIORIDADE 3: qualquer outra
      const predTxt = (parseInfo.predicado || '').toLowerCase();
      const valTxt  = (parseInfo.valor || '').toLowerCase();

      let candidata = candidatas.find(p => predTxt.includes((p.txt || '').toLowerCase()));
      if(!candidata) candidata = candidatas.find(p => valTxt.includes((p.txt || '').toLowerCase()));
      if(!candidata) candidata = candidatas[0];
      // Verifica se já não criou provisional pra essa palavra antes
      const jaExiste = STATE.nodes.find(n =>
        n.type === 'provisional' && n._categoria_alvo === candidata.txt
      );

      if(!jaExiste){
        // Cria provisional + hipótese + decide perguntar
        const prov = actionCreateProvisional({
          palavra:        candidata.txt,
          palavra_id:     candidata.word_id,
          contexto_hint:  _hintContexto(parseInfo),
          userInputNodeId,
          turnoInfo,
        });

        // Hipótese baseada no contexto detectado
        const hint = _hintContexto(parseInfo);
        let afirma = 'é algo novo';
        if(hint === 'corpo')    afirma = 'é parte do corpo';
        else if(hint === 'cor') afirma = 'é uma cor';
        else if(hint === 'nome')afirma = 'é um nome';

        const hypo = actionHypothesis({
          sobre:        candidata.word_id,
          afirma:       afirma,
          confidence:   0.35,
          evidencia:    parseInfo.palavras_conhecidas || [],
          userInputNodeId,
          parseNodeId:  parseInfo.parse_node_id,
          turnoInfo,
        });

        decidiu_perguntar = true;
        ask_args = {
          tipo:                  'category',
          palavra:               candidata.txt,
          palavra_id:            candidata.word_id,
          hypothesis_node_id:    hypo.hypothesis_node?.id,
          provisional_node_id:   prov.provisional_node?.id,
          userInputNodeId,
          parseNodeId:           parseInfo.parse_node_id,
          turnoInfo,
        };
      }
    }
  }

  _addIterLogD(turnoInfo, 'action',
    `doubt: ${decidiu_perguntar ? 'VAI PERGUNTAR' : 'fica quieto (sem palavra clara pra perguntar)'}`,
    {perguntar: decidiu_perguntar});

  return {
    decidiu_perguntar,
    ask_args,
    doubt_node: doubtNode,
  };
}

// ============================================================
// ANALISA CAUSA DA DÚVIDA
// ============================================================
function _analisarCausa(parseInfo){
  if(!parseInfo){
    return {tipo: 'sem_parse', descricao: 'parse não rodou'};
  }
  if(parseInfo.palavras_desconhecidas?.length > 0){
    return {
      tipo: 'palavras_novas',
      descricao: `${parseInfo.palavras_desconhecidas.length} palavra(s) desconhecida(s): ${parseInfo.palavras_desconhecidas.map(p=>p.txt).join(', ')}`
    };
  }
  if(!parseInfo.sujeito){
    return {tipo: 'sem_sujeito', descricao: 'não consegui identificar sobre quem é'};
  }
  if(parseInfo.modo === 'desconhecido'){
    return {tipo: 'modo_indefinido', descricao: 'sem modo claro (atribuição/posse/pergunta)'};
  }
  return {tipo: 'outro', descricao: 'dúvida genérica'};
}

// ============================================================
// HINT DE CONTEXTO
// Olha as palavras conhecidas pra chutar a categoria provável
// ============================================================
function _hintContexto(parseInfo){
  if(!parseInfo) return null;
  const conhecidas = (parseInfo.palavras_conhecidas || [])
    .map(id => STATE.nodes.find(n => n.id === id)?.text)
    .filter(Boolean)
    .map(t => t.toLowerCase());

  // se a frase fala de "olhos", "mão", "braço" — provavelmente parte do corpo
  if(conhecidas.some(t => ['olhos','olho','mao','mão','braco','braço','perna','cabelo'].includes(t))){
    return 'corpo';
  }
  // se fala de "azul", "verde", "vermelho" — cor
  if(conhecidas.some(t => ['azul','verde','vermelho','amarelo','preto','branco'].includes(t))){
    return 'cor';
  }
  // se fala de "nome", "chamo", "chamam"
  if(conhecidas.some(t => ['nome','chamo','chamam','apelido'].includes(t))){
    return 'nome';
  }
  return null;
}

function _addIterLogD(turnoInfo, kind, descricao, dados){
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
window.actionDoubt = actionDoubt;

console.log('[action_doubt v7] carregado');
