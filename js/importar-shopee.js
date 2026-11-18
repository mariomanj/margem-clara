// Lê o relatório de pedidos exportado da Shopee (Meus pedidos → Exportar)
// e transforma cada linha no mesmo formato de venda usado para o Mercado Livre.
// Usa normalizarTexto() de importar-ml.js. Não lemos dados do comprador.

// ATENÇÃO: este relatório não traz o valor que a Shopee repassa de fato.
// O repasse aqui é ESTIMADO: produtos - comissão - taxa de serviço - taxa de transação
// - cupom do vendedor - frete de devolução. Os ajustes de "ação comercial" e de PIX
// ficam de fora até conferirmos com o relatório "Minha Renda".

const COLUNAS_SHOPEE = {
  numero: 'id do pedido',
  status: 'status do pedido',
  motivoCancelamento: 'cancelar motivo',
  statusDevolucao: 'status da devolucao / reembolso',
  data: 'data de criacao do pedido',
  sku: 'numero de referencia sku',
  skuPrincipal: 'nº de referencia do sku principal',
  titulo: 'nome do produto',
  variacao: 'nome da variacao',
  unidades: 'quantidade',
  devolvidas: 'returned quantity',
  subtotal: 'subtotal do produto',
  cupomVendedor: 'cupom do vendedor',
  freteDevolucao: 'taxa de envio reversa',
  taxaTransacao: 'taxa de transacao',
  comissao: 'taxa de comissao liquida',
  servico: 'taxa de servico liquida',
};
const COLUNAS_OBRIGATORIAS_SHOPEE = ['numero', 'status', 'data', 'unidades', 'subtotal', 'comissao', 'servico'];

// Diz se as linhas parecem o relatório de pedidos da Shopee.
function ehRelatorioShopee(linhas) {
  return linhas.slice(0, 5).some((linha) => {
    const cabecalho = linha.map(normalizarTexto);
    return cabecalho.includes(COLUNAS_SHOPEE.numero) && cabecalho.includes(COLUNAS_SHOPEE.comissao);
  });
}

function lerRelatorioShopee(linhas) {
  const inicio = linhas.findIndex((linha) => linha.map(normalizarTexto).includes(COLUNAS_SHOPEE.numero));
  if (inicio === -1) throw new Error('Este arquivo não parece o relatório de pedidos da Shopee.');

  const cabecalho = linhas[inicio].map(normalizarTexto);
  const posicao = {};
  for (const [nome, titulo] of Object.entries(COLUNAS_SHOPEE)) posicao[nome] = cabecalho.indexOf(titulo);
  const faltando = COLUNAS_OBRIGATORIAS_SHOPEE.filter((nome) => posicao[nome] === -1);
  if (faltando.length) throw new Error('Faltam colunas no relatório da Shopee: ' + faltando.join(', '));

  const vendas = [];
  for (const linha of linhas.slice(inicio + 1)) {
    const valor = (nome) => (posicao[nome] === -1 ? '' : linha[posicao[nome]]);
    const texto = (nome) => String(valor(nome) ?? '').trim();
    const numero = (nome) => paraNumero(valor(nome));

    const numeroPedido = texto('numero');
    if (!numeroPedido) continue;

    const receita = numero('subtotal');
    const unidades = numero('unidades');
    const cancelada = normalizarTexto(texto('status')).includes('cancelad') || texto('motivoCancelamento') !== '';
    const devolvidas = Math.min(numero('devolvidas'), unidades);

    // Pedido cancelado: o dinheiro nunca entrou e a Shopee não cobra taxa.
    // Devolução: volta ao comprador a parte proporcional das unidades devolvidas.
    const reembolsos = cancelada ? receita : unidades > 0 ? receita * devolvidas / unidades : 0;
    const tarifa = cancelada ? 0 : numero('comissao') + numero('servico') + numero('taxaTransacao');
    // Na Shopee o frete de ida já está dentro da taxa de serviço; o vendedor paga só o de devolução.
    const frete = numero('freteDevolucao');
    const descontos = -numero('cupomVendedor');
    const total = receita - tarifa - frete + descontos - reembolsos;
    const sku = texto('sku') || texto('skuPrincipal');
    const variacao = texto('variacao');

    vendas.push({
      marketplace: 'shopee',
      estimado: true,
      numero: numeroPedido,
      // "2026-10-22 08:28" → "2026-10-22T08:28"
      data: /^\d{4}-\d{2}-\d{2}/.test(texto('data')) ? texto('data').slice(0, 16).replace(' ', 'T') : null,
      status: texto('motivoCancelamento') || texto('statusDevolucao') || texto('status'),
      tipo: cancelada ? 'cancelada' : devolvidas >= unidades && devolvidas > 0 ? 'devolucao' : 'normal',
      unidades,
      receita,
      tarifa,
      frete,
      descontos,
      reembolsos,
      total,
      publicidade: false, // o relatório da Shopee não diz se a venda veio de anúncio
      sku,
      anuncio: '',
      titulo: texto('titulo'),
      variacao,
      tipoAnuncio: '',
      // Mesmo SKU do Mercado Livre = mesmo produto = mesmo custo.
      chave: sku ? 'sku:' + sku : 'shopee:' + texto('titulo') + (variacao ? ' | ' + variacao : ''),
    });
  }

  if (vendas.length === 0) throw new Error('O relatório da Shopee não tem nenhum pedido.');
  return vendas;
}
