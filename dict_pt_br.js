// =============================================================================
// DICT_PT_BR.JS — Lab v7.1 - Raciocínio
//
// DICIONÁRIO BASE DE PORTUGUÊS.
//
// FILOSOFIA:
//   Antes do v7.1, palavras comuns como "tudo", "claro", "ok", "nada", "que",
//   "como", "vai", "está" — viravam provisional toda hora porque não estavam
//   na seed mínima. O sistema perguntava "o que é tudo?" — burro.
//
//   Com este dicionário, ~600 palavras comuns do português brasileiro
//   já viram word-nodes do tipo 'word' com _eh_dicionario=true, classe
//   gramatical anotada, e ligações leves a meta-conceitos (verbo, subst, etc).
//
//   action_doubt e action_router vão consultar este dicionário ANTES de criar
//   provisional ou disparar ask.
//
// IMPORTANTE:
//   - Dicionário NÃO ensina semântica completa (não diz "verde é uma cor")
//   - Só registra EXISTÊNCIA + classe + ligações estruturais
//   - Semântica vem por conversa (ainda usa learn_etiqueta_provisoria)
// =============================================================================

'use strict';

// ============================================================
// CONCEITOS-CLASSE GRAMATICAL (seed extra)
// ============================================================
const _DICT_CONCEITOS = [
  {id:'conc_substantivo', text:'SUBSTANTIVO (classe)',     tipo:'gramatical'},
  {id:'conc_verbo',       text:'VERBO (classe)',           tipo:'gramatical'},
  {id:'conc_adjetivo',    text:'ADJETIVO (classe)',        tipo:'gramatical'},
  {id:'conc_adverbio',    text:'ADVÉRBIO (classe)',        tipo:'gramatical'},
  {id:'conc_conectivo',   text:'CONECTIVO (classe)',       tipo:'gramatical'},
  {id:'conc_preposicao',  text:'PREPOSIÇÃO (classe)',      tipo:'gramatical'},
  {id:'conc_interjeicao', text:'INTERJEIÇÃO (classe)',     tipo:'gramatical'},
];

// ============================================================
// DICIONÁRIO PRINCIPAL — ~600 palavras
// formato compacto: classe → [palavras...]
// ============================================================
const _DICT = {

  // ============================================================
  // VERBOS (ser/estar/ter já vão pelo seed_network — aqui só os comuns)
  // ============================================================
  verbo: [
    // ser/estar/ter — flexões
    'sou','é','somos','sao','são','era','éramos','eram','foi','fomos','foram','sera','será','serao','serão',
    'estou','está','estamos','estao','estão','estava','estavamos','estavam','esteve','estiveram',
    'tenho','tem','temos','tens','tinha','tinham','teve','tiveram','terei','terá','teremos','terao','terão',
    // verbos comuns
    'fazer','faz','faço','fiz','fez','fizeram','farei','fará','fizesse','feito','fazendo',
    'ir','vai','vou','vamos','iam','foi','foram','irei','irá','iremos','indo',
    'vir','vem','venho','vinha','veio','vieram','virei','virá','viremos','vindo',
    'dizer','digo','diz','disse','dissemos','disseram','direi','dirá','dito','dizendo',
    'querer','quero','quer','queremos','queriam','quis','quisemos','queria','quererei','querendo',
    'poder','posso','pode','podemos','podem','podia','podiamos','pude','pôde','puderam','poderei','poderá',
    'saber','sei','sabe','sabemos','sabem','sabia','soube','sabido','sabendo',
    'ver','vejo','vê','vemos','veem','via','viam','vi','viu','viram','verei','visto','vendo',
    'falar','falo','fala','falamos','falam','falei','falou','falaram','falarei','falando',
    'pensar','penso','pensa','pensamos','pensam','pensei','pensou','pensaram','pensando',
    'achar','acho','acha','achamos','acham','achei','achou','acharam','achando',
    'dar','dou','dá','damos','dão','dei','deu','dão','deram','darei','dando',
    'pegar','pego','pega','pegamos','pegam','peguei','pegou','pegaram','pegando',
    'colocar','coloco','coloca','colocamos','colocam','coloquei','colocou','colocaram',
    'tirar','tiro','tira','tiramos','tiram','tirei','tirou','tiraram',
    'gostar','gosto','gosta','gostamos','gostam','gostei','gostou','gostaram','gostando',
    'amar','amo','ama','amamos','amam','amei','amou','amaram','amado','amando',
    'odiar','odeio','odeia','odiamos','odeiam','odiei','odiou','odiaram',
    'comer','como','come','comemos','comem','comi','comeu','comeram','comendo','comido',
    'beber','bebo','bebe','bebemos','bebem','bebi','bebeu','beberam','bebendo',
    'dormir','durmo','dorme','dormimos','dormem','dormi','dormiu','dormiram','dormindo',
    'acordar','acordo','acorda','acordamos','acordam','acordei','acordou','acordaram',
    'estudar','estudo','estuda','estudamos','estudam','estudei','estudou','estudaram','estudando',
    'trabalhar','trabalho','trabalha','trabalhamos','trabalham','trabalhei','trabalhou',
    'morar','moro','mora','moramos','moram','morei','morou','moraram','morando',
    'viver','vivo','vive','vivemos','vivem','vivi','viveu','viveram','vivendo','vivido',
    'morrer','morro','morre','morremos','morrem','morri','morreu','morreram','morrendo','morto',
    'nascer','nasço','nasce','nascemos','nascem','nasci','nasceu','nasceram','nascido',
    'andar','ando','anda','andamos','andam','andei','andou','andaram','andando',
    'correr','corro','corre','corremos','correm','corri','correu','correram','correndo',
    'aprender','aprendo','aprende','aprendemos','aprendem','aprendi','aprendeu','aprenderam',
    'ensinar','ensino','ensina','ensinamos','ensinam','ensinei','ensinou','ensinaram','ensinando',
    'mostrar','mostro','mostra','mostramos','mostram','mostrei','mostrou','mostraram',
    'explicar','explico','explica','explicamos','explicam','expliquei','explicou','explicaram','explicando',
    'entender','entendo','entende','entendemos','entendem','entendi','entendeu','entenderam','entendido',
    'lembrar','lembro','lembra','lembramos','lembram','lembrei','lembrou','lembraram','lembrando',
    'esquecer','esqueço','esquece','esquecemos','esquecem','esqueci','esqueceu','esqueceram',
    'precisar','preciso','precisa','precisamos','precisam','precisei','precisou','precisaram','precisando',
    'tentar','tento','tenta','tentamos','tentam','tentei','tentou','tentaram','tentando',
    'conseguir','consigo','consegue','conseguimos','conseguem','consegui','conseguiu','conseguiram',
    'continuar','continuo','continua','continuamos','continuam','continuei','continuou','continuaram',
    'começar','começo','começa','começamos','começam','comecei','começou','começaram','começando',
    'terminar','termino','termina','terminamos','terminam','terminei','terminou','terminaram',
    'acabar','acabo','acaba','acabamos','acabam','acabei','acabou','acabaram','acabando','acabado',
    'parar','paro','para','paramos','param','parei','parou','pararam','parando','parado',
    'chamar','chamo','chama','chamamos','chamam','chamei','chamou','chamaram','chamado','chamando',
    'perguntar','pergunto','pergunta','perguntamos','perguntam','perguntei','perguntou','perguntaram','perguntando','perguntado',
    'responder','respondo','responde','respondemos','respondem','respondi','respondeu','responderam','respondendo','respondido',
    'confirmar','confirmo','confirma','confirmamos','confirmam','confirmei','confirmou','confirmaram','confirmando','confirmado',
    'corrigir','corrijo','corrige','corrigimos','corrigem','corrigi','corrigiu','corrigiram','corrigindo','corrigido',
    'escrever','escrevo','escreve','escrevemos','escrevem','escrevi','escreveu','escreveram','escrevendo','escrito',
    'ler','leio','lê','lemos','leem','li','leu','leram','lendo','lido',
    'ouvir','ouço','ouve','ouvimos','ouvem','ouvi','ouviu','ouviram','ouvindo','ouvido',
    'sentir','sinto','sente','sentimos','sentem','senti','sentiu','sentiram','sentindo','sentido',
    'mudar','mudo','muda','mudamos','mudam','mudei','mudou','mudaram','mudando','mudado',
    'ficar','fico','fica','ficamos','ficam','fiquei','ficou','ficaram','ficando','ficado',
    'usar','uso','usa','usamos','usam','usei','usou','usaram','usando','usado',
    'servir','sirvo','serve','servimos','servem','servi','serviu','serviram','servindo','servido',
    'valer','valho','vale','valemos','valem','vali','valeu','valeram','valendo','valido',
    'parecer','pareço','parece','parecemos','parecem','pareci','pareceu','pareceram','parecendo','parecido',
    'haver','há','havia','houve','houveram','haverá','havido','havendo',
    'ficar','fico','fica','ficamos','ficam','fiquei','ficou','ficaram','ficando','ficado',
  ],

  // ============================================================
  // SUBSTANTIVOS
  // ============================================================
  substantivo: [
    // pessoa
    'pessoa','pessoas','gente','homem','homens','mulher','mulheres','menino','meninos','menina','meninas',
    'criança','crianças','adulto','adultos','idoso','idosos','bebê','bebês',
    'amigo','amigos','amiga','amigas','colega','colegas','irmão','irmãos','irmã','irmãs',
    'pai','pais','mãe','mães','filho','filhos','filha','filhas','avô','avó','tio','tia','primo','prima',
    'marido','esposa','namorado','namorada','noivo','noiva','familia','família',
    // partes do corpo
    'corpo','cabeça','cabelo','cabelos','rosto','face','olho','olhos','nariz','boca','lábio','lábios',
    'orelha','orelhas','dente','dentes','língua','queixo','pescoço','peito','costas','barriga',
    'braço','braços','perna','pernas','pé','pés','mão','mãos','dedo','dedos','unha','unhas',
    'coração','sangue','osso','pele','músculo','cérebro','estômago','pulmão','fígado','rim',
    // lugar
    'lugar','lugares','casa','casas','apartamento','prédio','rua','ruas','cidade','cidades','bairro',
    'estado','país','mundo','terra','escola','colégio','faculdade','universidade','trabalho','escritório',
    'loja','mercado','supermercado','padaria','farmácia','hospital','médico','banco','restaurante',
    'cinema','teatro','parque','praça','praia','rio','mar','floresta','montanha','vale','campo',
    'quarto','sala','cozinha','banheiro','garagem','jardim','varanda','porta','janela','parede','teto','chão',
    // tempo
    'tempo','momento','momentos','hora','horas','minuto','minutos','segundo','segundos','dia','dias',
    'semana','semanas','mês','meses','ano','anos','década','século','manhã','tarde','noite','madrugada',
    'hoje','ontem','amanhã','agora','depois','antes','sempre','nunca','jamais',
    // objeto
    'coisa','coisas','objeto','objetos','mesa','cadeira','cama','sofá','televisão','tv','rádio','telefone',
    'celular','computador','notebook','tablet','livro','livros','revista','jornal','carta','papel','caneta',
    'lápis','borracha','tesoura','régua','mochila','bolsa','carteira','dinheiro','cartão','chave',
    'carro','moto','bicicleta','ônibus','trem','avião','navio','barco',
    // comida
    'comida','água','suco','café','leite','chá','refrigerante','cerveja','vinho',
    'pão','queijo','manteiga','arroz','feijão','carne','frango','peixe','ovo','salada',
    'fruta','frutas','maçã','banana','laranja','uva','melancia','abacaxi','morango',
    'doce','bolo','torta','chocolate','sorvete','biscoito','bala',
    // abstrato
    'amor','ódio','medo','alegria','tristeza','raiva','saudade','felicidade','paz','guerra',
    'verdade','mentira','razão','motivo','sentido','significado','definição','conceito','ideia','pensamento',
    'palavra','palavras','frase','frases','texto','número','quantidade','tamanho','cor','cores','forma',
    'pergunta','perguntas','resposta','respostas','dúvida','dúvidas','problema','problemas','solução',
    'jeito','modo','maneira','forma','tipo','tipos','exemplo','exemplos','caso','vez','vezes',
    'erro','erros','acerto','acertos','sucesso','fracasso','tentativa','chance','oportunidade',
    'nome','nomes','apelido','apelidos','sobrenome','assinatura','identidade','origem','idade',
    'opinião','opiniões','crítica','elogio','sugestão','conselho','ordem','pedido','regra','regras','lei','leis',
  ],

  // ============================================================
  // ADJETIVOS
  // ============================================================
  adjetivo: [
    // tamanho
    'grande','grandes','pequeno','pequena','pequenos','pequenas','médio','média','enorme','gigante',
    'minúsculo','alto','alta','altos','altas','baixo','baixa','baixos','baixas','curto','curta','longo','longa',
    'largo','larga','estreito','estreita','grosso','grossa','fino','fina','gordo','gorda','magro','magra',
    // cor (só categoria — instâncias vão por conversa)
    'colorido','colorida','claro','clara','claros','claras','escuro','escura','escuros','escuras',
    'vermelho','vermelha','azul','azuis','verde','verdes','amarelo','amarela','preto','preta','branco','branca',
    'cinza','rosa','roxo','roxa','marrom','laranja','dourado','prateado',
    // qualidade
    'bom','boa','bons','boas','melhor','melhores','ótimo','ótima','ótimos','ótimas','excelente','perfeito','perfeita',
    'ruim','ruins','pior','piores','péssimo','péssima','péssimos','péssimas','horrível','terrível',
    'fácil','fáceis','difícil','difíceis','simples','complicado','complicada','complexo','complexa',
    'certo','certa','certos','certas','correto','correta','corretos','corretas','exato','exata','exatos','exatas',
    'errado','errada','errados','erradas','incorreto','incorreta','equivocado','equivocada',
    'verdadeiro','verdadeira','verdadeiros','verdadeiras','real','reais','falso','falsa','falsos','falsas',
    'novo','nova','novos','novas','velho','velha','velhos','velhas','antigo','antiga','recente','recentes',
    'jovem','jovens','idoso','idosa','idosos','idosas',
    'limpo','limpa','limpos','limpas','sujo','suja','sujos','sujas',
    'cheio','cheia','cheios','cheias','vazio','vazia','vazios','vazias',
    'aberto','aberta','abertos','abertas','fechado','fechada','fechados','fechadas',
    'quente','quentes','frio','fria','frios','frias','morno','morna','gelado','gelada',
    'rápido','rápida','rápidos','rápidas','lento','lenta','lentos','lentas','devagar',
    'forte','fortes','fraco','fraca','fracos','fracas','duro','dura','duros','duras','mole','moles',
    'bonito','bonita','bonitos','bonitas','feio','feia','feios','feias','lindo','linda','lindos','lindas',
    'feliz','felizes','triste','tristes','alegre','alegres','bravo','brava','bravos','bravas','calmo','calma',
    'inteligente','inteligentes','burro','burra','burros','burras','esperto','esperta','espertos','espertas',
    // afeto
    'querido','querida','queridos','queridas','amado','amada','amados','amadas','carinhoso','carinhosa',
    // outros
    'mesmo','mesma','mesmos','mesmas','diferente','diferentes','igual','iguais','parecido','parecida',
    'único','única','únicos','únicas','vários','várias','muito','muita','muitos','muitas',
    'pouco','pouca','poucos','poucas','tanto','tanta','tantos','tantas','todo','toda','todos','todas',
    'nenhum','nenhuma','nenhuns','nenhumas','algum','alguma','alguns','algumas','outro','outra','outros','outras',
    'cada','qualquer','quaisquer','próprio','própria','próprios','próprias','inteiro','inteira','inteiros','inteiras',
    'meio','meia','meios','meias','metade','dobro','triplo',
  ],

  // ============================================================
  // ADVÉRBIOS
  // ============================================================
  adverbio: [
    'sim','não','nao','talvez','provavelmente','certamente','realmente','verdadeiramente','obviamente',
    'claro','claramente','exatamente','precisamente','totalmente','completamente','perfeitamente',
    'muito','pouco','bastante','demais','quase','aproximadamente','cerca','perto','longe',
    'rapidamente','lentamente','devagar','calmamente','tranquilamente','urgentemente',
    'bem','mal','melhor','pior','assim','desse','dessa','desses','dessas','disso','desta','deste','destas','destes',
    'aqui','ali','lá','la','aí','ai','cá','ca','perto','longe','dentro','fora','em','sobre','sob','entre',
    'hoje','ontem','amanhã','agora','antes','depois','enquanto','sempre','nunca','jamais','já','ja','ainda',
    'cedo','tarde','imediatamente','rapidamente',
    'também','tambem','tampouco','nem','sequer','apenas','somente','só','so','exceto','salvo','menos',
    'apesar','contudo','entretanto','porém','porem','todavia','contudo','embora','mesmo','assim',
    'porque','porquê','porquê','pois','logo','portanto','consequentemente','daí','dai',
  ],

  // ============================================================
  // PREPOSIÇÕES + CONECTIVOS
  // ============================================================
  preposicao: [
    'a','ante','até','ate','após','apos','com','contra','de','desde','em','entre','para','pra','por',
    'perante','sem','sob','sobre','trás','tras','do','da','dos','das','no','na','nos','nas','ao','aos','à','às',
    'pelo','pela','pelos','pelas','num','numa','nuns','numas','dum','duma','duns','dumas',
  ],

  conectivo: [
    'e','ou','mas','porém','porem','contudo','todavia','entretanto','no entanto','porque','pois',
    'que','se','quando','enquanto','como','onde','aonde','donde','conforme','assim que','até que',
    'embora','ainda que','mesmo que','para que','a fim de que','de modo que','tanto que',
    'caso','desde que','contanto que','salvo se','exceto se','a menos que',
  ],

  // ============================================================
  // INTERJEIÇÕES + EXPRESSÕES
  // ============================================================
  interjeicao: [
    'ah','oh','uau','nossa','poxa','caramba','opa','ops','epa','ei','ué','ue','hum','hmm',
    'sim','não','nao','talvez','beleza','tranquilo','show','massa','legal','top','daora','dahora',
    'tudo','nada','algo','alguém','alguem','ninguém','ninguem','algum','tipo','meio',
    'então','entao','aliás','alias','enfim','enfim','afinal','enfim','realmente','sério','serio',
    'né','ne','viu','sabe','olha','vamos','vai','vamos lá','beleza','tá','ta','tá bom','tá certo',
    'valeu','obrigado','obrigada','desculpa','desculpas','perdão','perdao','por favor','prazer',
    'ok','okay','okey','tudo bem','tudo certo','de boa','beleza','firmeza',
  ],

};

// ============================================================
// APLICAR DICIONÁRIO
// Adiciona ~600 word-nodes na seed, ligando à classe gramatical
// ============================================================
function applyDictPtBr(){
  const ids = STATE.seed.nucleosSeed || [];
  let criados = 0;

  // 1. Cria conceitos-classe (se não existem)
  for(const c of _DICT_CONCEITOS){
    if(STATE.nodes.find(n => n.id === c.id)) continue;
    const n = makeNode({
      id:          c.id,
      type:        'concept',
      layer:       'core',
      origin_type: 'BOOT_V7',
      text:        c.text,
      mass:        3.5,
      is_anchor:   1,
      seed:        true,
    });
    n._tipo_meta = c.tipo;
    STATE.nodes.push(n);
    ids.push(c.id);
    criados++;
  }

  // 2. Pra cada classe gramatical, cria word-nodes
  const classToConcept = {
    verbo:       'conc_verbo',
    substantivo: 'conc_substantivo',
    adjetivo:    'conc_adjetivo',
    adverbio:    'conc_adverbio',
    preposicao:  'conc_preposicao',
    conectivo:   'conc_conectivo',
    interjeicao: 'conc_interjeicao',
  };

  for(const classe in _DICT){
    const conceitoClasse = classToConcept[classe];
    if(!conceitoClasse) continue;
    const palavras = _DICT[classe];

    for(const p of palavras){
      const normalizado = norm(p);
      const id = 'dict_' + normalizado.replace(/[^a-z0-9]/g, '_');
      // Pula se já existe (ex: vindo da seed_network)
      if(STATE.nodes.find(n => n.id === id)) continue;
      // Pula se id é vazio
      if(id === 'dict_') continue;

      const wn = makeNode({
        id:          id,
        type:        'word',
        layer:       'core',
        origin_type: 'BOOT_V7',
        text:        p,
        mass:        1.5,
        seed:        true,
      });
      wn._eh_dicionario = true;
      wn._classe        = classe;
      STATE.nodes.push(wn);
      ids.push(id);
      criados++;

      // Aresta leve word → conceito-classe
      STATE.edges.push(makeEdge({
        a: id, b: conceitoClasse, w: 0.65, kind: 'é_tipo_de', seed: true
      }));
    }
  }

  STATE.seed.nucleosSeed = ids;
  console.log(`[dict_pt_br v7] adicionados ${criados} word-nodes do dicionário`);
  return criados;
}

// ============================================================
// HELPER: palavra está no dicionário (qualquer forma)?
// ============================================================
function dictKnows(palavra){
  if(!palavra) return false;
  const p = norm(palavra);
  if(!p) return false;
  // Procura por dict_X
  const id = 'dict_' + p.replace(/[^a-z0-9]/g, '_');
  if(STATE.nodes.find(n => n.id === id)) return true;
  // Procura por word_X (pode estar na seed_network também)
  const id2 = 'word_' + p.replace(/[^a-z0-9]/g, '');
  if(STATE.nodes.find(n => n.id === id2 && (n._seed || n._eh_dicionario))) return true;
  return false;
}

// ============================================================
// HELPER: lista todas as palavras conhecidas (do dict + seed)
// Pra learn_typo usar como base de comparação
// ============================================================
function dictAllKnown(){
  return STATE.nodes
    .filter(n => n.type === 'word' && (n._eh_dicionario || n._seed))
    .map(n => (n.text || '').toLowerCase())
    .filter(t => t.length > 0);
}

// ============================================================
// HELPER: classe gramatical de uma palavra (ou null)
// ============================================================
function dictClasse(palavra){
  if(!palavra) return null;
  const p = norm(palavra);
  const id = 'dict_' + p.replace(/[^a-z0-9]/g, '_');
  const n = STATE.nodes.find(x => x.id === id);
  if(n && n._classe) return n._classe;
  return null;
}

// ============================================================
// STATS
// ============================================================
function dictStats(){
  const dictNodes = STATE.nodes.filter(n => n._eh_dicionario);
  const porClasse = {};
  for(const n of dictNodes){
    const c = n._classe || 'sem_classe';
    porClasse[c] = (porClasse[c] || 0) + 1;
  }
  return {
    total: dictNodes.length,
    por_classe: porClasse,
  };
}

// ============================================================
// EXPOR
// ============================================================
window.applyDictPtBr = applyDictPtBr;
window.dictKnows     = dictKnows;
window.dictAllKnown  = dictAllKnown;
window.dictClasse    = dictClasse;
window.dictStats     = dictStats;

console.log('[dict_pt_br v7.1] carregado');
