// Regras de cálculo do lucro.
// Este arquivo não mexe na tela: só recebe números e devolve números.
// Assim, a mesma conta serve para a calculadora e, depois, para o
// relatório de vendas importado do Excel.

// Calcula o lucro de UMA venda.
// Percentuais chegam como número "humano": 14 significa 14%.
function calcularLucro(venda) {
  const preco = venda.preco || 0;

  const custos = {
    produto: venda.custoProduto || 0,
    comissao: preco * (venda.comissaoPct || 0) / 100,
    tarifaFixa: venda.tarifaFixa || 0,
    frete: venda.frete || 0,
    imposto: preco * (venda.impostoPct || 0) / 100,
    embalagem: venda.embalagem || 0,
    anuncios: venda.anuncios || 0,
    outros: venda.outros || 0,
  };

  const totalCustos = Object.values(custos).reduce((soma, valor) => soma + valor, 0);
  const lucro = preco - totalCustos;
  const margemPct = preco > 0 ? (lucro / preco) * 100 : 0;

  return { preco, custos, totalCustos, lucro, margemPct };
}

// Descobre o preço de venda que entrega a margem desejada.
// Conta: preço = custos em R$ / (1 - comissão% - imposto% - margem%)
// Devolve null quando não existe preço possível (os percentuais somam 100% ou mais).
function calcularPrecoIdeal(venda, margemDesejadaPct) {
  const custosEmReais =
    (venda.custoProduto || 0) +
    (venda.tarifaFixa || 0) +
    (venda.frete || 0) +
    (venda.embalagem || 0) +
    (venda.anuncios || 0) +
    (venda.outros || 0);

  const sobra = 1 - ((venda.comissaoPct || 0) + (venda.impostoPct || 0) + margemDesejadaPct) / 100;
  if (sobra <= 0) return null;

  return custosEmReais / sobra;
}

// ---------- Vendas importadas do relatório do marketplace ----------

const CAMPOS_VENDA = ['unidades', 'receita', 'tarifa', 'frete', 'descontos', 'reembolsos', 'total'];
const CAMPOS_CUSTO = ['produto', 'imposto', 'embalagem', 'anuncios'];

// Calcula o lucro de cada venda importada e soma por produto, por marketplace e no total.
// Cada venda já vem com o que o marketplace descontou (tarifa, frete, reembolso)
// e com o "total", que é o dinheiro repassado. Daqui tiramos o que só o
// vendedor sabe: custo do produto, imposto, embalagem e Ads.
//   custos: { chaveDoProduto: custo unitário em R$ }
//   config: { impostoPct, embalagem (R$ por venda), gastoAds e fixos (R$ no período) }
//   marketplace: 'mercadolivre' | 'shopee' para mostrar só um; vazio = todos
function calcularRelatorio(vendas, custos, config, marketplace = '') {
  const validas = vendas.filter((v) => v.tipo !== 'cancelada');

  // O gasto com Ads do período é dividido entre as vendas que vieram de anúncio,
  // proporcional ao valor de cada uma. Se o relatório não marcar nenhuma, divide entre todas.
  let comAds = validas.filter((v) => v.publicidade);
  if (comAds.length === 0) comAds = validas;
  const baseAds = comAds.reduce((soma, v) => soma + v.receita, 0);
  const adsPorReal = baseAds > 0 ? (config.gastoAds || 0) / baseAds : 0;
  const recebeAds = new Set(comAds);

  const todas = vendas.map((v) => {
    const custoUnitario = custos[v.chave] ?? null;
    // Na devolução o produto volta para o estoque e a nota é cancelada:
    // não entra custo do produto nem imposto, só o prejuízo que o marketplace já descontou.
    const conta = v.tipo === 'normal';
    const c = {
      produto: conta ? (custoUnitario || 0) * v.unidades : 0,
      imposto: conta ? v.receita * (config.impostoPct || 0) / 100 : 0,
      embalagem: v.tipo === 'cancelada' ? 0 : (config.embalagem || 0),
      anuncios: recebeAds.has(v) ? v.receita * adsPorReal : 0,
    };
    const lucro = v.total - CAMPOS_CUSTO.reduce((soma, campo) => soma + c[campo], 0);
    const liquido = v.receita - v.reembolsos;
    return { ...v, custoUnitario, semCusto: conta && custoUnitario === null, custos: c, lucro,
      margemPct: liquido > 0 ? (lucro / liquido) * 100 : null };
  });
  // O rateio acima usa todas as vendas; o filtro só muda o que é somado e mostrado.
  const resultado = marketplace ? todas.filter((v) => v.marketplace === marketplace) : todas;

  // Soma vendas em um "grupo" (um produto, um marketplace ou o total geral).
  const novoGrupo = (extra) => ({ ...extra, vendas: 0, lucro: 0, semCusto: false, estimado: false,
    ...Object.fromEntries([...CAMPOS_VENDA, ...CAMPOS_CUSTO].map((campo) => [campo, 0])) });
  const somar = (grupo, v) => {
    if (v.tipo !== 'cancelada') grupo.vendas += 1;
    for (const campo of CAMPOS_VENDA) grupo[campo] += v[campo];
    for (const campo of CAMPOS_CUSTO) grupo[campo] += v.custos[campo];
    grupo.lucro += v.lucro;
    grupo.semCusto = grupo.semCusto || v.semCusto;
    grupo.estimado = grupo.estimado || Boolean(v.estimado);
  };
  // Margem sobre o que foi vendido de fato (sem o que voltou em reembolso).
  const fecharMargem = (grupo) => {
    const liquido = grupo.receita - grupo.reembolsos;
    grupo.margemPct = liquido > 0 ? (grupo.lucro / liquido) * 100 : null;
  };

  const porProduto = new Map();
  const total = novoGrupo({});
  for (const v of resultado) {
    if (!porProduto.has(v.chave)) {
      porProduto.set(v.chave, novoGrupo({ chave: v.chave, titulo: v.titulo, sku: v.sku,
        anuncio: v.anuncio, variacao: v.variacao, custoUnitario: v.custoUnitario, marketplaces: [] }));
    }
    const produto = porProduto.get(v.chave);
    somar(produto, v);
    if (!produto.marketplaces.includes(v.marketplace)) produto.marketplaces.push(v.marketplace);
    somar(total, v);
  }
  const produtos = [...porProduto.values()];
  produtos.forEach(fecharMargem);
  fecharMargem(total);

  // Comparação entre marketplaces: sempre com todas as vendas, independente do filtro.
  const porMarketplace = {};
  for (const v of todas) {
    porMarketplace[v.marketplace] = porMarketplace[v.marketplace] || novoGrupo({ marketplace: v.marketplace });
    somar(porMarketplace[v.marketplace], v);
  }
  Object.values(porMarketplace).forEach(fecharMargem);

  // Custos fixos são da empresa inteira: só entram na visão com todos os marketplaces.
  const fixos = marketplace ? 0 : (config.fixos || 0);
  const datas = resultado.map((v) => v.data).filter(Boolean).sort();
  const resumo = {
    ...total,
    canceladas: resultado.filter((v) => v.tipo === 'cancelada').length,
    devolucoes: resultado.filter((v) => v.tipo === 'devolucao').length,
    vendasComAds: resultado.filter((v) => v.publicidade && v.tipo !== 'cancelada').length,
    produtosSemCusto: produtos.filter((p) => p.semCusto).length,
    vendasSemCusto: resultado.filter((v) => v.semCusto).length,
    inicio: datas[0] || null,
    fim: datas[datas.length - 1] || null,
    fixos,
    lucroAposFixos: total.lucro - fixos,
  };

  return { vendas: resultado, produtos, porMarketplace, resumo };
}
