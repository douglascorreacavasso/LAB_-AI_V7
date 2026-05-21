// =============================================================================
// LEARN_TYPO.JS — Lab v7.1 - Raciocínio
//
// DETECTOR DE TYPO + LEVANTAMENTO DO PERFIL DE ESCRITA DO USER.
//
// FILOSOFIA:
//   O user errou e digitou "tuso" em vez de "tudo". O sistema na v7 anterior:
//     1. criou word-node "tuso"
//     2. criou provisional "categoria_temp_tuso"
//     3. perguntou "o que é tuso?"
//   USER FICA P. DA VIDA — claro, errou.
//
//   v7.1 faz diferente: ANTES de virar provisional, este módulo:
//     1. Mede distância Levenshtein contra dicionário + palavras já usadas
//     2. Se distância ≤ 2 E palavra-candidata existe → é typo
//     3. NÃO pergunta. Cria aresta 'escrito_como' do erro → palavra certa
//     4. Usa a palavra CERTA no parse downstream
//     5. Registra no perfil do user (STATE.userTypoProfile)
//
// PERFIL DE ESCRITA DO USER:
//   STATE.userTypoProfile = {
//     erros_frequentes: {'tuso':'tudo', 'tinah':'tinha', 'aj':'já', ...},
//     padroes: ['troca-de-letras', 'omissao-de-acento', ...],
//     total_erros: 12,
//     total_corrigidos_auto: 11,
//   }
// =============================================================================

'use strict';

// ============================================================
// INICIALIZA PERFIL SE NÃO EXISTE
// ============================================================
function _ensureTypoProfile(){
  if(!STATE.userTypoProfile){
    STATE.userTypoProfile = {
      erros_frequentes:    {},
      padroes:             [],
      total_erros:         0,
      total_corrigidos_auto: 0,
    };
  }
  return STATE.userTypoProfile;
}

// ============================================================
// DISTÂNCIA LEVENSHTEIN
// ============================================================
function _levenshtein(a, b){
  if(!a || !b) return Math.max((a||'').length, (b||'').length);
  if(a === b) return 0;
  const m = a.length, n = b.length;
  if(Math.abs(m - n) > 3) return 99;   // bail out cedo

  // Otimização: 2 linhas em vez de matriz
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for(let j = 0; j <= n; j++) prev[j] = j;

  for(let i = 1; i <= m; i++){
    curr[0] = i;
    for(let j = 1; j <= n; j++){
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j-1] + 1,        // inserção
        prev[j] + 1,          // remoção
        prev[j-1] + cost,     // substituição
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// ============================================================
// ENCONTRA TYPO MAIS PROVÁVEL
// args = {palavra, max_dist?}
// Retorna: {ehTypo, candidato, distancia, origem} | null
//   origem = 'dicionario' | 'sessao' | 'seed'
// ============================================================
function learnDetectarTypo(palavra, opts){
  opts = opts || {};
  const max = opts.max_dist || 2;
  if(!palavra) return null;
  const p = norm(palavra);
  if(p.length < 3) return null;             // pequena demais pra detectar
  if(/^[0-9+\-*/=÷×]/.test(p)) return null; // dígito/operador — não é typo

  // Se já é uma palavra conhecida do dicionário, NÃO é typo
  if(typeof dictKnows === 'function' && dictKnows(p)) return null;

  // Candidatas: dicionário + palavras conhecidas da sessão
  const candidatas = new Set();
  if(typeof dictAllKnown === 'function'){
    for(const w of dictAllKnown()) candidatas.add(w);
  }
  // Também adiciona palavras já usadas em conversas anteriores deste user
  for(const n of STATE.nodes){
    if(n.type !== 'word') continue;
    if(n._provisional) continue;     // não inclui provisional
    const t = (n.text || '').toLowerCase();
    if(t && t.length >= 3) candidatas.add(t);
  }

  // Pre-filtro: só candidatas com length próximo (diferença ≤ 2)
  const filtradas = [...candidatas].filter(c =>
    Math.abs(c.length - p.length) <= max
  );

  // Calcula distância
  let melhor = null;
  let menorDist = Infinity;
  for(const c of filtradas){
    if(c === p) continue;
    const d = _levenshtein(p, c);
    if(d < menorDist){
      menorDist = d;
      melhor = c;
      if(d === 1) break;     // ótimo o suficiente
    }
  }

  if(menorDist > max || !melhor) return null;

  // Decide origem do candidato
  let origem = 'sessao';
  if(typeof dictKnows === 'function' && dictKnows(melhor)) origem = 'dicionario';

  return {
    ehTypo:     true,
    palavra:    p,
    candidato:  melhor,
    distancia:  menorDist,
    origem:     origem,
  };
}

// ============================================================
// APLICA CORREÇÃO TYPO
// Cria aresta 'escrito_como' entre o word-node do erro e do certo
// Atualiza perfil. Marca o erro como corrigido.
// args = {palavra_errada_id, palavra_certa, turnoInfo}
// Retorna: {aplicou, palavra_certa_id}
// ============================================================
function learnAplicarTypo(args){
  const {palavra_errada_id, palavra_certa, turnoInfo} = args;
  const profile = _ensureTypoProfile();

  // 1. Acha word-node certo
  let certoId = 'dict_' + (palavra_certa || '').replace(/[^a-z0-9]/g, '_');
  let certoNode = STATE.nodes.find(n => n.id === certoId);
  if(!certoNode){
    certoId = 'word_' + (palavra_certa || '').replace(/[^a-z0-9]/g, '');
    certoNode = STATE.nodes.find(n => n.id === certoId);
  }
  if(!certoNode){
    // Cria word-node oficial pra palavra certa
    certoId = 'word_' + (palavra_certa || '').replace(/[^a-z0-9]/g, '');
    certoNode = makeNode({
      id:          certoId,
      type:        'word',
      layer:       'core',
      origin_type: 'ORGANIC_LEARNING',
      text:        palavra_certa,
      mass:        1.5,
    });
    STATE.nodes.push(certoNode);
  }

  // 2. Cria aresta: erro → certo (kind 'escrito_como')
  // Aresta forte, persistente: serve pra próxima vez
  const erradoNode = STATE.nodes.find(n => n.id === palavra_errada_id);
  if(!erradoNode){
    return {aplicou: false, motivo: 'palavra errada não está na rede'};
  }

  // Remove status provisional do erro (não vai virar provisional)
  erradoNode._provisional = false;
  erradoNode._eh_typo = true;
  erradoNode._typo_correto = certoNode.id;

  STATE.edges.push(makeEdge({
    a: erradoNode.id, b: certoNode.id, w: 0.95, kind: 'escrito_como'
  }));

  // 3. Atualiza perfil
  const erradoText = (erradoNode.text || '').toLowerCase();
  const certoText = (certoNode.text || '').toLowerCase();
  profile.erros_frequentes[erradoText] = certoText;
  profile.total_erros++;
  profile.total_corrigidos_auto++;

  // 4. Detecta padrão de erro (simples)
  const padrao = _detectarPadraoErro(erradoText, certoText);
  if(padrao && !profile.padroes.includes(padrao)){
    profile.padroes.push(padrao);
  }

  if(turnoInfo){
    turnoInfo.iteracoes.push({
      n:         turnoInfo.iteracoes.length + 1,
      kind:      'infer',
      descricao: `typo: "${erradoText}" → "${certoText}" (silencioso, sem perguntar)`,
      dados:     {erro: erradoText, certo: certoText, padrao},
      timestamp: new Date().toISOString(),
    });
  }

  return {aplicou: true, palavra_certa_id: certoNode.id, padrao};
}

// ============================================================
// DETECTA PADRÃO DE ERRO
// ============================================================
function _detectarPadraoErro(errado, certo){
  if(!errado || !certo) return null;
  // Padrões simples
  if(errado.length === certo.length){
    // troca de letras
    let trocas = 0;
    for(let i = 0; i < errado.length; i++){
      if(errado[i] !== certo[i]) trocas++;
    }
    if(trocas === 1) return 'troca-letra';
    if(trocas === 2 && _ehAnagrama(errado, certo)) return 'inversao-letras';
  }
  if(errado.length === certo.length + 1) return 'letra-extra';
  if(errado.length === certo.length - 1) return 'letra-faltando';
  // omissão de acento
  if(errado === certo.normalize('NFD').replace(/[\u0300-\u036f]/g, '')) return 'sem-acento';
  return 'outro';
}

function _ehAnagrama(a, b){
  return a.split('').sort().join('') === b.split('').sort().join('');
}

// ============================================================
// CORREÇÃO RETROATIVA: user disse "ops escrevi errado, era X"
// Busca último word-node provisional/typo recente na sessão.
// args = {palavra_certa, userInputNodeId, turnoInfo}
// ============================================================
function learnCorrecaoRetroativa(args){
  const {palavra_certa, userInputNodeId, turnoInfo} = args;
  if(!palavra_certa) return {aplicou: false, motivo: 'sem palavra certa fornecida'};

  // Procura últimos word-nodes provisionais (criados nos últimos 3 turnos)
  const turnoAtual = STATE.turn;
  const candidatos = STATE.nodes.filter(n =>
    n.type === 'word' &&
    !n._seed &&
    !n._eh_dicionario &&
    !n._eh_typo &&
    !n._origem_user
  ).sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));

  // Pega o mais próximo (Levenshtein) entre os candidatos recentes
  let melhor = null;
  let menorDist = Infinity;
  const pNorm = norm(palavra_certa);
  // v7.1-B: só candidatos com lastAccessed recente (últimos 3 turnos)
  const recentes = candidatos.filter(c =>
    (c.lastAccessed || 0) >= (turnoAtual - 3)
  ).slice(0, 8);  // top 8 mais recentes
  for(const cand of recentes){
    const cText = (cand.text || '').toLowerCase();
    if(cText === pNorm) continue;
    if(cText.length < 3) continue;     // muito curto
    const d = _levenshtein(cText, pNorm);
    // distância tem que ser baixa E proporcional ao tamanho (50% max)
    const maxAllowed = Math.min(3, Math.floor(Math.max(cText.length, pNorm.length) * 0.5));
    if(d < menorDist && d <= maxAllowed){
      menorDist = d;
      melhor = cand;
    }
  }

  if(!melhor){
    if(turnoInfo){
      turnoInfo.iteracoes.push({
        n:         turnoInfo.iteracoes.length + 1,
        kind:      'warn',
        descricao: `correção retroativa: não achei palavra próxima a "${palavra_certa}" nos últimos turnos`,
        timestamp: new Date().toISOString(),
      });
    }
    return {aplicou: false, motivo: 'não achei candidato recente'};
  }

  // Aplica typo
  return learnAplicarTypo({
    palavra_errada_id: melhor.id,
    palavra_certa,
    turnoInfo,
  });
}

// ============================================================
// STATS DO PERFIL DE TYPO
// ============================================================
function typoStats(){
  const p = STATE.userTypoProfile || {};
  return {
    total_erros:        p.total_erros || 0,
    total_corrigidos:   p.total_corrigidos_auto || 0,
    padroes_detectados: (p.padroes || []).slice(),
    erros_frequentes:   {...(p.erros_frequentes || {})},
  };
}

// ============================================================
// EXPOR
// ============================================================
window.learnDetectarTypo     = learnDetectarTypo;
window.learnAplicarTypo      = learnAplicarTypo;
window.learnCorrecaoRetroativa = learnCorrecaoRetroativa;
window.typoStats             = typoStats;

console.log('[learn_typo v7.1] carregado');
