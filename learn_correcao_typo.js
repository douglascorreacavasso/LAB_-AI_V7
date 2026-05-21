// =============================================================================
// LEARN_CORRECAO_TYPO.JS — Lab v7.1 - Raciocínio
//
// HANDLER PARA CORREÇÃO RETROATIVA DE TYPO.
//
// FILOSOFIA:
//   Bug do v7: user dizia "ops escrevi errado, era tudo" e o sistema só
//   respondia "desculpa, vou corrigir" — mas NÃO CORRIGIA NADA.
//
//   v7.1: detecta o padrão linguístico, extrai a palavra correta, chama
//   learn_typo.learnCorrecaoRetroativa pra ligar o typo recente à palavra
//   certa. Acontece em silêncio (não cria provisional, não pergunta).
//
// PADRÕES SUPORTADOS:
//   "ops escrevi errado era X"
//   "ops, escrevi errado, era X"
//   "errei, era X"
//   "correto era X"
//   "na verdade era X"
//   "quando eu escrever Y saiba que é X"   ← caso especial: aprendizado direto
// =============================================================================

'use strict';

// ============================================================
// DETECTA PADRÃO DE CORREÇÃO DE TYPO NA FRASE
// Retorna: {ehCorrecaoTypo, palavra_certa?, palavra_errada?} ou null
// ============================================================
function detectarCorrecaoTypo(textoOrig){
  if(!textoOrig) return null;
  const t = norm(textoOrig);

  // Padrões com palavra-alvo só (busca retroativa)
  const padroes_retroativos = [
    // "ops escrevi errado era X" / "ops escrevi errado ! era X"
    /(?:ops|opa|opss|ops!).*?(?:escrevi|digitei|escrevia).*?(?:errado|erradinho|erada).*?(?:era|é|eh|seria|deveria ser)\s+(?:["']?)([a-záàâãéêíïóôõöúüç]+)/i,
    // "errei, era X" / "errei ! era X" / "ops! era X"
    /(?:errei|errou|errado)[!,\s.]+(?:era|é|eh)\s+(?:["']?)([a-záàâãéêíïóôõöúüç]+)/i,
    // "correto era X" / "o correto era X"
    /(?:o\s+)?correto\s+(?:era|é)\s+(?:["']?)([a-záàâãéêíïóôõöúüç]+)/i,
    // "na verdade era X"
    /na verdade.*?(?:era|é)\s+(?:["']?)([a-záàâãéêíïóôõöúüç]+)/i,
    // "queria dizer X"
    /queria dizer\s+(?:["']?)([a-záàâãéêíïóôõöúüç]+)/i,
  ];

  for(const re of padroes_retroativos){
    const m = textoOrig.match(re);
    if(m && m[1]){
      const palavraCerta = norm(m[1]);
      if(palavraCerta.length >= 2){
        return {
          ehCorrecaoTypo: true,
          palavra_certa:  palavraCerta,
          tipo:           'retroativa',
        };
      }
    }
  }

  // Padrão explícito: "quando eu escrever Y saiba que é X"
  // (Aprendizado direto — user ensina o mapping)
  const reExplicito = /quando.*?(?:escrever|digitar|escrevo|digito)\s+(?:["']?)([a-záàâãéêíïóôõöúüç]+)(?:["']?)\s+(?:saiba|entenda|sera|é|eh).*?(?:["']?)([a-záàâãéêíïóôõöúüç]+)/i;
  const m2 = textoOrig.match(reExplicito);
  if(m2 && m2[1] && m2[2]){
    return {
      ehCorrecaoTypo:    true,
      palavra_errada:    norm(m2[1]),
      palavra_certa:     norm(m2[2]),
      tipo:              'explicito',
    };
  }

  return null;
}

// ============================================================
// AÇÃO PRINCIPAL: processa correção de typo
// args = {textoOrig, userInputNodeId, turnoInfo}
// Retorna: {acao_tomada, mensagem, palavra_corrigida?}
// ============================================================
function actionCorrecaoTypo(args){
  const {textoOrig, userInputNodeId, turnoInfo} = args;
  const det = detectarCorrecaoTypo(textoOrig);

  if(!det){
    return {acao_tomada: 'nenhuma', motivo: 'não é padrão de correção de typo'};
  }

  // === Tipo "explicito": user disse "quando eu escrever Y saiba que é X" ===
  if(det.tipo === 'explicito'){
    if(typeof learnAplicarTypo !== 'function'){
      return {acao_tomada: 'nenhuma', motivo: 'learn_typo não carregado'};
    }

    // Cria/encontra word-node do errado
    let erradoId = 'word_' + det.palavra_errada.replace(/[^a-z0-9]/g, '');
    let erradoNode = STATE.nodes.find(n => n.id === erradoId);
    if(!erradoNode){
      erradoNode = makeNode({
        id:          erradoId,
        type:        'word',
        layer:       'surface',
        origin_type: 'USER',
        text:        det.palavra_errada,
        mass:        1,
      });
      STATE.nodes.push(erradoNode);
    }
    erradoNode._eh_typo = true;

    const r = learnAplicarTypo({
      palavra_errada_id: erradoId,
      palavra_certa:     det.palavra_certa,
      turnoInfo,
    });

    if(r.aplicou){
      return {
        acao_tomada:        'mapeamento_explicito',
        mensagem:           `beleza, anotei: quando você escreve "${det.palavra_errada}" eu entendo "${det.palavra_certa}".`,
        palavra_errada:     det.palavra_errada,
        palavra_certa:      det.palavra_certa,
      };
    }
    return {acao_tomada: 'nenhuma', motivo: 'falhou ao mapear'};
  }

  // === Tipo "retroativa": user disse "ops, era X" ===
  if(det.tipo === 'retroativa'){
    if(typeof learnCorrecaoRetroativa !== 'function'){
      return {acao_tomada: 'nenhuma', motivo: 'learn_typo não carregado'};
    }

    const r = learnCorrecaoRetroativa({
      palavra_certa: det.palavra_certa,
      userInputNodeId,
      turnoInfo,
    });

    if(r.aplicou){
      // Acha texto do erro pra mensagem
      const erradoNode = STATE.nodes.find(n => n.id === r.palavra_certa_id);
      const certoText  = erradoNode?.text || det.palavra_certa;

      // Pega o último typo corrigido pra usar como referência
      const profile = STATE.userTypoProfile || {erros_frequentes: {}};
      const ultimoErro = Object.entries(profile.erros_frequentes)
        .filter(([k, v]) => v === det.palavra_certa)
        .pop();

      const palavraErradaUsada = ultimoErro ? ultimoErro[0] : '(palavra anterior)';

      return {
        acao_tomada:        'corrigido_retroativo',
        mensagem:           `ah! entendi — "${palavraErradaUsada}" → "${det.palavra_certa}". corrigido.`,
        palavra_certa:      det.palavra_certa,
        palavra_errada:     palavraErradaUsada,
      };
    }

    // Não achou candidato — diz que não tem o que corrigir
    return {
      acao_tomada: 'sem_candidato',
      mensagem:    `entendi que houve um typo, mas não achei a palavra anterior pra mapear pra "${det.palavra_certa}". na próxima eu já sei.`,
    };
  }

  return {acao_tomada: 'nenhuma'};
}

// ============================================================
// EXPOR
// ============================================================
window.detectarCorrecaoTypo = detectarCorrecaoTypo;
window.actionCorrecaoTypo   = actionCorrecaoTypo;

console.log('[learn_correcao_typo v7.1] carregado');
