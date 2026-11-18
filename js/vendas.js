// Aba "Vendas importadas": lê o Excel do Mercado Livre, guarda os custos
// que o vendedor digita e mostra o lucro real por venda e por produto.

// Tudo fica salvo neste navegador (localStorage). Se o navegador bloquear,
// a tela continua funcionando, só não lembra os dados ao recarregar.
const CHAVE_VENDAS = 'margemclara.vendas';
const CHAVE_CUSTOS = 'margemclara.custos';
const CHAVE_CONFIG = 'margemclara.config';

function carregar(chave, padrao) {
  try {
    const texto = localStorage.getItem(chave);
    return texto ? JSON.parse(texto) : padrao;
  } catch {
    return padrao;
  }
}
function salvar(chave, valor) {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // sem armazenamento: segue só na memória
  }
}

let importacao = carregar(CHAVE_VENDAS, null); // { arquivo, vendas }
const custos = carregar(CHAVE_CUSTOS, {});     // { chaveDoProduto: custo unitário }
const config = { impostoPct: 0, embalagem: 0, gastoAds: 0, fixos: 0, ...carregar(CHAVE_CONFIG, {}) };
let relatorio = null;

// Mesmas cores da calculadora, para o vendedor reconhecer cada custo.
const PARTES = [
  { campo: 'reembolsos', nome: 'Cancelamentos e devoluções', cor: 'var(--c-outros)' },
  { campo: 'tarifa', nome: 'Tarifa do Mercado Livre', cor: 'var(--c-comissao)' },
  { campo: 'frete', nome: 'Frete', cor: 'var(--c-frete)' },
  { campo: 'produto', nome: 'Custo dos produtos', cor: 'var(--c-produto)' },
  { campo: 'imposto', nome: 'Imposto', cor: 'var(--c-imposto)' },
  { campo: 'embalagem', nome: 'Embalagem', cor: 'var(--c-embalagem)' },
  { campo: 'anuncios', nome: 'Anúncios (Ads)', cor: 'var(--c-anuncios)' },
];

const el = (id) => document.getElementById(id);
const dataCurta = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
const dataLonga = (iso) => (iso ? `${dataCurta(iso)}/${iso.slice(0, 4)}` : '—');
const margemTexto = (m) => (m === null ? '—' : pct(m));
const classeLucro = (valor) => (valor < 0 ? 'negativo' : 'positivo');
const ehProblema = (item) => item.lucro < 0 || (item.margemPct !== null && item.margemPct < 10);

function mensagem(texto, erro = false) {
  el('mensagem').textContent = texto;
  el('mensagem').classList.toggle('erro', erro);
}

// ---------- Importar o arquivo ----------

el('arquivo').addEventListener('change', async (evento) => {
  const arquivo = evento.target.files[0];
  if (!arquivo) return;
  if (typeof XLSX === 'undefined') {
    mensagem('Não consegui carregar o leitor de Excel. Verifique a internet e recarregue a página.', true);
    return;
  }
  mensagem('Lendo ' + arquivo.name + '…');
  try {
    const planilha = XLSX.read(await arquivo.arrayBuffer());
    const aba = planilha.Sheets[planilha.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(aba, { header: 1, defval: '' });
    const vendas = lerRelatorioMercadoLivre(linhas);
    importacao = { arquivo: arquivo.name, vendas };
    salvar(CHAVE_VENDAS, importacao);
    mensagem(`${vendas.length} vendas importadas de ${arquivo.name}.`);
    atualizarVendas();
  } catch (erro) {
    mensagem(erro.message, true);
  }
  evento.target.value = '';
});

// ---------- Custos gerais (imposto, embalagem, Ads, fixos) ----------

const formConfig = el('config');
for (const campo of Object.keys(config)) formConfig.elements[campo].value = paraCampo(config[campo]);

formConfig.addEventListener('input', () => {
  for (const campo of Object.keys(config)) config[campo] = paraNumero(formConfig.elements[campo].value);
  salvar(CHAVE_CONFIG, config);
  atualizarVendas();
});

// ---------- Custo de cada produto (digitado na tabela) ----------

el('tabelaProdutos').addEventListener('change', (evento) => {
  const campo = evento.target;
  if (!campo.dataset.chave) return;
  if (campo.value.trim() === '') delete custos[campo.dataset.chave];
  else custos[campo.dataset.chave] = paraNumero(campo.value);
  salvar(CHAVE_CUSTOS, custos);

  // Redesenha depois que o foco já foi para o próximo campo (Tab), e devolve o foco a ele.
  setTimeout(() => {
    const foco = document.activeElement && document.activeElement.dataset.chave;
    atualizarVendas();
    if (foco) document.querySelector(`input[data-chave="${CSS.escape(foco)}"]`)?.focus();
  }, 0);
});
el('tabelaProdutos').addEventListener('keydown', (evento) => {
  if (evento.key === 'Enter' && evento.target.dataset.chave) evento.target.blur();
});

el('soProblemas').addEventListener('change', () => atualizarVendas());
el('ordem').addEventListener('change', () => atualizarVendas());

// ---------- Desenhar a tela ----------

function atualizarVendas() {
  el('dados').hidden = !importacao;
  if (!importacao) return;

  relatorio = calcularRelatorio(importacao.vendas, custos, config);
  desenharResumo(relatorio.resumo);
  desenharProdutos(relatorio.produtos);
  desenharVendas(relatorio.vendas);
}

function desenharResumo(r) {
  el('vResultado').classList.toggle('prejuizo', r.lucro < 0);
  el('vLucro').textContent = reais(r.lucro);
  el('vMargem').textContent = margemTexto(r.margemPct);
  el('qtdVendas').textContent = r.vendas;
  el('periodo').textContent = `${dataLonga(r.inicio)} a ${dataLonga(r.fim)}`;

  const avisos = [];
  if (r.produtosSemCusto) {
    avisos.push(`${r.produtosSemCusto} produtos (${r.vendasSemCusto} vendas) ainda sem custo: ` +
      'o lucro aparece maior do que é. Preencha na tabela "Por produto".');
  }
  if (!config.gastoAds && r.vendasComAds) {
    avisos.push(`${r.vendasComAds} vendas vieram de anúncio pago, mas o gasto com Ads não foi informado.`);
  }
  el('vAviso').textContent = avisos.join(' ');
  el('detalheContagem').textContent =
    `${r.canceladas} canceladas e ${r.devolucoes} devoluções no período (não entram na contagem de vendas).`;

  // Barra: cada custo é um pedaço proporcional ao faturamento.
  const base = Math.max(r.receita + r.descontos, PARTES.reduce((s, p) => s + r[p.campo], 0) + Math.max(r.lucro, 0));
  const pedacos = PARTES.filter((p) => r[p.campo] > 0).map((p) => ({ ...p, valor: r[p.campo] }));
  if (r.lucro > 0) pedacos.push({ nome: 'Lucro', cor: 'var(--c-lucro)', valor: r.lucro });
  el('vBarra').innerHTML = pedacos.map((p) =>
    `<span style="width:${(p.valor / base) * 100}%;background:${p.cor}" title="${p.nome}: ${reais(p.valor)}"></span>`).join('');

  // Cascata: do faturamento até o lucro, passando pelo que o ML repassa.
  const linha = (nome, valor, cor, total = false) => `
    <li class="${total ? 'total' : ''}">
      <span class="bolinha" style="background:${cor || 'transparent'}"></span>
      <span class="nome">${nome}</span>
      <span class="valor">${reais(valor)}</span>
      <span class="parte">${r.receita > 0 ? pct((valor / r.receita) * 100) : ''}</span>
    </li>`;
  const parte = (campo) => PARTES.find((p) => p.campo === campo);
  const menos = (campo) => (r[campo] ? linha(parte(campo).nome, -r[campo], parte(campo).cor) : '');

  el('cascata').innerHTML =
    linha('Faturamento bruto', r.receita, null, true) +
    menos('reembolsos') + menos('tarifa') + menos('frete') +
    (r.descontos ? linha('Descontos e bônus', r.descontos, 'var(--c-lucro)') : '') +
    linha('Repasse do Mercado Livre', r.total, null, true) +
    menos('produto') + menos('imposto') + menos('embalagem') + menos('anuncios') +
    linha('Lucro', r.lucro, 'var(--c-lucro)', true) +
    (r.fixos ? linha('Custos fixos', -r.fixos, 'var(--c-tarifa)') + linha('Lucro depois dos fixos', r.lucroAposFixos, null, true) : '');
}

function desenharProdutos(produtos) {
  const ordem = el('ordem').value;
  const ordenar = {
    receita: (a, b) => b.receita - a.receita,
    lucro: (a, b) => b.lucro - a.lucro,
    margem: (a, b) => (a.margemPct ?? Infinity) - (b.margemPct ?? Infinity),
    semCusto: (a, b) => b.semCusto - a.semCusto || b.receita - a.receita,
  }[ordem];

  let lista = [...produtos].sort(ordenar);
  if (el('soProblemas').checked) lista = lista.filter(ehProblema);

  el('tabelaProdutos').innerHTML = lista.length ? lista.map((p) => `
    <tr>
      <td class="produto">${escapar(p.titulo)}
        <small>${p.sku ? 'SKU ' + escapar(p.sku) : 'sem SKU'} · ${escapar(p.anuncio)}${p.variacao && !p.sku ? ' · ' + escapar(p.variacao) : ''}</small></td>
      <td class="num">${p.vendas}</td>
      <td class="num">${reais(p.receita)}</td>
      <td class="num">${reais(p.tarifa)}</td>
      <td class="num">${reais(p.frete)}</td>
      <td class="num">${reais(p.total)}</td>
      <td class="num"><input class="custo${p.custoUnitario === null ? ' vazio' : ''}" inputmode="decimal"
        data-chave="${escapar(p.chave)}" value="${paraCampo(p.custoUnitario)}" placeholder="preencher"
        aria-label="Custo unitário de ${escapar(p.titulo)}"></td>
      <td class="num ${classeLucro(p.lucro)}">${reais(p.lucro)}</td>
      <td class="num ${classeLucro(p.lucro)}">${margemTexto(p.margemPct)}</td>
    </tr>`).join('') : '<tr><td colspan="9" class="vazio">Nenhum produto com prejuízo ou margem baixa.</td></tr>';
}

function desenharVendas(vendas) {
  let lista = [...vendas].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  if (el('soProblemas').checked) lista = lista.filter(ehProblema);

  const etiqueta = { cancelada: 'Cancelada', devolucao: 'Devolução' };
  el('tabelaVendas').innerHTML = lista.length ? lista.map((v) => `
    <tr>
      <td>${dataCurta(v.data)}</td>
      <td class="produto">${escapar(v.titulo)}
        <small>Venda ${escapar(v.numero)} · ${v.unidades} un.${v.publicidade ? ' · via Ads' : ''}
        ${v.tipo !== 'normal' ? `<span class="etiqueta alerta" title="${escapar(v.status)}">${etiqueta[v.tipo]}</span>` : ''}
        ${v.semCusto ? '<span class="etiqueta">sem custo</span>' : ''}</small></td>
      <td class="num">${reais(v.receita)}</td>
      <td class="num">${reais(v.tarifa)}</td>
      <td class="num">${reais(v.frete)}</td>
      <td class="num">${reais(v.total)}</td>
      <td class="num">${reais(v.custos.produto)}</td>
      <td class="num">${reais(v.custos.imposto + v.custos.embalagem + v.custos.anuncios)}</td>
      <td class="num ${classeLucro(v.lucro)}">${reais(v.lucro)}</td>
      <td class="num ${classeLucro(v.lucro)}">${margemTexto(v.margemPct)}</td>
    </tr>`).join('') : '<tr><td colspan="10" class="vazio">Nenhuma venda com prejuízo ou margem baixa.</td></tr>';
}

// ---------- Baixar e limpar ----------

el('baixar').addEventListener('click', () => {
  if (!relatorio || typeof XLSX === 'undefined') return;
  const arred = (n) => Math.round(n * 100) / 100;
  const margem = (m) => (m === null ? '' : arred(m));

  const produtos = relatorio.produtos.map((p) => ({
    'Produto': p.titulo, 'SKU': p.sku, 'Anúncio': p.anuncio, 'Vendas': p.vendas, 'Unidades': p.unidades,
    'Faturamento': arred(p.receita), 'Cancelamentos e devoluções': arred(p.reembolsos),
    'Tarifa ML': arred(p.tarifa), 'Frete': arred(p.frete), 'Repasse ML': arred(p.total),
    'Custo unitário': p.custoUnitario ?? '', 'Custo produtos': arred(p.produto), 'Imposto': arred(p.imposto),
    'Embalagem': arred(p.embalagem), 'Ads': arred(p.anuncios), 'Lucro': arred(p.lucro), 'Margem %': margem(p.margemPct),
  }));
  const vendas = relatorio.vendas.map((v) => ({
    'Data': v.data ? v.data.replace('T', ' ') : '', 'Venda': v.numero, 'Situação': v.status, 'Produto': v.titulo,
    'SKU': v.sku, 'Unidades': v.unidades, 'Via Ads': v.publicidade ? 'Sim' : 'Não',
    'Faturamento': arred(v.receita), 'Cancelamentos e devoluções': arred(v.reembolsos),
    'Tarifa ML': arred(v.tarifa), 'Frete': arred(v.frete), 'Descontos e bônus': arred(v.descontos),
    'Repasse ML': arred(v.total), 'Custo produto': arred(v.custos.produto), 'Imposto': arred(v.custos.imposto),
    'Embalagem': arred(v.custos.embalagem), 'Ads': arred(v.custos.anuncios), 'Lucro': arred(v.lucro), 'Margem %': margem(v.margemPct),
  }));

  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, XLSX.utils.json_to_sheet(produtos), 'Por produto');
  XLSX.utils.book_append_sheet(livro, XLSX.utils.json_to_sheet(vendas), 'Por venda');
  XLSX.writeFile(livro, 'lucro-vendas.xlsx');
});

// Remove só as vendas; os custos digitados ficam guardados para o próximo relatório.
el('limpar').addEventListener('click', () => {
  importacao = null;
  relatorio = null;
  salvar(CHAVE_VENDAS, null);
  mensagem('Vendas removidas. Os custos dos produtos continuam salvos.');
  atualizarVendas();
});

if (importacao) mensagem(`Mostrando ${importacao.vendas.length} vendas de ${importacao.arquivo}.`);
atualizarVendas();
