const { uploadFoto } = require('./cloudinary');
const { getPool } = require('./db');

export const config = { api: { bodyParser: false } };

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  try {
    const { fields, file } = await parseMultipart(req);
    const { nome_completo, nick, data_nascimento, telefone, endereco, cidade, video_url, video_public_id } = fields;

    if (!nome_completo || !nick || !data_nascimento || !cidade)
      return res.status(400).json({ erro: 'Campos obrigatórios ausentes' });

    if (!file && !video_url)
      return res.status(400).json({ erro: 'Envie a foto com documento ou o vídeo de verificação' });

    // Mínimo 16 anos
    const nasc = new Date(data_nascimento);
    const hoje = new Date();
    const idade = hoje.getFullYear() - nasc.getFullYear()
      - (hoje < new Date(hoje.getFullYear(), nasc.getMonth(), nasc.getDate()) ? 1 : 0);
    if (idade < 16) return res.status(400).json({ erro: 'É necessário ter 16 anos ou mais' });

    const pool = getPool();

    // Nick único — só bloqueia se aprovado
    const nickCheck = await pool.query(
      "SELECT 1 FROM cadastros WHERE nick = $1 AND status = 'aprovado'", [nick.trim()]
    );
    if (nickCheck.rows.length > 0) return res.status(409).json({ erro: 'Este nick já está em uso' });

    // Upload foto
    let fotoUrl = null, fotoPublicId = null;
    if (file) {
      try {
        const resultado = await uploadFoto(file.buffer, file.mimetype);
        fotoUrl = resultado.secure_url;
        fotoPublicId = resultado.public_id;
      } catch (err) {
        console.error('Erro upload foto:', err.message);
        return res.status(500).json({ erro: 'Erro ao enviar foto. Tente novamente.' });
      }
    }

    await pool.query(
      `INSERT INTO cadastros
        (nome_completo, nick, data_nascimento, telefone, endereco, cidade,
         foto_url, foto_public_id, video_url, video_public_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        nome_completo.trim(), nick.trim(), data_nascimento,
        telefone?.trim() || null, endereco?.trim() || null, cidade?.trim() || null,
        fotoUrl, fotoPublicId,
        video_url || null, video_public_id || null
      ]
    );

    return res.status(201).json({ mensagem: 'Cadastro recebido! Uma administradora irá revisar em até 48h.' });
  } catch (err) {
    console.error('Erro geral:', err.message, err.stack);
    return res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
  }
};

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', d => chunks.push(d));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      const boundary = contentType.split('boundary=')[1]?.trim();
      if (!boundary) return reject(new Error('Boundary não encontrado'));
      const fields = {};
      let file = null;
      const boundaryBuf = Buffer.from('--' + boundary);
      const parts = splitBuffer(body, boundaryBuf);
      for (const part of parts) {
        if (!part || part.length < 4) continue;
        const sep = Buffer.from('\r\n\r\n');
        const sepIdx = indexOf(part, sep);
        if (sepIdx === -1) continue;
        const headerBuf = part.slice(0, sepIdx).toString('utf8');
        let dataBuf = part.slice(sepIdx + 4);
        if (dataBuf.slice(-2).toString() === '\r\n') dataBuf = dataBuf.slice(0, -2);
        const nameMatch = headerBuf.match(/name="([^"]+)"/);
        const filenameMatch = headerBuf.match(/filename="([^"]+)"/);
        const mimeMatch = headerBuf.match(/Content-Type:\s*([^\r\n]+)/i);
        if (!nameMatch) continue;
        const fieldName = nameMatch[1];
        if (filenameMatch && fieldName === 'foto') {
          file = { buffer: dataBuf, filename: filenameMatch[1], mimetype: mimeMatch?.[1]?.trim() || 'image/jpeg' };
        } else if (!filenameMatch) {
          fields[fieldName] = dataBuf.toString('utf8');
        }
      }
      resolve({ fields, file });
    });
    req.on('error', reject);
  });
}

function indexOf(buf, search) {
  for (let i = 0; i <= buf.length - search.length; i++) {
    let found = true;
    for (let j = 0; j < search.length; j++) {
      if (buf[i + j] !== search[j]) { found = false; break; }
    }
    if (found) return i;
  }
  return -1;
}

function splitBuffer(buf, delimiter) {
  const parts = [];
  let start = 0, idx;
  while ((idx = indexOf(buf.slice(start), delimiter)) !== -1) {
    parts.push(buf.slice(start, start + idx));
    start += idx + delimiter.length;
    if (buf[start] === 13 && buf[start + 1] === 10) start += 2;
    if (buf[start] === 45 && buf[start + 1] === 45) break;
  }
  return parts;
}
