// =============================================================================
// ENGINE_SIMULATOR.JS — Lab v7.1-B - Raciocínio
//
// O MOTOR DE AUTO-TESTE QUE FALTAVA.
//
// FILOSOFIA:
//   Até agora o motor fazia: parse → pulso → decide UMA ação → fala.
//   Resultado: 28% de "hmm não sei" porque ele tentava UMA coisa e desistia.
//
//   Agora o motor faz: parse → pulso → GERA N CANDIDATAS DE RESPOSTA →
//   SIMULA CADA UMA → mede custo → escolhe a melhor → aplica de verdade.
//
//   É como humano refletindo "espera, talvez essa frase signifique X...
//   não, mais provável Y... ah Y faz mais sentido pelo contexto".
//
// COMO FUNCIONA:
//   1. Snapshot do STATE
//   2. Pra cada estratégia candidata:
//      - Aplica em fork temporário
//      - Mede custo (criou provisional? contradição? respondeu vazio?)
//      - Reverte
//   3. Escolhe estratégia de menor custo
//   4. Aplica no STATE real
//
// ESTRATÉGIAS CANDIDATAS:
//   A. SAUDAÇÃO          → responde com template saudação
//   B. CONSUME_PENDING   → trata como resposta à última pergunta pendente
//   C. RECALL_ATIVO      → busca fatos do user/self
//   D. WRITE_FATO        → grava como atribuição
//   E. COMPUTE_MATH      → tenta resolver matematicamente
//   F. ACK_CURTO         → "beleza" / "ok" / "entendi"
//   G. ASK_FOCO          → pergunta dirigida sobre palavra-chave
//   H. PERGUNTA_NEUTRA   → "hmm não sei" (último recurso)
//
// O PROMETIDO: "ele tenta pelo menos 3 vezes o começo da conversa antes de
// te dar uma resposta". Agora ele tenta 8 estratégias internas, escolhe a
// melhor por custo, e SÓ ENTÃO responde.
// =============================================================================

'use strict';

// ============================================================
// FUNÇÃO PRINCIPAL — chamada pelo core_engine antes de finalizar
// args = {entrada, parseRes, parseInfo, userInputNodeId, turnoInfo}
// Retorna: {melhor_estrategia, resposta, candidatas, custos, escolheu_por}
// ============================================================
function engineSimulate(args){
  const {entrada, parseInfo, userInputNodeId, turnoInfo} = args;
  const t0 = nowT();

  // 1. SNAPSHOT do STATE atual (vamos restaurar após cada simulação)
  const snap = _snapshotForSim();

  // 2. Lista de estratégias a testar
  const estrategias = _listarEstrategias(parseInfo, entrada);

  // 3. Pra cada estratégia: simula em fork, mede custo
  const candidatas = [];
  for(const est of estrategias){
    // Restaura snapshot ANTES de cada simulação
    _restoreForSim(snap);

    try {
      const resultado = _simularEstrategia(est, args);
      if(resultado && resultado.resposta){
        const custo = _calcularCusto(resultado, snap, est, entrada, parseInfo);
        candidatas.push({
          estrategia: est.nome,
          resposta:   resultado.resposta,
          custo:      custo,
          motivo:     resultado.motivo,
          _resultado: resultado,
          _delta:     _calcularDelta(snap),
        });
      }
    } catch(e){
      // Estratégia falhou — só ignora
      candidatas.push({
        estrategia: est.nome,
        resposta:   null,
        custo:      999,
        motivo:     'erro: ' + e.message,
      });
    }
  }

  // 4. Restaura snapshot final ANTES de aplicar de verdade
  _restoreForSim(snap);

  // 5. Escolhe melhor candidata (menor custo)
  candidatas.sort((a, b) => a.custo - b.custo);
  const melhor = candidatas[0];

  if(!melhor || !melhor.resposta){
    return {
      escolheu_por:    'fallback',
      melhor_estrategia: 'pergunta_neutra',
      resposta:        'hmm, não sei ainda. me conta mais?',
      candidatas:      candidatas,
      tempo_ms:        nowT() - t0,
    };
  }

  // Log da decisão
  if(turnoInfo){
    const top3 = candidatas.slice(0, 3)
      .map(c => `${c.estrategia}(${c.custo.toFixed(1)})`)
      .join(' < ');
    turnoInfo.iteracoes.push({
      n:         turnoInfo.iteracoes.length + 1,
      kind:      'infer',
      descricao: `simulator: testou ${candidatas.length} estratégias → escolheu "${melhor.estrategia}" (custo=${melhor.custo.toFixed(1)})`,
      dados:     {top3, escolhida: melhor.estrategia, motivo: melhor.motivo},
      timestamp: new Date().toISOString(),
    });
  }

  return {
    escolheu_por:      'menor_custo',
    melhor_estrategia: melhor.estrategia,
    resposta:          melhor.resposta,
    candidatas:        candidatas,
    tempo_ms:          nowT() - t0,
    motivo:            melhor.motivo,
  };
}

// ============================================================
// LISTA DE ESTRATÉGIAS A TESTAR (com filtragem inteligente)
// ============================================================
function _listarEstrategias(parseInfo, entrada){
  const ests = [];
  const tOrig = norm(entrada || '');
  const tokensIn = tOrig.split(' ').filter(t => t && !STOPWORDS.has(t));

  // A. SAUDAÇÃO — sempre disponível se conceito iluminado
  ests.push({nome: 'saudacao', tipo: 'simple', tag: 'saudacao_resposta'});

  // B. CONSUME_PENDING — só se há pendingClarify
  if(STATE.pendingClarify){
    ests.push({nome: 'consume_pending', tipo: 'pending'});
  }

  // C. RECALL — só se sujeito ativo existe
  if(STATE.activeSubject){
    ests.push({nome: 'recall', tipo: 'recall', alvo: STATE.activeSubject});
  }
  // Recall do self se frase menciona "voce/seu"
  if(/(voce|você|vc|seu|sua|seus|suas)/.test(tOrig)){
    ests.push({nome: 'recall_self', tipo: 'recall', alvo: '__self__'});
  }

  // D. WRITE — só se parse detectou sujeito+predicado+valor coerente
  if(parseInfo?.sujeito && (parseInfo.predicado || parseInfo.valor)){
    ests.push({nome: 'write', tipo: 'write'});
  }

  // E. COMPUTE_MATH — só se frase tem dígitos
  if(/[0-9]/.test(tOrig) && /[+\-*/=÷×]|mais|menos|vezes|igual/.test(tOrig)){
    ests.push({nome: 'compute', tipo: 'compute'});
  }

  // F. ACK_CURTO — quando frase é só interjeição/concordância
  const interjeicoes = ['ok','beleza','sim','isso','tá','perfeito','show','massa','legal','top','obrigado','obrigada','valeu'];
  if(tokensIn.length <= 2 && tokensIn.some(t => interjeicoes.includes(t))){
    ests.push({nome: 'ack_curto', tipo: 'ack'});
  }

  // G. ASK_FOCO — só se há palavra desconhecida real (não no dict, não typo)
  if(parseInfo?.palavras_desconhecidas?.length > 0){
    ests.push({nome: 'ask_foco', tipo: 'ask'});
  }

  // H. EXPLICA — quando há frase explicativa longa ("é uma X", "significa")
  if(tokensIn.length > 3 && /^(significa|quer dizer|é uma|é um|é o|é a|sao|são|trata-se)/i.test(tOrig)){
    ests.push({nome: 'explica_definicao', tipo: 'explica'});
  }

  // I. NEUTRA — sempre último recurso (custo alto)
  ests.push({nome: 'pergunta_neutra', tipo: 'neutra'});

  return ests;
}

// ============================================================
// SIMULA UMA ESTRATÉGIA — aplica em fork, retorna resposta + delta
// ============================================================
function _simularEstrategia(est, args){
  const {userInputNodeId, parseInfo, turnoInfo} = args;

  switch(est.tipo){

    case 'simple': {
      // SAUDAÇÃO: pega template iluminado
      const tplTag = est.tag || 'saudacao_resposta';
      const candidatos = STATE.nodes
        .filter(n => n._template_tag === tplTag)
        .sort((a, b) => (b.energy || 0) - (a.energy || 0));
      if(candidatos.length === 0) return null;
      // Só vale se conc_saudacao iluminado MINIMAMENTE
      const concSaud = STATE.nodes.find(n => n.id === 'conc_saudacao');
      const energiaConcSaud = concSaud?.energy || 0;
      if(energiaConcSaud < 3 && tplTag === 'saudacao_resposta'){
        return null;     // não há sinal de saudação
      }
      return {resposta: candidatos[0].text, motivo: `template "${tplTag}" iluminado`};
    }

    case 'pending': {
      // Trata como resposta à pendingClarify
      if(!STATE.pendingClarify || typeof actionExplain !== 'function') return null;
      const pcCtx = STATE.pendingClarify;
      const exp = actionExplain({
        pendingClarify: pcCtx,
        userInputNodeId,
        parseInfo,
        turnoInfo: null,    // não loga na simulação
      });
      if(!exp) return null;

      // Se explicou de verdade, promove provisional
      let promoMsg = '';
      if(exp.explicou && typeof learnPromoverProvisional === 'function'){
        const provInfo = STATE.nodes.find(n => n.id === pcCtx?.provisional_id);
        if(provInfo){
          const prom = learnPromoverProvisional({
            provisional_id:    pcCtx.provisional_id,
            categoria_dita:    exp.explicacao?.categoria,
            hypothesis_id:     pcCtx.hypothesis_id,
            palavra_node_id:   pcCtx.palavra_node_id,
            userInputNodeId,
            turnoInfo: null,
          });
          if(prom?.promovida){
            promoMsg = ` agora sei que "${provInfo._categoria_alvo}" é ${prom.concept_node?.text || prom.concept_oficial_id}.`;
          }
        }
      }

      let resp;
      if(exp.confirmou)  resp = 'beleza, anotado!' + promoMsg;
      else if(exp.negou) resp = 'ok, deixa eu repensar.';
      else if(exp.explicou) resp = 'entendi!' + promoMsg + ' obrigado por explicar.';
      else resp = 'ok, vou tentar de novo.';

      return {resposta: resp, motivo: 'consumiu pendingClarify'};
    }

    case 'recall': {
      // Recall do sujeito
      if(typeof actionRecallSubject !== 'function') return null;
      const rec = actionRecallSubject(est.alvo, null, userInputNodeId);
      if(!rec || !rec.texto || rec.fatos.length === 0){
        return null;     // recall vazio — pena alta
      }
      return {resposta: rec.texto, motivo: `recall ${est.alvo} achou ${rec.fatos.length} fato(s)`};
    }

    case 'write': {
      // Write — só se vale a pena
      if(typeof actionWrite !== 'function') return null;
      // Aborta se predicado é frase (bug do "sim mas nome")
      const pred = parseInfo.predicado || '';
      if(_predicadoEhFrase(pred)){
        return null;     // bloqueia
      }
      let suj = parseInfo.sujeito;
      let val = parseInfo.valor;
      if(suj === '__pendente__'){
        if(parseInfo.predicado === 'nome' && val && STATE.activeSubject){
          suj = STATE.activeSubject;
        } else {
          return null;
        }
      }
      if(!suj || !val) return null;

      const wr = actionWrite({
        sujeito: suj, predicado: pred, valor: val,
        userInputNodeId,
        parseNodeId: parseInfo.parse_node_id,
        turnoInfo: null,
      });
      if(!wr || !wr.fato) return null;

      const resp = wr.conflito
        ? `mudei de "${wr.valor_anterior}" para "${val}". anotado!`
        : `ok, anotei: ${pred} → ${val}.`;
      return {resposta: resp, motivo: `write ${pred}=${val}`};
    }

    case 'compute': {
      // Math: tenta aplicar rule existente
      if(typeof actionCompute !== 'function') return null;
      const c = actionCompute({userInputNodeId, parseInfo, turnoInfo: null});
      if(!c.calculou){
        // Tenta detectar como exemplo
        if(typeof learnDetectarPattern === 'function'){
          const ld = learnDetectarPattern({userInputNodeId, parseInfo, turnoInfo: null});
          if(ld.detectou_pattern){
            if(ld.promoveu_pra_rule){
              return {resposta: `entendi! aprendi a regra: ${_simbolo(ld.promoveu_pra_rule._operador)}(a,b) = ${ld.promoveu_pra_rule._formula}. agora sei calcular isso.`, motivo: 'aprendeu rule'};
            }
            const n = (ld.pattern_node?._exemplos || []).length;
            return {resposta: `anotei. já vi ${n} exemplo(s) desse padrão. me dá mais pra eu confirmar.`, motivo: 'coletou exemplo'};
          }
        }
        return null;
      }
      return {resposta: `${c.a} ${c.op_simbolo} ${c.b} = ${c.resultado}`, motivo: `aplicou rule ${c.rule_id}`};
    }

    case 'ack': {
      // ACK curto — variado conforme contexto
      const opts = ['beleza!', 'show!', 'entendi.', 'tá!', 'ok.'];
      return {resposta: opts[Math.floor(Math.random() * opts.length)], motivo: 'ack neutro'};
    }

    case 'ask': {
      // Ask focado — mas só se a palavra desconhecida NÃO está no dict
      const candidatas = (parseInfo.palavras_desconhecidas || []).filter(p => {
        const t = (p.txt || '').toLowerCase();
        if(t.length < 3) return false;
        if(/^[0-9+\-*/=?!.,]+$/.test(t)) return false;
        if(typeof dictKnows === 'function' && dictKnows(t)) return false;
        // Também ignora typo já detectado
        if(typeof learnDetectarTypo === 'function'){
          const typ = learnDetectarTypo(t, {max_dist: 2});
          if(typ?.ehTypo) return false;
        }
        return true;
      });
      if(candidatas.length === 0) return null;
      const candidata = candidatas[0];
      const opts = [
        `não conheço "${candidata.txt}". o que é?`,
        `"${candidata.txt}" é o quê? me explica?`,
        `o que significa "${candidata.txt}"?`,
      ];
      return {resposta: opts[Math.floor(Math.random() * opts.length)], motivo: `ask sobre ${candidata.txt}`};
    }

    case 'explica': {
      // É uma definição livre — vale ack
      return {resposta: 'entendi! anotei isso.', motivo: 'reconheceu explicação livre'};
    }

    case 'neutra': {
      // Última opção
      return {resposta: 'hmm, ainda não sei muito sobre isso. me conta mais?', motivo: 'sem hipótese'};
    }
  }
  return null;
}

// ============================================================
// CÁLCULO DE CUSTO DA CANDIDATA
// Pena BAIXA = candidata boa. Pena ALTA = candidata ruim.
// ============================================================
function _calcularCusto(resultado, snap, est, entrada, parseInfo){
  let custo = 0;

  // 1. PENA POR FALLBACK
  if(est.nome === 'pergunta_neutra') custo += 12;     // último recurso

  // 2. PENA POR RESPOSTA-VAZIA
  if(/^(hmm|não sei|me ensina|me conta mais)/.test((resultado.resposta || '').toLowerCase())){
    custo += 8;
  }

  // 3. BÔNUS POR USAR ESTRATÉGIA ESPECÍFICA EM SITUAÇÃO COERENTE
  if(est.nome === 'consume_pending' && STATE.pendingClarify){
    custo -= 3;     // tem pendência → tratar é forte
  }
  if(est.nome === 'compute' && /[0-9]/.test(entrada)){
    custo -= 4;
  }
  if(est.nome === 'recall' || est.nome === 'recall_self'){
    // v7.1-B FIX: recall SÓ é bom quando user pediu EXPLICITAMENTE
    // Usa texto ORIGINAL (não norm) pra detectar "?" — o norm() REMOVE !?.,
    const entOrig = (entrada || '').toLowerCase().trim();
    const tNorm = norm(entrada || '').trim();
    const pediuRecall =
      /\?\s*$/.test(entOrig) ||
      /^(qual|quem|como|sabe|lembra|conhece|liste|listar|enumera|me diz)/.test(tNorm) ||
      /(o que sabe|que sabe sobre|lista o que)/.test(tNorm);
    if(pediuRecall){
      custo -= 6;
    } else {
      custo += 15;  // pena MUITO alta — pior que fallback genérico
    }
  }
  if(est.nome === 'write'){
    custo -= 3;     // write é progresso
  }
  if(est.nome === 'saudacao'){
    // Só faz sentido se input curto e tipo saudação
    const tOrig = norm(entrada || '');
    if(/^(oi|ola|olá|opa|eai|bom dia|boa tarde|boa noite|hey)/.test(tOrig)){
      custo -= 5;
    } else {
      custo += 5;     // saudação fora de contexto = ruim
    }
  }

  // 4. PENA POR CRIAR PROVISIONAL ÓRFÃ
  const deltaProv = _contarProvisionaisAguardando() - (snap._provisionaisAguardando || 0);
  if(deltaProv > 0) custo += deltaProv * 3;

  // 5. PENA POR CRIAR CONTRADIÇÃO
  const deltaContra = (STATE.contradicoes || []).length - (snap.contradicoes?.length || 0);
  if(deltaContra > 0) custo += deltaContra * 8;

  // 6. PENA POR SUPERSEDED (sobrescrita)
  const deltaSup = STATE.nodes.filter(n => n._superseded).length - (snap._superseded || 0);
  if(deltaSup > 0) custo += deltaSup * 1.5;

  // 7. BÔNUS POR REUSAR CONCEPT EXISTENTE
  // (não conta agora — difícil mediar)

  // 8. PENA SE WRITE TEM PREDICADO-FRASE
  if(est.nome === 'write' && parseInfo){
    if(_predicadoEhFrase(parseInfo.predicado)) custo += 6;
  }

  return custo;
}

// ============================================================
// HELPER: predicado é "frase" (3+ palavras OU contém verbo do dict)?
// ============================================================
function _predicadoEhFrase(pred){
  if(!pred) return false;
  const p = String(pred).toLowerCase().trim();
  if(p.length === 0) return false;
  // mais de 2 palavras = frase
  const partes = p.split(/\s+/);
  if(partes.length > 2) return true;
  // contém verbo do dicionário (é, sou, sim, mas, claro etc) = frase
  for(const palavra of partes){
    if(typeof dictClasse === 'function'){
      const cl = dictClasse(palavra);
      if(cl === 'verbo' || cl === 'interjeicao' || cl === 'conectivo') return true;
    }
  }
  return false;
}

// ============================================================
// HELPER: snapshot leve pra simulação
// ============================================================
function _snapshotForSim(){
  // Aqui não fazemos deep-clone do STATE inteiro — caro demais por turno.
  // Fazemos snapshot SELETIVO do que muda em escrita/recall.
  return {
    nodesCount:    STATE.nodes.length,
    edgesCount:    STATE.edges.length,
    nodes:         STATE.nodes.slice(),    // shallow copy do array (não dos nós)
    edges:         STATE.edges.slice(),
    dossiers:      JSON.parse(JSON.stringify(STATE.dossiers || {})),
    selfDossier:   JSON.parse(JSON.stringify(STATE.selfDossier || {})),
    contradicoes:  (STATE.contradicoes || []).slice(),
    pendingClarify:STATE.pendingClarify ? JSON.parse(JSON.stringify(STATE.pendingClarify)) : null,
    definitions:   JSON.parse(JSON.stringify(STATE.definitions || {})),
    activeSubject: STATE.activeSubject,
    _provisionaisAguardando: _contarProvisionaisAguardando(),
    _superseded:   STATE.nodes.filter(n => n._superseded).length,
    // Snapshot de propriedades mutáveis dos nós existentes
    _nodeProps:    STATE.nodes.map(n => ({id: n.id, energy: n.energy, mass: n.mass, _superseded: n._superseded, _status: n._status, _provisional: n._provisional})),
  };
}

function _restoreForSim(snap){
  // Restaura arrays nodes/edges (cortando o que foi adicionado durante simulação)
  STATE.nodes = snap.nodes.slice();
  STATE.edges = snap.edges.slice();
  STATE.dossiers = JSON.parse(JSON.stringify(snap.dossiers));
  STATE.selfDossier = JSON.parse(JSON.stringify(snap.selfDossier));
  STATE.contradicoes = snap.contradicoes.slice();
  STATE.pendingClarify = snap.pendingClarify ? JSON.parse(JSON.stringify(snap.pendingClarify)) : null;
  STATE.definitions = JSON.parse(JSON.stringify(snap.definitions));
  STATE.activeSubject = snap.activeSubject;
  // Restaura propriedades dos nós que sobrevivem
  const propsById = {};
  for(const p of snap._nodeProps) propsById[p.id] = p;
  for(const n of STATE.nodes){
    const p = propsById[n.id];
    if(p){
      n.energy = p.energy;
      n.mass = p.mass;
      n._superseded = p._superseded;
      n._status = p._status;
      n._provisional = p._provisional;
    }
  }
}

function _calcularDelta(snap){
  return {
    delta_nodes: STATE.nodes.length - snap.nodesCount,
    delta_edges: STATE.edges.length - snap.edgesCount,
  };
}

function _contarProvisionaisAguardando(){
  return STATE.nodes.filter(n => n.type === 'provisional' && n._status === 'aguardando_resposta').length;
}

function _simbolo(conc){
  return ({
    'conc_op_soma': '+', 'conc_op_subt': '-', 'conc_op_mult': '×', 'conc_op_div': '÷',
  })[conc] || '?';
}

// ============================================================
// EXPOR
// ============================================================
window.engineSimulate = engineSimulate;

console.log('[engine_simulator v7.1-B] carregado — auto-teste de candidatas');
