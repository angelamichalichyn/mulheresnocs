function validarFormatoCPF(cpf) {
  cpf = cpf.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let s=0; for(let i=0;i<9;i++) s+=+cpf[i]*(10-i);
  let d1=(s*10)%11; if(d1>=10) d1=0; if(d1!==+cpf[9]) return false;
  s=0; for(let i=0;i<10;i++) s+=+cpf[i]*(11-i);
  let d2=(s*10)%11; if(d2>=10) d2=0; return d2===+cpf[10];
}

async function consultarCPF(cpf) {
  cpf = cpf.replace(/\D/g, '');

  // Primeiro valida matematicamente — se inválido, rejeita na hora
  if (!validarFormatoCPF(cpf)) {
    return { valido: false, erro: 'CPF com formato inválido' };
  }

  // Tenta consultar a BrasilAPI mas não bloqueia se ela falhar
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cpf/v1/${cpf}`, {
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = await res.json();
      const situacao = data.situacaoCadastral?.descricao || '';
      // Só bloqueia se explicitamente irregular
      if (['SUSPENSA','CANCELADA','TITULAR FALECIDO','NULA'].some(s => situacao.toUpperCase().includes(s))) {
        return { valido: false, situacao, nome: null, erro: `CPF com situação: ${situacao}` };
      }
      return { valido: true, situacao: situacao || 'REGULAR', nome: data.nome || null };
    }

    // BrasilAPI retornou erro (404, 500, etc) — não bloqueia, revisão manual confirma
    console.log(`BrasilAPI retornou ${res.status} para CPF — seguindo sem validação remota`);
    return { valido: true, situacao: 'NAO_VERIFICADO', nome: null };

  } catch (err) {
    // Timeout ou rede indisponível — não bloqueia
    console.log('BrasilAPI indisponível:', err.message);
    return { valido: true, situacao: 'NAO_VERIFICADO', nome: null };
  }
}

module.exports = { validarFormatoCPF, consultarCPF };
