// Liga a tela da calculadora às contas de calculos.js (formatos em formato.js).
// Toda vez que um campo muda, lemos os valores, calculamos e redesenhamos o resultado.

// Nome e cor de cada custo no gráfico "para onde vai o dinheiro".
const ROTULOS = {
  produto: { nome: 'Custo do produto', cor: 'var(--c-produto)' },
  comissao: { nome: 'Comissão do marketplace', cor: 'var(--c-comissao)' },
  tarifaFixa: { nome: 'Tarifa fixa', cor: 'var(--c-tarifa)' },
  frete: { nome: 'Frete', cor: 'var(--c-frete)' },
  imposto: { nome: 'Imposto', cor: 'var(--c-imposto)' },
  embalagem: { nome: 'Embalagem', cor: 'var(--c-embalagem)' },
  anuncios: { nome: 'Anúncios (Ads)', cor: 'var(--c-anuncios)' },
  outros: { nome: 'Outros', cor: 'var(--c-outros)' },
};

const formulario = document.getElementById('formCalculadora');

// Lê um campo numérico (a conversão de "12,50" fica em formato.js).
function lerNumero(nome) {
  return paraNumero(formulario.elements[nome].value);
}

function lerVenda() {
  return {
    preco: lerNumero('preco'),
    custoProduto: lerNumero('custoProduto'),
    comissaoPct: lerNumero('comissaoPct'),
    tarifaFixa: lerNumero('tarifaFixa'),
    frete: lerNumero('frete'),
    impostoPct: lerNumero('impostoPct'),
    embalagem: lerNumero('embalagem'),
    anuncios: lerNumero('anuncios'),
    outros: lerNumero('outros'),
  };
}

function atualizar() {
  const venda = lerVenda();
  const r = calcularLucro(venda);

  const cartao = document.getElementById('resultado');
  cartao.classList.toggle('prejuizo', r.lucro < 0);

  document.getElementById('lucro').textContent = reais(r.lucro);
  document.getElementById('margem').textContent = r.preco > 0 ? pct(r.margemPct) : '—';
  document.getElementById('totalCustos').textContent = reais(r.totalCustos);
  document.getElementById('aviso').textContent =
    r.lucro < 0 ? 'Esta venda dá prejuízo.' :
    r.preco > 0 && r.margemPct < 10 ? 'Margem baixa: qualquer custo extra vira prejuízo.' : '';

  desenharComposicao(r);
  atualizarPrecoIdeal(venda);
}

// Barra empilhada: cada custo vira um pedaço proporcional ao preço de venda.
function desenharComposicao(r) {
  const barra = document.getElementById('barra');
  const lista = document.getElementById('detalhes');
  barra.innerHTML = '';
  lista.innerHTML = '';

  if (r.preco <= 0) return;

  const base = Math.max(r.preco, r.totalCustos);
  const pedacos = Object.entries(r.custos).filter(([, valor]) => valor > 0);
  if (r.lucro > 0) pedacos.push(['lucro', r.lucro]);

  for (const [chave, valor] of pedacos) {
    const rotulo = chave === 'lucro' ? { nome: 'Lucro', cor: 'var(--c-lucro)' } : ROTULOS[chave];

    const pedaco = document.createElement('span');
    pedaco.style.width = (valor / base) * 100 + '%';
    pedaco.style.background = rotulo.cor;
    pedaco.title = `${rotulo.nome}: ${reais(valor)}`;
    barra.appendChild(pedaco);

    const item = document.createElement('li');
    item.innerHTML = `
      <span class="bolinha" style="background:${rotulo.cor}"></span>
      <span class="nome">${rotulo.nome}</span>
      <span class="valor">${reais(valor)}</span>
      <span class="parte">${pct((valor / r.preco) * 100)}</span>`;
    lista.appendChild(item);
  }
}

function atualizarPrecoIdeal(venda) {
  const margemDesejada = lerNumero('margemDesejada');
  const preco = calcularPrecoIdeal(venda, margemDesejada);
  document.getElementById('precoIdeal').textContent =
    preco === null ? 'Impossível: os percentuais passam de 100%' : reais(preco);
}

formulario.addEventListener('input', atualizar);
atualizar();
