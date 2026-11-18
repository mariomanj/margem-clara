// Funções de formatação usadas em todas as telas.

const formatoReais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatoPct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const formatoDecimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const reais = (valor) => formatoReais.format(valor);
const pct = (valor) => formatoPct.format(valor) + '%';

// Transforma texto em número aceitando vírgula ("12,50") ou ponto ("12.50").
// Se já for número (como vem do Excel), devolve ele mesmo.
function paraNumero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  let texto = String(valor ?? '').trim().replace(/^R\$\s*/, '');
  // Com vírgula, o ponto é separador de milhar ("1.299,90"); sem vírgula, é decimal.
  if (texto.includes(',')) texto = texto.replace(/\./g, '').replace(',', '.');
  const numero = parseFloat(texto);
  return Number.isFinite(numero) ? numero : 0;
}

// Número para mostrar dentro de um campo: 405.9 → "405,90".
const paraCampo = (valor) => (valor ? formatoDecimal.format(valor) : '');

// Evita que um texto vindo do arquivo (título do anúncio) vire HTML na tela.
function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
