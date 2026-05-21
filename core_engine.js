// =============================================================================
// CORE_ENGINE.JS — Lab v7 - Raciocínio
//
// MOTOR DE CONVERGÊNCIA
// ===================
//
// FILOSOFIA:
//   Não é regex-burrão "if texto contém X, faz Y".
//   É um loop iterativo onde a rede de núcleos se reorganiza até CONVERGIR
//   numa resposta. Cada iteração faz um passo cognitivo pequeno.
//
// FLUXO de calcular(mensagem):
//   iter 1  PARSE        → quebra mensagem em palavras, cria/encontra word-nodes
//   iter 2  PULSO         → propaga energia a partir dessas palavras (Suma §5.1)
//   iter 3  RECALL        → analisa quem foi iluminado, busca padrões coerentes
//   iter 4  HYPOTHESIS    → cria núcleos auxiliares (hipóteses) onde for preciso
//   iter 5  ACTION_DECIDE → decide qual ação tomar (read, write, ask, speak)
//   iter 6  ACTION_EXECUTE→ executa a ação (cria/altera nós)
//   iter 7  SPEAK         → monta a resposta a partir do template iluminado
//   iter 8+ ITERA MAIS    → se não convergiu, refina (até MAX_ITERATIONS)
//
// CADA ITERAÇÃO:
//   - faz UMA coisa pequena
//   - registra no log: {n, descricao, nodes_criados, edges_criadas, ...}
//   - pode marcar "convergiu = true" e parar
//
// SAÍDA:
//   {resposta, logic_chain_id, iteracoes:[], convergiu, tempo_ms}
//
// IMPORTANTE: ações concretas (parse de "X é Y", criação de fato, etc) vão
// chegar nas LEVAS B1 e B2. Esta A2 monta o ESQUELETO do motor + ações básicas
// (saudação responder, criar word-nodes novos, propagar pulso).
// =============================================================================

'use strict';

// ============================================================
// CALCULAR — função principal exposta pra UI
// ============================================================
async function calcular(mensagem){
  const t0 = nowT();
  STATE.turn++;

  const turnoInfo = {
    turno:      STATE.turn,
    session_id: STATE.session_atual,
    entrada:    mensagem,
    timestamp:  new Date().toISOString(),
    iteracoes:  [],
    convergiu:  false,
    resposta:   null,
    logic_chain_id: null,
    tempo_ms:   0,
  };

  // ============================================================
  // ITER 1 — PARSE
  // Quebra a mensagem em palavras. Pra cada palavra:
  //   - se já existe word-node, usa
  //   - se não existe, cria como word + provisional
  // ============================================================
  const parseRes = _iter_parse(mensagem, turnoInfo);
  const tokensAtivos = parseRes.word_node_ids;
  const userInputNodeId = parseRes.user_input_node_id;

  if(tokensAtivos.length === 0){
    _addIterLog(turnoInfo, 'warn',
      '⚠ nenhum token significativo extraído', null);
    _finalizar(turnoInfo, '(mensagem vazia ou só stopwords)', t0);
    return turnoInfo;
  }

  // ============================================================
  // ITER 2 — PULSO
  // Propaga energia a partir das palavras (Suma §5.1)
  // ============================================================
  const pulseRes = _iter_pulso(tokensAtivos, turnoInfo);

  // ============================================================
  // ITER 3 — RECALL: quem ficou iluminado?
  // ============================================================
  const recallRes = _iter_recall(pulseRes.activated, turnoInfo);

  // ============================================================
  // ITER 4 — PARSE SEMÂNTICO (B1): identifica sujeito, modo, predicado, valor
  // ============================================================
  let parseInfo = null;
  if(typeof actionParse === 'function'){
    parseInfo = actionParse(parseRes, recallRes, userInputNodeId, turnoInfo);
  }

  // ============================================================
  // ITER 5 — ROUTER (B1): orquestra ações
  // Sem router (modo legacy A2), cai no decide+execute+speak simples
  // ============================================================
  let routerRes = null;
  let resposta = null;
  let execRes = {action_node_ids: [], output_node_ids: []};

  if(parseInfo && typeof actionRouter === 'function'){
    routerRes = actionRouter(parseInfo, userInputNodeId, turnoInfo);
    resposta = routerRes.resposta_txt;
    execRes.output_node_ids.push(routerRes.output_node_id);
    if(routerRes.speak_node_id) execRes.action_node_ids.push(routerRes.speak_node_id);
  } else {
    // Fallback: lógica simples (A2)
    const decisao = _iter_decide(recallRes.conceitos_ativos, recallRes.templates_ativos, parseRes, turnoInfo);
    execRes = _iter_execute(decisao, userInputNodeId, turnoInfo);
    resposta = _iter_speak(execRes, decisao, turnoInfo);
  }

  // ============================================================
  // LOGIC_CHAIN — registra a cadeia completa
  // ============================================================
  const chain = {
    id:        uid('chain'),
    turno:     STATE.turn,
    timestamp: new Date().toISOString(),
    tipo:      _inferChainTypeB1(parseInfo, routerRes),
    sequencia: [
      userInputNodeId,
      ...tokensAtivos.slice(0, 5),
      parseInfo?.parse_node_id,
      ...(execRes.action_node_ids || []),
      ...(execRes.output_node_ids || []),
    ].filter(Boolean),
    modo:      parseInfo?.modo,
    sujeito:   parseInfo?.sujeito,
    acoes:     routerRes?.acoes_disparadas || [],
    marcada:   null,
  };
  STATE.logic_chains.push(chain);
  turnoInfo.logic_chain_id = chain.id;

  // ============================================================
  // FINALIZA
  // ============================================================
  _finalizar(turnoInfo, resposta, t0);
  turnoInfo.convergiu = true;
  return turnoInfo;
}

// ============================================================
// ITER 1 — PARSE
// ============================================================
function _iter_parse(mensagem, turnoInfo){
  const toks = tokens(mensagem);
  const t_norm = norm(mensagem);

  const word_node_ids = [];
  const novos = [];

  // Tenta também match de bigramas conhecidos da seed ("bom dia", "boa noite")
  const bigramas_seed = ['bom dia', 'boa tarde', 'boa noite', 'na verdade', 'nao é', 'não é'];
  let mensagemRest = ' ' + t_norm + ' ';
  for(const bg of bigramas_seed){
    if(mensagemRest.includes(' ' + bg + ' ')){
      const id = 'word_' + bg.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const existing = STATE.nodes.find(n => n.id === id);
      if(existing){
        word_node_ids.push(existing.id);
        existing.lastAccessed = nowT();
        mensagemRest = mensagemRest.replace(' ' + bg + ' ', ' ');
      }
    }
  }

  // Cria nó user_input pra mensagem inteira (vive na surface)
  const inputNode = makeNode({
    type:        'user_input',
    layer:       'surface',
    origin_type: 'CHAT',
    text:        mensagem,
    tokens:      toks,
    mass:        2,
    energy:      0,
    session_id:  STATE.session_atual,
  });
  STATE.nodes.push(inputNode);

  // Cria/encontra word-nodes pra cada token
  // symMap pra operadores (espelha seed_operadores.js)
  const _symMapEng = {
    '+':'plus','-':'minus','*':'star','x':'x','×':'times','/':'slash','÷':'div','=':'eq',
  };
  for(const tok of toks){
    // Dígito puro? procura num_X
    let id, wn;
    if(/^-?\d+(\.\d+)?$/.test(tok)){
      id = 'num_' + tok;
      wn = STATE.nodes.find(n => n.id === id);
    }
    // Operador matemático simbólico? procura op_X via symMap
    if(!wn && _symMapEng[tok]){
      id = 'op_' + _symMapEng[tok];
      wn = STATE.nodes.find(n => n.id === id);
    }
    // Senão, lookup word_X normal
    if(!wn){
      id = 'word_' + tok.replace(/[^a-z0-9_]/g, '');
      if(id === 'word_') id = 'word_' + Math.random().toString(36).slice(2,7);
      wn = STATE.nodes.find(n => n.id === id);
    }

    if(!wn){
      // Não existe → cria como provisional
      wn = makeNode({
        id:          id,
        type:        'word',
        layer:       'surface',
        origin_type: 'CHAT',
        text:        tok,
        mass:        1,
        provisional: true,
      });
      STATE.nodes.push(wn);
      novos.push({id: wn.id, tipo: 'word', txt: tok, provisional: true});

      // Liga word ao input
      STATE.edges.push(makeEdge({
        a: wn.id, b: inputNode.id, w: 0.4, kind: 'co-occur'
      }));
    } else {
      wn.lastAccessed = nowT();
      wn.mass = (wn.mass || 1) + 0.1;       // ganha massa por uso
      // Liga ao input mesmo se já existia
      const has = STATE.edges.find(e =>
        (e.a === wn.id && e.b === inputNode.id) || (e.a === inputNode.id && e.b === wn.id)
      );
      if(!has){
        STATE.edges.push(makeEdge({
          a: wn.id, b: inputNode.id, w: 0.5, kind: 'co-occur'
        }));
      }
    }
    word_node_ids.push(wn.id);
  }

  _addIterLog(turnoInfo, 'create',
    `parse: extraiu ${toks.length} token(s), criou ${novos.length} novo(s) word-node(s)`,
    {tokens: toks, novos: novos.map(n => n.txt)});

  return {word_node_ids, user_input_node_id: inputNode.id, novos};
}

// ============================================================
// ITER 2 — PULSO
// ============================================================
function _iter_pulso(seedIds, turnoInfo){
  // Self-Core sempre participa do pulso (doa e volta a 0)
  const allSeeds = [...seedIds];
  if(STATE.nodes.find(n => n.id === '__SELF_CORE__')){
    allSeeds.push('__SELF_CORE__');
  }

  const res = propagatePulse(allSeeds, {pulse_initial: PHYSICS.PULSO_INICIAL});

  _addIterLog(turnoInfo, 'pulse',
    `pulso: ${allSeeds.length} sementes → ${res.nucleiTouched} núcleos ativados, ${res.edgesUsed.size} arestas iluminadas, ${res.reinforced.length} reforçadas`,
    {nucleiTouched: res.nucleiTouched, edgesLit: res.edgesUsed.size, reinforced: res.reinforced.length});

  return res;
}

// ============================================================
// ITER 3 — RECALL
// Olha quais conceitos e templates ficaram com energia alta
// ============================================================
function _iter_recall(activatedMap, turnoInfo){
  const lit = getLitNodes(activatedMap, PHYSICS.THRESHOLD_LIT);

  const conceitos_ativos = lit
    .filter(x => x.node.type === 'concept')
    .map(x => ({id: x.node.id, text: x.node.text, energy: x.energy}));

  const templates_ativos = lit
    .filter(x => x.node.type === 'generated_msg' && x.node._template_tag)
    .map(x => ({
      id: x.node.id,
      tag: x.node._template_tag,
      text: x.node.text,
      energy: x.energy
    }));

  _addIterLog(turnoInfo, 'infer',
    `recall: ${conceitos_ativos.length} conceito(s) ativo(s), ${templates_ativos.length} template(s) candidato(s)`,
    {conceitos: conceitos_ativos.map(c => c.text), templates: templates_ativos.length});

  return {lit, conceitos_ativos, templates_ativos};
}

// ============================================================
// ITER 4 — DECIDE
// Escolhe qual ação tomar com base nos conceitos ativos.
// ============================================================
function _iter_decide(conceitos, templates, parseRes, turnoInfo){
  // Mapeia conceito_id → energia, pra checagens rápidas
  const concEnergy = {};
  for(const c of conceitos) concEnergy[c.id] = c.energy;

  let acao = 'action_doubt';
  let template_tag = null;
  let motivo = '';

  // Regras simples de decisão (A2 — vão crescer nas próximas levas)
  if(concEnergy['conc_saudacao'] && concEnergy['conc_saudacao'] > 5){
    acao = 'action_speak';
    template_tag = 'saudacao_resposta';
    motivo = 'saudação detectada (conc_saudacao iluminado)';
  }
  else if(concEnergy['conc_despedida'] && concEnergy['conc_despedida'] > 5){
    acao = 'action_speak';
    template_tag = 'despedida_resposta';
    motivo = 'despedida detectada';
  }
  else if(concEnergy['conc_fb_pos'] && concEnergy['conc_fb_pos'] > 5){
    acao = 'action_speak';
    template_tag = 'fb_resposta';
    motivo = 'feedback positivo';
  }
  else if(concEnergy['conc_fb_neg'] && concEnergy['conc_fb_neg'] > 5){
    acao = 'action_speak';
    template_tag = 'fb_resposta';
    motivo = 'feedback negativo';
  }
  else if(concEnergy['conc_pergunta'] && concEnergy['conc_pergunta'] > 3){
    acao = 'action_speak';
    template_tag = 'pergunta_sem_resposta';
    motivo = 'pergunta detectada (sem rule disponível — LEVA C2 trará)';
  }
  else if(concEnergy['conc_atribuicao'] && concEnergy['conc_atribuicao'] > 3){
    acao = 'action_speak';
    template_tag = 'atrib_resposta';
    motivo = 'atribuição detectada (LEVA B1 trará action_write real)';
  }
  else {
    acao = 'action_doubt';
    motivo = 'nenhum conceito iluminado forte — sistema em dúvida';
  }

  _addIterLog(turnoInfo, 'action',
    `decide: ${acao}` + (template_tag ? ` (tag=${template_tag})` : '') + ` — ${motivo}`,
    {acao, template_tag, motivo});

  return {acao, template_tag, motivo, conceitos_ativos: conceitos};
}

// ============================================================
// ITER 5 — EXECUTE
// Executa a ação. Cria action-node na layer apropriada,
// liga ao input e ao output que vier.
// ============================================================
function _iter_execute(decisao, userInputNodeId, turnoInfo){
  const action_node_ids = [];
  const output_node_ids = [];

  // Cria um action-node representando a ação tomada
  const actNode = makeNode({
    type:        decisao.acao,
    layer:       defaultLayerForType(decisao.acao),
    origin_type: 'SYSTEM',
    text:        decisao.acao + (decisao.template_tag ? ' [' + decisao.template_tag + ']' : ''),
    mass:        1,
    fire_id:     nextFireId(),
  });
  STATE.nodes.push(actNode);
  action_node_ids.push(actNode.id);

  // Liga input → action
  STATE.edges.push(makeEdge({
    a: userInputNodeId, b: actNode.id, w: 0.6, kind: 'sequence'
  }));

  _addIterLog(turnoInfo, 'action',
    `execute: criou ${decisao.acao} (id=${actNode.id.slice(-6)})`,
    {action_id: actNode.id});

  return {action_node_ids, output_node_ids, decisao, actNode};
}

// ============================================================
// ITER 6 — SPEAK
// Pega o template com mais energia da tag pedida e materializa
// como resposta. Se não tem template específico, usa fallback.
// ============================================================
function _iter_speak(execRes, decisao, turnoInfo){
  const tag = decisao.template_tag;
  let respostaTxt = null;

  if(tag){
    // Procura templates da tag entre os iluminados; pega o mais energético
    const candidatos = STATE.nodes
      .filter(n => n._template_tag === tag)
      .sort((a, b) => (b.energy || 0) - (a.energy || 0));

    if(candidatos.length > 0){
      const escolhido = candidatos[0];
      respostaTxt = escolhido.text;

      // Ponte de Luz manual no template escolhido
      escolhido.lastAccessed = nowT();
      escolhido.mass = (escolhido.mass || 1) + 0.2;

      _addIterLog(turnoInfo, 'infer',
        `speak: escolheu template "${tag}" → "${respostaTxt.slice(0, 60)}"`,
        {template_id: escolhido.id, txt: respostaTxt});
    }
  }

  // Fallback se não achou template
  if(!respostaTxt){
    if(decisao.acao === 'action_doubt'){
      respostaTxt = 'hmm, ainda não sei muito sobre isso. me conta mais?';
    } else {
      respostaTxt = 'ok.';
    }
    _addIterLog(turnoInfo, 'warn',
      `speak: usou fallback ("${respostaTxt}")`, null);
  }

  // Cria nó generated_msg na surface representando a resposta
  const outNode = makeNode({
    type:        'generated_msg',
    layer:       'surface',
    origin_type: 'GENERATED',
    text:        respostaTxt,
    mass:        1.5,
    session_id:  STATE.session_atual,
  });
  STATE.nodes.push(outNode);

  // Liga action → output
  if(execRes.actNode){
    STATE.edges.push(makeEdge({
      a: execRes.actNode.id, b: outNode.id, w: 0.7, kind: 'sequence'
    }));
  }
  execRes.output_node_ids.push(outNode.id);

  return respostaTxt;
}

// ============================================================
// HELPERS
// ============================================================
function _inferChainType(decisao){
  if(decisao.acao === 'action_doubt')  return 'logic_chain';
  if(decisao.template_tag === 'pergunta_sem_resposta') return 'logic_chain_recall';
  if(decisao.template_tag === 'atrib_resposta')        return 'logic_chain_inference';
  return 'logic_chain';
}

// Inferência de tipo pra B1 (usa parseInfo + routerRes)
function _inferChainTypeB1(parseInfo, routerRes){
  if(!parseInfo) return 'logic_chain';
  const modo = parseInfo.modo;
  if(modo === 'atribuicao' || modo === 'posse') return 'logic_chain_inference';
  if(modo === 'pergunta'){
    if(routerRes?.acoes_disparadas?.includes('recall')) return 'logic_chain_recall';
    return 'logic_chain_recall';
  }
  if(modo === 'feedback_pos' || modo === 'feedback_neg') return 'logic_chain';
  if(modo === 'contradicao')      return 'logic_chain_contradiction';
  if(modo === 'social_saudacao')  return 'logic_chain';
  if(modo === 'social_despedida') return 'logic_chain';
  return 'logic_chain';
}

function _addIterLog(turnoInfo, kind, descricao, dados){
  turnoInfo.iteracoes.push({
    n:          turnoInfo.iteracoes.length + 1,
    kind:       kind,
    descricao:  descricao,
    dados:      dados || null,
    timestamp:  new Date().toISOString(),
  });
}

function _finalizar(turnoInfo, resposta, t0){
  turnoInfo.resposta = resposta;
  turnoInfo.tempo_ms = nowT() - t0;
  STATE.iterations.push(turnoInfo);
  STATE.lastTurn = {
    user:    turnoInfo.entrada,
    ai:      resposta,
    subject: STATE.activeSubject,
    chain_id: turnoInfo.logic_chain_id,
  };
  // Decay leve global após o turno
  decayEnergiaTick();

  // C1: meditação automática a cada 8 turnos
  if(typeof learnMeditar === 'function' && STATE.turn > 0 && STATE.turn % 8 === 0){
    learnMeditar({turnoInfo, automatica: true});
  }
}

// ============================================================
// ESTATÍSTICAS DO MOTOR
// ============================================================
function engineStats(){
  return {
    total_turnos:    STATE.iterations.length,
    convergiram:     STATE.iterations.filter(i => i.convergiu).length,
    tempo_medio_ms:  STATE.iterations.length > 0
                     ? STATE.iterations.reduce((s, i) => s + (i.tempo_ms || 0), 0) / STATE.iterations.length
                     : 0,
    cadeias:         STATE.logic_chains.length,
  };
}

// ============================================================
// EXPOR
// ============================================================
window.calcular     = calcular;
window.engineStats  = engineStats;

console.log('[core_engine v7] carregado — motor de convergência pronto');
