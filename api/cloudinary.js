const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadFoto(buffer, mimetype) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'mulheresnocs/verificacoes' },
      (error, result) => { if (error) reject(error); else resolve(result); }
    );
    stream.end(buffer);
  });
}

async function deletarFoto(publicId) {
  try { await cloudinary.uploader.destroy(publicId); }
  catch (err) { console.error('Erro ao deletar foto:', err.message); }
}

async function gerarUrlAssinada(publicId) {
  // URL direta do Cloudinary — só quem tiver o link consegue acessar
  const url = cloudinary.url(publicId, { secure: true });
  console.log('URL foto:', publicId, url ? 'gerada' : 'falhou');
  return url;
}

module.exports = { uploadFoto, deletarFoto, gerarUrlAssinada };
