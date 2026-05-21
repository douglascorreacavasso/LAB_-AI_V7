// =============================================================================
// ACTION_COMPUTE.JS — Lab v7 - Raciocínio
//
// APLICA RULE APRENDIDA pra calcular respostas matemáticas.
//
// FILOSOFIA:
//   Hoje "quanto é 7+7?" cai em "hmm, não sei ainda".
//   Mas se o sistema APRENDEU a rule_conc_op_soma_dobro_a (porque user
//   ensinou com 2+2=4, 3+3=6, 5+5=10), agora ele:
//   1. Reconhece "7+7" como aplicação dessa rule
//   2. Aplica formula 2*a (com a=7) → 14
//   3. Responde "7+7=14"
//
// IMPORTANTE: a rule INFERIDA pode estar errada (sistema viu só casos
// onde a==b). Quando user diz "quanto é 2+5?", a rule "dobro_a" daria 4 (errado).
// Aí o user pode dizer "errado, é 7" → cadeia ruim, rule perde brightness.
//
// SAÍDA:
//   {calculou?, resultado?, rule_usada?, formula_aplicada?}
// =============================================================================

'use strict';

// ============================================================
// AÇÃO PRINCIPAL
// args = {
//   userInputNodeId, parseInfo, turnoInfo
// }
// Retorna: {calculou, resultado, rule_node?, formula}
// ============================================================
function actionCompute(args){
  const {userInputNodeId, parseInfo, turnoInfo} = args;

  // 1. Tenta extrair pergunta matemática: "quanto é A op B?"
  const pergunta = _parseMathPergunta(userInputNodeId);
  if(!pergunta){
    return {calculou: false, motivo: 'não é pergunta matemática'};
  }

  _addIterLogCM(turnoInfo, 'infer',
    `compute: detectou pergunta ${pergunta.a} ${pergunta.op_simbolo} ${pergunta.b} = ?`,
    {pergunta});

  // 2. Procura rule_math pra esse operador
  const rule = STATE.nodes.find(n =>
    n.type === 'rule_math' && n._operador === pergunta.operador
  );

  if(!rule){
    _addIterLogCM(turnoInfo, 'warn',
      `compute: nenhuma rule aprendida pra operador ${pergunta.op_simbolo}`,
      {operador: pergunta.operador});
    return {calculou: false, motivo: 'rule não aprendida'};
  }

  // 3. Aplica a fórmula
  const resultado = _aplicarFormula(rule._relacao, pergunta.a, pergunta.b);
  if(resultado === null || isNaN(resultado)){
    return {calculou: false, motivo: 'fórmula não aplicável'};
  }

  // 4. Cria action_compute node
  const compNode = makeNode({
    type:        'action_compute',
    layer:       'exec',
    origin_type: 'SYSTEM',
    text:        `compute(${pergunta.a} ${pergunta.op_simbolo} ${pergunta.b}) = ${resultado}`,
    mass:        1.5,
    fire_id:     nextFireId(),
  });
  compNode._operandos = [pergunta.a, pergunta.b];
  compNode._operador  = pergunta.operador;
  compNode._resultado = resultado;
  compNode._rule_usada = rule.id;
  STATE.nodes.push(compNode);

  if(userInputNodeId){
    STATE.edges.push(makeEdge({
      a: userInputNodeId, b: compNode.id, w: 0.7, kind: 'sequence'
    }));
  }
  // Liga rule → compute (a rule foi aplicada)
  STATE.edges.push(makeEdge({
    a: rule.id, b: compNode.id, w: 0.8, kind: 'sequence'
  }));
  // Reforça rule (foi útil!)
  rule.mass = (rule.mass || 1) + 0.3;
  rule.lastAccessed = nowT();
  rule._n_usos = (rule._n_usos || 0) + 1;

  _addIterLogCM(turnoInfo, 'action',
    `compute: aplicou ${rule.text} → ${resultado}`,
    {rule_id: rule.id, resultado, formula: rule._formula});

  return {
    calculou: true,
    resultado,
    rule_node: rule,
    rule_id: rule.id,
    formula: rule._formula,
    a: pergunta.a,
    b: pergunta.b,
    op_simbolo: pergunta.op_simbolo,
    compute_node_id: compNode.id,
  };
}

// ============================================================
// PARSE DE PERGUNTA MATEMÁTICA
// "quanto é 7+7", "7 + 7 = ?", "2 mais 3", "qual o resultado de 5 vezes 5"
// Retorna {a, b, operador, op_simbolo} ou null
// ============================================================
function _parseMathPergunta(userInputNodeId){
  const inputN = STATE.nodes.find(n => n.id === userInputNodeId);
  if(!inputN) return null;
  const texto = (inputN.text || '').toLowerCase();

  // Tokeniza preservando símbolos
  let t = texto.replace(/([+\-*/=÷×?])/g, ' $1 ').replace(/\s+/g, ' ').trim();
  const toks = t.split(' ').filter(x => x);

  // Mapeamento símbolo → ID estável (espelha seed_operadores.js)
  const symMapMath = {
    '+':'plus','-':'minus','*':'star','x':'x','×':'times','/':'slash','÷':'div','=':'eq',
  };

  // Mapeia tokens pra {tipo, valor/conceito}
  const seq = [];
  for(const tok of toks){
    if(/^-?\d+(\.\d+)?$/.test(tok)){
      seq.push({tipo: 'num', valor: parseFloat(tok)});
      continue;
    }
    let wn = null;
    // Operador simbólico via symMap
    if(symMapMath[tok]){
      const opId = 'op_' + symMapMath[tok];
      wn = STATE.nodes.find(n => n.id === opId);
    }
    // num_X
    if(!wn){
      const numId = 'num_' + tok;
      wn = STATE.nodes.find(n => n.id === numId);
    }
    // word_X
    if(!wn){
      const wid = 'word_' + tok.replace(/[^a-z0-9]/g, '');
      if(wid !== 'word_') wn = STATE.nodes.find(n => n.id === wid);
    }
    // op_X por extenso
    if(!wn){
      const opId = 'op_' + tok.toLowerCase().replace(/[^a-z0-9]/g, '_');
      if(opId !== 'op_') wn = STATE.nodes.find(n => n.id === opId);
    }

    if(wn){
      if(typeof wn._valor_numerico === 'number'){
        seq.push({tipo: 'num', valor: wn._valor_numerico});
      } else if(wn._eh_operador){
        seq.push({tipo: 'op', conceito: wn._conceito_op});
      }
    }
  }

  // Padrão: [num] [op aritmético] [num]
  const opsAritmeticos = ['conc_op_soma','conc_op_subt','conc_op_mult','conc_op_div'];

  for(let i = 0; i <= seq.length - 3; i++){
    const a  = seq[i];
    const op = seq[i+1];
    const b  = seq[i+2];
    if(a.tipo === 'num' && b.tipo === 'num' &&
       op.tipo === 'op' && opsAritmeticos.includes(op.conceito)){
      return {
        a:          a.valor,
        b:          b.valor,
        operador:   op.conceito,
        op_simbolo: _opSimbolo(op.conceito),
      };
    }
  }
  return null;
}

// ============================================================
// APLICA FÓRMULA NOMEADA
// ============================================================
function _aplicarFormula(nome, a, b){
  const fmap = {
    'soma':      (x,y) => x + y,
    'subt':      (x,y) => x - y,
    'mult':      (x,y) => x * y,
    'div':       (x,y) => y !== 0 ? x / y : null,
    'dobro_a':   (x,y) => x * 2,
    'dobro_b':   (x,y) => y * 2,
    'metade_a':  (x,y) => x / 2,
    'metade_b':  (x,y) => y / 2,
    'maior':     (x,y) => Math.max(x, y),
    'menor':     (x,y) => Math.min(x, y),
    'a':         (x,y) => x,
    'b':         (x,y) => y,
    'a+b_2':     (x,y) => (x + y) / 2,
  };
  const fn = fmap[nome];
  if(!fn) return null;
  return fn(a, b);
}

function _opSimbolo(conceito){
  return ({
    'conc_op_soma': '+',
    'conc_op_subt': '-',
    'conc_op_mult': '×',
    'conc_op_div':  '÷',
  })[conceito] || '?';
}

function _addIterLogCM(turnoInfo, kind, descricao, dados){
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
window.actionCompute = actionCompute;

console.log('[action_compute v7] carregado');
