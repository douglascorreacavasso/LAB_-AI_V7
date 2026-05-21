// =============================================================================
// LEARN_PATTERN.JS — Lab v7 - Raciocínio
//
// DETECTOR INDUTIVO DE PADRÕES.
//
// FILOSOFIA:
//   Quando o user diz "2 + 2 = 4", o sistema:
//   1. Reconhece a ESTRUTURA: [num] [op_soma] [num] [op_igual] [num]
//   2. Extrai os VALORES: operando_a=2, operando_b=2, resultado=4
//   3. Procura RELAÇÃO entre operandos e resultado:
//      - a == b → "operandos iguais"
//      - res == a*2 → "resultado é dobro de a"
//      - res == a+b → "resultado é soma"
//   4. Cria pattern_candidate com essas hipóteses, confidence baixa
//
//   No próximo exemplo "3 + 3 = 6":
//   - mesma estrutura, mesmas relações ainda valem → REFORÇA confidence
//
//   Após 3+ exemplos consistentes → PROMOVE pra rule_math oficial.
//
// IMPORTANTE: o "achar relações" é GENÉRICO. Testa todas as combinações
// matemáticas básicas (a+b, a-b, a*b, a/b, a*2, b*2, max, min, etc).
//
// SAÍDA:
//   pattern_candidate node {_estrutura, _relacoes:[...], _exemplos:[ids],
//   _confidence}
// =============================================================================

'use strict';

// ============================================================
// FUNÇÃO PRINCIPAL — chamada quando detecta exemplo matemático
// args = {
//   userInputNodeId, parseInfo, turnoInfo
// }
// Retorna: {detectou_pattern?, pattern_node?, promoveu_pra_rule?, valor_resultado?}
// ============================================================
function learnDetectarPattern(args){
  const {userInputNodeId, parseInfo, turnoInfo} = args;

  // 1. Tenta extrair estrutura matemática da frase
  const exemplo = _parseMathExpression(userInputNodeId);
  if(!exemplo){
    return {detectou_pattern: false, motivo: 'frase não é expressão matemática'};
  }

  _addIterLogP(turnoInfo, 'infer',
    `pattern: detectou expressão ${exemplo.operandos.join(' ' + exemplo.op_simbolo + ' ')} = ${exemplo.resultado}`,
    {operandos: exemplo.operandos, op: exemplo.operador, resultado: exemplo.resultado});

  // 2. Cria nó example representando esta instância
  const exampleNode = makeNode({
    type:        'example',
    layer:       'mantle',
    origin_type: 'CHAT',
    text:        `exemplo: ${exemplo.operandos.join(' ' + exemplo.op_simbolo + ' ')} = ${exemplo.resultado}`,
    mass:        1.5,
    energy:      2,
  });
  exampleNode._operandos = exemplo.operandos;
  exampleNode._operador  = exemplo.operador;
  exampleNode._resultado = exemplo.resultado;
  exampleNode._turno     = STATE.turn;
  STATE.nodes.push(exampleNode);

  if(userInputNodeId){
    STATE.edges.push(makeEdge({
      a: userInputNodeId, b: exampleNode.id, w: 0.7, kind: 'exemplo_de'
    }));
  }
  // Liga exemplo ao conceito do operador
  if(exemplo.operador_id){
    STATE.edges.push(makeEdge({
      a: exampleNode.id, b: exemplo.operador_id, w: 0.8, kind: 'é_atributo_de'
    }));
  }

  // 3. Procura ou cria pattern_candidate pra esse operador
  let patternNode = _findOuCreatePattern(exemplo, turnoInfo);

  // 4. Liga exemplo ao pattern
  STATE.edges.push(makeEdge({
    a: exampleNode.id, b: patternNode.id, w: 0.8, kind: 'exemplo_de'
  }));
  patternNode._exemplos = patternNode._exemplos || [];
  patternNode._exemplos.push(exampleNode.id);

  // 5. Testa todas as relações matemáticas pra ver quais ainda valem
  const relacoesNovas = _analisarRelacoes(exemplo);
  patternNode._relacoes_testadas = relacoesNovas;

  // 6. Intersecta com relações anteriores (só as que valem em TODOS os exemplos)
  if(!patternNode._relacoes_validas){
    patternNode._relacoes_validas = relacoesNovas.slice();
  } else {
    patternNode._relacoes_validas = patternNode._relacoes_validas.filter(rel =>
      relacoesNovas.some(rn => rn.nome === rel.nome)
    );
  }

  // 7. Atualiza confidence
  const numExemplos = patternNode._exemplos.length;
  const numRelacoes = patternNode._relacoes_validas.length;
  // confidence = base * (exemplos / 3 limitado) * (1 se há relação consistente)
  let conf = Math.min(0.95, 0.25 + numExemplos * 0.20);
  if(numRelacoes === 0) conf = Math.max(0.1, conf - 0.4);  // sem relação consistente — fraco
  patternNode._confidence = conf;
  patternNode.mass = (patternNode.mass || 1) + 0.4;
  patternNode.energy = Math.min(20, (patternNode.energy || 0) + 3);

  _addIterLogP(turnoInfo, 'infer',
    `pattern: ${numExemplos} exemplo(s), ${numRelacoes} relação(ões) válida(s), conf=${conf.toFixed(2)}`,
    {exemplos: numExemplos, relacoes: patternNode._relacoes_validas.map(r=>r.nome), conf});

  // 8. PROMOÇÃO: confidence ≥ 0.7 E pelo menos 3 exemplos E ao menos 1 relação válida → rule_math
  let promoveuPraRule = null;
  if(conf >= 0.7 && numExemplos >= 3 && numRelacoes >= 1 && patternNode._status !== 'rule'){
    promoveuPraRule = _promoverPraRule(patternNode, turnoInfo);
  }

  return {
    detectou_pattern: true,
    exemplo,
    pattern_node:     patternNode,
    promoveu_pra_rule: promoveuPraRule,
  };
}

// ============================================================
// PARSE DE EXPRESSÃO MATEMÁTICA
// Procura na frase os números, operadores e o resultado
// "2 + 2 = 4" → {operandos:[2,2], operador:'soma', resultado:4}
// "tres mais tres da seis" → idem
// Retorna null se não for uma expressão completa
// ============================================================
function _parseMathExpression(userInputNodeId){
  const inputN = STATE.nodes.find(n => n.id === userInputNodeId);
  if(!inputN) return null;
  const texto = (inputN.text || '').toLowerCase();

  // Tokeniza preservando símbolos numéricos e operadores
  // Substitui +, -, *, =, ÷ por versões com espaço
  let t = texto.replace(/([+\-*/=÷×])/g, ' $1 ').replace(/\s+/g, ' ').trim();
  const toks = t.split(' ').filter(x => x);

  // Mapeamento de símbolos → ID estável (espelha seed_operadores.js)
  const symMapMath = {
    '+':'plus','-':'minus','*':'star','x':'x','×':'times','/':'slash','÷':'div','=':'eq',
  };

  // Pra cada token: tenta achar word-node correspondente (dígito, extenso, operador)
  const seq = [];
  for(const tok of toks){
    // 1. Dígito direto
    if(/^-?\d+(\.\d+)?$/.test(tok)){
      seq.push({tipo: 'num', valor: parseFloat(tok), word_id: null, txt: tok});
      continue;
    }
    // 2. Operador simbólico — usa symMap pra achar id estável
    let wn = null;
    if(symMapMath[tok]){
      const opId = 'op_' + symMapMath[tok];
      wn = STATE.nodes.find(n => n.id === opId);
    }
    // 3. num_X pra dígitos por extenso (ex: "dois" → num_2 via sinônimo)
    if(!wn){
      const numId = 'num_' + tok;
      wn = STATE.nodes.find(n => n.id === numId);
    }
    // 4. word_X normal (com replace seguro)
    if(!wn){
      const wid = 'word_' + tok.replace(/[^a-z0-9]/g, '');
      if(wid !== 'word_') wn = STATE.nodes.find(n => n.id === wid);
    }
    // 5. fallback: operador por extenso (mais, soma, vezes…)
    if(!wn){
      const opId = 'op_' + tok.toLowerCase().replace(/[^a-z0-9]/g, '_');
      if(opId !== 'op_') wn = STATE.nodes.find(n => n.id === opId);
    }

    if(wn){
      if(typeof wn._valor_numerico === 'number'){
        seq.push({tipo: 'num', valor: wn._valor_numerico, word_id: wn.id, txt: tok});
      } else if(wn._eh_operador){
        seq.push({tipo: 'op', conceito: wn._conceito_op, word_id: wn.id, txt: tok});
      } else {
        seq.push({tipo: 'outro', word_id: wn.id, txt: tok});
      }
    } else {
      seq.push({tipo: 'outro', word_id: null, txt: tok});
    }
  }

  // ============================================================
  // Procura padrão estrutural [num] [op_aritmetico] [num] [op_igual] [num]
  // (operadores aritméticos: soma, subt, mult, div)
  // ============================================================
  const seqUtil = seq.filter(x => x.tipo === 'num' || x.tipo === 'op');
  if(seqUtil.length < 5) return null;

  const opsAritmeticos = ['conc_op_soma','conc_op_subt','conc_op_mult','conc_op_div'];

  // Janela: 5 elementos seguidos: num op num = num
  for(let i = 0; i <= seqUtil.length - 5; i++){
    const a  = seqUtil[i];
    const op = seqUtil[i+1];
    const b  = seqUtil[i+2];
    const eq = seqUtil[i+3];
    const r  = seqUtil[i+4];

    if(a.tipo === 'num' && b.tipo === 'num' && r.tipo === 'num' &&
       op.tipo === 'op' && opsAritmeticos.includes(op.conceito) &&
       eq.tipo === 'op' && eq.conceito === 'conc_op_igual'){
      const symb = _operadorSimbolo(op.conceito);
      return {
        operandos:    [a.valor, b.valor],
        operador:     op.conceito,
        operador_id:  op.word_id,
        op_simbolo:   symb,
        resultado:    r.valor,
      };
    }
  }

  return null;
}

// ============================================================
// SÍMBOLO DE OPERADOR
// ============================================================
function _operadorSimbolo(conceito){
  return ({
    'conc_op_soma': '+',
    'conc_op_subt': '-',
    'conc_op_mult': '×',
    'conc_op_div':  '÷',
  })[conceito] || '?';
}

// ============================================================
// ENCONTRA OU CRIA PATTERN_CANDIDATE
// Um pattern existe por OPERADOR + arity (sempre 2 aqui)
// ============================================================
function _findOuCreatePattern(exemplo, turnoInfo){
  const patternId = 'pattern_' + exemplo.operador;
  let p = STATE.nodes.find(n => n.id === patternId);
  if(p) return p;

  p = makeNode({
    id:          patternId,
    type:        'pattern',
    layer:       'mantle',
    origin_type: 'INFERENCE',
    text:        `padrão: ${_operadorSimbolo(exemplo.operador)} (em descoberta)`,
    mass:        2,
    energy:      3,
    is_anchor:   1,
  });
  p._operador = exemplo.operador;
  p._arity    = 2;
  p._status   = 'candidato';
  p._exemplos = [];
  p._relacoes_validas = null;
  p._confidence = 0.25;
  p._turno_criado = STATE.turn;
  STATE.nodes.push(p);

  // Liga ao conceito do operador
  STATE.edges.push(makeEdge({
    a: p.id, b: exemplo.operador, w: 0.8, kind: 'é_tipo_de'
  }));

  _addIterLogP(turnoInfo, 'create',
    `pattern: criou candidato "${patternId}" pra operador ${_operadorSimbolo(exemplo.operador)}`,
    {pattern_id: patternId});

  return p;
}

// ============================================================
// ANALISA RELAÇÕES MATEMÁTICAS
// Testa todas as relações conhecidas e retorna as que valem pra esse exemplo
// ============================================================
function _analisarRelacoes(ex){
  const [a, b] = ex.operandos;
  const r = ex.resultado;

  const candidatas = [
    {nome: 'soma',          formula:'a+b',      vale: (a + b) === r,             fn: (x,y)=>x+y},
    {nome: 'subt',          formula:'a-b',      vale: (a - b) === r,             fn: (x,y)=>x-y},
    {nome: 'mult',          formula:'a*b',      vale: (a * b) === r,             fn: (x,y)=>x*y},
    {nome: 'div',           formula:'a/b',      vale: b !== 0 && (a / b) === r,  fn: (x,y)=>y!==0?x/y:null},
    {nome: 'dobro_a',       formula:'2*a',      vale: (a * 2) === r,             fn: (x,y)=>x*2},
    {nome: 'dobro_b',       formula:'2*b',      vale: (b * 2) === r,             fn: (x,y)=>y*2},
    {nome: 'metade_a',      formula:'a/2',      vale: (a / 2) === r,             fn: (x,y)=>x/2},
    {nome: 'metade_b',      formula:'b/2',      vale: (b / 2) === r,             fn: (x,y)=>y/2},
    {nome: 'maior',         formula:'max(a,b)', vale: Math.max(a,b) === r,        fn: (x,y)=>Math.max(x,y)},
    {nome: 'menor',         formula:'min(a,b)', vale: Math.min(a,b) === r,        fn: (x,y)=>Math.min(x,y)},
    {nome: 'a',             formula:'a',        vale: a === r,                    fn: (x,y)=>x},
    {nome: 'b',             formula:'b',        vale: b === r,                    fn: (x,y)=>y},
    {nome: 'a+b_2',         formula:'(a+b)/2',  vale: ((a+b)/2) === r,            fn: (x,y)=>(x+y)/2},
  ];

  return candidatas.filter(c => c.vale).map(c => ({
    nome: c.nome,
    formula: c.formula,
  }));
}

// ============================================================
// PROMOVE PATTERN → RULE
// Cria nó rule_math oficial, marca pattern como promovido
// ============================================================
function _promoverPraRule(patternNode, turnoInfo){
  // Escolhe a relação mais "específica" das válidas
  const relacoes = patternNode._relacoes_validas || [];
  // Heurística: relação que NÃO é a operação trivial sempre é mais informativa
  // Ex: pra operador soma, relação 'soma' é trivial; relação 'dobro_a' é interessante
  const operadorBase = _operadorBaseRel(patternNode._operador);
  const interessantes = relacoes.filter(r => r.nome !== operadorBase);
  const escolhida = interessantes[0] || relacoes[0] || null;

  if(!escolhida) return null;

  // Cria rule_math
  const ruleId = 'rule_' + patternNode._operador + '_' + escolhida.nome;
  let rule = STATE.nodes.find(n => n.id === ruleId);

  if(!rule){
    rule = makeNode({
      id:          ruleId,
      type:        'rule_math',
      layer:       'core',
      origin_type: 'ORGANIC_LEARNING',
      text:        `regra: ${_operadorSimbolo(patternNode._operador)}(a,b) = ${escolhida.formula}`,
      mass:        4,
      energy:      5,
      is_anchor:   1,
      is_super:    1,
    });
    rule._operador  = patternNode._operador;
    rule._relacao   = escolhida.nome;
    rule._formula   = escolhida.formula;
    rule._origem    = 'inferida por exemplos';
    rule._turno_criada = STATE.turn;
    rule._n_exemplos = (patternNode._exemplos || []).length;
    STATE.nodes.push(rule);

    // Liga rule ↔ pattern
    STATE.edges.push(makeEdge({
      a: rule.id, b: patternNode.id, w: 0.9, kind: 'deriva_de'
    }));
    // Liga rule ao operador
    STATE.edges.push(makeEdge({
      a: rule.id, b: patternNode._operador, w: 0.9, kind: 'é_atributo_de'
    }));
  }

  patternNode._status      = 'rule';
  patternNode._promoveu_para = ruleId;
  patternNode.is_super     = 1;

  _addIterLogP(turnoInfo, 'create',
    `PROMOÇÃO: pattern → rule_math "${ruleId}" — ${_operadorSimbolo(patternNode._operador)}(a,b) = ${escolhida.formula}`,
    {rule_id: ruleId, formula: escolhida.formula});

  return rule;
}

// ============================================================
// RELAÇÃO BASE DO OPERADOR
// (a relação trivial — quando soma e operador é soma, é trivial)
// ============================================================
function _operadorBaseRel(opConceito){
  return ({
    'conc_op_soma': 'soma',
    'conc_op_subt': 'subt',
    'conc_op_mult': 'mult',
    'conc_op_div':  'div',
  })[opConceito] || null;
}

// ============================================================
// LISTA TODAS AS RULES MATH APRENDIDAS
// ============================================================
function listRulesMath(){
  return STATE.nodes.filter(n => n.type === 'rule_math');
}

// ============================================================
// STATS DE PATTERNS
// ============================================================
function patternStats(){
  const patterns = STATE.nodes.filter(n => n.type === 'pattern');
  const rules = STATE.nodes.filter(n => n.type === 'rule_math');
  const examples = STATE.nodes.filter(n => n.type === 'example');
  return {
    patterns_total:     patterns.length,
    patterns_candidato: patterns.filter(p => p._status === 'candidato').length,
    patterns_promovidos:patterns.filter(p => p._status === 'rule').length,
    rules_aprendidas:   rules.length,
    exemplos_coletados: examples.length,
  };
}

function _addIterLogP(turnoInfo, kind, descricao, dados){
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
window.learnDetectarPattern = learnDetectarPattern;
window.listRulesMath        = listRulesMath;
window.patternStats         = patternStats;

console.log('[learn_pattern v7] carregado');
