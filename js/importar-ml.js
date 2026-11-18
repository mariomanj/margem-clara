// Lê o relatório "Vendas" exportado do Mercado Livre (Excel) e transforma
// cada linha em uma venda com os números que importam para o lucro.
// Não lemos dados do comprador (nome, CPF, endereço): não precisamos deles.

// Nome da coluna no relatório (sem acento, minúsculo) → nome que usamos no código.
// Procuramos pelo nome e não pela posição, porque o ML pode mudar a ordem.
// Quando o nome se repete (ex.: "Estado"), vale a primeira coluna.
const COLUNAS_ML = {
  numero: 'n.', // "N.º de venda"
  data: 'data de venda',
  status: 'estado',
  unidades: 'unidades',
  receita: 'receita por produtos (brl)',
  acrescimo: 'receita por acrescimo no preco',
  taxaParcelamento: 'taxa de parcelamento',
  tarifa: 'tarifa de venda e impostos',
  receitaEnvio: 'receita por envio',
  tarifaEnvio: 'tarifas de envio',
  custoEnvioMedidas: 'custo de envio com base nas medidas',
  custoDiferenca: 'custo por diferencas nas medidas',
  descontos: 'descontos e bonus',
  cancelamentos: 'cancelamentos e reembolsos',
  total: 'total (brl)',
  publicidade: 'venda por publicidade',
  sku: 'sku',
  anuncio: '# de anuncio',
  titulo: 'titulo do anuncio',
  variacao: 'variacao',
  tipoAnuncio: 'tipo de anuncio',
};
const COLUNAS_OBRIGATORIAS = ['numero', 'data', 'status', 'unidades', 'receita', 'tarifa', 'total'];

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function normalizarTexto(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// "17 de novembro de 2026 22:27 hs." → "2026-11-17T22:27"
function lerData(texto) {
  const m = normalizarTexto(texto).match(/(\d{1,2}) de ([a-z]+) de (\d{4})(?: (\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const mes = MESES.indexOf(m[2]) + 1;
  if (!mes) return null;
  const dois = (n) => String(n).padStart(2, '0');
  return `${m[3]}-${dois(mes)}-${dois(m[1])}T${dois(m[4] || 0)}:${m[5] || '00'}`;
}

// Reembolso que zera ou deixa negativo o repasse = venda desfeita.
// Se ainda sobrou dinheiro, foi reembolso parcial e o produto ficou com o comprador.
function classificarVenda(status, reembolsos, total) {
  if (reembolsos <= 0 || total > 0) return 'normal';
  return normalizarTexto(status).includes('cancelad') ? 'cancelada' : 'devolucao';
}

// Recebe as linhas da planilha (lista de listas) e devolve a lista de vendas.
// Se o arquivo não for o relatório certo, lança um erro com mensagem para o usuário.
function lerRelatorioMercadoLivre(linhas) {
  const inicio = linhas.findIndex((linha) =>
    linha.some((celula) => normalizarTexto(celula) === COLUNAS_ML.receita));
  if (inicio === -1) {
    throw new Error('Este arquivo não parece o relatório de vendas do Mercado Livre. ' +
      'No ML, vá em Vendas e use o botão de baixar (Excel).');
  }

  const cabecalho = linhas[inicio].map(normalizarTexto);
  const posicao = {};
  for (const [nome, titulo] of Object.entries(COLUNAS_ML)) {
    let i = cabecalho.indexOf(titulo);
    if (i === -1) i = cabecalho.findIndex((coluna) => coluna.startsWith(titulo));
    posicao[nome] = i;
  }
  const faltando = COLUNAS_OBRIGATORIAS.filter((nome) => posicao[nome] === -1);
  if (faltando.length) throw new Error('Faltam colunas no relatório: ' + faltando.join(', '));

  const vendas = [];
  for (const linha of linhas.slice(inicio + 1)) {
    const valor = (nome) => (posicao[nome] === -1 ? '' : linha[posicao[nome]]);
    const texto = (nome) => String(valor(nome) ?? '').trim();
    const numero = (nome) => paraNumero(valor(nome));

    const numeroVenda = texto('numero');
    if (!/^\d+$/.test(numeroVenda)) continue; // linha vazia ou de rodapé

    const reembolsos = -numero('cancelamentos');
    const total = numero('total');
    const sku = texto('sku');
    const anuncio = texto('anuncio');
    const variacao = texto('variacao');

    vendas.push({
      numero: numeroVenda,
      data: lerData(texto('data')),
      status: texto('status'),
      tipo: classificarVenda(texto('status'), reembolsos, total),
      unidades: numero('unidades'),
      receita: numero('receita'),
      // Custos aparecem negativos no relatório; aqui guardamos positivos.
      // O acréscimo do parcelamento entra e sai igual, então vai junto da tarifa.
      tarifa: -(numero('tarifa') + numero('acrescimo') + numero('taxaParcelamento')),
      // Frete líquido: o que o ML cobrou menos o que o comprador pagou de envio.
      frete: -(numero('receitaEnvio') + numero('tarifaEnvio') +
        numero('custoEnvioMedidas') + numero('custoDiferenca')),
      descontos: numero('descontos'),
      reembolsos,
      total, // dinheiro que o ML repassa = receita - tarifa - frete + descontos - reembolsos
      publicidade: normalizarTexto(valor('publicidade')) === 'sim',
      sku,
      anuncio,
      titulo: texto('titulo'),
      variacao,
      tipoAnuncio: texto('tipoAnuncio'),
      // Identifica o produto para guardar o custo. Sem SKU, usa anúncio + variação.
      chave: sku ? 'sku:' + sku : 'anuncio:' + anuncio + (variacao ? ' | ' + variacao : ''),
    });
  }

  if (vendas.length === 0) throw new Error('O relatório não tem nenhuma venda.');
  return vendas;
}
