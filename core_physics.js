// =============================================================================
// CORE_PHYSICS.JS — Lab v7 - Raciocínio
//
// FÍSICA OFICIAL (Suma Teológica §5.1)
// ===================================
//
// PROPAGAÇÃO DE PULSO (BFS):
//   E_transf = E_origem × β × peso_aresta × α^hop
//   α = 0.95  (decai por hop)
//   β = 0.20  (fração que sai)
//   MAX_HOPS = 6
//   PULSO_INICIAL = 100
//   THRESHOLD = 2  (transf < 2 → para)
//
// DISPERSÃO REAL (v5 F5):
//   Quem propaga PERDE o que doou. Não acumula infinito.
//
// SELF-CORE (v5 F1):
//   Doa energia, volta a 0. Nunca acumula.
//
// PONTE DE LUZ:
//   Aresta usada ganha +0.02 de peso (consolidação Hebbian).
//
// MASSA CRÍTICA:
//   mass > 100 + grau >= 3 conexões → núcleo "vira ideia" (super).
//
// PENALIDADE POR ERRO (Matemática da Dor §4.3):
//   massa_nova = massa_atual × (1 − α_pain × e^(β_pain × Error))
//
// DECAIMENTO TEMPORAL (Paradoxo da Supermassa §4.6):
//   massa = massa_base × e^(−λ × dias_sem_acesso)
//
// =============================================================================

'use strict';

// ============================================================
// PROPAGAÇÃO DE PULSO — BFS oficial
// ============================================================
// Dispara um pulso a partir de N núcleos-semente, propaga pela rede
// usando a fórmula oficial, marca arestas iluminadas (_lit=true),
// reforça pesos (Ponte de Luz) e retorna mapa de núcleos ativados.
//
// Args:
//   seedIds: array de IDs de núcleos onde o pulso começa
//   opts: {
//     pulse_initial: número (default PHYSICS.PULSO_INICIAL),
//     max_hops:      número (default PHYSICS.MAX_HOPS),
//     alpha, beta:   override das constantes,
//     reinforce:     bool (default true) — usa Ponte de Luz?
//     disperse:      bool (default true) — origem perde energia que doou?
//   }
//
// Retorna: {
//   activated:  Map<nodeId, energyRecebida>,
//   edgesUsed:  Set<edgeIndex>,
//   reinforced: array de {a,b,deltaW},
//   nucleiTouched: count,
//   converged:  bool (true se atingiu fim natural, false se travou no teto),
// }
function propagatePulse(seedIds, opts){
  opts = opts || {};
  const PULSE = opts.pulse_initial !== undefined ? opts.pulse_initial : PHYSICS.PULSO_INICIAL;
  const MAX_HOPS = opts.max_hops !== undefined ? opts.max_hops : PHYSICS.MAX_HOPS;
  const ALPHA = opts.alpha !== undefined ? opts.alpha : PHYSICS.ALPHA;
  const BETA  = opts.beta  !== undefined ? opts.beta  : PHYSICS.BETA;
  const REINFORCE = opts.reinforce !== false;
  const DISPERSE  = opts.disperse !== false;

  // Limpa flag _lit das arestas
  for(const e of STATE.edges) e._lit = false;

  // Energia inicial nos sementes
  const activated = new Map();          // nodeId → energia recebida
  const edgesUsed = new Set();          // índices de arestas iluminadas
  const reinforced = [];                // arestas que foram reforçadas

  // Frontier do BFS
  let frontier = [];
  for(const id of seedIds){
    const n = STATE.nodes.find(x => x.id === id);
    if(!n) continue;
    n.energy = (n.energy || 0) + PULSE;
    n.lastAccessed = nowT();
    activated.set(id, PULSE);
    frontier.push({id, energy: PULSE, hop: 0});
  }

  // Loop BFS
  let nucleiTouched = activated.size;
  const visited = new Set(seedIds);     // evita reentrar no mesmo nó
  let converged = true;

  for(let hop = 0; hop < MAX_HOPS && frontier.length > 0; hop++){
    const nextFrontier = [];

    for(const f of frontier){
      // Achou estouro de segurança?
      if(nucleiTouched >= PHYSICS.MAX_NUCLEI_PULSE){
        console.warn('[physics] MAX_NUCLEI_PULSE atingido em hop', hop);
        converged = false;
        break;
      }

      // Energia do nó atual
      const E_origem = f.energy;
      if(E_origem < PHYSICS.THRESHOLD_TRANSF) continue;

      // Arestas conectadas a este nó
      let doado = 0;
      for(let i = 0; i < STATE.edges.length; i++){
        const e = STATE.edges[i];
        if(e.a !== f.id && e.b !== f.id) continue;
        if(e.w < PHYSICS.WEIGHT_MIN) continue;

        const otherId = e.a === f.id ? e.b : e.a;
        if(visited.has(otherId)) continue;

        // FÓRMULA OFICIAL: E_transf = E_origem × β × peso × α^hop
        const transf = E_origem * BETA * e.w * Math.pow(ALPHA, hop);
        if(transf < PHYSICS.THRESHOLD_TRANSF) continue;

        // Adiciona energia ao alvo
        const target = STATE.nodes.find(x => x.id === otherId);
        if(!target) continue;
        target.energy = (target.energy || 0) + transf;
        target.lastAccessed = nowT();

        // Ganha massa (acúmulo gradual)
        target.mass = (target.mass || 1) + transf / 100;

        // Ilumina a aresta
        e._lit = true;
        e.uses = (e.uses || 0) + 1;
        e.lastUsed = nowT();
        edgesUsed.add(i);

        // Ponte de Luz — reforço
        if(REINFORCE){
          const oldW = e.w;
          e.w = Math.min(PHYSICS.WEIGHT_MAX, e.w + PHYSICS.BRIDGE_DELTA);
          if(e.w !== oldW){
            reinforced.push({a: e.a, b: e.b, deltaW: e.w - oldW});
          }
        }

        // Marca/enfileira o alvo
        visited.add(otherId);
        activated.set(otherId, transf);
        nucleiTouched++;
        nextFrontier.push({id: otherId, energy: transf, hop: hop + 1});

        doado += transf;
      }

      // DISPERSÃO REAL — origem perde o que doou (v5 F5)
      if(DISPERSE){
        const origNode = STATE.nodes.find(x => x.id === f.id);
        if(origNode){
          origNode.energy = Math.max(0, (origNode.energy || 0) - doado);
          // Self-Core sempre volta a 0
          if(PHYSICS.SELF_RETURNS_ZERO && origNode.type === 'identity_self'){
            origNode.energy = 0;
          }
        }
      }
    }

    if(!converged) break;
    frontier = nextFrontier;
  }

  return {activated, edgesUsed, reinforced, nucleiTouched, converged};
}

// ============================================================
// NÚCLEOS ILUMINADOS — pós pulso
// Retorna os nós com energia >= threshold, ordenados por energia desc.
// ============================================================
function getLitNodes(activatedMap, minEnergy){
  minEnergy = minEnergy !== undefined ? minEnergy : PHYSICS.THRESHOLD_LIT;
  const out = [];
  for(const [id, e] of activatedMap.entries()){
    if(e < minEnergy) continue;
    const n = STATE.nodes.find(x => x.id === id);
    if(n) out.push({node: n, energy: e});
  }
  return out.sort((a, b) => b.energy - a.energy);
}

// ============================================================
// PROMOÇÃO A "IDEIA" (super-núcleo)
// Quando um nó passa massa crítica + tem N conexões, vira is_super=1.
// ============================================================
function checkAndPromoteIdeas(){
  const promovidos = [];
  for(const n of STATE.nodes){
    if(n.is_super) continue;
    if(n.type === 'identity_self') continue;            // Self é único super manual
    if((n.mass || 0) < PHYSICS.MASSA_CRITICA) continue;

    // Conta grau
    const grau = STATE.edges.filter(e => e.a === n.id || e.b === n.id).length;
    if(grau < PHYSICS.MIN_CONEX_IDEIA) continue;

    n.is_super = 1;
    n.brightness = Math.min(1, (n.brightness || 0.5) + 0.3);
    promovidos.push(n.id);
  }
  return promovidos;
}

// ============================================================
// INIBIÇÃO LATERAL — feedback negativo
// Recebe lista de arestas e enfraquece (multiplica peso por 1-fator)
// ============================================================
function inibirArestas(edgeRefs, fator){
  fator = fator !== undefined ? fator : 0.3;
  let count = 0;
  for(const ref of edgeRefs){
    const e = STATE.edges.find(x =>
      (x.a === ref.a && x.b === ref.b) || (x.a === ref.b && x.b === ref.a)
    );
    if(!e) continue;
    e.w = Math.max(PHYSICS.WEIGHT_MIN, e.w * (1 - fator));
    count++;
  }
  return count;
}

// ============================================================
// REFORÇO EXPLÍCITO — feedback positivo
// Soma fator ao peso de cada aresta.
// ============================================================
function reforcarArestas(edgeRefs, fator){
  fator = fator !== undefined ? fator : 0.15;
  let count = 0;
  for(const ref of edgeRefs){
    const e = STATE.edges.find(x =>
      (x.a === ref.a && x.b === ref.b) || (x.a === ref.b && x.b === ref.a)
    );
    if(!e) continue;
    e.w = Math.min(PHYSICS.WEIGHT_MAX, e.w + fator);
    count++;
  }
  return count;
}

// ============================================================
// PENALIDADE POR ERRO (Matemática da Dor §4.3)
// massa_nova = massa_atual × (1 − α_pain × e^(β_pain × erro))
// erro ∈ [0, 1]
// ============================================================
function aplicarPenalidade(nodeIds, erro){
  erro = Math.max(0, Math.min(1, erro || 1));
  const fator = 1 - PHYSICS.PAIN_ALPHA * Math.exp(PHYSICS.PAIN_BETA * erro);
  const log = [];
  for(const id of nodeIds){
    const n = STATE.nodes.find(x => x.id === id);
    if(!n) continue;
    const massaAntes = n.mass || 1;
    n.mass = Math.max(0.1, massaAntes * fator);
    log.push({id, massa_antes: massaAntes, massa_depois: n.mass});
  }
  return log;
}

// ============================================================
// DECAIMENTO TEMPORAL (Paradoxo da Supermassa §4.6)
// Roda periodicamente: núcleos sem acesso há muitos dias perdem massa.
// massa = massa × e^(−λ × dias)
// ============================================================
function aplicarDecayTemporal(){
  const agora = nowT();
  const umDia = 1000 * 60 * 60 * 24;
  let aplicados = 0;
  for(const n of STATE.nodes){
    if(n.type === 'identity_self') continue;            // Self não decai
    if(n._seed) continue;                                // seed não decai
    const ultimo = n.lastAccessed || n.createdAt || agora;
    const dias = (agora - ultimo) / umDia;
    if(dias < 1) continue;
    // Sessões com mais de DECAY_DAYS sem acesso recebem decay acelerado (x3)
    const lambda = dias > PHYSICS.DECAY_DAYS ? PHYSICS.LAMBDA * 3 : PHYSICS.LAMBDA;
    const fator = Math.exp(-lambda * dias);
    n.mass = (n.mass || 1) * fator;
    aplicados++;
  }
  return aplicados;
}

// ============================================================
// GRAVIDADE SIMBÓLICA — atualiza posições 3D
// Núcleos pesados "puxam" os leves; layers seguram em raios próprios.
// Roda a cada iteração do motor pra rede ficar dinâmica.
// ============================================================
function tickGravidade(){
  const N = STATE.nodes.length;
  if(N === 0) return;

  // Centro = origem (Self-Core fica fixo lá)
  for(let i = 0; i < N; i++){
    const a = STATE.nodes[i];
    if(a.type === 'identity_self'){
      a.pos = [0, 0, 0];                                // Self fica fixo no centro
      continue;
    }

    // Vetor de força acumulado
    let fx = 0, fy = 0, fz = 0;

    // 1. Atração pelas conexões (mola)
    for(const e of STATE.edges){
      if(e.a !== a.id && e.b !== a.id) continue;
      const otherId = e.a === a.id ? e.b : e.a;
      const b = STATE.nodes.find(n => n.id === otherId);
      if(!b || !b.pos) continue;

      const dx = b.pos[0] - a.pos[0];
      const dy = b.pos[1] - a.pos[1];
      const dz = b.pos[2] - a.pos[2];
      const d = Math.sqrt(dx*dx + dy*dy + dz*dz) || 0.001;

      const ideal = 50 + (1 - e.w) * 30;
      const f = (d - ideal) * 0.005 * e.w;
      fx += dx/d * f;
      fy += dy/d * f;
      fz += dz/d * f;
    }

    // 2. Repulsão por layer (mantém núcleos da mesma camada na sua órbita)
    const r_target = PHYSICS.LAYER_RADIUS[a.layer] || PHYSICS.LAYER_RADIUS.surface;
    const r_atual = Math.sqrt(a.pos[0]*a.pos[0] + a.pos[1]*a.pos[1] + a.pos[2]*a.pos[2]) || 0.001;
    const f_radial = (r_target - r_atual) * 0.002;
    fx += a.pos[0]/r_atual * f_radial;
    fy += a.pos[1]/r_atual * f_radial;
    fz += a.pos[2]/r_atual * f_radial;

    // Aplica
    a.pos[0] += fx;
    a.pos[1] += fy;
    a.pos[2] += fz;
  }
}

// ============================================================
// LIMPA ENERGIA EXCESSIVA (decay rápido por turno)
// Energia decai 3% por tick pra evitar saturação
// ============================================================
function decayEnergiaTick(){
  for(const n of STATE.nodes){
    if(n.energy > 0.5) n.energy *= 0.97;
    else if(n.energy > 0) n.energy = 0;
  }
}

// ============================================================
// EXPOR
// ============================================================
window.propagatePulse        = propagatePulse;
window.getLitNodes           = getLitNodes;
window.checkAndPromoteIdeas  = checkAndPromoteIdeas;
window.inibirArestas         = inibirArestas;
window.reforcarArestas       = reforcarArestas;
window.aplicarPenalidade     = aplicarPenalidade;
window.aplicarDecayTemporal  = aplicarDecayTemporal;
window.tickGravidade         = tickGravidade;
window.decayEnergiaTick      = decayEnergiaTick;

console.log('[core_physics v7] carregado — fórmula oficial Suma §5.1');
console.log('  α=', PHYSICS.ALPHA, '  β=', PHYSICS.BETA,
            '  MAX_HOPS=', PHYSICS.MAX_HOPS,
            '  PULSO=', PHYSICS.PULSO_INICIAL);
