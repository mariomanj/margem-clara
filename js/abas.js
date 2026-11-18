// Troca entre as abas "Calculadora" e "Vendas importadas".
// A aba aberta fica no endereço (#vendas), assim dá para mandar o link direto para ela.

const ABAS = ['calculadora', 'vendas'];

function mostrarAba() {
  const atual = ABAS.includes(location.hash.slice(1)) ? location.hash.slice(1) : ABAS[0];
  for (const nome of ABAS) {
    const ativa = nome === atual;
    document.getElementById('aba-' + nome).hidden = !ativa;
    const aba = document.getElementById('tab-' + nome);
    aba.setAttribute('aria-selected', ativa);
    if (ativa) aba.setAttribute('aria-current', 'page');
    else aba.removeAttribute('aria-current');
  }
}

window.addEventListener('hashchange', mostrarAba);
mostrarAba();
