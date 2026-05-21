// =============================================================================
// ACTION_PARSE.JS — Lab v7 - Raciocínio
//
// QUEBRA A FRASE USANDO A REDE — não usando regex de string.
//
// FILOSOFIA:
//   O parse não pergunta "a frase contém 'meu'?". Ele pergunta:
//   "alguma palavra desta frase tem aresta 'refere_a' apontando pra conc_eu?".
//   Se sim, o sujeito é o usuário ativo.
//
// O QUE O PARSE PRODUZ:
//   {
//     sujeito:    'douglas' | '__self__' | null,
//     evidencia:  ['meu'],                       // palavras que indicaram sujeito
//     modo:       'atribuicao'|'posse'|'pergunta'|'feedback_pos'|'feedback_neg'|'social'|'desconhecido',
//     predicado:  'olhos' | 'nome' | ...         // o "o quê" da frase (se houver)
//     valor:      'azuis' | 'douglas' | ...      // o valor atribuído (se houver)
//     conceitos_ativos: [...]                    // conceitos seed iluminados (do recall)
//     palavras_conhecidas:   [...word_ids],
//     palavras_desconhecidas:[...{txt, word_id}], // criadas como provisional
//     bigramas_capturados:   [],
//     parse_node_id:                              // node action_parse criado
//   }
//
// IMPORTANTE: tudo isso é ASSIM com base nos núcleos da SEED (conc_eu, conc_voce,
// conc_atribuicao, etc). Sem rede com seed → parse retorna 'desconhecido'.
// =============================================================================

'use strict';

// ============================================================
// PARSE PRINCIPAL
// Recebe o resultado do recall (conceitos iluminados, palavras ativadas).
// Devolve um objeto de "compreensão" semântica.
// ============================================================
function actionParse(parseRes, recallRes, userInputNodeId, turnoInfo){
  const word_ids = parseRes.word_node_ids;
  const conceitosAtivos = recallRes.conceitos_ativos || [];

  // Cria nó action_parse representando esta análise
  const parseNode = makeNode({
    type:        'action_parse',
    layer:       'parse',
    origin_type: 'SYSTEM',
    text:        'parse semântico',
    mass:        1,
    fire_id:     nextFireId(),
  });
  STATE.nodes.push(parseNode);
  STATE.edges.push(makeEdge({
    a: userInputNodeId, b: parseNode.id, w: 0.6, kind: 'sequence'
  }));

  // Mapa de conceitos ativos por id pra checks rápidos
  const concAtivos = {};
  for(const c of conceitosAtivos) concAtivos[c.id] = c.energy;

  // ============================================================
  // 1. RESOLVER SUJEITO
  // Pra cada palavra desta frase, checa se ela tem aresta refere_a → conc_eu ou conc_voce
  // ============================================================
  let sujeito = null;
  let evidencia = [];
  let sujeito_tipo = null;        // 'user' | 'self' | null

  for(const wid of word_ids){
    const w = STATE.nodes.find(n => n.id === wid);
    if(!w) continue;

    // procura aresta refere_a saindo desta palavra
    const arestas = STATE.edges.filter(e =>
      (e.a === wid || e.b === wid) && e.kind === 'refere_a'
    );

    for(const e of arestas){
      const alvo = e.a === wid ? e.b : e.a;
      if(alvo === 'conc_eu'){
        sujeito = STATE.activeSubject || '__pendente__';
        sujeito_tipo = 'user';
        evidencia.push(w.text);
        break;
      }
      if(alvo === 'conc_voce' || alvo === '__SELF_CORE__'){
        sujeito = '__self__';
        sujeito_tipo = 'self';
        evidencia.push(w.text);
        break;
      }
    }
    if(sujeito) break;
  }

  // FALLBACK: pronomes ficam em STOPWORDS então não viram word-nodes neste turno
  // Checa no TEXTO ORIGINAL se há pronomes user/self
  if(!sujeito){
    const inputN = STATE.nodes.find(n => n.id === userInputNodeId);
    const tOrig = (inputN?.text || '').toLowerCase();
    const tNorm = ' ' + norm(tOrig) + ' ';

    // pronomes user (eu, meu, minha, meus, minhas, me, mim)
    if(/( eu | meu | minha | meus | minhas | me | mim |^meu |^minha |^eu )/.test(tNorm)){
      sujeito = STATE.activeSubject || '__pendente__';
      sujeito_tipo = 'user';
      evidencia.push('(pronome user no texto)');
    }
    // pronomes self (voce, você, vc, seu, sua, seus, suas, te, teu, tua)
    else if(/( voce | você | vc | seu | sua | seus | suas | te | teu | tua |^seu |^sua |^teu )/.test(tNorm)){
      sujeito = '__self__';
      sujeito_tipo = 'self';
      evidencia.push('(pronome self no texto)');
    }
  }

  // Sem evidência de sujeito → usa o sujeito ativo, se houver
  if(!sujeito && STATE.activeSubject){
    sujeito = STATE.activeSubject;
    sujeito_tipo = 'user';
    evidencia = ['(sujeito ativo)'];
  }

  // ============================================================
  // 2. DETECTAR MODO (atribuição? posse? pergunta? saudação? feedback?)
  // Baseado em quais conceitos da seed foram iluminados pelo pulso
  // ============================================================
  let modo = 'desconhecido';

  // Atalho: também detecta marcadores diretos no texto original
  // (pergunta com ?, palavras-pergunta — protege casos onde pulso não acendeu forte)
  const inputNode = STATE.nodes.find(n => n.id === userInputNodeId);
  const textoOrig = (inputNode?.text || '').toLowerCase();
  const temPergMarker = /[?]/.test(textoOrig) ||
    /\b(qual|quanto|como|quando|onde|quem|oque|o que|sabe|lembra|conhece|lista|listar|enumera|me diz)\b/.test(textoOrig);

  // Ordem de prioridade
  if((concAtivos['conc_saudacao'] || 0) > 5)        modo = 'social_saudacao';
  else if((concAtivos['conc_despedida'] || 0) > 5)  modo = 'social_despedida';
  else if((concAtivos['conc_fb_neg'] || 0) > 5)     modo = 'feedback_neg';
  else if((concAtivos['conc_fb_pos'] || 0) > 5)     modo = 'feedback_pos';
  else if((concAtivos['conc_contradicao'] || 0) > 4) modo = 'contradicao';
  else if((concAtivos['conc_pergunta'] || 0) > 3 || temPergMarker) modo = 'pergunta';
  else if((concAtivos['conc_atribuicao'] || 0) > 3) modo = 'atribuicao';
  else if((concAtivos['conc_posse'] || 0) > 3)      modo = 'posse';

  // Atalho extra: se acendeu 'conc_atribuicao' fraco MAS a frase tem é/são/=,
  // ainda vale como atribuição (texto-based fallback)
  // (\b não funciona em acentos no JS, então usamos espaço ou início/fim)
  if(modo === 'desconhecido' && /(^|[\s])(é|sao|são|=)([\s]|$)/i.test(textoOrig)){
    modo = 'atribuicao';
  }
  if(modo === 'desconhecido' && /(^|[\s])(tenho|tem)([\s]|$)/i.test(textoOrig)){
    modo = 'posse';
  }

  // ============================================================
  // 3. EXTRAIR PREDICADO E VALOR (quando aplicável)
  //
  // Heurística baseada na rede:
  //   - identifica word de atribuição/posse (já iluminadas)
  //   - palavras ANTES dela = predicado (parte do corpo, nome, atributo)
  //   - palavras DEPOIS dela = valor
  //
  // FALLBACK: se "é"/"são"/"=" são stopwords (não viraram word_id), parseia
  // diretamente o texto original quebrando pelo operador.
  // ============================================================
  let predicado = null;
  let valor = null;

  if(modo === 'atribuicao' || modo === 'posse'){
    // Acha índice da palavra-âncora (que aciona atribuição/posse)
    let idxAncora = -1;
    for(let i = 0; i < word_ids.length; i++){
      const w = STATE.nodes.find(n => n.id === word_ids[i]);
      if(!w) continue;
      const arestas = STATE.edges.filter(e =>
        (e.a === w.id || e.b === w.id) && e.kind === 'refere_a'
      );
      const aciona = arestas.some(e => {
        const alvo = e.a === w.id ? e.b : e.a;
        return alvo === 'conc_atribuicao' || alvo === 'conc_posse';
      });
      if(aciona){ idxAncora = i; break; }
    }

    if(idxAncora >= 0){
      // Palavras antes da âncora = predicado (pula pronomes que talvez tenham virado word)
      for(let i = idxAncora - 1; i >= 0; i--){
        const w = STATE.nodes.find(n => n.id === word_ids[i]);
        if(!w) continue;
        const ePronome = STATE.edges.some(e =>
          (e.a === w.id || e.b === w.id) && e.kind === 'refere_a' &&
          ((e.a === 'conc_eu' || e.b === 'conc_eu' ||
            e.a === 'conc_voce' || e.b === 'conc_voce'))
        );
        if(ePronome) continue;
        predicado = w.text;
        break;
      }
      // Valor = palavras depois da âncora
      const valores = [];
      for(let i = idxAncora + 1; i < word_ids.length; i++){
        const w = STATE.nodes.find(n => n.id === word_ids[i]);
        if(!w) continue;
        valores.push(w.text);
      }
      if(valores.length) valor = valores.join(' ');
    }

    // FALLBACK texto-original: âncora não estava nos word_ids (era stopword)
    if(!predicado && !valor){
      const inputN = STATE.nodes.find(n => n.id === userInputNodeId);
      const tOrig = (inputN?.text || '').toLowerCase();
      // tenta dividir por é/são/=
      const m = tOrig.match(/^(.*?)(?:\s+|^)(é|sao|são|=|tem|tenho)\s+(.+)$/i);
      if(m){
        const antesRaw = (m[1] || '').trim();
        const depoisRaw = (m[3] || '').trim();
        const operador = (m[2] || '').toLowerCase();
        // remove pronomes da parte "antes" pra ficar com o predicado
        const pron = ['meu','minha','meus','minhas','seu','sua','seus','suas','eu','você','voce','vc','te','teu','tua'];
        // remove numerais (dois, duas, três, quatro, um, uma) — eles são quantificadores, não predicado
        const numerais = ['dois','duas','tres','três','quatro','cinco','seis','sete','oito','nove','dez','um','uma','vinte','trinta','meu','muitos','muitas','varios','vários'];
        const antesToks = norm(antesRaw).split(' ').filter(w => w && !pron.includes(w));
        const depoisToks = norm(depoisRaw).split(' ').filter(w => w && !STOPWORDS.has(w));

        if(antesToks.length) predicado = antesToks.join(' ');
        if(depoisToks.length) valor = depoisToks.join(' ');

        // CASO POSSE ("tenho dois braços"): predicado vem DEPOIS do operador,
        // não antes (porque a frase é "eu(suj-implícito) tenho X")
        // → último token significativo = predicado, demais = quantificador/valor
        if(operador === 'tem' || operador === 'tenho'){
          // No fallback: depoisToks = [dois, bracos] → predicado='bracos', valor='dois'
          const depoisSemNum = depoisToks.filter(t => !numerais.includes(t));
          if(depoisSemNum.length > 0){
            // último não-numeral é o predicado real
            predicado = depoisSemNum[depoisSemNum.length - 1];
            // valor = os outros (quantificador + restante)
            const valorToks = depoisToks.filter(t => t !== predicado);
            valor = valorToks.length ? valorToks.join(' ') : depoisSemNum[0];
            if(predicado === valor) valor = '1';
          }
        }

        // Caso atribuição "X é Y": se antes ficou vazio, NÃO assumir nada — desce em desconhecido
        // (antes assumíamos "nome" — isso causava bugs)
      }
    }
  }

  // ============================================================
  // 4. PALAVRAS DESCONHECIDAS — registra pra inspeção
  // ============================================================
  const palavras_desconhecidas = (parseRes.novos || []).map(n => ({
    txt: n.txt, word_id: n.id
  }));

  // ============================================================
  // 5. MONTA RESULTADO
  // ============================================================
  const resultado = {
    sujeito,
    sujeito_tipo,
    evidencia,
    modo,
    predicado,
    valor,
    conceitos_ativos: conceitosAtivos,
    palavras_conhecidas: word_ids.filter(id => {
      const w = STATE.nodes.find(n => n.id === id);
      return w && !w._provisional;
    }),
    palavras_desconhecidas,
    parse_node_id: parseNode.id,
  };

  // Liga parse → conceito principal detectado
  const conceitoChave = _conceitoChaveDoModo(modo);
  if(conceitoChave && STATE.nodes.find(n => n.id === conceitoChave)){
    STATE.edges.push(makeEdge({
      a: parseNode.id, b: conceitoChave, w: 0.5, kind: 'deriva_de'
    }));
  }

  _addIterLog(turnoInfo, 'infer',
    `parse: modo=${modo}` +
    (sujeito ? ` · sujeito=${sujeito}` : ' · sem sujeito') +
    (predicado ? ` · predicado=${predicado}` : '') +
    (valor ? ` · valor="${valor}"` : ''),
    {modo, sujeito, predicado, valor, evidencia});

  return resultado;
}

// ============================================================
// HELPER: conceito-chave de cada modo
// ============================================================
function _conceitoChaveDoModo(modo){
  return ({
    'social_saudacao':  'conc_saudacao',
    'social_despedida': 'conc_despedida',
    'feedback_pos':     'conc_fb_pos',
    'feedback_neg':     'conc_fb_neg',
    'contradicao':      'conc_contradicao',
    'pergunta':         'conc_pergunta',
    'atribuicao':       'conc_atribuicao',
    'posse':            'conc_posse',
  })[modo] || null;
}

// Reusa o helper de log que está no engine
function _addIterLog(turnoInfo, kind, descricao, dados){
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
window.actionParse = actionParse;

console.log('[action_parse v7] carregado');
