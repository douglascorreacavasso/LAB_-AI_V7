// =============================================================================
// ACTION_ROUTER.JS — Lab v7 - Raciocínio
//
// O CÉREBRO DO MOTOR.
// Recebe o resultado do parse e orquestra quais ações disparar.
//
// LÓGICA DE ROTEAMENTO (em ordem):
//
//   1. modo='social_saudacao'  → action_speak(tag='saudacao_resposta')
//   2. modo='social_despedida' → action_speak(tag='despedida_resposta')
//   3. modo='feedback_pos'     → action_speak(tag='fb_resposta') (+ reforço da última cadeia)
//   4. modo='feedback_neg'     → action_speak(tag='fb_resposta') (+ inibição/revert)
//   5. modo='pergunta' + "sabe sobre" → action_recall + action_speak(recall_texto)
//   6. modo='pergunta'         → action_speak(tag='pergunta_sem_resposta')
//                                 [LEVA C2 trará rules pra responder de verdade]
//   7. modo='atribuicao' c/ sujeito+predicado+valor → action_write + action_speak(composto)
//   8. modo='posse' c/ sujeito+predicado+valor      → action_write + action_speak(composto)
//   9. modo='desconhecido' mas tem palavras desconhecidas → action_doubt + action_ask (B2)
//   10. fallback                → action_speak(desconhecido)
//
// SAÍDA:
//   {resposta_txt, output_node_id, acoes_disparadas:[...]}
// =============================================================================

'use strict';

// ============================================================
// ROTEAR — escolhe ações com base no parse
// ============================================================
function actionRouter(parseInfo, userInputNodeId, turnoInfo){
  const {modo, sujeito, predicado, valor, palavras_desconhecidas} = parseInfo;
  const acoesDisparadas = [];

  // ============================================================
  // PRÉ-ROTA: CORREÇÃO DE TYPO (v7.1-A)
  // Antes de tudo: se a frase é "ops escrevi errado, era X" ou similar,
  // resolve o typo retroativamente e responde com clareza.
  // ============================================================
  if(typeof actionCorrecaoTypo === 'function'){
    const inputN = STATE.nodes.find(n => n.id === userInputNodeId);
    const textoOrig = inputN?.text || '';
    const correcao = actionCorrecaoTypo({
      textoOrig, userInputNodeId, turnoInfo,
    });
    if(correcao && correcao.acao_tomada !== 'nenhuma'){
      const r = actionSpeak({
        contexto:        'composto',
        parseNodeId:     parseInfo.parse_node_id,
        userInputNodeId, turnoInfo,
      });
      const outNode = STATE.nodes.find(n => n.id === r.output_node_id);
      if(outNode) outNode.text = correcao.mensagem;
      r.resposta_txt = correcao.mensagem;
      acoesDisparadas.push('correcao_typo');
      return {...r, acoes_disparadas: acoesDisparadas};
    }
  }

  // ============================================================
  // PRÉ-ROTA: MATEMÁTICA (C2)
  // Antes de qualquer outra coisa, testa se é:
  //   (a) pergunta matemática → actionCompute aplica rule aprendida
  //   (b) exemplo matemático "A op B = C" → learnDetectarPattern
  // ============================================================

  // 0.5 — Pergunta matemática (tem prioridade sobre tudo)
  if(typeof actionCompute === 'function'){
    const comp = actionCompute({userInputNodeId, parseInfo, turnoInfo});
    if(comp.calculou){
      // Compõe resposta natural
      const respTxt = `${comp.a} ${comp.op_simbolo} ${comp.b} = ${comp.resultado}`;
      const r = actionSpeak({
        contexto:        'composto',
        parseNodeId:     parseInfo.parse_node_id,
        actionPrevNodeId:comp.compute_node_id,
        userInputNodeId, turnoInfo,
      });
      const outNode = STATE.nodes.find(n => n.id === r.output_node_id);
      if(outNode) outNode.text = respTxt;
      r.resposta_txt = respTxt;
      acoesDisparadas.push('compute', 'speak[math]');
      return {...r, acoes_disparadas: acoesDisparadas};
    }
  }

  // 0.6 — Exemplo matemático (sentença A op B = C como afirmação)
  if(typeof learnDetectarPattern === 'function'){
    const ld = learnDetectarPattern({userInputNodeId, parseInfo, turnoInfo});
    if(ld.detectou_pattern){
      // Compõe resposta dependente do estado do pattern
      let respTxt = '';
      if(ld.promoveu_pra_rule){
        const rule = ld.promoveu_pra_rule;
        respTxt = `entendi! aprendi a regra: ${_opSimboloRouter(rule._operador)}(a,b) = ${rule._formula}. agora sei calcular isso.`;
      } else {
        const conf = ld.pattern_node._confidence;
        const n = (ld.pattern_node._exemplos || []).length;
        respTxt = `anotei. já vi ${n} exemplo(s) desse padrão (confiança ${(conf*100).toFixed(0)}%).`;
        if(n < 3) respTxt += ` me dá mais exemplos pra eu confirmar.`;
      }
      const r = actionSpeak({
        contexto:        'composto',
        parseNodeId:     parseInfo.parse_node_id,
        userInputNodeId, turnoInfo,
      });
      const outNode = STATE.nodes.find(n => n.id === r.output_node_id);
      if(outNode) outNode.text = respTxt;
      r.resposta_txt = respTxt;
      acoesDisparadas.push('learn_pattern');
      if(ld.promoveu_pra_rule) acoesDisparadas.push('promove_rule');
      return {...r, acoes_disparadas: acoesDisparadas};
    }
  }

  // ============================================================
  // 0. CHECA pendingClarify — se tem pergunta esperando resposta,
  // trata a entrada como explicação ANTES de tudo
  //
  // PORÉM: só consome pendingClarify se a entrada parece MESMO uma resposta.
  // Se o user mudou de assunto (frase nova com sujeito/predicado/modo claro),
  // descarta pendingClarify pra não corromper.
  // ============================================================
  if(STATE.pendingClarify && typeof actionExplain === 'function'){
    const pcContext = STATE.pendingClarify;

    // Heurística "isso é resposta à pergunta?" — restrita pra não consumir frase nova:
    //  - "sim", "não", "isso", "certo", "errado" sozinhas → confirmação/negação simples
    //  - começa com o termo perguntado (ex: "olhos são partes do corpo")
    //  - frase MUITO curta (1 ou 2 tokens) sem verbo de atribuição/posse
    //  - explicação direta sem verbo: ("uma cor", "parte do corpo")
    //
    // EXCEÇÃO: se modo é feedback_neg/pos, NÃO consome pendingClarify
    //   (feedback tem prioridade — pode estar corrigindo write anterior)
    //
    // v7.1-A: NOVO — aceita TAMBÉM explicações longas que começam com
    //   padrões explicativos claros (Significa, É uma, É o, Quer dizer, etc).
    //   Isso resolve o bug do v7 onde frases de 130+ chars caíam em "não sei".
    const inputN = STATE.nodes.find(n => n.id === userInputNodeId);
    const tOrig = norm(inputN?.text || '');
    const tokensIn = tOrig.split(' ').filter(t => t && !STOPWORDS.has(t));
    const modoFeedback = (modo === 'feedback_neg' || modo === 'feedback_pos');

    const ehConfNegSimples = /^(sim|nao|não|isso|certo|correto|errado|exato|claro)\s*\.?$/.test(tOrig);
    const ehConfNeg = ehConfNegSimples;
    const comecaComTermo = pcContext.term && tOrig.startsWith(pcContext.term + ' ');
    const ehAtribuicaoDoTermo = (modo === 'atribuicao' || modo === 'posse') &&
                                 pcContext.term && tOrig.startsWith(pcContext.term);
    const ehFraseCurtaSemVerbo = tokensIn.length <= 2 &&
                                 !/\b(é|sao|são|tem|tenho|=)\b/i.test(tOrig);

    // v7.1-A: padrões explicativos longos
    const ehExplicacaoLonga = /^(significa|quer dizer|é (uma|um|o|a)|sao |são |é quando|seria|trata-se|refere-se)/i.test(tOrig) ||
                              /^(uma|um|o|a) [a-z]+ (que|usad|para)/i.test(tOrig);

    const ehResposta = !modoFeedback && (
      ehConfNeg || comecaComTermo || ehAtribuicaoDoTermo ||
      ehFraseCurtaSemVerbo || ehExplicacaoLonga
    );

    if(ehResposta){
      const explain = actionExplain({
        pendingClarify: pcContext,
        userInputNodeId,
        parseInfo,
        turnoInfo,
      });

      if(explain){
        const pc = explain;

      // Se houve explicação real (não só sim/não), promove provisional
      let promoMsg = '';
      if(pc.explicou && typeof learnPromoverProvisional === 'function'){
        const provInfo = STATE.nodes.find(n => n.id === pcContext?.provisional_id);
        if(provInfo){
          const prom = learnPromoverProvisional({
            provisional_id:    pcContext.provisional_id,
            categoria_dita:    pc.explicacao?.categoria,
            hypothesis_id:     pcContext.hypothesis_id,
            palavra_node_id:   pcContext.palavra_node_id,
            userInputNodeId,
            turnoInfo,
          });
          if(prom?.promovida){
            promoMsg = ` agora sei que "${provInfo._categoria_alvo}" é ${prom.concept_node.text}.`;
          }
        }
      }

      // Resposta humana ao user
      let respTxt = '';
      if(pc.confirmou){
        respTxt = 'beleza, anotado!' + promoMsg;
      } else if(pc.negou){
        respTxt = 'ok, então deixa eu repensar.';
      } else if(pc.explicou){
        respTxt = 'entendi!' + promoMsg + ' obrigado por explicar.';
      } else {
        respTxt = 'ok, vou tentar de novo.';
      }

      const r = actionSpeak({
        contexto:        'composto',
        parseNodeId:     parseInfo.parse_node_id,
        userInputNodeId, turnoInfo,
      });
      // sobrescreve a resposta do speak template-based pela nossa composta
      const outNode = STATE.nodes.find(n => n.id === r.output_node_id);
      if(outNode) outNode.text = respTxt;

      acoesDisparadas.push('explain', pc.explicou ? 'promote' : 'ack');
      return {
        resposta_txt: respTxt,
        output_node_id: r.output_node_id,
        speak_node_id: r.speak_node_id,
        acoes_disparadas: acoesDisparadas,
      };
      }
    } else {
      // Não é resposta à pergunta — descarta pendingClarify e segue fluxo normal
      _addIterLogRouter(turnoInfo, 'infer',
        `pendingClarify descartada: entrada não é resposta à pergunta sobre "${pcContext.term}"`,
        {term: pcContext.term});
      STATE.pendingClarify = null;
    }
  }

  // ============================================================
  // 1. SOCIAL: saudação
  // ============================================================
  if(modo === 'social_saudacao'){
    const r = actionSpeak({
      contexto:        'social_saudacao',
      tag_template:    'saudacao_resposta',
      parseNodeId:     parseInfo.parse_node_id,
      userInputNodeId, turnoInfo,
    });
    acoesDisparadas.push('speak[saudacao]');
    return {...r, acoes_disparadas: acoesDisparadas};
  }

  // ============================================================
  // 2. SOCIAL: despedida
  // ============================================================
  if(modo === 'social_despedida'){
    const r = actionSpeak({
      contexto:        'social_despedida',
      tag_template:    'despedida_resposta',
      parseNodeId:     parseInfo.parse_node_id,
      userInputNodeId, turnoInfo,
    });
    acoesDisparadas.push('speak[despedida]');
    return {...r, acoes_disparadas: acoesDisparadas};
  }

  // ============================================================
  // 3. FEEDBACK POSITIVO — reforça a última cadeia (+ semântico C1)
  // ============================================================
  if(modo === 'feedback_pos'){
    // C1: feedback semântico ("isso, lembra disso") — antes do reforço genérico
    let feedbackInfo = null;
    if(typeof learnProcessarFeedback === 'function'){
      const inputN = STATE.nodes.find(n => n.id === userInputNodeId);
      feedbackInfo = learnProcessarFeedback({
        tipo: 'positivo',
        textoOrig: inputN?.text || '',
        parseInfo, userInputNodeId, turnoInfo,
      });
    }

    // Reforça a logic_chain anterior (comportamento padrão)
    const last = STATE.logic_chains[STATE.logic_chains.length - 1];
    if(last && !last.marcada){
      last.marcada = 'boa';
      const edgeRefs = [];
      for(let i = 0; i < last.sequencia.length - 1; i++){
        edgeRefs.push({a: last.sequencia[i], b: last.sequencia[i+1]});
      }
      const c = reforcarArestas(edgeRefs, 0.1);
      _addIterLogRouter(turnoInfo, 'action',
        `feedback+: marcou cadeia "${last.id.slice(-6)}" como boa, reforçou ${c} aresta(s)`,
        {chain_id: last.id, reforcadas: c});
    }
    const r = actionSpeak({
      contexto:        'feedback_pos',
      tag_template:    'fb_resposta',
      parseNodeId:     parseInfo.parse_node_id,
      userInputNodeId, turnoInfo,
    });
    acoesDisparadas.push('speak[fb_pos]', 'reforco');
    if(feedbackInfo?.acao_tomada === 'consolida') acoesDisparadas.push('consolida');
    return {...r, acoes_disparadas: acoesDisparadas};
  }

  // ============================================================
  // 4. FEEDBACK NEGATIVO — inibe a última cadeia + reverte (+ semântico C1)
  // ============================================================
  if(modo === 'feedback_neg'){
    // C1: tenta extrair correção embutida ("errado, é X") ou negação ("X não é Y")
    let feedbackInfo = null;
    if(typeof learnProcessarFeedback === 'function'){
      const inputN = STATE.nodes.find(n => n.id === userInputNodeId);
      feedbackInfo = learnProcessarFeedback({
        tipo: 'negativo',
        textoOrig: inputN?.text || '',
        parseInfo, userInputNodeId, turnoInfo,
      });
    }

    const last = STATE.logic_chains[STATE.logic_chains.length - 1];
    if(last && !last.marcada){
      last.marcada = 'ruim';
      const edgeRefs = [];
      for(let i = 0; i < last.sequencia.length - 1; i++){
        edgeRefs.push({a: last.sequencia[i], b: last.sequencia[i+1]});
      }
      const c = inibirArestas(edgeRefs, 0.25);

      // Se NÃO houve correção semântica explícita, reverte o último write
      let reverted = null;
      if(feedbackInfo?.acao_tomada !== 'corrigido' && feedbackInfo?.acao_tomada !== 'negado'){
        reverted = _revertLastWrite(last);
      }

      _addIterLogRouter(turnoInfo, 'action',
        `feedback-: cadeia "${last.id.slice(-6)}" marcada ruim, inibiu ${c} aresta(s)` +
        (reverted ? `, reverteu ${reverted}` : '') +
        (feedbackInfo?.acao_tomada === 'corrigido' ? `, corrigiu via "errado, é X"` : '') +
        (feedbackInfo?.acao_tomada === 'negado' ? `, anulou via "X não é Y"` : ''),
        {chain_id: last.id, inibidas: c, revertido: reverted, semantico: feedbackInfo?.acao_tomada});
    }

    // Resposta varia conforme tipo de feedback
    let respCustom = null;
    if(feedbackInfo?.acao_tomada === 'corrigido'){
      respCustom = `ok, corrigi: ${feedbackInfo.predicado} é "${feedbackInfo.valor_novo}" (anulei "${feedbackInfo.valor_antigo}").`;
    } else if(feedbackInfo?.acao_tomada === 'negado'){
      respCustom = `entendi, ${feedbackInfo.descricao}.`;
    }

    const r = actionSpeak({
      contexto:        'feedback_neg',
      tag_template:    'fb_resposta',
      parseNodeId:     parseInfo.parse_node_id,
      userInputNodeId, turnoInfo,
    });
    if(respCustom){
      const outNode = STATE.nodes.find(n => n.id === r.output_node_id);
      if(outNode) outNode.text = respCustom;
      r.resposta_txt = respCustom;
    }

    acoesDisparadas.push('speak[fb_neg]', 'inibicao');
    if(feedbackInfo?.acao_tomada === 'corrigido') acoesDisparadas.push('correcao_semantica');
    if(feedbackInfo?.acao_tomada === 'negado')    acoesDisparadas.push('negacao_semantica');
    return {...r, acoes_disparadas: acoesDisparadas};
  }

  // ============================================================
  // 5. PERGUNTA DE RECALL ("o que sabe sobre mim?")
  // Heurística: pergunta + sujeito conhecido + palavras "sabe"/"lembra"
  // ============================================================
  if(modo === 'pergunta' && _ehPerguntaRecall(parseInfo, userInputNodeId)){
    const alvo = _quemERecall(parseInfo);
    if(alvo){
      const recallRes = actionRecallSubject(alvo, turnoInfo, userInputNodeId);
      const r = actionSpeak({
        contexto:         'recall',
        recall_texto:     recallRes.texto,
        parseNodeId:      parseInfo.parse_node_id,
        actionPrevNodeId: recallRes.recall_node_id,
        userInputNodeId, turnoInfo,
      });
      acoesDisparadas.push('recall', 'speak[recall]');
      return {...r, acoes_disparadas: acoesDisparadas};
    }
  }

  // ============================================================
  // 6. PERGUNTA GENÉRICA — não sei responder ainda
  // ============================================================
  if(modo === 'pergunta'){
    const r = actionSpeak({
      contexto:        'pergunta_sem_resposta',
      tag_template:    'pergunta_sem_resposta',
      parseNodeId:     parseInfo.parse_node_id,
      userInputNodeId, turnoInfo,
    });
    acoesDisparadas.push('speak[pergunta_sem_resposta]');
    return {...r, acoes_disparadas: acoesDisparadas};
  }

  // ============================================================
  // 7. ATRIBUIÇÃO ou POSSE — escreve fato!
  // ============================================================
  if((modo === 'atribuicao' || modo === 'posse') && (sujeito || valor) && (predicado || valor)){
    let pred = predicado;
    let val  = valor;
    let suj  = sujeito;

    // Inferência de predicado quando vazio:
    // - SE frase original menciona "nome"/"chamo" → predicado='nome'
    // - SENÃO desce em desconhecido (não escreve cega)
    if(!pred && val){
      const inputN = STATE.nodes.find(n => n.id === userInputNodeId);
      const tOrig = norm(inputN?.text || '');
      const mencionaNome = / nome | nome$|^nome /.test(' ' + tOrig + ' ') ||
                           /(chamo|chamam|chama|chame)/.test(tOrig);
      if(mencionaNome){
        pred = 'nome';
      }
    }
    if(suj === '__self__' && !pred && val) pred = 'nome';

    // RESOLUÇÃO DE PENDENTE:
    // Caso especial restrito: SÓ resolve pendente=valor quando o predicado é "nome"
    // E o texto original menciona "nome" explicitamente (evita corromper sujeito
    // quando frases tipo "tenho olhos azuis" vêm com pendente)
    if(suj === '__pendente__'){
      const inputN = STATE.nodes.find(n => n.id === userInputNodeId);
      const tOrig = norm(inputN?.text || '');
      const mencionaNome = / nome | nome$|^nome /.test(' ' + tOrig + ' ');
      const mencionaChamar = /(chamo|chamam|chama|chame)/.test(tOrig);

      if(pred === 'nome' && val && (mencionaNome || mencionaChamar)){
        suj = String(val).toLowerCase();
        STATE.activeSubject = suj;
        _addIterLogRouter(turnoInfo, 'infer',
          `pendente resolvido: sujeito agora é "${suj}" (pelo nome dado)`,
          {sujeito: suj});
      } else if(STATE.activeSubject){
        // Sujeito ativo de turnos anteriores
        suj = STATE.activeSubject;
      } else {
        // Não dá pra resolver — não escreve
        suj = null;
      }
    }

    if(suj && pred && val){
      // Verifica se predicado ou valor contém palavra desconhecida (provisional candidata)
      const palavrasNovas = parseInfo.palavras_desconhecidas || [];
      const valorTokens = norm(val).split(' ').filter(t => t.length > 1);
      const predTokens = norm(pred).split(' ').filter(t => t.length > 1);

      // Palavra nova significativa que aparece no predicado ou valor?
      const palavraNovaImportante = palavrasNovas.find(p => {
        const txt = (p.txt || '').toLowerCase();
        if(txt.length < 3) return false;          // ignora 'o', 'em' etc
        if(/^[0-9]+$/.test(txt)) return false;    // ignora números puros
        return valorTokens.includes(txt) || predTokens.includes(txt);
      });

      // Se descobriu palavra nova importante E o sistema ainda NÃO tem
      // hipótese sobre ela, prefere QUESTIONAR primeiro.
      // PORÉM: NÃO questiona quando o predicado é "nome"/"apelido"/"papel"
      // — esses valores são instâncias (douglas, doug, professor), não tipos.
      const predIsIdent = ['nome', 'apelido', 'papel', 'profissão', 'profissao'].includes((pred || '').toLowerCase());

      if(palavraNovaImportante && !predIsIdent && typeof actionDoubt === 'function'){
        // Já criou provisional pra essa palavra antes?
        const jaExistente = STATE.nodes.find(n =>
          n.type === 'provisional' && n._categoria_alvo === palavraNovaImportante.txt
        );

        if(!jaExistente){
          // dispara doubt → ask
          const d = actionDoubt({parseInfo, userInputNodeId, turnoInfo});
          if(d.decidiu_perguntar && d.ask_args && typeof actionAsk === 'function'){
            // ESCREVE O FATO ASSIM MESMO (não bloqueia — só investiga em paralelo)
            const wr = actionWrite({
              sujeito: suj, predicado: pred, valor: val,
              userInputNodeId,
              parseNodeId: parseInfo.parse_node_id,
              turnoInfo,
            });

            const askR = actionAsk(d.ask_args);
            // Compõe resposta: confirmação + pergunta
            const respTxt = (wr ? `ok, anotei: ${_displayPredicadoB1(pred)} → ${val}. ` : '') + askR.resposta_txt;
            const outNode = STATE.nodes.find(n => n.id === askR.output_node_id);
            if(outNode) outNode.text = respTxt;

            acoesDisparadas.push('write', 'doubt', 'hypothesis', 'ask');
            return {
              resposta_txt: respTxt,
              output_node_id: askR.output_node_id,
              speak_node_id: askR.speak_node_id,
              acoes_disparadas: acoesDisparadas,
            };
          }
        }
      }

      // Fluxo normal: só write + speak
      const wr = actionWrite({
        sujeito: suj, predicado: pred, valor: val,
        userInputNodeId,
        parseNodeId: parseInfo.parse_node_id,
        turnoInfo,
      });

      if(wr){
        // DETECTA CONTRADIÇÕES SEMÂNTICAS com fatos existentes (C1)
        let contraInfo = null;
        if(typeof learnDetectarContradicao === 'function' && wr.fato){
          contraInfo = learnDetectarContradicao({
            sujeito: suj, predicado: pred, valor: val,
            fato_node_id: wr.fato.id,
            turnoInfo,
          });
        }

        const r = actionSpeak({
          contexto:         'atribuicao_ok',
          compor_de:        {sujeito: suj, predicado: pred, valor: val,
                             foi_update: wr.conflito, valor_anterior: wr.valor_anterior},
          parseNodeId:      parseInfo.parse_node_id,
          actionPrevNodeId: wr.write_node?.id,
          userInputNodeId, turnoInfo,
        });

        // Se houve contradição séria, anexa pergunta de esclarecimento
        if(contraInfo?.contradicoes?.length > 0){
          const c = contraInfo.contradicoes.find(x => x.severidade === 'alta') ||
                    contraInfo.contradicoes[0];
          const respOrig = r.resposta_txt || '';
          const pergContra = `mas espera... ${c.descricao}. qual está certo?`;
          const outNode = STATE.nodes.find(n => n.id === r.output_node_id);
          if(outNode) outNode.text = respOrig + ' ' + pergContra;
          r.resposta_txt = respOrig + ' ' + pergContra;
          acoesDisparadas.push('detect_contradiction');
        }

        acoesDisparadas.push('write', 'speak[composto]');
        return {...r, acoes_disparadas: acoesDisparadas};
      }
    }
  }

  // ============================================================
  // 8. DESCONHECIDO — entra em DOUBT, que decide se pergunta
  // ============================================================
  if(typeof actionDoubt === 'function'){
    const d = actionDoubt({parseInfo, userInputNodeId, turnoInfo});

    // Doubt decidiu perguntar? Dispara action_ask
    if(d.decidiu_perguntar && d.ask_args && typeof actionAsk === 'function'){
      const r = actionAsk(d.ask_args);
      acoesDisparadas.push('doubt', 'hypothesis', 'provisional', 'ask');
      return {...r, acoes_disparadas: acoesDisparadas};
    }

    // Doubt decidiu ficar quieto — devolve resposta neutra
    const r = actionSpeak({
      contexto:        'desconhecido',
      tag_template:    null,
      parseNodeId:     parseInfo.parse_node_id,
      userInputNodeId, turnoInfo,
    });
    acoesDisparadas.push('doubt', 'speak[neutro]');
    return {...r, acoes_disparadas: acoesDisparadas};
  }

  // ============================================================
  // 9. FALLBACK ABSOLUTO (sem doubt disponível)
  // ============================================================
  const r = actionSpeak({
    contexto:        'desconhecido',
    parseNodeId:     parseInfo.parse_node_id,
    userInputNodeId, turnoInfo,
  });
  acoesDisparadas.push('speak[fallback]');
  return {...r, acoes_disparadas: acoesDisparadas};
}

// ============================================================
// HELPER: detecta se a pergunta é de recall
// "o que sabe sobre mim", "lista o que sabe", "que sabe sobre douglas",
// + v7.1-A: "qual é o meu nome", "quem sou", "como me chamo", "qual meu X"
// ============================================================
function _ehPerguntaRecall(parseInfo, userInputNodeId){
  const inputNode = STATE.nodes.find(n => n.id === userInputNodeId);
  if(!inputNode) return false;
  const t = norm(inputNode.text || '');

  // padrões explícitos de recall sobre o user/self
  if(/(sabe|lembra|conhece|lista|listar|enumera)/.test(t)) return true;
  // perguntas diretas sobre atributos próprios
  if(/(qual|quem|como|que)\s+(é|eh|sou|me chamo|meu|minha|meus|minhas|seu|sua)/.test(t)) return true;
  if(/^(qual|quem|como|que).*?(nome|apelido|idade|nasci|moro|gosto|prefer)/.test(t)) return true;
  if(/quem (sou|é) (eu|voce|você)/.test(t)) return true;
  if(/como me chamo|como eu me chamo|qual meu nome/.test(t)) return true;
  return false;
}

// Decide: a pergunta é sobre "mim" (user) ou sobre "voce" (self)?
function _quemERecall(parseInfo){
  // Se o parse identificou sujeito self → pergunta sobre a Nerael
  if(parseInfo.sujeito_tipo === 'self') return '__self__';
  // Se identificou user (ou tem activeSubject) → sobre o user
  if(parseInfo.sujeito && parseInfo.sujeito !== '__pendente__'){
    return parseInfo.sujeito;
  }
  if(STATE.activeSubject) return STATE.activeSubject;
  return null;
}

// ============================================================
// HELPER: reverte o último fato escrito após feedback_neg
// Retorna o predicado revertido (ou null)
// ============================================================
function _revertLastWrite(chain){
  if(!chain || !chain.sequencia) return null;
  // Procura nó identity_fact/identity_attr na cadeia (escrito por write)
  for(let i = chain.sequencia.length - 1; i >= 0; i--){
    const id = chain.sequencia[i];
    const n = STATE.nodes.find(x => x.id === id);
    if(!n) continue;
    if(n.type === 'identity_fact' || n.type === 'identity_attr'){
      // Marca o fato como superseded e reverte do dossiê
      n._superseded = true;
      n.brightness = Math.max(0.1, (n.brightness || 0.5) - 0.4);

      // Reverte dossiê
      if(n._sujeito === '__self__'){
        delete STATE.selfDossier[n._slot];
      } else if(n._sujeito && n._grupo && n._slot){
        const d = STATE.dossiers[n._sujeito]?.[n._grupo];
        if(d && d[n._slot] !== undefined){
          if(Array.isArray(d[n._slot])){
            d[n._slot] = d[n._slot].filter(v => String(v).toLowerCase() !== String(n._valor).toLowerCase());
          } else {
            delete d[n._slot];
          }
        }
      }
      return `${n._grupo}.${n._slot}=${n._valor}`;
    }
  }
  return null;
}

function _addIterLogRouter(turnoInfo, kind, descricao, dados){
  if(!turnoInfo) return;
  turnoInfo.iteracoes.push({
    n:         turnoInfo.iteracoes.length + 1,
    kind:      kind,
    descricao: descricao,
    dados:     dados || null,
    timestamp: new Date().toISOString(),
  });
}

// Helper de display de predicado (espelha o de action_speak.js)
function _displayPredicadoB1(p){
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

// Helper de símbolo de operador matemático (C2)
function _opSimboloRouter(conceito){
  return ({
    'conc_op_soma': '+',
    'conc_op_subt': '-',
    'conc_op_mult': '×',
    'conc_op_div':  '÷',
  })[conceito] || '?';
}

// ============================================================
// EXPOR
// ============================================================
window.actionRouter = actionRouter;

console.log('[action_router v7] carregado');
