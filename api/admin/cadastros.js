const { getPool } = require('../db');
const { deletarFoto } = require('../cloudinary');
const jwt = require('jsonwebtoken');

function verificarToken(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;
  try { return jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET); }
  catch { return null; }
}

module.exports = async (req, res) => {
  const admin = verificarToken(req);
  if (!admin) return res.status(401).json({ erro: 'Não autenticado' });

  const pool = getPool();
  const { id, stats, status, page, action, limit } = req.query;

  // GET stats
  if (req.method === 'GET' && stats) {
    const { rows } = await pool.query('SELECT status, COUNT(*) as total FROM cadastros GROUP BY status');
    const result = { pendente: 0, aprovado: 0, rejeitado: 0 };
    rows.forEach(r => (result[r.status] = parseInt(r.total)));
    return res.status(200).json(result);
  }

  // GET foto + vídeo por id
  if (req.method === 'GET' && id) {
    const { rows } = await pool.query(
      'SELECT foto_url, video_url FROM cadastros WHERE id = $1', [id]
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Cadastro não encontrado' });
    return res.status(200).json({
      url: rows[0].foto_url || null,
      video_url: rows[0].video_url || null
    });
  }

  // GET lista
  if (req.method === 'GET') {
    const s = status || 'pendente';
    const l = parseInt(limit || '20');
    const p = parseInt(page || '1');
    const offset = (p - 1) * l;
    const { rows } = await pool.query(
      `SELECT id, nome_completo, nick, data_nascimento, telefone, endereco, cidade,
              cpf_situacao, cpf_nome_receita, status, motivo_rejeicao, criado_em
       FROM cadastros WHERE status = $1
       ORDER BY criado_em ASC LIMIT $2 OFFSET $3`,
      [s, l, offset]
    );
    const total = await pool.query('SELECT COUNT(*) FROM cadastros WHERE status=$1', [s]);
    return res.status(200).json({ cadastros: rows, total: parseInt(total.rows[0].count), page: p });
  }

  // PATCH alterar nick
  if (req.method === 'PATCH' && action === 'nick') {
    const { id: cid, nick } = req.body;
    if (!nick || nick.trim().length < 3) return res.status(400).json({ erro: 'Nick inválido' });
    const check = await pool.query(
      "SELECT 1 FROM cadastros WHERE nick = $1 AND status = 'aprovado' AND id != $2",
      [nick.trim(), cid]
    );
    if (check.rows.length > 0) return res.status(409).json({ erro: 'Nick já está em uso' });
    await pool.query('UPDATE cadastros SET nick = $1 WHERE id = $2', [nick.trim(), cid]);
    return res.status(200).json({ mensagem: 'Nick atualizado.' });
  }

  // PATCH aprovar/rejeitar
  if (req.method === 'PATCH') {
    const { id: cid, acao, motivo } = req.body;
    if (!['aprovar', 'rejeitar'].includes(acao)) return res.status(400).json({ erro: 'Ação inválida' });
    const novoStatus = acao === 'aprovar' ? 'aprovado' : 'rejeitado';
    const { rows } = await pool.query(
      `UPDATE cadastros SET status=$1, motivo_rejeicao=$2, revisado_por=$3, revisado_em=NOW()
       WHERE id=$4 RETURNING foto_public_id, video_public_id`,
      [novoStatus, motivo || null, admin.id, cid]
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Cadastro não encontrado' });

    // Deletar foto e vídeo (LGPD)
    if (rows[0].foto_public_id) await deletarFoto(rows[0].foto_public_id);
    if (rows[0].video_public_id) {
      try {
        const cloudinary = require('cloudinary').v2;
        await cloudinary.uploader.destroy(rows[0].video_public_id, { resource_type: 'video' });
      } catch (e) { console.error('Erro ao deletar vídeo:', e.message); }
    }
    await pool.query(
      'UPDATE cadastros SET foto_public_id=NULL, foto_url=NULL, video_public_id=NULL, video_url=NULL WHERE id=$1',
      [cid]
    );

    await pool.query(
      'INSERT INTO audit_log (admin_id, acao, cadastro_id, detalhes) VALUES ($1,$2,$3,$4)',
      [admin.id, novoStatus, cid, JSON.stringify({ motivo })]
    );
    return res.status(200).json({ mensagem: `Cadastro ${novoStatus}.` });
  }

  return res.status(404).json({ erro: 'Rota não encontrada' });
};
