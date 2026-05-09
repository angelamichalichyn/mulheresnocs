// api/upload-sign.js
// Gera assinatura para upload direto ao Cloudinary pelo frontend
const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  try {
    const timestamp = Math.round(Date.now() / 1000);
    const folder = 'mulheresnocs/videos';

    const toSign = `folder=${folder}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`;
    const signature = crypto.createHash('sha1').update(toSign).digest('hex');

    return res.status(200).json({
      signature,
      timestamp,
      folder,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao gerar assinatura' });
  }
};
